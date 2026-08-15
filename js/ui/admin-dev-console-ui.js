/* ============================================================
   GYMBOT QC — HIDDEN DEVELOPER CONSOLE UI (Phase 9)
   Renders and wires the console's own internal tabs (AI Config,
   Master Prompt, Diagnostics, Logs, Backup, Integrations, DB
   Utilities, Feature Flags, Version). Reachable only from inside
   dashboard.html (DEVELOPER-only page — see main-dashboard.js),
   via a hidden nav entry revealed by clicking the sidebar brand
   5 times in 3 seconds, then an optional password prompt.

   This module owns NOTHING but rendering/wiring — every real
   read/write goes through dev-console-service.js.
   ============================================================ */
import {
  CONFIG, GEMINI_SELECTABLE_MODELS, FEATURE_FLAG_DEFINITIONS,
  INTEGRATION_DEFINITIONS, AUDIT_ACTIONS
} from "../config.js";
import { escapeHtml } from "../utils.js";
import { getCurrentUser } from "../services/auth-service.js";
import { recordAuditEntry } from "../services/audit-log-service.js";
import { showToast } from "./toast-ui.js";
import {
  getDevAiConfig, saveDevAiConfig, resetDevAiConfig,
  getMasterPromptTemplate, saveMasterPromptTemplate, resetMasterPromptTemplate, previewMasterPrompt,
  getFeatureFlags, setFeatureFlag,
  getIntegrations, saveIntegration, testIntegrationConnection,
  getSystemLogs, clearSystemLogs,
  runDiagnostics,
  exportBackup, importBackup,
  seedDemoGyms, seedDemoLeads, seedDemoInvoices, clearDemoData, resetApplication, clearCache,
  getVersionInfo,
  hasDevConsolePassword, setDevConsolePassword, checkDevConsolePassword
} from "../services/dev-console-service.js";
import {
  isShowcaseGymSeeded, seedShowcaseGym, clearShowcaseGym, getShowcaseGymId, getShowcaseGymName
} from "../services/demo-mode-service.js";
import { ROUTES } from "../config.js";

// "Sales Demo" (Phase 11) is deliberately a SEPARATE tab from
// "Database Utilities" (Phase 9) — Database Utilities generates bulk,
// throwaway records (`Demo Lead 1`, `Demo Gym 2`, ...) for stress-testing
// tables/pagination. Sales Demo seeds exactly ONE coherent, presentable
// gym — real business settings, a believable lead pipeline, an active
// paid subscription, a paid invoice history — meant to be shown to an
// actual prospective gym owner, then previewed live from their point of
// view. Neither tab's data or code touches the other's.
const TABS = Object.freeze(["ai", "prompt", "diagnostics", "logs", "backup", "integrations", "database", "salesdemo", "flags", "version"]);
const TAB_LABELS = Object.freeze({
  ai: "AI Configuration",
  prompt: "Master System Prompt",
  diagnostics: "System Diagnostics",
  logs: "Logs",
  backup: "Backup & Restore",
  integrations: "Integration Hub",
  database: "Database Utilities",
  salesdemo: "Sales Demo",
  flags: "Feature Flags",
  version: "Version"
});

let unlocked = false;

/* ---------------- Hidden access trigger ---------------- */

/** Call once from admin-shell-ui.js after the shell renders. Wires the
 *  5-clicks-in-3-seconds trigger on the sidebar brand. Gym Owners never
 *  see this — dashboard.html is already DEVELOPER-only end to end, this
 *  is purely a "don't clutter the nav for the 99% of visits" affordance,
 *  plus the optional password below as a second, deliberate gate. */
export function wireHiddenDevConsoleTrigger(){
  const brand = document.querySelector(".owner-sidebar-brand");
  const navLink = document.getElementById("devConsoleNavLink");
  if(!brand || !navLink) return;

  let clicks = [];
  brand.style.cursor = "pointer";
  brand.addEventListener("click", () => {
    const now = Date.now();
    clicks = clicks.filter(t => now - t < CONFIG.DEV_CONSOLE_CLICK_WINDOW_MS);
    clicks.push(now);
    if(clicks.length >= CONFIG.DEV_CONSOLE_CLICK_COUNT){
      clicks = [];
      revealConsole(navLink);
    }
  });
}

