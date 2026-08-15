/* ============================================================
   GYMBOT QC — HIDDEN DEVELOPER CONSOLE SERVICE (Phase 9)
   Pure logic + storage for everything the Developer Console
   page needs: AI tuning overrides, the master system-prompt
   template, feature flags, integration placeholders, system
   logs, diagnostics, and backup/restore. No DOM here — same
   split as every other *-service.js file.

   PERMISSION BOUNDARY: same as audit-log-service.js and
   admin-registry-service.js — this is Developer-only data.
   Nothing in this file is ever imported from owner-facing code
   (owner-*-ui.js, main-owner-dashboard.js). The console page
   itself (admin-dev-console-ui.js) is only reached from inside
   dashboard.html, which is already gated by requireRole(DEVELOPER)
   in main-dashboard.js — this file adds no new auth of its own,
   it only stores/reads Developer-only settings.

   NAMING NOTE: this repo's own docs/PHASE8_NOTES.md already used
   "Phase 8" for a different, earlier round of Developer Dashboard
   work (audit log, account lifecycle, analytics). This Hidden
   Developer Console — AI config, master prompt, diagnostics, logs,
   backup/restore, integrations, DB utilities, feature flags — is
   filed as Phase 9 so the repo's phase numbering stays sequential
   and truthful. See docs/PHASE9_NOTES.md.
   ============================================================ */
import { storage } from "../storage.js";
import {
  CONFIG,
  DEFAULT_DEV_AI_CONFIG,
  DEFAULT_FEATURE_FLAGS,
  FEATURE_FLAG_DEFINITIONS,
  INTEGRATION_DEFINITIONS,
  SYSTEM_LOG_LEVELS
} from "../config.js";
import { generateId, sanitizeRecords } from "../utils.js";
import { getAllGymsForDeveloper } from "./tenant-service.js";
import { getAuditLog } from "./audit-log-service.js";

/* ---------------- AI Configuration (Gemini overrides) ---------------- */

/** @returns {object} the saved override object merged over the defaults, so
 *  every field is always defined even for a brand-new install. */
export function getDevAiConfig(){
  const saved = storage.getJSON("devAiConfig", {});
  return Object.assign({}, DEFAULT_DEV_AI_CONFIG, saved || {});
}

/** Clamps numeric fields into their sane ranges before saving — a Developer
 *  typo (e.g. temperature 20) should never reach the live Gemini call. */
export function saveDevAiConfig(partial){
  const current = getDevAiConfig();
  const next = Object.assign({}, current, partial || {});

  next.temperature = clamp(toNumber(next.temperature, current.temperature), CONFIG.DEV_TEMPERATURE_MIN, CONFIG.DEV_TEMPERATURE_MAX);
  next.maxOutputTokens = Math.round(clamp(toNumber(next.maxOutputTokens, current.maxOutputTokens), CONFIG.DEV_MAX_OUTPUT_TOKENS_MIN, CONFIG.DEV_MAX_OUTPUT_TOKENS_MAX));
  next.timeoutMs = Math.round(clamp(toNumber(next.timeoutMs, current.timeoutMs), CONFIG.DEV_TIMEOUT_MS_MIN, CONFIG.DEV_TIMEOUT_MS_MAX));
  next.retryAttempts = Math.round(clamp(toNumber(next.retryAttempts, current.retryAttempts), CONFIG.DEV_RETRY_ATTEMPTS_MIN, CONFIG.DEV_RETRY_ATTEMPTS_MAX));
  next.model = (next.model || DEFAULT_DEV_AI_CONFIG.model).trim();
  next.personality = (next.personality || "").trim();
  next.fallbackResponse = (next.fallbackResponse || "").trim();

  const ok = storage.setJSON("devAiConfig", next);
  return { ok, config: next, reason: ok ? null : "Couldn't save — check browser storage settings." };
}

export function resetDevAiConfig(){
  storage.setJSON("devAiConfig", DEFAULT_DEV_AI_CONFIG);
  return DEFAULT_DEV_AI_CONFIG;
}

