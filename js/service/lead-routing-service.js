/* ============================================================
   GYMBOT QC — LEAD ROUTING SERVICE (Phase 5)
   Per-gym settings for "where new leads are sent" (Owner
   Settings > Lead Routing). Pure logic + storage, no DOM —
   same pattern as gym-settings-service.js.

   HONESTY ABOUT WHAT'S REAL: localCrm/csvExport/jsonExport are
   real, working features (the Leads page IS the local CRM; the
   export buttons genuinely produce a file). Google Sheets, n8n,
   Zapier, and Make.com have no backend behind them yet — this
   module never fakes a successful connection for them. Testing
   one of those always surfaces a real "no backend configured"
   error rather than a simulated green check, so the status
   colors an owner sees are never a lie.

   TENANT SCOPING: everything here is keyed by gymId, same
   boundary as gym-settings-service.js.
   ============================================================ */
import { storage } from "../storage.js";
import { LEAD_ROUTING_PROVIDERS } from "../config.js";
import { clampText } from "../utils.js";

const WEBHOOK_URL_MAX_LEN = 500;

function getAllRouting(){
  // { [gymId]: { [providerId]: { status, webhookUrl?, error? } } }
  const raw = storage.getJSON("leadRouting", {});
  return (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
}

function saveAllRouting(map){
  return storage.setJSON("leadRouting", map);
}

function defaultProviderState(provider){
  if(provider.kind === "core" || provider.kind === "working"){
    return { status: "connected" };
  }
  return { status: "not_connected", webhookUrl: "", error: "" };
}

/**
 * @param {string} gymId
 * @returns {{providers: object[]}} LEAD_ROUTING_PROVIDERS definitions,
 *   each merged with this gym's saved state (status/webhookUrl/error)
 */
export function getRoutingSettings(gymId){
  const saved = (gymId && getAllRouting()[gymId]) || {};
  const providers = LEAD_ROUTING_PROVIDERS.map(def => Object.assign(
    {}, def, defaultProviderState(def), saved[def.id] || {}
  ));
  return { providers };
}

function saveProviderState(gymId, providerId, state){
  if(!gymId) return false;
  const all = getAllRouting();
  const gymRouting = Object.assign({}, all[gymId]);
  gymRouting[providerId] = Object.assign({}, gymRouting[providerId], state);
  all[gymId] = gymRouting;
  return saveAllRouting(all);
}

/**
 * Placeholder integrations only. Since there's no backend wired up for
 * any of them, this always resolves to an honest failure — it exists so
 * the UI has something real to call rather than a UI-only fake toggle.
 * @param {string} gymId
 * @param {string} providerId one of the "placeholder" provider ids
 * @returns {{ok:false, error:string}}
 */
export function testPlaceholderConnection(gymId, providerId){
  const def = LEAD_ROUTING_PROVIDERS.find(p => p.id === providerId);
  const error = def
    ? `${def.label} isn't wired up to a backend yet — there's nowhere for GymBot QC to send the request. This needs a real server-side integration (Phase 6+).`
    : "Unknown integration.";
  saveProviderState(gymId, providerId, { status: "error", error });
  return { ok:false, error };
}

/** Resets a placeholder provider back to its default "Not Connected" gray state. */
export function resetPlaceholderConnection(gymId, providerId){
  saveProviderState(gymId, providerId, { status: "not_connected", error: "" });
  return getRoutingSettings(gymId);
}

/** @param {string} url raw webhook URL from the settings form */
export function setWebhookUrl(gymId, providerId, url){
  const clean = clampText((url || "").trim(), WEBHOOK_URL_MAX_LEN);
  saveProviderState(gymId, providerId, { webhookUrl: clean });
  return clean;
}