function revealConsole(navLink){
  if(unlocked){
    navLink.hidden = false;
    return;
  }
  if(hasDevConsolePassword()){
    const attempt = window.prompt("Developer Console password:");
    if(attempt === null) return; // canceled
    if(!checkDevConsolePassword(attempt)){
      showToast("Incorrect password.");
      return;
    }
  }
  unlocked = true;
  navLink.hidden = false;
  showToast("Developer Console unlocked for this session.");
}

/* ---------------- Page init ---------------- */

export function initAdminDevConsolePage(){
  wireTabNav();
  renderActiveTab();
}

export function refreshAdminDevConsolePage(){
  renderActiveTab();
}

function currentTab(){
  const raw = document.querySelector(".dev-console-tab.active");
  return (raw && raw.dataset.tab) || "ai";
}

function wireTabNav(){
  document.querySelectorAll(".dev-console-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".dev-console-tab").forEach(t => t.classList.toggle("active", t === tab));
      renderActiveTab();
    });
  });
}

function renderActiveTab(){
  const root = document.getElementById("devConsoleContent");
  if(!root) return;
  const tab = currentTab();
  document.getElementById("devConsoleHeading").textContent = TAB_LABELS[tab] || "Developer Console";

  switch(tab){
    case "ai": return renderAiTab(root);
    case "prompt": return renderPromptTab(root);
    case "diagnostics": return renderDiagnosticsTab(root);
    case "logs": return renderLogsTab(root);
    case "backup": return renderBackupTab(root);
    case "integrations": return renderIntegrationsTab(root);
    case "database": return renderDatabaseTab(root);
    case "salesdemo": return renderSalesDemoTab(root);
    case "flags": return renderFlagsTab(root);
    case "version": return renderVersionTab(root);
    default: return renderAiTab(root);
  }
}

function performedBy(){
  const user = getCurrentUser();
  return user ? user.email : null;
}

/* ---------------- AI Configuration ---------------- */

