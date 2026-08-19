/* ============================================================
   GYMBOT QC — NOTIFICATION SERVICE (Phase 10)
   In-app notifications for GCash billing events. Pure logic +
   storage only, no DOM — same shape as audit-log-service.js: one
   flat array, newest-last on disk, newest-first on read, rolling
   cap so it can't grow unbounded.

   Two audiences share one collection, distinguished by `audience`:
     - "owner"     — always carries a gymId, only that gym's owner
                     should ever see it (read paths filter by gymId).
     - "developer" — gymId is still recorded (so a Developer notif
                     can link back to the gym it's about) but every
                     Developer session sees every "developer" entry —
                     there's only one Developer role, not per-tenant.

   Entries are created as a SIDE EFFECT of gcash-payment-service.js's
   submit/approve/reject actions and gym-settings/subscription code
   never creates one directly — same "one place owns when this
   happens" pattern invoice-service.js's header comment describes.

   PERMISSION BOUNDARY: getOwnerNotifications(gymId) is the only read
   path owner-facing code should use; getDeveloperNotifications() must
   never be imported from owner-facing code (mirrors audit-log-service.js).
   ============================================================ */
import { storage } from "../storage.js";
import { CONFIG } from "../config.js";
import { generateId, sanitizeRecords } from "../utils.js";

// Sanitized at the source (id required) — a malformed entry would
// otherwise crash the `.audience`/`.read` filters below.
function getAll(){
  return sanitizeRecords(storage.getJSON("notifications", [], { requireArray: true }), ["id"]);
}

function saveAll(list){
  return storage.setJSON("notifications", list);
}

/**
 * @param {{audience:"owner"|"developer", gymId?:string, title:string, message:string, category:string}} entry
 * @returns {object} the created notification
 */
export function createNotification({ audience, gymId = null, title, message, category }){
  const notif = {
    id: generateId("notif"),
    audience,
    gymId,
    title,
    message,
    category,
    read: false,
    createdAt: new Date().toISOString()
  };

  try{
    const all = getAll();
    all.push(notif);
    const trimmed = all.length > CONFIG.NOTIFICATIONS_MAX_ENTRIES
      ? all.slice(all.length - CONFIG.NOTIFICATIONS_MAX_ENTRIES)
      : all;
    saveAll(trimmed);
  }catch(err){
    // Best-effort only, same as recordAuditEntry() — a notification
    // failing to save should never block the billing action it's about.
  }

  return notif;
}

/** @returns {object[]} this gym owner's notifications, newest first. */
export function getOwnerNotifications(gymId){
  if(!gymId) return [];
  return getAll()
    .filter(n => n.audience === "owner" && n.gymId === gymId)
    .sort(newestFirst);
}

/** Developer-only read — every "developer" notification on the
 *  platform. Gating is the Master Admin UI's role guard, not this file. */
export function getDeveloperNotifications(){
  return getAll().filter(n => n.audience === "developer").sort(newestFirst);
}

export function getUnreadCount(list){
  return (list || []).filter(n => !n.read).length;
}

/** Marks every given notification id as read. No-op on unknown ids. */
export function markNotificationsRead(ids){
  if(!Array.isArray(ids) || ids.length === 0) return;
  const idSet = new Set(ids);
  const all = getAll();
  let changed = false;
  all.forEach(n => {
    if(idSet.has(n.id) && !n.read){ n.read = true; changed = true; }
  });
  if(changed) saveAll(all);
}

function newestFirst(a, b){
  return new Date(b.createdAt) - new Date(a.createdAt);
}
