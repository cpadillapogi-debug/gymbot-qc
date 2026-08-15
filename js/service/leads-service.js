/* ============================================================
   GYMBOT QC — LEADS SERVICE (Phase 5: Lead CRM)
   Persistence + validation for captured leads. UI modules call
   these instead of touching storage or localStorage directly.

   TENANT SCOPING: every read/write here takes a gymId and is
   scoped to it — leads are stored in one flat array (like
   `users`/`gyms`), each record tagged with its own gymId. Every
   exported function that returns or mutates leads requires a
   gymId; there is no "get everything" escape hatch for UI code
   (mirrors the boundary tenant-service.js / gym-settings-service.js
   already draw for gyms and business settings).
   ============================================================ */
import { storage } from "../storage.js";
import { CONFIG, LEAD_STATUSES, SYSTEM_LOG_LEVELS, SYSTEM_LOG_CATEGORIES } from "../config.js";
import { clampText, generateId, normalizePhoneForMatch, isValidEmail, sanitizeRecords } from "../utils.js";
import { logSystemEvent } from "./dev-console-service.js";

const DEFAULT_STATUS = LEAD_STATUSES[0]; // "New"

/* ---------- Raw storage (all gyms, flat array) ---------- */

// Sanitized at the source (id/gymId required) so a corrupted entry
// can't crash any of this file's per-gym filtering below — the `l &&`
// guards elsewhere in this file are kept as extra defense-in-depth.
function getAllLeadsRaw(){
  return sanitizeRecords(storage.getJSON("leads", [], { requireArray: true }), ["id", "gymId"]);
}

function saveAllLeadsRaw(leads){
  return storage.setJSON("leads", leads);
}

/** @returns {object[]} this gym's leads, newest first */
export function getLeads(gymId){
  if(!gymId) return [];
  return getAllLeadsRaw().filter(l => l && l.gymId === gymId);
}

export function getLeadById(gymId, leadId){
  if(!gymId || !leadId) return null;
  return getAllLeadsRaw().find(l => l && l.gymId === gymId && l.id === leadId) || null;
}

/** @returns {object|null} an existing lead in this gym with a matching phone number */
export function findLeadByPhone(gymId, phone){
  const key = normalizePhoneForMatch(phone);
  if(!gymId || !key) return null;
  return getAllLeadsRaw().find(l => l && l.gymId === gymId && normalizePhoneForMatch(l.phone) === key) || null;
}

export function clearLeads(gymId){
  if(!gymId) return false;
  const remaining = getAllLeadsRaw().filter(l => !(l && l.gymId === gymId));
  return saveAllLeadsRaw(remaining);
}

/* ---------- Validation ---------- */

/**
 * @param {{name:string, phone:string}} input
 * @returns {{valid:boolean, errors:{name?:string, phone?:string}, cleanName:string, cleanPhone:string}}
 */
export function validateBookingInput({ name, phone }){
  const errors = {};
  const cleanName = clampText((name || "").trim(), CONFIG.LEAD_NAME_MAX_LEN);
  const cleanPhone = clampText((phone || "").trim(), CONFIG.LEAD_PHONE_MAX_LEN);

  if(cleanName.length < 2){
    errors.name = "Please enter your name.";
  }
  // Loose PH-friendly phone check: at least 7 digits present.
  const digitCount = (cleanPhone.match(/\d/g) || []).length;
  if(digitCount < 7){
    errors.phone = "Please enter a valid phone number.";
  }

  return { valid: Object.keys(errors).length === 0, errors, cleanName, cleanPhone };
}

/* ---------- Automatic capture (AI receptionist -> CRM) ---------- */

/**
 * Creates a New lead, or — if a lead with the same phone number already
 * exists for this gym — updates it in place instead of creating a
 * duplicate. This is the single entry point the chat widget's booking
 * flow (booking-ui.js) calls; it's also safe to call again later with
 * more/updated info for the same customer (e.g. they message again).
 *
 * @param {{gymId:string, name:string, phone:string, email?:string,
 *   goal?:string, preferredTime?:string, source?:string,
 *   conversationSummary?:string}} fields
 * @returns {{lead:object, created:boolean}}
 */