function renderAiTab(root){
  const cfg = getDevAiConfig();
  root.innerHTML = `
    <div class="owner-panel">
      <h3>Gemini connection</h3>
      <div class="owner-form-group">
        <label for="devAiModel">Model</label>
        <select id="devAiModel">
          ${GEMINI_SELECTABLE_MODELS.map(m => `<option value="${escapeHtml(m)}" ${m === cfg.model ? "selected" : ""}>${escapeHtml(m)}</option>`).join("")}
        </select>
      </div>
      <div class="owner-form-group">
        <label for="devAiTimeout">Response timeout (ms)</label>
        <input type="number" id="devAiTimeout" value="${cfg.timeoutMs}" min="${CONFIG.DEV_TIMEOUT_MS_MIN}" max="${CONFIG.DEV_TIMEOUT_MS_MAX}">
      </div>
      <div class="owner-form-group">
        <label for="devAiRetries">Retry attempts</label>
        <input type="number" id="devAiRetries" value="${cfg.retryAttempts}" min="${CONFIG.DEV_RETRY_ATTEMPTS_MIN}" max="${CONFIG.DEV_RETRY_ATTEMPTS_MAX}">
      </div>
      <button class="btn btn-ghost btn-sm" id="devAiTestBtn" type="button">Test connection</button>
      <div class="status-line" id="devAiTestStatus"></div>
    </div>

    <div class="owner-panel">
      <h3>Generation settings</h3>
      <div class="owner-form-group">
        <label for="devAiTemp">Temperature (${CONFIG.DEV_TEMPERATURE_MIN}–${CONFIG.DEV_TEMPERATURE_MAX})</label>
        <input type="number" step="0.1" id="devAiTemp" value="${cfg.temperature}" min="${CONFIG.DEV_TEMPERATURE_MIN}" max="${CONFIG.DEV_TEMPERATURE_MAX}">
      </div>
      <div class="owner-form-group">
        <label for="devAiMaxTokens">Max output tokens</label>
        <input type="number" id="devAiMaxTokens" value="${cfg.maxOutputTokens}" min="${CONFIG.DEV_MAX_OUTPUT_TOKENS_MIN}" max="${CONFIG.DEV_MAX_OUTPUT_TOKENS_MAX}">
      </div>
      <div class="owner-form-group">
        <label for="devAiPersonality">AI personality</label>
        <input type="text" id="devAiPersonality" value="${escapeHtml(cfg.personality)}">
      </div>
      <div class="owner-form-group">
        <label for="devAiFallback">Default fallback response</label>
        <textarea id="devAiFallback" rows="3">${escapeHtml(cfg.fallbackResponse)}</textarea>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-primary btn-sm" id="devAiSaveBtn" type="button">Save</button>
        <button class="btn btn-ghost btn-sm" id="devAiResetBtn" type="button">Reset to default</button>
      </div>
      <div class="status-line" id="devAiSaveStatus"></div>
    </div>
  `;

  document.getElementById("devAiSaveBtn").addEventListener("click", () => {
    const result = saveDevAiConfig({
      model: document.getElementById("devAiModel").value,
      timeoutMs: document.getElementById("devAiTimeout").value,
      retryAttempts: document.getElementById("devAiRetries").value,
      temperature: document.getElementById("devAiTemp").value,
      maxOutputTokens: document.getElementById("devAiMaxTokens").value,
      personality: document.getElementById("devAiPersonality").value,
      fallbackResponse: document.getElementById("devAiFallback").value
    });
    setStatus("devAiSaveStatus", result.ok ? "Saved." : result.reason, result.ok);
    if(result.ok) recordAuditEntry({ action: AUDIT_ACTIONS.SAVE_AI_CONFIG, gymId: null, newValue: result.config, performedBy: performedBy() });
  });

  document.getElementById("devAiResetBtn").addEventListener("click", () => {
    resetDevAiConfig();
    renderAiTab(root);
    showToast("AI configuration reset to default.");
  });

  document.getElementById("devAiTestBtn").addEventListener("click", async () => {
    const btn = document.getElementById("devAiTestBtn");
    if(btn.disabled) return; // re-entrancy guard against rapid double-clicks
    btn.disabled = true;
    setStatus("devAiTestStatus", "Testing...", true);
    try{
      const { testGeminiConnection, FAILURE_REASON_LABEL } = await import("../services/gemini-service.js");
      const result = await testGeminiConnection();
      setStatus("devAiTestStatus", result.ok ? "Connected." : (FAILURE_REASON_LABEL[result.reason] || "Couldn't connect."), result.ok);
    }catch(err){
      setStatus("devAiTestStatus", "Couldn't test the connection — please try again.", false);
      console.warn("[admin-dev-console-ui] AI test connection failed", err);
    }finally{
      btn.disabled = false;
    }
  });
}

/* ---------------- Master System Prompt ---------------- */

