/* ============================================================
   GYMBOT QC — TENANT SERVICE
   Manages the `gyms` collection — the tenant model. Every Gym
   Owner user links to exactly one gym record via gymId/ownerId.
   Future phases (leads, subscriptions, invoices, settings, AI
   conversations) should be scoped by gymId — read it from the
   session (see auth-service.js), never trust a value passed in
   from the UI unchecked.
   ============================================================ */
import { storage } from "../storage.js";
import { generateId, sanitizeRecords } from "../utils.js";
import { AUDIT_ACTIONS } from "../config.js";
import { recordAuditEntry } from "./audit-log-service.js";

// Every gym record needs id/ownerId to be safely usable by the rest of
// this file (and by auth-service.js's login-time lookups) — a record
// missing either is filtered out in memory. Nothing is deleted from
// storage; see utils.js's sanitizeRecords().
function getAllGyms(){
  return sanitizeRecords(storage.getJSON("gyms", [], { requireArray: true }), ["id", "ownerId"]);
}

function saveAllGyms(gyms){
  return storage.setJSON("gyms", gyms);
}

/**
 * @param {{name:string, ownerId:string}} fields
 * @returns {object} the created gym record
 */
export function createGym({ name, ownerId }){
  const gym = {
    id: generateId("gym"),
    name,
    ownerId,
    createdAt: new Date().toISOString(),
    deletedAt: null // Phase 8: Developer-only soft delete — see deleteGymForDeveloper()
  };
  const gyms = getAllGyms();
  gyms.push(gym);
  saveAllGyms(gyms);
  return gym;
}

export function getGymById(gymId){
  return getAllGyms().find(g => g.id === gymId) || null;
}

export function getGymByOwnerId(ownerId){
  return getAllGyms().find(g => g.ownerId === ownerId) || null;
}

export function getAllGymsForDeveloper(){
  // Developer-only listing. Callers must check role before
  // exposing this — this function itself doesn't gate access,
  // route guards (auth-guard.js) do.
  return getAllGyms();
}

/* ---------- Developer-only account lifecycle (Phase 8) ----------
   SOFT delete only — "Delete account" never removes the gym record
   or anything scoped to it (leads/settings/conversations/invoices/
   subscription/analytics all stay exactly where they are). It just
   flags the gym as deleted so login-time and registry code can treat
   it as gone. "Restore account" clears the flag. Gating is the
   Developer Dashboard's requireRole(ROLES.DEVELOPER) guard, same
   boundary style as getAllGymsForDeveloper() — not this file. */

export function isGymDeleted(gym){
  return !!(gym && gym.deletedAt);
}

/** @returns {{ok:boolean, reason?:string, message?:string}} */
export function deleteGymForDeveloper(gymId, performedBy){
  const gyms = getAllGyms();
  const gym = gyms.find(g => g.id === gymId);
  if(!gym) return { ok: false, reason: "Gym not found." };
  if(gym.deletedAt) return { ok: false, reason: "This gym is already deleted." };

  const previousValue = gym.deletedAt;
  gym.deletedAt = new Date().toISOString();
  saveAllGyms(gyms);

  recordAuditEntry({
    action: AUDIT_ACTIONS.DELETE, gymId, performedBy,
    previousValue, newValue: gym.deletedAt,
    note: "Soft delete — no leads/settings/conversations/invoices/subscription/analytics were removed."
  });

  return { ok: true, message: `${gym.name} was deleted. All data is retained and this can be restored at any time.` };
}

/** @returns {{ok:boolean, reason?:string, message?:string}} */
export function restoreGymForDeveloper(gymId, performedBy){
  const gyms = getAllGyms();
  const gym = gyms.find(g => g.id === gymId);
  if(!gym) return { ok: false, reason: "Gym not found." };
  if(!gym.deletedAt) return { ok: false, reason: "This gym isn't deleted." };

  const previousValue = gym.deletedAt;
  gym.deletedAt = null;
  saveAllGyms(gyms);

  recordAuditEntry({
    action: AUDIT_ACTIONS.RESTORE, gymId, performedBy,
    previousValue, newValue: null,
    note: "Gym account restored from a soft delete."
  });

  return { ok: true, message: `${gym.name} was restored.` };
}
