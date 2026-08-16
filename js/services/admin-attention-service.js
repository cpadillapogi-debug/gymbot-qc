/* ============================================================
   GYMBOT QC — MASTER ADMIN: NEEDS ATTENTION SERVICE (Phase 13)
   Turns the flat "needsAttentionCount" number that already existed
   on admin-registry-service.js's getPlatformOverview() into actual
   itemized issues — one row per real problem, each with a severity,
   the gym it belongs to, when it was detected, and a recommended
   action. Pure logic + composition of other services, no DOM — same
   layering and Developer-only permission boundary as
   admin-registry-service.js (read the header comment there first).

   DATA INTEGRITY: every issue below is derived from a real stored
   record (subscription status, an actual GCash payment, an actual
   invoice, actual business settings). Nothing here invents a
   problem that doesn't exist in storage. There is no AI-conversation
   log, no uptime monitor, and no support-ticket system in this
   codebase yet (see docs/PHASE6_NOTES.md / PHASE10_NOTES.md for the
   same honesty pattern) — so "AI errors," "chatbot offline," and
   "unresolved tickets" from the wishlist spec are deliberately left
   out rather than faked. When those systems exist, add a detector
   function here the same way the ones below are written.
   ============================================================ */
import { SUBSCRIPTION_STATUS, GCASH_PAYMENT_STATUS, INVOICE_STATUS } from "../config.js";
import { getGymRegistry } from "./admin-registry-service.js";
import { getAllPaymentsForDeveloper } from "./gcash-payment-service.js";
import { getAllInvoicesForDeveloper } from "./invoice-service.js";
import { getBusinessSettings } from "./gym-settings-service.js";

export const ATTENTION_SEVERITY = Object.freeze({
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low"
});

export const ATTENTION_SEVERITY_LABELS = Object.freeze({
  [ATTENTION_SEVERITY.CRITICAL]: "Critical",
  [ATTENTION_SEVERITY.HIGH]: "High",
  [ATTENTION_SEVERITY.MEDIUM]: "Medium",
  [ATTENTION_SEVERITY.LOW]: "Low"
});

// Lower number = more severe. Used for sorting the list.
const SEVERITY_RANK = Object.freeze({
  [ATTENTION_SEVERITY.CRITICAL]: 0,
  [ATTENTION_SEVERITY.HIGH]: 1,
  [ATTENTION_SEVERITY.MEDIUM]: 2,
  [ATTENTION_SEVERITY.LOW]: 3
});