function renderPromptTab(root){
  const template = getMasterPromptTemplate();
  root.innerHTML = `
    <div class="owner-panel">
      <h3>Master System Prompt Editor</h3>
      <p class="help-text" style="margin-top:0;">Controls how every gym's AI receptionist behaves. Use <code>{gymInfo}</code> where that gym's business info should be inserted, and <code>{memoryBlock}</code> for the optional conversation-memory block. Gym Owners cannot see or edit this.</p>
      <textarea id="devPromptInput" rows="14" style="width:100%;font-family:monospace;font-size:12.5px;">${escapeHtml(template)}</textarea>
      <div style="display:flex;gap:10px;margin-top:10px;">
        <button class="btn btn-primary btn-sm" id="devPromptSaveBtn" type="button">Save</button>
        <button class="btn btn-ghost btn-sm" id="devPromptResetBtn" type="button">Reset to default</button>
        <button class="btn btn-ghost btn-sm" id="devPromptPreviewBtn" type="button">Preview</button>
      </div>
      <div class="status-line" id="devPromptStatus"></div>
    </div>
    <div class="owner-panel" id="devPromptPreviewPanel" hidden>
      <h3>Preview (sample gym info)</h3>
      <pre class="owner-ai-preview" id="devPromptPreviewOutput"></pre>
    </div>
    <div class="owner-panel">
      <h3>Version history</h3>
      <p class="help-text" style="margin-top:0;">Not implemented yet — every save currently overwrites the previous template with no history kept. A real version history (diff + rollback) is a Phase 10+ candidate.</p>
    </div>
  `;

  document.getElementById("devPromptSaveBtn").addEventListener("click", () => {
    const text = document.getElementById("devPromptInput").value;
    const result = saveMasterPromptTemplate(text);
    setStatus("devPromptStatus", result.ok ? "Saved — every gym's AI now uses this." : result.reason, result.ok);
    if(result.ok) recordAuditEntry({ action: AUDIT_ACTIONS.SAVE_MASTER_PROMPT, gymId: null, performedBy: performedBy() });
  });

  document.getElementById("devPromptResetBtn").addEventListener("click", () => {
    if(!window.confirm("Reset the master prompt to its built-in default? This overwrites any custom edits.")) return;
    const restored = resetMasterPromptTemplate();
    document.getElementById("devPromptInput").value = restored;
    recordAuditEntry({ action: AUDIT_ACTIONS.RESET_MASTER_PROMPT, gymId: null, performedBy: performedBy() });
    showToast("Reset to default.");
  });

  document.getElementById("devPromptPreviewBtn").addEventListener("click", () => {
    const text = document.getElementById("devPromptInput").value;
    const rendered = text.includes("{gymInfo}")
      ? text.replace("{memoryBlock}", "").replace("{gymInfo}", "(sample gym info would appear here)")
      : previewMasterPrompt();
    document.getElementById("devPromptPreviewOutput").textContent = rendered;
    document.getElementById("devPromptPreviewPanel").hidden = false;
  });
}

/* ---------------- Diagnostics ---------------- */

function renderDiagnosticsTab(root){
  root.innerHTML = `
    <div class="owner-panel">
      <div class="owner-panel-head">
        <h3 style="margin:0;">System Diagnostics</h3>
        <button class="btn btn-ghost btn-sm" id="devDiagRunBtn" type="button">Run Diagnostics</button>
      </div>
      <div id="devDiagOutput"><p class="help-text">Click "Run Diagnostics" for a fresh snapshot.</p></div>
    </div>
  `;
  document.getElementById("devDiagRunBtn").addEventListener("click", () => {
    const d = runDiagnostics();
    document.getElementById("devDiagOutput").innerHTML = `
      <ul class="owner-plain-list">
        <li>API connection status: ${escapeHtml(d.apiConnectionStatus)}</li>
        <li>Storage usage: ${(d.storageUsageBytes / 1024).toFixed(1)} KB</li>
        <li>Gyms: ${d.gymCount}</li>
        <li>Users: ${d.userCount}</li>
        <li>Leads: ${d.leadCount}</li>
        <li>Invoices: ${d.invoiceCount}</li>
        <li>Subscriptions: ${d.subscriptionCount}</li>
        <li>Browser: ${escapeHtml(d.browserCompatibility)}</li>
        <li>Last system update (build): ${escapeHtml(d.lastSystemUpdate)}</li>
        <li>Application version: ${escapeHtml(d.applicationVersion)}</li>
        <li>Checked at: ${new Date(d.checkedAt).toLocaleString()}</li>
      </ul>
    `;
  });
}

/* ---------------- Logs ---------------- */

