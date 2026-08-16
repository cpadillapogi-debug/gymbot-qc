/* ============================================================
   GYMBOT QC — SUBSCRIPTION SERVICE (Phase 6)
   Subscription plans, billing cycle, and the subscription state
   machine. Pure logic + storage only, no DOM — same layering as
   gym-settings-service.js / leads-service.js.

   THERE IS NO REAL PAYMENT GATEWAY YET. Every subscription state
   is driven by dates alone (trial length, billing interval,
   grace period, suspension timers — all tunable in CONFIG), the
   same way OWNER_DEMO_METRICS and the Phase 5 routing
   placeholders are honest about being simulated rather than
   silently pretending to be real. See docs/PHASE6_NOTES.md for
   the full write-up.

   TENANT SCOPING: one subscription record per gymId, storage key
   is a map like businessSettings (not a flat array like leads/
   invoices) since it's 1:1 with a gym rather than many-per-gym.
   getSubscription(gymId) is the only read path — it lazily
   creates a Trialing record for a gym that doesn't have one yet,
   and advances the record through any state transitions that are
   already due before returning it. UI code should never read the
   storage map directly.

   PERMISSION BOUNDARY: nothing in this file lets a Gym Owner
   change plan prices, billing dates, or subscription status
   directly. requestPlanUpgrade() only ever writes a
   requestedPlanId + timestamp — see its own comment.
   ============================================================ */
import { storage } from "../storage.js";
import { CONFIG, SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUS, INVOICE_STATUS, AUDIT_ACTIONS } from "../config.js";
import { addDays } from "../utils.js";
import { getGymById } from "./tenant-service.js";
import { generateInvoice, markLatestPendingInvoiceOverdue, getInvoicesForGym } from "./invoice-service.js";
import { recordAuditEntry } from "./audit-log-service.js";

/* ---------- Storage ---------- */

