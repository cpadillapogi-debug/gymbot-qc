/* ============================================================
   GYMBOT QC — COMMISSION ENGINE SERVICE (Phase 10)
   The GymBot QC Service Fee: a configurable cut of each approved
   GCash payment. Pure logic + storage only, no DOM — same shape
   as dev-console-service.js's config getters/setters (a single
   object, not a per-gym or flat-array collection, since there's
   exactly one commission policy for the whole platform).

   PERMISSION BOUNDARY: saveCommissionConfig() is a Developer-only
   write (audited, same as dev-console-service.js's config saves).
   calculateCommission() itself is a pure function safe to call
   from anywhere that already has an amount — it's used both by
   gcash-payment-service.js (to record what was actually deducted
   on an approved payment) and by the Developer Console's Revenue
   tab (to preview the current config against an example amount).
   ============================================================ */
import { storage } from "../storage.js";
import { CONFIG, COMMISSION_MODES, DEFAULT_COMMISSION_CONFIG, AUDIT_ACTIONS } from "../config.js";
import { recordAuditEntry } from "./audit-log-service.js";

/** @returns {object} the current commission config, merged over defaults
 *  so a brand-new install always has every field defined. */
export function getCommissionConfig(){
  const raw = storage.getJSON("commissionConfig", null);
  return Object.assign({}, DEFAULT_COMMISSION_CONFIG, (raw && typeof raw === "object") ? raw : {});
}

function sanitize(partial){
  const mode = Object.values(COMMISSION_MODES).includes(partial.mode) ? partial.mode : DEFAULT_COMMISSION_CONFIG.mode;
  const fixedAmount = clamp(Number(partial.fixedAmount), 0, CONFIG.COMMISSION_FIXED_MAX, DEFAULT_COMMISSION_CONFIG.fixedAmount);
  const percentage = clamp(Number(partial.percentage), 0, CONFIG.COMMISSION_PERCENTAGE_MAX, DEFAULT_COMMISSION_CONFIG.percentage);
  return { mode, fixedAmount, percentage };
}

function clamp(n, min, max, fallback){
  if(!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Developer-only write. Gating is the Master Admin UI's
 * requireRole(DEVELOPER) guard (see admin-shell-ui.js), not this
 * function — same boundary style as dev-console-service.js.
 * @returns {object} the saved config
 */
export function saveCommissionConfig(partial, performedBy){
  const previous = getCommissionConfig();
  const next = Object.assign({}, sanitize(partial), { updatedAt: new Date().toISOString() });
  storage.setJSON("commissionConfig", next);

  recordAuditEntry({
    action: AUDIT_ACTIONS.SAVE_COMMISSION_CONFIG, gymId: null, performedBy,
    previousValue: `${previous.mode} (fixed ₱${previous.fixedAmount} / ${previous.percentage}%)`,
    newValue: `${next.mode} (fixed ₱${next.fixedAmount} / ${next.percentage}%)`
  });

  return next;
}

/**
 * Splits a peso amount between the gym and GymBot QC's service fee,
 * per the current (or a supplied) commission config. Never lets the
 * commission exceed the amount itself — a misconfigured fixed fee
 * larger than the invoice would otherwise make gymReceives negative.
 * @param {number} amount
 * @param {object} [config] defaults to getCommissionConfig()
 * @returns {{commissionAmount:number, gymReceives:number, mode:string}}
 */
export function calculateCommission(amount, config = getCommissionConfig()){
  const amt = Math.max(0, Number(amount) || 0);

  if(config.mode === COMMISSION_MODES.FIXED){
    const commissionAmount = Math.min(Math.max(0, Number(config.fixedAmount) || 0), amt);
    return { commissionAmount, gymReceives: amt - commissionAmount, mode: config.mode };
  }
  if(config.mode === COMMISSION_MODES.PERCENTAGE){
    const pct = Math.min(100, Math.max(0, Number(config.percentage) || 0));
    const commissionAmount = Math.round(amt * (pct / 100));
    return { commissionAmount, gymReceives: amt - commissionAmount, mode: config.mode };
  }
  // DISABLED — no fee.
  return { commissionAmount: 0, gymReceives: amt, mode: COMMISSION_MODES.DISABLED };
}