function renderLogsTab(root){
  root.innerHTML = `
    <div class="owner-panel">
      <div class="owner-leads-toolbar">
        <select id="devLogLevelFilter">
          <option value="">All levels</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <input type="date" id="devLogDateFilter">
        <button class="btn btn-ghost btn-sm" id="devLogClearBtn" type="button">Clear logs</button>
        <span class="owner-leads-count" id="devLogCount"></span>
      </div>
      <div id="devLogList"></div>
    </div>
  `;

  const renderList = () => {
    const level = document.getElementById("devLogLevelFilter").value || null;
    const since = document.getElementById("devLogDateFilter").value || null;
    const logs = getSystemLogs({ level, since });
    document.getElementById("devLogCount").textContent = `${logs.length} entries`;
    document.getElementById("devLogList").innerHTML = logs.length === 0
      ? `<p class="help-text">No log entries${level || since ? " match this filter" : " yet"}.</p>`
      : `<table class="owner-table"><thead><tr><th>Time</th><th>Level</th><th>Category</th><th>Message</th></tr></thead><tbody>
          ${logs.map(l => `<tr>
            <td>${new Date(l.timestamp).toLocaleString()}</td>
            <td>${escapeHtml(l.level)}</td>
            <td>${escapeHtml(l.category || "")}</td>
            <td>${escapeHtml(l.message || "")}</td>
          </tr>`).join("")}
        </tbody></table>`;
  };

  document.getElementById("devLogLevelFilter").addEventListener("change", renderList);
  document.getElementById("devLogDateFilter").addEventListener("change", renderList);
  document.getElementById("devLogClearBtn").addEventListener("click", () => {
    if(!window.confirm("Clear all system logs? This can't be undone.")) return;
    clearSystemLogs();
    renderList();
  });

  renderList();
}

/* ---------------- Backup & Restore ---------------- */

function renderBackupTab(root){
  root.innerHTML = `
    <div class="owner-panel">
      <h3>Export</h3>
      <p class="help-text" style="margin-top:0;">Downloads every stored collection (gyms, users, leads, invoices, subscriptions, settings, and this Developer Console's own configuration) as one JSON file.</p>
      <button class="btn btn-primary btn-sm" id="devBackupExportBtn" type="button">Export all data as JSON</button>
    </div>
    <div class="owner-panel">
      <h3>Import / Restore</h3>
      <p class="help-text" style="margin-top:0;">Restoring overwrites existing data for any collection present in the file. Always export a fresh backup first if you're not sure.</p>
      <input type="file" id="devBackupFileInput" accept="application/json">
      <div class="status-line" id="devBackupStatus"></div>
    </div>
  `;

  document.getElementById("devBackupExportBtn").addEventListener("click", () => {
    const backup = exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gymbot-qc-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    recordAuditEntry({ action: AUDIT_ACTIONS.EXPORT_BACKUP, gymId: null, performedBy: performedBy() });
    showToast("Backup downloaded.");
  });

  document.getElementById("devBackupFileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    if(!window.confirm(`Restore from "${file.name}"? This will overwrite existing data for every collection the file contains.`)){
      e.target.value = "";
      return;
    }
    try{
      const text = await file.text();
      const parsed = JSON.parse(text);
      const result = importBackup(parsed);
      setStatus("devBackupStatus", result.ok ? `Restored ${result.restoredKeys.length} collection(s). Reload the app to see all changes.` : result.reason, result.ok);
      if(result.ok) recordAuditEntry({ action: AUDIT_ACTIONS.IMPORT_BACKUP, gymId: null, newValue: result.restoredKeys, performedBy: performedBy() });
    }catch(err){
      setStatus("devBackupStatus", "Couldn't read that file — is it valid JSON?", false);
    }
    e.target.value = "";
  });
}

/* ---------------- Integration Hub ---------------- */