export function captureLead(fields){
  const f = fields || {};
  if(!f.gymId) throw new Error("captureLead: gymId is required.");

  const now = new Date().toISOString();
  const existing = findLeadByPhone(f.gymId, f.phone);

  if(existing){
    const updated = Object.assign({}, existing, {
      // Never blank out a field we already had with an empty new value.
      name: f.name || existing.name,
      email: f.email || existing.email,
      goal: f.goal || existing.goal,
      preferredTime: f.preferredTime || existing.preferredTime,
      source: f.source || existing.source,
      conversationSummary: f.conversationSummary || existing.conversationSummary,
      updatedAt: now,
      lastActivityAt: now
    });
    replaceLead(updated);
    return { lead: updated, created: false };
  }

  const lead = {
    id: generateId("lead"),
    gymId: f.gymId,
    name: clampText((f.name || "").trim(), CONFIG.LEAD_NAME_MAX_LEN),
    phone: clampText((f.phone || "").trim(), CONFIG.LEAD_PHONE_MAX_LEN),
    email: isValidEmail(f.email) ? f.email.trim() : "",
    goal: f.goal || "",
    preferredTime: f.preferredTime || "",
    source: f.source || "Website",
    status: DEFAULT_STATUS,
    notes: "",
    conversationSummary: f.conversationSummary || "",
    statusHistory: [{ status: DEFAULT_STATUS, at: now }],
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now
  };

  const leads = getAllLeadsRaw();
  leads.unshift(lead);
  saveAllLeadsRaw(leads);
  logSystemEvent({ level: SYSTEM_LOG_LEVELS.INFO, category: SYSTEM_LOG_CATEGORIES.LEAD_CREATED, message: `New lead captured for gym ${f.gymId}`, meta: { gymId: f.gymId, leadId: lead.id } });
  return { lead, created: true };
}

/** Kept for the marketing demo widget (demo.js) and any direct-entry
 *  flow — a thin wrapper so callers don't need to know the dedup rules
 *  unless they want them (demo leads are deliberately always fresh). */
export function saveLead(fields){
  return captureLead(fields).lead;
}

function replaceLead(updatedLead){
  const leads = getAllLeadsRaw();
  const idx = leads.findIndex(l => l && l.id === updatedLead.id && l.gymId === updatedLead.gymId);
  if(idx === -1) return false;
  leads[idx] = updatedLead;
  return saveAllLeadsRaw(leads);
}

/* ---------- Owner-driven CRM edits ---------- */

/**
 * @param {string} gymId
 * @param {string} leadId
 * @param {string} status must be one of LEAD_STATUSES
 * @returns {{ok:boolean, lead?:object, reason?:string}}
 */
export function updateLeadStatus(gymId, leadId, status){
  if(!LEAD_STATUSES.includes(status)){
    return { ok:false, reason:"Not a valid status." };
  }
  const lead = getLeadById(gymId, leadId);
  if(!lead) return { ok:false, reason:"Lead not found." };

  const now = new Date().toISOString();
  const updated = Object.assign({}, lead, {
    status,
    updatedAt: now,
    lastActivityAt: now,
    statusHistory: lead.statusHistory.concat([{ status, at: now }])
  });
  replaceLead(updated);
  return { ok:true, lead: updated };
}

/**
 * @param {string} gymId
 * @param {string} leadId
 * @param {string} notes
 * @returns {{ok:boolean, lead?:object, reason?:string}}
 */
export function updateLeadNotes(gymId, leadId, notes){
  const lead = getLeadById(gymId, leadId);
  if(!lead) return { ok:false, reason:"Lead not found." };

  const now = new Date().toISOString();
  const updated = Object.assign({}, lead, {
    notes: clampText(String(notes || ""), CONFIG.LEAD_NOTES_MAX_LEN),
    updatedAt: now
  });
  replaceLead(updated);
  return { ok:true, lead: updated };
}

/**
 * @param {string} gymId
 * @param {string} leadId
 * @returns {boolean} true if a lead was found and removed
 */
export function deleteLead(gymId, leadId){
  const leads = getAllLeadsRaw();
  const next = leads.filter(l => !(l && l.gymId === gymId && l.id === leadId));
  if(next.length === leads.length) return false;
  return saveAllLeadsRaw(next);
}