function getAllSubscriptions(){
  const raw = storage.getJSON("subscriptions", {});
  return (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
}

function saveAllSubscriptions(map){
  return storage.setJSON("subscriptions", map);
}

/* ---------- Plans ---------- */

/** @returns {object} the plan record, falling back to the default plan if planId is unknown */
export function getPlan(planId){
  return SUBSCRIPTION_PLANS.find(p => p.id === planId)
    || SUBSCRIPTION_PLANS.find(p => p.id === CONFIG.SUBSCRIPTION_DEFAULT_PLAN_ID);
}

export function getAllPlans(){
  return SUBSCRIPTION_PLANS;
}

/* ---------- Default record + state machine ---------- */

function createDefaultSubscription(gymId){
  // Anchored to the gym's own createdAt (not "now") so re-reading this
  // record later is deterministic — two reads on different days must
  // derive the same trial window, not silently reset it.
  const gym = getGymById(gymId);
  const anchor = (gym && gym.createdAt) ? gym.createdAt : new Date().toISOString();
  const trialEnd = addDays(anchor, CONFIG.SUBSCRIPTION_TRIAL_DAYS).toISOString();

  return {
    gymId,
    planId: CONFIG.SUBSCRIPTION_DEFAULT_PLAN_ID,
    status: SUBSCRIPTION_STATUS.TRIALING,
    statusSince: anchor,          // when the CURRENT status began — drives the transition timers below
    trialEndDate: trialEnd,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    nextBillingDate: trialEnd,    // during the trial, "next billing" IS the trial end
    canceledAt: null,
    requestedPlanId: null,        // owner's upgrade request — see requestPlanUpgrade()
    upgradeRequestedAt: null,
    createdAt: anchor
  };
}

/**
 * Applies at most ONE due, time-based transition and returns the updated
 * record, or null if nothing is due yet. Active/Disabled/Expired are
 * terminal here — Active would resume the billing cycle on its next
 * renewal once real payment charging exists (Phase 7); Disabled/Expired
 * only change via a Developer action or a fresh cancellation, neither of
 * which is a passage-of-time transition.
 */
function applyNextTransition(sub, now){
  const sinceMs = new Date(sub.statusSince).getTime();
  const nowMs = now.getTime();

  switch(sub.status){
    case SUBSCRIPTION_STATUS.TRIALING: {
      if(nowMs < new Date(sub.trialEndDate).getTime()) return null;
      const periodStart = sub.trialEndDate;
      const periodEnd = addDays(periodStart, CONFIG.SUBSCRIPTION_BILLING_INTERVAL_DAYS).toISOString();
      return Object.assign({}, sub, {
        status: SUBSCRIPTION_STATUS.PENDING_PAYMENT,
        statusSince: periodStart,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        nextBillingDate: periodEnd
      });
    }
    case SUBSCRIPTION_STATUS.PENDING_PAYMENT: {
      const graceAt = addDays(sinceMs, CONFIG.SUBSCRIPTION_GRACE_TRIGGER_DAYS).toISOString();
      if(nowMs < new Date(graceAt).getTime()) return null;
      return Object.assign({}, sub, { status: SUBSCRIPTION_STATUS.GRACE_PERIOD, statusSince: graceAt });
    }
    case SUBSCRIPTION_STATUS.GRACE_PERIOD: {
      const suspendAt = addDays(sinceMs, CONFIG.SUBSCRIPTION_GRACE_PERIOD_DAYS).toISOString();
      if(nowMs < new Date(suspendAt).getTime()) return null;
      return Object.assign({}, sub, { status: SUBSCRIPTION_STATUS.SUSPENDED, statusSince: suspendAt });
    }
    case SUBSCRIPTION_STATUS.SUSPENDED: {
      const disableAt = addDays(sinceMs, CONFIG.SUBSCRIPTION_SUSPENSION_TRIGGER_DAYS).toISOString();
      if(nowMs < new Date(disableAt).getTime()) return null;
      return Object.assign({}, sub, { status: SUBSCRIPTION_STATUS.DISABLED, statusSince: disableAt });
    }
    case SUBSCRIPTION_STATUS.CANCELED: {
      // Access continues until the period the owner already paid for ends.
      if(!sub.currentPeriodEnd || nowMs < new Date(sub.currentPeriodEnd).getTime()) return null;
      return Object.assign({}, sub, { status: SUBSCRIPTION_STATUS.EXPIRED, statusSince: sub.currentPeriodEnd });
    }
    default:
      return null;
  }
}

/** Invoice side effects of specific transitions — kept next to the state
 *  machine so "when is a bill generated/marked overdue" has one home. */
function handleTransitionSideEffects(gymId, toStatus, sub){
  if(toStatus === SUBSCRIPTION_STATUS.PENDING_PAYMENT){
    // Idempotency guard: two tabs (or two components) both calling
    // getSubscription() around the same moment could otherwise each
    // observe the same pre-transition record and independently
    // generate a billing-period invoice for it. Since billingPeriodStart
    // is deterministic per period (derived from the subscription's own
    // dates, not "now"), a duplicate would always share this same value —
    // skip creating a second one if this exact period is already billed.
    const alreadyBilled = getInvoicesForGym(gymId).some(inv => inv.billingPeriodStart === sub.currentPeriodStart);
    if(!alreadyBilled){
      generateInvoice(gymId, getPlan(sub.planId), {
        createdAt: sub.currentPeriodStart,
        dueDate: sub.currentPeriodStart,
        status: INVOICE_STATUS.PENDING
      });
    }
  }
  if(toStatus === SUBSCRIPTION_STATUS.GRACE_PERIOD){
    markLatestPendingInvoiceOverdue(gymId);
  }
}

/**
 * The only read path for a gym's subscription. Lazily creates a Trialing
 * record on first call, then advances it through any transitions that
 * are already due (looped, so a browser left idle past several
 * timers still lands on the correct state in one call) before
 * persisting and returning it.
 * @param {string} gymId
 * @returns {object|null} the (possibly just-updated) subscription record
 */
export function getSubscription(gymId){
  if(!gymId) return null;

  const all = getAllSubscriptions();
  let sub = all[gymId] || createDefaultSubscription(gymId);
  let changed = !all[gymId];

  const now = new Date();
  for(let guard = 0; guard < 10; guard++){
    const next = applyNextTransition(sub, now);
    if(!next) break;
    sub = next;
    changed = true;
    handleTransitionSideEffects(gymId, sub.status, sub);
  }

  if(changed){
    all[gymId] = sub;
    saveAllSubscriptions(all);
  }
  return sub;
}

/**
 * Like getSubscription(), but lets the caller choose which plan the
 * trial starts on (falls back to CONFIG.SUBSCRIPTION_DEFAULT_PLAN_ID
 * for an unknown/omitted planId). Used by the onboarding wizard's
 * plan-picker step. If a subscription record already exists for this
 * gym, this never overwrites its plan — same "don't clobber an
 * existing record" rule getSubscription() follows.
 * @param {string} gymId
 * @param {string} [planId]
 */
export function startTrialWithPlan(gymId, planId){
  if(!gymId) return null;

  const all = getAllSubscriptions();
  if(all[gymId]) return getSubscription(gymId); // already started — don't overwrite the chosen plan

  const sub = createDefaultSubscription(gymId);
  if(SUBSCRIPTION_PLANS.some(p => p.id === planId)) sub.planId = planId;

  all[gymId] = sub;
  saveAllSubscriptions(all);
  return sub;
}

/* ---------- Derived, display-only values ---------- */

/** @returns {{aiEnabled:boolean, dashboardReadOnly:boolean, accountLocked:boolean, banner:string|null}} */
export function getSubscriptionAccess(status){
  switch(status){
    case SUBSCRIPTION_STATUS.TRIALING:
      return { aiEnabled: true, dashboardReadOnly: false, accountLocked: false, banner: "trial" };
    case SUBSCRIPTION_STATUS.ACTIVE:
      return { aiEnabled: true, dashboardReadOnly: false, accountLocked: false, banner: null };
    case SUBSCRIPTION_STATUS.PENDING_PAYMENT:
      return { aiEnabled: true, dashboardReadOnly: false, accountLocked: false, banner: "payment_due" };
    case SUBSCRIPTION_STATUS.GRACE_PERIOD:
      return { aiEnabled: true, dashboardReadOnly: false, accountLocked: false, banner: "grace" };
    case SUBSCRIPTION_STATUS.SUSPENDED:
      return { aiEnabled: false, dashboardReadOnly: true, accountLocked: false, banner: "suspended" };
    case SUBSCRIPTION_STATUS.DISABLED:
      return { aiEnabled: false, dashboardReadOnly: true, accountLocked: true, banner: null };
    case SUBSCRIPTION_STATUS.CANCELED:
      return { aiEnabled: false, dashboardReadOnly: false, accountLocked: false, banner: "canceled" };
    case SUBSCRIPTION_STATUS.EXPIRED:
      return { aiEnabled: false, dashboardReadOnly: false, accountLocked: false, banner: "expired" };
    default:
      return { aiEnabled: true, dashboardReadOnly: false, accountLocked: false, banner: null };
  }
}

export function getTrialDaysRemaining(sub){
  if(!sub || sub.status !== SUBSCRIPTION_STATUS.TRIALING) return 0;
  const ms = new Date(sub.trialEndDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

export function getAmountDue(sub){
  if(!sub) return 0;
  const owedStatuses = [SUBSCRIPTION_STATUS.PENDING_PAYMENT, SUBSCRIPTION_STATUS.GRACE_PERIOD, SUBSCRIPTION_STATUS.SUSPENDED];
  return owedStatuses.includes(sub.status) ? getPlan(sub.planId).priceMonthly : 0;
}

export function getPaymentStatusLabel(sub){
  if(!sub) return "\u2014";
  switch(sub.status){
    case SUBSCRIPTION_STATUS.TRIALING: return "No payment due — trial";
    case SUBSCRIPTION_STATUS.ACTIVE: return "Paid, current";
    case SUBSCRIPTION_STATUS.PENDING_PAYMENT: return "Awaiting payment verification";
    case SUBSCRIPTION_STATUS.GRACE_PERIOD: return "Overdue — grace period";
    case SUBSCRIPTION_STATUS.SUSPENDED: return "Overdue — suspended";
    case SUBSCRIPTION_STATUS.DISABLED: return "Account disabled";
    case SUBSCRIPTION_STATUS.CANCELED: return "Canceled";
    case SUBSCRIPTION_STATUS.EXPIRED: return "Expired";
    default: return "\u2014";
  }
}

/* ---------- Owner-facing actions ---------- */

/**
 * Records an upgrade REQUEST only — this never changes planId, price,
 * or status. There's no payment/billing backend yet (Phase 7), so an
 * owner "upgrading" today can only ever flag intent for a Developer to
 * action manually; pretending a client-side click actually changed
 * what they're billed would be exactly the kind of fake-success the
 * rest of this codebase deliberately avoids (see Phase 5's lead
 * routing placeholders).
 * @returns {{ok:boolean, reason?:string, message?:string}}
 */
export function requestPlanUpgrade(gymId, planId){
  if(!gymId){
    return { ok: false, reason: "No gym is associated with this account." };
  }
  const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId);
  if(!plan){
    return { ok: false, reason: "Unknown plan." };
  }

  const all = getAllSubscriptions();
  const sub = all[gymId] || createDefaultSubscription(gymId);

  if(plan.id === sub.planId){
    return { ok: false, reason: `You're already on the ${plan.name} plan.` };
  }

  sub.requestedPlanId = plan.id;
  sub.upgradeRequestedAt = new Date().toISOString();
  all[gymId] = sub;
  saveAllSubscriptions(all);

  return { ok: true, message: `Upgrade to ${plan.name} requested. Real plan changes and billing aren't automated yet — a developer will follow up to confirm and apply it.` };
}

/* ---------- Developer-only actions (Master Admin, Phase 7) ----------
   Everything below is a manual override standing in for the real
   payment gateway called out throughout docs/PHASE6_NOTES.md. Gating
   is the Master Admin UI's requireRole(ROLES.DEVELOPER) guard, not
   these functions themselves — same boundary style as
   getAllGymsForDeveloper(). Owner-facing code must never import these. */

/**
 * Applies a gym owner's already-recorded upgrade REQUEST (see
 * requestPlanUpgrade() above) — this is the only place requestedPlanId
 * ever becomes the actual planId. Does not touch status or billing
 * dates; those are independent of which plan is active.
 * @returns {{ok:boolean, reason?:string, message?:string}}
 */
export function applyRequestedPlanUpgrade(gymId, performedBy){
  if(!gymId) return { ok: false, reason: "Missing gym." };

  const all = getAllSubscriptions();
  const sub = all[gymId];
  if(!sub || !sub.requestedPlanId){
    return { ok: false, reason: "This gym has no pending upgrade request." };
  }

  const previousPlanId = sub.planId;
  const plan = getPlan(sub.requestedPlanId);
  sub.planId = plan.id;
  sub.requestedPlanId = null;
  sub.upgradeRequestedAt = null;
  all[gymId] = sub;
  saveAllSubscriptions(all);

  recordAuditEntry({
    action: AUDIT_ACTIONS.APPLY_UPGRADE, gymId, performedBy,
    previousValue: previousPlanId, newValue: plan.id
  });

  return { ok: true, message: `${gymId} moved to the ${plan.name} plan.` };
}

/**
 * Reactivates a Suspended or Disabled subscription straight to Active,
 * opening a fresh billing period starting today. Per
 * docs/PHASE6_NOTES.md's "what Phase 7 should build" — a Developer is
 * the only role that can ever do this, standing in for "payment was
 * confirmed out-of-band" until a real gateway exists.
 * @returns {{ok:boolean, reason?:string, message?:string}}
 */
export function reactivateSubscription(gymId, performedBy){
  if(!gymId) return { ok: false, reason: "Missing gym." };

  const all = getAllSubscriptions();
  const sub = all[gymId] || createDefaultSubscription(gymId);
  const reactivatable = [SUBSCRIPTION_STATUS.SUSPENDED, SUBSCRIPTION_STATUS.DISABLED];
  if(!reactivatable.includes(sub.status)){
    return { ok: false, reason: `Only Suspended or Disabled subscriptions can be reactivated (this one is currently ${sub.status}).` };
  }

  const previousStatus = sub.status;
  const now = new Date().toISOString();
  const periodEnd = addDays(now, CONFIG.SUBSCRIPTION_BILLING_INTERVAL_DAYS).toISOString();
  all[gymId] = Object.assign({}, sub, {
    status: SUBSCRIPTION_STATUS.ACTIVE,
    statusSince: now,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    nextBillingDate: periodEnd
  });
  saveAllSubscriptions(all);

  recordAuditEntry({
    action: AUDIT_ACTIONS.ACTIVATE, gymId, performedBy,
    previousValue: previousStatus, newValue: SUBSCRIPTION_STATUS.ACTIVE,
    note: "Reactivate override (fresh billing period started)."
  });

  return { ok: true, message: "Subscription reactivated — now Active." };
}

/* ---------- Developer-only manual controls (Phase 8: Developer Dashboard) ----------
   Everything below is a direct, explicit override a Master Admin can
   fire from the Developer Dashboard — distinct from reactivateSubscription()
   above (which only ever lands on Active from Suspended/Disabled) and
   applyRequestedPlanUpgrade() (which only ever applies what an owner
   already requested). Each one is logged to the audit log at the point
   of mutation, not by the UI layer, for the same "can't forget to log
   it" reason tenant-service.js's delete/restore pair is. */

function setStatusRaw(gymId, status, extra = {}){
  const all = getAllSubscriptions();
  const sub = all[gymId] || createDefaultSubscription(gymId);
  const now = new Date().toISOString();
  all[gymId] = Object.assign({}, sub, { status, statusSince: now }, extra);
  saveAllSubscriptions(all);
  return { previousStatus: sub.status, updated: all[gymId] };
}

/** Manually sets a gym straight to Active, with a fresh billing period.
 *  Unlike reactivateSubscription(), this can be fired from ANY status
 *  (e.g. un-canceling), not only Suspended/Disabled. */
export function activateGymManually(gymId, performedBy){
  if(!gymId) return { ok: false, reason: "Missing gym." };
  const now = new Date().toISOString();
  const periodEnd = addDays(now, CONFIG.SUBSCRIPTION_BILLING_INTERVAL_DAYS).toISOString();
  const { previousStatus } = setStatusRaw(gymId, SUBSCRIPTION_STATUS.ACTIVE, {
    currentPeriodStart: now, currentPeriodEnd: periodEnd, nextBillingDate: periodEnd
  });

  recordAuditEntry({ action: AUDIT_ACTIONS.ACTIVATE, gymId, performedBy, previousValue: previousStatus, newValue: SUBSCRIPTION_STATUS.ACTIVE });
  return { ok: true, message: "Account activated — now Active." };
}

/** Manually suspends a gym: AI receptionist off, dashboard read-only.
 *  See getSubscriptionAccess() for the exact effects and
 *  owner-billing-banner-ui.js for where they're enforced. */
export function suspendGymManually(gymId, performedBy, reason = ""){
  if(!gymId) return { ok: false, reason: "Missing gym." };
  const all = getAllSubscriptions();
  const sub = all[gymId];
  if(sub && sub.status === SUBSCRIPTION_STATUS.SUSPENDED){
    return { ok: false, reason: "This gym is already suspended." };
  }
  const { previousStatus } = setStatusRaw(gymId, SUBSCRIPTION_STATUS.SUSPENDED);

  recordAuditEntry({ action: AUDIT_ACTIONS.SUSPEND, gymId, performedBy, previousValue: previousStatus, newValue: SUBSCRIPTION_STATUS.SUSPENDED, note: reason });
  return { ok: true, message: "Account suspended. AI receptionist disabled and the owner's dashboard is now read-only." };
}

/** Manually disables a gym: full account lock (owner sees the lock
 *  overlay, can only log out). No data is touched. */
export function disableGymManually(gymId, performedBy, reason = ""){
  if(!gymId) return { ok: false, reason: "Missing gym." };
  const all = getAllSubscriptions();
  const sub = all[gymId];
  if(sub && sub.status === SUBSCRIPTION_STATUS.DISABLED){
    return { ok: false, reason: "This gym is already disabled." };
  }
  const { previousStatus } = setStatusRaw(gymId, SUBSCRIPTION_STATUS.DISABLED);

  recordAuditEntry({ action: AUDIT_ACTIONS.DISABLE, gymId, performedBy, previousValue: previousStatus, newValue: SUBSCRIPTION_STATUS.DISABLED, note: reason });
  return { ok: true, message: "Account disabled. The owner is fully locked out until reactivated." };
}

/** Extends the trial end date by N days. Only meaningful while
 *  Trialing — the trial has already ended for any other status, so
 *  there's nothing to extend (a Developer would reactivate/change
 *  status instead). */
export function extendTrial(gymId, days, performedBy){
  if(!gymId) return { ok: false, reason: "Missing gym." };
  const n = Number(days);
  if(!Number.isFinite(n) || n <= 0 || n > CONFIG.DEV_EXTEND_TRIAL_MAX_DAYS){
    return { ok: false, reason: `Enter a number of days between 1 and ${CONFIG.DEV_EXTEND_TRIAL_MAX_DAYS}.` };
  }

  const all = getAllSubscriptions();
  const sub = all[gymId] || createDefaultSubscription(gymId);
  if(sub.status !== SUBSCRIPTION_STATUS.TRIALING){
    return { ok: false, reason: `Only a Trialing subscription has a trial to extend (this one is currently ${sub.status}).` };
  }

  const previousTrialEnd = sub.trialEndDate;
  const newTrialEnd = addDays(previousTrialEnd, n).toISOString();
  all[gymId] = Object.assign({}, sub, { trialEndDate: newTrialEnd, nextBillingDate: newTrialEnd });
  saveAllSubscriptions(all);

  recordAuditEntry({ action: AUDIT_ACTIONS.EXTEND_TRIAL, gymId, performedBy, previousValue: previousTrialEnd, newValue: newTrialEnd, note: `+${n} day(s)` });
  return { ok: true, message: `Trial extended by ${n} day${n === 1 ? "" : "s"}.` };
}

/** Directly sets a gym's plan, independent of any owner upgrade
 *  request. Unlike applyRequestedPlanUpgrade(), this can set ANY
 *  plan — used for manual corrections, not the normal upgrade path. */
export function changeSubscriptionPlanDirect(gymId, planId, performedBy){
  if(!gymId) return { ok: false, reason: "Missing gym." };
  const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId);
  if(!plan) return { ok: false, reason: "Unknown plan." };

  const all = getAllSubscriptions();
  const sub = all[gymId] || createDefaultSubscription(gymId);
  if(sub.planId === plan.id) return { ok: false, reason: `Already on the ${plan.name} plan.` };

  const previousPlanId = sub.planId;
  all[gymId] = Object.assign({}, sub, { planId: plan.id, requestedPlanId: null, upgradeRequestedAt: null });
  saveAllSubscriptions(all);

  recordAuditEntry({ action: AUDIT_ACTIONS.CHANGE_PLAN, gymId, performedBy, previousValue: previousPlanId, newValue: plan.id });
  return { ok: true, message: `Plan changed to ${plan.name}.` };
}

/** Directly sets the next billing date (and, when there's an open
 *  billing period, its period end too, so the two stay consistent). */
export function changeBillingDate(gymId, isoDate, performedBy){
  if(!gymId) return { ok: false, reason: "Missing gym." };
  const parsed = new Date(isoDate);
  if(!isoDate || isNaN(parsed.getTime())){
    return { ok: false, reason: "Enter a valid date." };
  }

  const all = getAllSubscriptions();
  const sub = all[gymId] || createDefaultSubscription(gymId);
  const previousDate = sub.nextBillingDate;
  const newDate = parsed.toISOString();

  const extra = { nextBillingDate: newDate };
  if(sub.currentPeriodEnd) extra.currentPeriodEnd = newDate;
  if(sub.status === SUBSCRIPTION_STATUS.TRIALING) extra.trialEndDate = newDate;

  all[gymId] = Object.assign({}, sub, extra);
  saveAllSubscriptions(all);

  recordAuditEntry({ action: AUDIT_ACTIONS.CHANGE_BILLING_DATE, gymId, performedBy, previousValue: previousDate, newValue: newDate });
  return { ok: true, message: `Next billing date changed to ${parsed.toLocaleDateString()}.` };
}

/* ---------- Phase 10: GCash Billing ---------- */

/**
 * Owner-triggered transition: fires when a Gym Owner uploads a GCash
 * proof of payment (see gcash-payment-service.js's submitPaymentProof()).
 * Deliberately NOT audit-logged the same way the Developer-only actions
 * above are — this is the owner's own action on their own account, same
 * reasoning requestPlanUpgrade() already uses for not calling
 * recordAuditEntry(). Doesn't touch billing dates or invoices; those are
 * handled by gcash-payment-service.js / invoice-service.js.
 * @returns {object} the updated subscription record
 */
export function markSubscriptionAwaitingVerification(gymId){
  const all = getAllSubscriptions();
  const sub = all[gymId] || createDefaultSubscription(gymId);
  const now = new Date().toISOString();
  all[gymId] = Object.assign({}, sub, { status: SUBSCRIPTION_STATUS.PENDING_PAYMENT, statusSince: now });
  saveAllSubscriptions(all);
  return all[gymId];
}

/** Approves a submitted GCash payment: subscription -> Active, with a
 *  fresh 30-day billing period starting now (same billing-date math as
 *  activateGymManually() — this is that same override, just logged
 *  under APPROVE_PAYMENT instead of ACTIVATE so the audit trail reads
 *  as a payment decision, not a generic status flip).
 *  Invoice/payment record updates are gcash-payment-service.js's job —
 *  this function only ever touches the subscription record. */
export function approveGymPayment(gymId, performedBy){
  if(!gymId) return { ok: false, reason: "Missing gym." };
  const now = new Date().toISOString();
  const periodEnd = addDays(now, CONFIG.SUBSCRIPTION_BILLING_INTERVAL_DAYS).toISOString();
  const { previousStatus } = setStatusRaw(gymId, SUBSCRIPTION_STATUS.ACTIVE, {
    currentPeriodStart: now, currentPeriodEnd: periodEnd, nextBillingDate: periodEnd
  });

  recordAuditEntry({ action: AUDIT_ACTIONS.APPROVE_PAYMENT, gymId, performedBy, previousValue: previousStatus, newValue: SUBSCRIPTION_STATUS.ACTIVE });
  return { ok: true, message: "Payment approved — subscription is now Active for another 30 days." };
}

/** Rejects a submitted GCash payment: subscription returns to Pending
 *  Payment (this codebase's closest equivalent to "Past Due" — there's
 *  no separate status for it, see SUBSCRIPTION_STATUS in config.js) so
 *  the owner can resubmit. Billing dates are left untouched — rejection
 *  doesn't grant or remove any billing period. */
export function rejectGymPayment(gymId, performedBy, reason = ""){
  if(!gymId) return { ok: false, reason: "Missing gym." };
  const { previousStatus } = setStatusRaw(gymId, SUBSCRIPTION_STATUS.PENDING_PAYMENT);

  recordAuditEntry({ action: AUDIT_ACTIONS.REJECT_PAYMENT, gymId, performedBy, previousValue: previousStatus, newValue: SUBSCRIPTION_STATUS.PENDING_PAYMENT, note: reason });
  return { ok: true, message: "Payment rejected — owner will see the reason and can resubmit." };
}

/** Generic "set the subscription status to exactly this" override —
 *  the escape hatch for any status this UI doesn't have a narrower,
 *  purpose-built action for. Every other developer action above is
 *  preferred where it fits; this one skips all of the derived-field
 *  bookkeeping the others do (billing period, trial date, etc.), so
 *  use it only when a narrower action doesn't apply. */
export function setSubscriptionStatusManually(gymId, status, performedBy){
  if(!gymId) return { ok: false, reason: "Missing gym." };
  if(!Object.values(SUBSCRIPTION_STATUS).includes(status)){
    return { ok: false, reason: "Unknown subscription status." };
  }

  const all = getAllSubscriptions();
  const sub = all[gymId] || createDefaultSubscription(gymId);
  if(sub.status === status) return { ok: false, reason: `Already ${status}.` };

  const { previousStatus } = setStatusRaw(gymId, status);
  recordAuditEntry({ action: AUDIT_ACTIONS.CHANGE_STATUS, gymId, performedBy, previousValue: previousStatus, newValue: status });
  return { ok: true, message: `Status changed to ${status}.` };
}