function renderIntegrationsTab(root){
  const integrations = getIntegrations();
  root.innerHTML = INTEGRATION_DEFINITIONS.map(def => {
    const cfg = integrations[def.id];
    return `
      <div class="owner-panel">
        <div class="owner-panel-head">
          <h3 style="margin:0;">${escapeHtml(def.label)}</h3>
          <span class="owner-sub-status-badge">Not connected</span>
        </div>
        <div class="owner-form-group">
          <label for="devIntKey-${def.id}">API key</label>
          <input type="text" id="devIntKey-${def.id}" placeholder="Paste ${escapeHtml(def.label)} API key" value="${escapeHtml(cfg.apiKey)}">
        </div>
        ${def.hasWebhook ? `
        <div class="owner-form-group">
          <label for="devIntUrl-${def.id}">Webhook URL</label>
          <input type="text" id="devIntUrl-${def.id}" placeholder="https://..." value="${escapeHtml(cfg.webhookUrl)}">
        </div>` : ""}
        <div style="display:flex;gap:10px;">
          <button class="btn btn-ghost btn-sm dev-int-save" type="button" data-id="${def.id}">Save</button>
          <button class="btn btn-ghost btn-sm dev-int-test" type="button" data-id="${def.id}">Test connection</button>
        </div>
        <div class="status-line" id="devIntStatus-${def.id}"></div>
      </div>
    `;
  }).join("");

  root.querySelectorAll(".dev-int-save").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const apiKeyEl = document.getElementById(`devIntKey-${id}`);
      const urlEl = document.getElementById(`devIntUrl-${id}`);
      const result = saveIntegration(id, { apiKey: apiKeyEl.value, webhookUrl: urlEl ? urlEl.value : "" });
      setStatus(`devIntStatus-${id}`, result.ok ? "Saved." : result.reason, result.ok);
      if(result.ok) recordAuditEntry({ action: AUDIT_ACTIONS.SAVE_INTEGRATION, gymId: null, note: id, performedBy: performedBy() });
    });
  });
  root.querySelectorAll(".dev-int-test").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const result = testIntegrationConnection(id);
      setStatus(`devIntStatus-${id}`, result.reason, false);
    });
  });
}

/* ---------------- Database Utilities ---------------- */

function renderDatabaseTab(root){
  root.innerHTML = `
    <div class="owner-panel">
      <h3>Seed demo data</h3>
      <p class="help-text" style="margin-top:0;">Adds clearly-marked demo gyms/leads/invoices for testing — never mixed with real tenant data.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-ghost btn-sm" id="devSeedGymsBtn" type="button">Seed demo gyms</button>
        <button class="btn btn-ghost btn-sm" id="devSeedLeadsBtn" type="button">Seed demo leads</button>
        <button class="btn btn-ghost btn-sm" id="devSeedInvoicesBtn" type="button">Seed demo invoices</button>
      </div>
      <div class="status-line" id="devSeedStatus"></div>
    </div>
    <div class="owner-panel">
      <h3>Danger zone</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-danger-outline btn-sm" id="devClearDemoBtn" type="button">Clear demo data</button>
        <button class="btn btn-danger-outline btn-sm" id="devClearCacheBtn" type="button">Clear cache</button>
        <button class="btn btn-danger-outline btn-sm" id="devResetAppBtn" type="button">Reset application</button>
      </div>
      <p class="help-text">"Reset application" deletes ALL data in this browser — every gym, user, lead, invoice, and setting. Export a backup first.</p>
      <div class="status-line" id="devDangerStatus"></div>
    </div>
  `;

  document.getElementById("devSeedGymsBtn").addEventListener("click", () => {
    seedDemoGyms(3);
    recordAuditEntry({ action: AUDIT_ACTIONS.SEED_DEMO_DATA, gymId: null, note: "gyms", performedBy: performedBy() });
    setStatus("devSeedStatus", "Seeded 3 demo gyms.", true);
  });
  document.getElementById("devSeedLeadsBtn").addEventListener("click", () => {
    const result = seedDemoLeads(10);
    if(result.ok) recordAuditEntry({ action: AUDIT_ACTIONS.SEED_DEMO_DATA, gymId: null, note: "leads", performedBy: performedBy() });
    setStatus("devSeedStatus", result.ok ? "Seeded 10 demo leads." : result.reason, result.ok);
  });
  document.getElementById("devSeedInvoicesBtn").addEventListener("click", () => {
    const result = seedDemoInvoices(5);
    if(result.ok) recordAuditEntry({ action: AUDIT_ACTIONS.SEED_DEMO_DATA, gymId: null, note: "invoices", performedBy: performedBy() });
    setStatus("devSeedStatus", result.ok ? "Seeded 5 demo invoices." : result.reason, result.ok);
  });

  document.getElementById("devClearDemoBtn").addEventListener("click", () => {
    if(!window.confirm("Remove all demo-marked gyms, users, leads, and invoices? Real tenant data is untouched.")) return;
    clearDemoData();
    recordAuditEntry({ action: AUDIT_ACTIONS.CLEAR_DEMO_DATA, gymId: null, performedBy: performedBy() });
    setStatus("devDangerStatus", "Demo data cleared.", true);
  });
  document.getElementById("devClearCacheBtn").addEventListener("click", () => {
    if(!window.confirm("Clear the local system log cache?")) return;
    clearCache();
    recordAuditEntry({ action: AUDIT_ACTIONS.CLEAR_CACHE, gymId: null, performedBy: performedBy() });
    setStatus("devDangerStatus", "Cache cleared.", true);
  });
  document.getElementById("devResetAppBtn").addEventListener("click", () => {
    if(!window.confirm("This deletes ALL application data in this browser — gyms, users, leads, invoices, settings — permanently. Type-confirm by clicking OK only if you have a backup.")) return;
    if(!window.confirm("Really sure? This cannot be undone.")) return;
    recordAuditEntry({ action: AUDIT_ACTIONS.RESET_APPLICATION, gymId: null, performedBy: performedBy() });
    resetApplication();
    window.location.reload();
  });
}

