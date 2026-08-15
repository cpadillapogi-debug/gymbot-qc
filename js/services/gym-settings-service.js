/* ============================================================
   GYMBOT QC — GYM SETTINGS SERVICE (Phase 3)
   Structured, per-gym Business Settings — the fields a Gym
   Owner edits about their own business (name, address, fees,
   hours, FAQs, etc). Pure logic + storage only, no DOM.

   Deliberately separate from gym-info-service.js: that module
   owns the freeform text blob fed straight into the AI system
   prompt (Setup panel / future AI Receptionist config) — a
   Developer-facing concern. This module owns the structured
   record a Gym Owner sees as "my business info" on their own
   dashboard. Phase 4 can have the AI Receptionist read from
   this structured record instead of (or in addition to) the
   freeform blob without Business Settings needing to change.

   TENANT SCOPING: everything here is keyed by gymId, read from
   the caller's session — never trust a gymId passed in from a
   form or URL without checking it against the session first
   (see requireGymOwnerSession() in owner-shell-ui.js).
   ============================================================ */
import { storage } from "../storage.js";
import { DEFAULT_BUSINESS_SETTINGS, BUSINESS_SETTINGS_FIELD_MAX_LEN, WELCOME_MESSAGE_MAX_LEN, DESCRIPTION_MAX_LEN, FAQ_MAX_COUNT, FAQ_FIELD_MAX_LEN } from "../config.js";
import { clampText, generateId } from "../utils.js";

function getAllSettings(){
  // { [gymId]: settingsObject }
  const raw = storage.getJSON("businessSettings", {});
  return (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
}

function saveAllSettings(map){
  return storage.setJSON("businessSettings", map);
}

/**
 * @param {string} gymId
 * @returns {object} this gym's settings, defaults filled in for any missing field
 */
export function getBusinessSettings(gymId){
  const all = getAllSettings();
  const saved = (gymId && all[gymId]) ? all[gymId] : {};
  return Object.assign({}, DEFAULT_BUSINESS_SETTINGS, saved, {
    faqs: Array.isArray(saved.faqs) ? saved.faqs : []
  });
}

/**
 * Validates + clamps input, MERGES over the gym's existing saved record
 * (not the bare defaults), and saves. Merging matters because the form
 * only ever submits the fields it knows about — if a future caller (or
 * a partial save) omits a field, this must not blank out what's already
 * saved for it.
 * @param {string} gymId
 * @param {object} fields partial or full settings object from the form
 * @returns {{ok:boolean, reason?:string, settings?:object}}
 */
export function saveBusinessSettings(gymId, fields){
  if(!gymId){
    return { ok:false, reason:"No gym is associated with this account." };
  }
  const existing = getBusinessSettings(gymId);
  const clean = sanitizeSettings(Object.assign({}, existing, fields || {}));

  const all = getAllSettings();
  all[gymId] = clean;
  const ok = saveAllSettings(all);
  return ok
    ? { ok:true, settings: clean }
    : { ok:false, reason:"Couldn't save — check browser storage settings." };
}

function sanitizeSettings(fields){
  const f = fields || {};
  const clampField = v => clampText(String(v || "").trim(), BUSINESS_SETTINGS_FIELD_MAX_LEN);
  const yesNo = v => ["yes", "no", "unspecified"].includes(v) ? v : "unspecified";

  const faqs = Array.isArray(f.faqs) ? f.faqs.slice(0, FAQ_MAX_COUNT).map(item => ({
    id: (item && item.id) || generateId("faq"),
    question: clampText(String((item && item.question) || "").trim(), FAQ_FIELD_MAX_LEN),
    answer: clampText(String((item && item.answer) || "").trim(), FAQ_FIELD_MAX_LEN)
  })).filter(item => item.question || item.answer) : [];

  return {
    gymName: clampField(f.gymName),
    logoFileName: clampField(f.logoFileName),
    address: clampField(f.address),
    contactNumber: clampField(f.contactNumber),
    facebookUrl: clampField(f.facebookUrl),
    instagramUrl: clampField(f.instagramUrl),
    hours: clampField(f.hours),
    membershipFee: clampField(f.membershipFee),
    walkInFee: clampField(f.walkInFee),
    studentDiscount: clampField(f.studentDiscount),
    ptRate: clampField(f.ptRate),
    parkingAvailable: yesNo(f.parkingAvailable),
    welcomeMessage: clampText(String(f.welcomeMessage || "").trim(), WELCOME_MESSAGE_MAX_LEN),
    faqs,
    // Phase 4
    description: clampText(String(f.description || "").trim(), DESCRIPTION_MAX_LEN),
    trainerAvailable: yesNo(f.trainerAvailable),
    freeTrialAvailable: yesNo(f.freeTrialAvailable)
  };
}