function toNumber(value, fallback){
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(n, min, max){
  return Math.min(max, Math.max(min, n));
}

/* ---------------- Master System Prompt ---------------- */

// Same template gym-info-service.js has always hard-coded — kept here as the
// single default so "Reset to default" has something real to reset to.
export const DEFAULT_MASTER_PROMPT_TEMPLATE =
`You are GymBot QC, a friendly, professional, and energetic Filipino gym receptionist chatting on Facebook Messenger.
Speak in natural Taglish (a mix of Tagalog and English), the way a warm, approachable gym front-desk staff member would text a customer. Keep replies short — 1 to 3 sentences, like a real chat message, not an essay.

Use ONLY the gym info below to answer questions about membership rates, walk-in fees, student discounts, operating hours, personal trainers, group classes, parking, accepted payments (including GCash), gym location, and beginner-friendly questions. If asked something not covered here, say you'll check with staff and offer to note down their contact info.

Handle price objections warmly and redirect to the free trial or student discount. When a customer shows real interest — asking about visiting, trying the gym, or booking — naturally ask for their name, phone number, preferred visit time, and fitness goal (one at a time, conversationally, not as a form). Once you have enough, encourage them to book a free trial and tell them a booking form will appear.{memoryBlock}

GYM INFO:
{gymInfo}`;

/** @returns {string} the current template — falls back to the built-in default. */
export function getMasterPromptTemplate(){
  const saved = storage.get("masterPromptTemplate", "");
  return saved && saved.trim().length > 0 ? saved : DEFAULT_MASTER_PROMPT_TEMPLATE;
}

export function saveMasterPromptTemplate(text){
  if(typeof text !== "string" || text.trim().length === 0){
    return { ok:false, reason:"The master prompt can't be empty." };
  }
  if(!text.includes("{gymInfo}")){
    return { ok:false, reason:"The template must include a {gymInfo} placeholder." };
  }
  const ok = storage.set("masterPromptTemplate", text);
  return { ok, reason: ok ? null : "Couldn't save — check browser storage settings." };
}

export function resetMasterPromptTemplate(){
  storage.set("masterPromptTemplate", DEFAULT_MASTER_PROMPT_TEMPLATE);
  return DEFAULT_MASTER_PROMPT_TEMPLATE;
}

/** Renders the template with sample data — used by the Preview button only,
 *  never by the live gemini-service.js call path directly (that composes
 *  its own memoryBlock/gymInfo — see buildSystemPromptFromTemplate below). */
export function previewMasterPrompt(sampleGymInfo){
  return buildSystemPromptFromTemplate(getMasterPromptTemplate(), sampleGymInfo || "(sample gym info would appear here)", "");
}

/** Shared renderer so gym-info-service.js's buildSystemPrompt() and the
 *  console's Preview button always produce identical output for the same
 *  template + inputs. */
export function buildSystemPromptFromTemplate(template, gymInfo, memorySummary){
  const memoryBlock = memorySummary ? `\n\n${memorySummary}` : "";
  return template.replace("{memoryBlock}", memoryBlock).replace("{gymInfo}", gymInfo);
}

/* ---------------- Feature Flags ---------------- */

export function getFeatureFlags(){
  const saved = storage.getJSON("featureFlags", {});
  return Object.assign({}, DEFAULT_FEATURE_FLAGS, saved || {});
}

export function isFeatureEnabled(flagId){
  return getFeatureFlags()[flagId] !== false;
}

export function setFeatureFlag(flagId, enabled){
  if(!FEATURE_FLAG_DEFINITIONS.some(f => f.id === flagId)){
    return { ok:false, reason:"Unknown feature flag." };
  }
  const next = Object.assign({}, getFeatureFlags(), { [flagId]: !!enabled });
  const ok = storage.setJSON("featureFlags", next);
  return { ok, flags: next, reason: ok ? null : "Couldn't save — check browser storage settings." };
}

/* ---------------- Integration Hub (placeholders) ---------------- */

export function getIntegrations(){
  const saved = storage.getJSON("integrations", {});
  const out = {};
  INTEGRATION_DEFINITIONS.forEach(def => {
    out[def.id] = Object.assign({ apiKey: "", webhookUrl: "", connected: false }, (saved || {})[def.id] || {});
  });
  return out;
}

export function saveIntegration(id, { apiKey = "", webhookUrl = "" } = {}){
  if(!INTEGRATION_DEFINITIONS.some(def => def.id === id)){
    return { ok:false, reason:"Unknown integration." };
  }
  const all = getIntegrations();
  all[id] = { apiKey: apiKey.trim(), webhookUrl: webhookUrl.trim(), connected: all[id].connected };
  const ok = storage.setJSON("integrations", all);
  return { ok, integrations: all, reason: ok ? null : "Couldn't save — check browser storage settings." };
}

/** There is no real backend behind any of these yet (same honesty rule as
 *  Phase 5's lead-routing placeholders) — this always returns a real,
 *  non-faked "not connected" result rather than simulating success. */
export function testIntegrationConnection(id){
  const def = INTEGRATION_DEFINITIONS.find(d => d.id === id);
  if(!def) return { ok:false, reason:"Unknown integration." };
  const cfg = getIntegrations()[id];
  if(!cfg.apiKey && !cfg.webhookUrl){
    return { ok:false, reason:"No API key or webhook URL saved yet." };
  }
  return { ok:false, reason:`${def.label} isn't wired to a real backend yet — this is a Phase 9 placeholder. See Phase 10+ notes.` };
}

/* ---------------- System Logs ---------------- */

// Loosely sanitized, same reasoning as audit-log-service.js's getAllEntries().
function getAllSystemLogs(){
  return sanitizeRecords(storage.getJSON("systemLogs", [], { requireArray: true }));
}

/**
 * Records one system log entry. Never throws, same best-effort pattern as
 * recordAuditEntry() in audit-log-service.js.
 * @param {{level:string, category:string, message:string, meta?:object}} entry
 */
export function logSystemEvent({ level = SYSTEM_LOG_LEVELS.INFO, category, message, meta = null }){
  const entry = {
    id: generateId("log"),
    level, category, message,
    meta: meta || null,
    timestamp: new Date().toISOString()
  };
  try{
    const all = getAllSystemLogs();
    all.push(entry);
    const trimmed = all.length > CONFIG.SYSTEM_LOG_MAX_ENTRIES
      ? all.slice(all.length - CONFIG.SYSTEM_LOG_MAX_ENTRIES)
      : all;
    storage.setJSON("systemLogs", trimmed);
  }catch(err){
    // best-effort only
  }
  return entry;
}

/** @returns {object[]} newest first, optionally filtered. */
export function getSystemLogs({ level = null, category = null, since = null } = {}){
  let logs = getAllSystemLogs().slice().reverse();
  if(level) logs = logs.filter(l => l.level === level);
  if(category) logs = logs.filter(l => l.category === category);
  if(since){
    const sinceTime = new Date(since).getTime();
    logs = logs.filter(l => new Date(l.timestamp).getTime() >= sinceTime);
  }
  return logs;
}

export function clearSystemLogs(){
  return storage.setJSON("systemLogs", []);
}

/* ---------------- Diagnostics ---------------- */

/** @returns {object} live counts across every storage collection, plus a
 *  rough storage-usage estimate. Read-only — never mutates anything. */
export function runDiagnostics(){
  const gyms = safeCount("gyms");
  const users = safeCount("users");
  const leads = safeCount("leads");
  const invoices = safeCount("invoices");
  const subscriptions = countSubscriptions();
  const apiKeySaved = !!storage.get("apiKey", "");

  return {
    apiConnectionStatus: apiKeySaved ? "Key saved (not tested)" : "No API key saved",
    storageUsageBytes: estimateStorageUsageBytes(),
    gymCount: gyms,
    userCount: users,
    leadCount: leads,
    invoiceCount: invoices,
    subscriptionCount: subscriptions,
    browserCompatibility: `${navigator.userAgent || "Unknown browser"}`,
    lastSystemUpdate: CONFIG.APP_BUILD,
    applicationVersion: CONFIG.APP_VERSION,
    checkedAt: new Date().toISOString()
  };
}

function safeCount(logicalKey){
  const arr = storage.getJSON(logicalKey, [], { requireArray: true });
  return Array.isArray(arr) ? arr.length : 0;
}

function countSubscriptions(){
  const map = storage.getJSON("subscriptions", {});
  return map && typeof map === "object" ? Object.keys(map).length : 0;
}

function estimateStorageUsageBytes(){
  let total = 0;
  try{
    Object.values(CONFIG.STORAGE_KEYS).forEach(realKey => {
      const raw = window.localStorage.getItem(realKey);
      if(raw) total += raw.length;
    });
  }catch(err){
    // localStorage unavailable — return whatever was tallied so far
  }
  return total;
}

/* ---------------- Backup & Restore ---------------- */

/** @returns {object} every logical storage collection, raw, as one JSON-safe
 *  object — the full state of the app in this browser. */
export function exportBackup(){
  const data = {};
  Object.keys(CONFIG.STORAGE_KEYS).forEach(logicalKey => {
    const raw = storage.get(logicalKey, null);
    if(raw === null) return;
    try{
      data[logicalKey] = JSON.parse(raw);
    }catch(err){
      data[logicalKey] = raw; // plain string value (e.g. apiKey, theme)
    }
  });
  return {
    exportedAt: new Date().toISOString(),
    appVersion: CONFIG.APP_VERSION,
    data
  };
}

/**
 * Restores a backup object previously produced by exportBackup(). Caller
 * (the UI) is responsible for the "confirm before overwrite" step — this
 * function performs the overwrite unconditionally once called.
 *
 * Atomic by construction: every key the restore is about to touch is
 * snapshotted first. If any individual write fails partway through —
 * StorageAdapter.set() returns false on a full quota, for instance,
 * without throwing — every key already written this run is rolled back
 * to its pre-restore value before returning ok:false, so a failed
 * restore can never leave a mix of old and new data on disk. (Before
 * this fix, a failed storage.set() was silently counted as a success —
 * restoredKeys was pushed regardless of its return value.)
 * @returns {{ok:boolean, reason?:string, restoredKeys?:string[]}}
 */
export function importBackup(backupObject){
  if(!backupObject || typeof backupObject !== "object" || !backupObject.data || typeof backupObject.data !== "object"){
    return { ok:false, reason:"That file doesn't look like a GymBot QC backup." };
  }

  const entries = Object.entries(backupObject.data).filter(([logicalKey]) => logicalKey in CONFIG.STORAGE_KEYS);
  if(entries.length === 0){
    return { ok:false, reason:"That backup file doesn't contain any recognized GymBot QC data." };
  }

  // Snapshot current values for every key we're about to touch.
  const snapshot = entries.map(([logicalKey]) => [logicalKey, storage.get(logicalKey, null)]);

  const restoredKeys = [];
  let failedKey = null;
  try{
    for(const [logicalKey, value] of entries){
      const asString = typeof value === "string" ? value : JSON.stringify(value);
      const wrote = storage.set(logicalKey, asString);
      if(!wrote){ failedKey = logicalKey; break; }
      restoredKeys.push(logicalKey);
    }
  }catch(err){
    failedKey = failedKey || "unknown";
  }

  if(failedKey){
    // Roll back every key already written this run — never leave a
    // half-restored, inconsistent mix of old and new data.
    snapshot.forEach(([logicalKey, previousValue]) => {
      if(previousValue === null){
        storage.remove(logicalKey);
      }else{
        storage.set(logicalKey, previousValue);
      }
    });
    return { ok:false, reason:`Restore failed while writing "${failedKey}" (storage may be full). No changes were kept.` };
  }

  return { ok:true, restoredKeys };
}

/* ---------------- Database Utilities ---------------- */

const DEMO_MARKER_PREFIX = "demo_";

export function seedDemoGyms(count = 3){
  const gyms = storage.getJSON("gyms", [], { requireArray: true });
  const users = storage.getJSON("users", [], { requireArray: true });
  for(let i = 0; i < count; i++){
    const gymId = generateId(DEMO_MARKER_PREFIX + "gym");
    const ownerId = generateId(DEMO_MARKER_PREFIX + "user");
    gyms.push({ id: gymId, name: `Demo Gym ${i + 1}`, ownerId, createdAt: new Date().toISOString(), _demo: true });
    users.push({ id: ownerId, email: `demo-owner-${i + 1}@example.test`, role: "gym_owner", _demo: true });
  }
  storage.setJSON("gyms", gyms);
  storage.setJSON("users", users);
  return { ok:true, seeded: count };
}

export function seedDemoLeads(count = 10){
  const gyms = getAllGymsForDeveloper().filter(g => g._demo);
  if(gyms.length === 0) return { ok:false, reason:"Seed demo gyms first." };
  const leads = storage.getJSON("leads", [], { requireArray: true });
  for(let i = 0; i < count; i++){
    const gym = gyms[i % gyms.length];
    leads.push({
      id: generateId(DEMO_MARKER_PREFIX + "lead"),
      gymId: gym.id,
      name: `Demo Lead ${i + 1}`,
      phone: "0900 000 0000",
      status: "New",
      source: "Demo",
      createdAt: new Date().toISOString(),
      _demo: true
    });
  }
  storage.setJSON("leads", leads);
  return { ok:true, seeded: count };
}

export function seedDemoInvoices(count = 5){
  const gyms = getAllGymsForDeveloper().filter(g => g._demo);
  if(gyms.length === 0) return { ok:false, reason:"Seed demo gyms first." };
  const invoices = storage.getJSON("invoices", [], { requireArray: true });
  for(let i = 0; i < count; i++){
    const gym = gyms[i % gyms.length];
    invoices.push({
      id: generateId(DEMO_MARKER_PREFIX + "inv"),
      gymId: gym.id,
      amount: 2500,
      status: "pending",
      createdAt: new Date().toISOString(),
      _demo: true
    });
  }
  storage.setJSON("invoices", invoices);
  return { ok:true, seeded: count };
}

/** Removes every record tagged `_demo: true` (or whose id was minted with
 *  the demo prefix) across gyms, users, leads, and invoices. Never touches
 *  real tenant data. */
export function clearDemoData(){
  ["gyms", "users", "leads", "invoices"].forEach(key => {
    const arr = storage.getJSON(key, [], { requireArray: true });
    const filtered = arr.filter(item => !item._demo);
    storage.setJSON(key, filtered);
  });
  return { ok:true };
}

/** Full wipe of every known storage key. Irreversible unless a backup was
 *  exported first — the UI must confirm before calling this. */
export function resetApplication(){
  Object.keys(CONFIG.STORAGE_KEYS).forEach(logicalKey => storage.remove(logicalKey));
  return { ok:true };
}

/** Clears only derived/cache-like data (system logs) — never touches gyms,
 *  users, leads, invoices, subscriptions, or settings. */
export function clearCache(){
  storage.remove("systemLogs");
  return { ok:true };
}

/* ---------------- Version ---------------- */

export function getVersionInfo(){
  return {
    version: CONFIG.APP_VERSION,
    build: CONFIG.APP_BUILD,
    releaseDate: "2026-08-13",
    environment: CONFIG.APP_ENVIRONMENT
  };
}

/* ---------------- Console access gate ---------------- */

/** Optional extra password on top of the DEVELOPER role login that already
 *  gates dashboard.html. Defaults to unset (no extra password) — the
 *  Developer sets one from the console's Security tab the first time they
 *  open it. This is a soft, client-side gate only — see docs/PHASE9_NOTES.md
 *  "Security considerations" for why it isn't a substitute for real secret
 *  storage. */
export function hasDevConsolePassword(){
  return !!storage.get("devConsolePassword", "");
}

export function setDevConsolePassword(rawPassword){
  const value = (rawPassword || "").trim();
  if(!value) return { ok:false, reason:"Password can't be empty." };
  const ok = storage.set("devConsolePassword", value);
  return { ok, reason: ok ? null : "Couldn't save — check browser storage settings." };
}

export function checkDevConsolePassword(attempt){
  const saved = storage.get("devConsolePassword", "");
  if(!saved) return true; // no password set yet — click-gate alone is enough
  return (attempt || "") === saved;
}

export function getAuditLogSummaryCount(){
  return getAuditLog().length;
}