/* ---------------- Sales Demo (Phase 11) ---------------- */

function renderSalesDemoTab(root){
  const seeded = isShowcaseGymSeeded();
  const gymId = getShowcaseGymId();

  root.innerHTML = `
    <div class="owner-panel">
      <h3>60-second gym owner demo</h3>
      <p class="help-text" style="margin-top:0;">
        Seeds one realistic gym — ${escapeHtml(getShowcaseGymName())} — with business
        settings, a full lead pipeline (New through Converted and Lost),
        an active paid subscription, and invoice history. Use this when
        showing GymBot QC to a real prospective gym owner: seed it once,
        then preview it from their side without logging out of your own
        Developer account.
      </p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" id="salesDemoSeedBtn" type="button">${seeded ? "Reseed demo gym" : "Seed demo gym"}</button>
        <button class="btn btn-ghost btn-sm" id="salesDemoPreviewBtn" type="button" ${seeded ? "" : "disabled"}>Preview as Gym Owner ↗</button>
        <button class="btn btn-danger-outline btn-sm" id="salesDemoClearBtn" type="button" ${seeded ? "" : "disabled"}>Clear demo gym</button>
      </div>
      <div class="status-line" id="salesDemoStatus">${seeded ? `Seeded — gym id <code>${escapeHtml(gymId)}</code>. Visible in the Gym Registry like any other gym.` : "Not seeded yet."}</div>
    </div>
    <div class="owner-panel">
      <h3>How the preview works</h3>
      <p class="help-text" style="margin-top:0;">
        "Preview as Gym Owner" opens the Gym Owner dashboard in a new tab,
        scoped read-write to the demo gym only, with a banner reminding
        you it's a Developer preview. Your own Developer session in this
        tab is completely untouched — close the preview tab (or click
        "Back to Developer Console" in its banner) to return, at any
        point, without logging in or out of anything.
      </p>
      <p class="help-text">
        The same "Preview as Gym Owner" action is also available from any
        row in the <strong>Gym Registry</strong> — this isn't limited to
        the seeded demo gym.
      </p>
    </div>
  `;

  document.getElementById("salesDemoSeedBtn").addEventListener("click", () => {
    const result = seedShowcaseGym();
    if(result.ok){
      recordAuditEntry({ action: AUDIT_ACTIONS.SEED_DEMO_DATA, gymId: result.gymId, note: "sales demo gym", performedBy: performedBy() });
      showToast("Demo gym seeded.");
    }
    renderSalesDemoTab(root);
  });
  document.getElementById("salesDemoPreviewBtn").addEventListener("click", () => {
    const id = getShowcaseGymId();
    if(!id) return;
    window.open(`${ROUTES.DASHBOARD_OWNER}?devview=${encodeURIComponent(id)}`, "_blank", "noopener");
  });
  document.getElementById("salesDemoClearBtn").addEventListener("click", () => {
    if(!window.confirm("Remove the demo gym and its sample data? Real tenant data is untouched.")) return;
    clearShowcaseGym(performedBy());
    recordAuditEntry({ action: AUDIT_ACTIONS.CLEAR_DEMO_DATA, gymId: null, note: "sales demo gym", performedBy: performedBy() });
    showToast("Demo gym cleared.");
    renderSalesDemoTab(root);
  });
}

