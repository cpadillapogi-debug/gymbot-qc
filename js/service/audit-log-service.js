/* ============================================================
   GYMBOT QC — DEVELOPER AUDIT LOG SERVICE (Phase 8)
   Flat, append-only(-ish) log of every Developer action that
   changes a gym's account/subscription state. Pure logic +
   storage only, no DOM — same shape as invoice-service.js: one
   flat array, newest-last on disk, newest-first on read.

   WHY A SEPARATE FILE: every Developer-only mutation (in
   subscription-service.js, tenant-service.js, auth-service.js)
   calls recordAuditEntry() itself, right where the mutation
   happens — not from the UI layer — so there's no way to fire
   one of those actions and forget to log it. UI code only ever
   READS this file, via getAuditLog().

   PERMISSION BOUNDARY: same as admin-registry-service.js — this
   is Developer-only data. getAuditLog() must never be imported
   from owner-facing code.
   ============================================================ */
import { storage } from "../storage.js";
import { CONFIG } from "../config.js";
import { generateId, sanitizeRecords } from "../utils.js";

// Loosely sanitized (just "is a real object") — log entries are
// read-only display data, but a stray null in the array would still
// crash a `.level`/`.category` filter on the admin log page.
function getAllEntries(){
  return sanitizeRecords(storage.getJSON("auditLog", [], { requireArray: true }));
}

function saveAllEntries(entries){
  return storage.setJSON("auditLog", entries);
}

/**
 * Records one audit entry. Never throws — a logging failure should
 * never block the action it's describing, so storage errors are
 * swallowed the same way storage-adapter.js already swallows quota /
 * corrupt-JSON errors for every other collection.
 * @param {{action:string, gymId:string, previousValue?:*, newValue?:*, performedBy?:string, note?:string}} entry
 * @returns {object} the recorded entry
 */
export function recordAuditEntry({ action, gymId, previousValue = null, newValue = null, performedBy = null, note = "" }){
  const entry = {
    id: generateId("audit"),
    action,
    gymId: gymId || null,
    previousValue,
    newValue,
    performedBy: performedBy || "(unknown developer)",
    note: note || "",
    timestamp: new Date().toISOString()
  };

  try{
    const all = getAllEntries();
    all.push(entry);
    // Rolling cap — oldest entries drop off first, same trim direction
    // a real log file would use.
    const trimmed = all.length > CONFIG.AUDIT_LOG_MAX_ENTRIES
      ? all.slice(all.length - CONFIG.AUDIT_LOG_MAX_ENTRIES)
      : all;
    saveAllEntries(trimmed);
  }catch(err){
    // Best-effort only — see header comment.
  }

  return entry;
}

/** @returns {object[]} every audit entry, newest first. */
export function getAuditLog(){
  return getAllEntries().slice().reverse();
}

/** @returns {object[]} every audit entry for one gym, newest first. */
export function getAuditLogForGym(gymId){
  if(!gymId) return [];
  return getAuditLog().filter(e => e.gymId === gymId);
}