function daysSince(isoString){
  if(!isoString) return null;
  const ms = Date.now() - new Date(isoString).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

function issue({ severity, gymId, gymName, problem, detectedAt, action, category }){
  return {
    id: `${category}:${gymId}:${detectedAt || ""}`,
    severity,
    gymId,
    gymName,
    problem,
    detectedAt: detectedAt || null,
    recommendedAction: action,
    category,
    status: "open" // this service only ever reports OPEN issues — an issue
                    // disappears from the list once the underlying record
                    // changes (e.g. payment approved, subscription reactivated),
                    // rather than being marked "resolved" by hand.
  };
}

/**
 * @returns {object[]} every open issue across the whole platform,
 *   most severe first, ties broken by oldest-detected-first.
 */
export function getAttentionIssues(){
  const issues = [];
  const registry = getGymRegistry().filter(r => !r.isDeleted);
  const payments = getAllPaymentsForDeveloper();
  const invoices = getAllInvoicesForDeveloper();

  registry.forEach(row => {
    // --- Subscription-state issues -----------------------------------
    if(row.status === SUBSCRIPTION_STATUS.SUSPENDED){
      issues.push(issue({
        severity: ATTENTION_SEVERITY.CRITICAL,
        gymId: row.gymId, gymName: row.gymName,
        problem: "Subscription suspended — AI receptionist is off for this gym.",
        detectedAt: row.nextBillingDate,
        action: "Review payment history and reactivate, or contact the owner.",
        category: "subscription_suspended"
      }));
    } else if(row.status === SUBSCRIPTION_STATUS.GRACE_PERIOD){
      issues.push(issue({
        severity: ATTENTION_SEVERITY.HIGH,
        gymId: row.gymId, gymName: row.gymName,
        problem: "In grace period — will auto-suspend if payment isn't confirmed soon.",
        detectedAt: row.nextBillingDate,
        action: "Follow up with the owner before this auto-suspends.",
        category: "subscription_grace_period"
      }));
    } else if(row.status === SUBSCRIPTION_STATUS.PENDING_PAYMENT){
      issues.push(issue({
        severity: ATTENTION_SEVERITY.MEDIUM,
        gymId: row.gymId, gymName: row.gymName,
        problem: `Payment pending${row.amountDue ? ` — ₱${row.amountDue} due` : ""}.`,
        detectedAt: row.nextBillingDate,
        action: "Check the GCash Billing queue for a submitted payment.",
        category: "subscription_pending_payment"
      }));
    }

    if(row.status !== SUBSCRIPTION_STATUS.SUSPENDED
       && row.status !== SUBSCRIPTION_STATUS.DISABLED
       && row.status !== SUBSCRIPTION_STATUS.CANCELED
       && !row.aiEnabled){
      issues.push(issue({
        severity: ATTENTION_SEVERITY.MEDIUM,
        gymId: row.gymId, gymName: row.gymName,
        problem: "AI receptionist is disabled for this gym's current plan/status.",
        detectedAt: null,
        action: "Confirm this is expected, or check the gym's plan access.",
        category: "ai_inactive"
      }));
    }

    // --- Incomplete profile --------------------------------------------
    const settings = getBusinessSettings(row.gymId);
    if(!settings || !settings.gymName || !settings.description){
      issues.push(issue({
        severity: ATTENTION_SEVERITY.LOW,
        gymId: row.gymId, gymName: row.gymName,
        problem: "Gym profile is incomplete (missing name and/or description for the AI).",
        detectedAt: row.createdAt,
        action: "Prompt the owner to finish Business Settings.",
        category: "incomplete_profile"
      }));
    }
  });

  // --- GCash payments awaiting review, aged ---------------------------
  payments
    .filter(p => p.status === GCASH_PAYMENT_STATUS.SUBMITTED)
    .forEach(p => {
      const age = daysSince(p.submittedAt);
      issues.push(issue({
        severity: age !== null && age >= 2 ? ATTENTION_SEVERITY.HIGH : ATTENTION_SEVERITY.MEDIUM,
        gymId: p.gymId,
        gymName: (registry.find(r => r.gymId === p.gymId) || {}).gymName || "(unknown gym)",
        problem: `GCash payment awaiting verification${age !== null ? ` (submitted ${age}d ago)` : ""}.`,
        detectedAt: p.submittedAt,
        action: "Review in GCash Billing → Pending Payments.",
        category: "payment_awaiting_review"
      }));
    });

  // --- Overdue invoices -------------------------------------------------
  invoices
    .filter(inv => inv.status === INVOICE_STATUS.OVERDUE)
    .forEach(inv => {
      issues.push(issue({
        severity: ATTENTION_SEVERITY.HIGH,
        gymId: inv.gymId,
        gymName: (registry.find(r => r.gymId === inv.gymId) || {}).gymName || "(unknown gym)",
        problem: `Invoice overdue — ₱${inv.amount}.`,
        detectedAt: inv.dueDate || inv.createdAt,
        action: "Confirm payment status with the owner or mark resolved.",
        category: "invoice_overdue"
      }));
    });

  issues.sort((a, b) => {
    const rankDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if(rankDiff !== 0) return rankDiff;
    return new Date(a.detectedAt || 0) - new Date(b.detectedAt || 0);
  });

  return issues;
}

/** @returns {{total:number, bySeverity:Record<string,number>}} */
export function getAttentionSummary(){
  const issues = getAttentionIssues();
  const bySeverity = Object.values(ATTENTION_SEVERITY).reduce((acc, s) => {
    acc[s] = 0;
    return acc;
  }, {});
  issues.forEach(i => { bySeverity[i.severity]++; });
  return { total: issues.length, bySeverity };
}