/* ---------------- Feature Flags ---------------- */

function renderFlagsTab(root){
  const flags = getFeatureFlags();
  root.innerHTML = `
    <div class="owner-panel">
      <h3>Feature Flags</h3>
      <p class="help-text" style="margin-top:0;">Only the Developer can change these. Gym Owners never see this panel.</p>
      ${FEATURE_FLAG_DEFINITIONS.map(f => `
        <div class="owner-form-group" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div>
            <strong>${escapeHtml(f.label)}</strong>
            <div class="help-text" style="margin:2px 0 0;">${escapeHtml(f.description)}</div>
          </div>
          <label style="display:flex;align-items:center;gap:6px;white-space:nowrap;">
            <input type="checkbox" class="dev-flag-toggle" data-id="${f.id}" ${flags[f.id] ? "checked" : ""}>
          </label>
        </div>
      `).join("")}
    </div>
  `;
  root.querySelectorAll(".dev-flag-toggle").forEach(cb => {
    cb.addEventListener("change", () => {
      const result = setFeatureFlag(cb.dataset.id, cb.checked);
      if(result.ok){
        recordAuditEntry({ action: AUDIT_ACTIONS.TOGGLE_FEATURE_FLAG, gymId: null, note: cb.dataset.id, newValue: cb.checked, performedBy: performedBy() });
        showToast(`${cb.dataset.id}: ${cb.checked ? "enabled" : "disabled"}`);
      }else{
        cb.checked = !cb.checked;
        showToast(result.reason);
      }
    });
  });
}

/* ---------------- Version ---------------- */

function renderVersionTab(root){
  const v = getVersionInfo();
  const hasPassword = hasDevConsolePassword();
  root.innerHTML = `
    <div class="owner-panel">
      <h3>Version</h3>
      <ul class="owner-plain-list">
        <li>Current version: ${escapeHtml(v.version)}</li>
        <li>Build number: ${escapeHtml(v.build)}</li>
        <li>Release date: ${escapeHtml(v.releaseDate)}</li>
        <li>Environment: ${escapeHtml(v.environment)}</li>
      </ul>
      <p class="help-text">Update management isn't implemented yet — this is a static display, no auto-update mechanism exists (there's no backend to check against).</p>
    </div>
    <div class="owner-panel">
      <h3>Console access password</h3>
      <p class="help-text" style="margin-top:0;">${hasPassword ? "A password is currently set for the 5-click console trigger." : "No password is set yet — anyone who clicks the logo 5 times reaches this console. Set one below."}</p>
      <div class="owner-form-group">
        <label for="devConsolePwInput">${hasPassword ? "Change" : "Set"} password</label>
        <input type="password" id="devConsolePwInput" placeholder="New password">
      </div>
      <button class="btn btn-primary btn-sm" id="devConsolePwSaveBtn" type="button">Save</button>
      <div class="status-line" id="devConsolePwStatus"></div>
    </div>
  `;
  document.getElementById("devConsolePwSaveBtn").addEventListener("click", () => {
    const result = setDevConsolePassword(document.getElementById("devConsolePwInput").value);
    setStatus("devConsolePwStatus", result.ok ? "Saved." : result.reason, result.ok);
    if(result.ok) document.getElementById("devConsolePwInput").value = "";
  });
}

/* ---------------- Shared ---------------- */

function setStatus(elId, message, isOk){
  const el = document.getElementById(elId);
  if(!el) return;
  el.textContent = message;
  el.className = "status-line " + (isOk ? "ok" : "err");
}
