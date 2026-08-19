/* ============================================================
   GYMBOT QC — GYM PLATFORM CONFIG SERVICE (Phase 14, Global OS
   foundation — Sections 4 & 52)
   Attaches business-type + globalization settings to a gym
   WITHOUT touching the existing `gyms` collection or any code
   that reads it (tenant-service.js's Gym record shape is
   untouched — see its header comment on why that matters:
   getAllGymsForDeveloper() etc. keep working exactly as before).
   Stored as its own map, same pattern as businessSettings/
   subscriptions in config.js's STORAGE_KEYS.

   DEFAULTS: every gym that doesn't have a config record yet
   (i.e. every gym created before this phase, including the
   existing "gymbrat" record) reads back as Traditional Gym /
   Philippines / PHP / Filipino — the exact assumptions this app
   already made implicitly everywhere else. Nothing changes for
   an existing gym until someone explicitly calls
   saveGymPlatformConfig() for it.

   WHAT STILL NEEDS TO HAPPEN BEFORE THIS IS A REAL FEATURE: no
   UI page reads this yet. The next phase is (a) an owner-facing
   settings form to edit it, and (b) replacing the hardcoded PHP
   Intl.NumberFormat calls across admin-billing-page-ui.js,
   admin-overview-page-ui.js, admin-registry-service.js, and the
   owner-facing billing/dashboard pages with
   formatCurrencyAmount(amount, config.currencyCode) from
   config-globalization.js. That's real UI surgery across many
   files, not a one-file change, and is listed as remaining work
   rather than silently done here.
   ============================================================ */
import { storage } from "../storage.js";
import { DEFAULT_BUSINESS_TYPE_ID, getBusinessType } from "../config-business-types.js";
import { DEFAULT_COUNTRY_CODE, getCountry } from "../config-globalization.js";

function getAllConfigs(){
  const raw = storage.getJSON("gymPlatformConfig", {});
  return (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
}

function saveAllConfigs(map){
  return storage.setJSON("gymPlatformConfig", map);
}

function defaultConfigFor(gymId){
  const country = getCountry(DEFAULT_COUNTRY_CODE);
  return {
    gymId,
    businessTypeId: DEFAULT_BUSINESS_TYPE_ID,
    countryCode: country.code,
    currencyCode: country.defaultCurrency,
    languageCode: country.defaultLanguage,
    updatedAt: null
  };
}

/** @returns {object} this gym's platform config — a real stored record
 *  if one exists, otherwise the default every gym implicitly had
 *  before this phase (never null, so callers never need a fallback). */
export function getGymPlatformConfig(gymId){
  if(!gymId) return defaultConfigFor(gymId);
  const all = getAllConfigs();
  return all[gymId] || defaultConfigFor(gymId);
}

/**
 * @param {string} gymId
 * @param {{businessTypeId?:string, countryCode?:string, currencyCode?:string, languageCode?:string}} fields
 * @returns {object} the saved config
 */
export function saveGymPlatformConfig(gymId, fields){
  if(!gymId) throw new Error("saveGymPlatformConfig requires a gymId.");

  const all = getAllConfigs();
  const previous = all[gymId] || defaultConfigFor(gymId);

  const next = Object.assign({}, previous, {
    businessTypeId: fields.businessTypeId ? getBusinessType(fields.businessTypeId).id : previous.businessTypeId,
    countryCode: fields.countryCode ? getCountry(fields.countryCode).code : previous.countryCode,
    currencyCode: fields.currencyCode || previous.currencyCode,
    languageCode: fields.languageCode || previous.languageCode,
    updatedAt: new Date().toISOString()
  });

  all[gymId] = next;
  saveAllConfigs(all);
  return next;
}
