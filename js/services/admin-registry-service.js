/* ============================================================
   GYMBOT QC — ADMIN REGISTRY SERVICE (Phase 7: Master Admin)
   Read-only aggregation layer for the Master Admin dashboard.
   Pure logic + composition of other services, no DOM — same
   layering as owner-dashboard-metrics-service.js, except this
   one is explicitly Developer-only and deliberately CROSSES
   tenant boundaries on purpose (that's the whole point of a
   platform-wide registry).

   PERMISSION BOUNDARY: every export here reads across every gym
   on the platform. Gating is the Master Admin UI's
   requireRole(ROLES.DEVELOPER) guard (see admin-shell-ui.js),
   not this file — same boundary style as
   tenant-service.js's getAllGymsForDeveloper(). This module must
   NEVER be imported from owner-facing code (owner-shell-ui.js
   and everything it imports).
   ============================================================ */
import { SUBSCRIPTION_STATUS, INVOICE_STATUS, GCASH_PAYMENT_STATUS } from "../config.js";
import { getAllGymsForDeveloper, getGymById, isGymDeleted } from "./tenant-service.js";
import { getAllUsersForDeveloper, getUserByIdForDeveloper } from "./auth-service.js";
import {
  getSubscription, getPlan, getSubscriptionAccess,
  getTrialDaysRemaining, getAmountDue, getPaymentStatusLabel
} from "./subscription-service.js";
import { getInvoicesForGym, getAllInvoicesForDeveloper } from "./invoice-service.js";
import { getLeads } from "./leads-service.js";
import { getBusinessSettings } from "./gym-settings-service.js";
import { isToday } from "../utils.js";
import { getAllSubmittedPayments, getAllPaymentsForDeveloper } from "./gcash-payment-service.js";

/**
 * One row per gym on the platform, joining the gym record with its
 * owner account, current subscription (state machine already advanced
 * — see getSubscription()), and lead count. This is the data behind
 * the Gym Registry table.
 * @returns {object[]}
 */
export function getGymRegistry(){
  const gyms = getAllGymsForDeveloper();

  return gyms.map(gym => {
    const owner = getUserByIdForDeveloper(gym.ownerId);
    const sub = getSubscription(gym.id);
    const plan = getPlan(sub.planId);
    const requestedPlan = sub.requestedPlanId ? getPlan(sub.requestedPlanId) : null;
    const access = getSubscriptionAccess(sub.status);
    const invoices = getInvoicesForGym(gym.id);

    return {
      gymId: gym.id,
      gymName: gym.name,
      createdAt: gym.createdAt,
      deletedAt: gym.deletedAt || null,
      isDeleted: isGymDeleted(gym),
      ownerId: gym.ownerId,
      // No separate "owner name" field exists yet (see auth-service.js's
      // user model) — email is the owner identity everywhere in this codebase.
      ownerEmail: owner ? owner.email : "(no owner account)",
      ownerLastLogin: owner ? owner.lastLoginAt || null : null,
      planId: plan.id,
      planName: plan.name,
      status: sub.status,
      trialDaysRemaining: getTrialDaysRemaining(sub),
      nextBillingDate: sub.nextBillingDate,
      amountDue: getAmountDue(sub),
      requestedPlanId: sub.requestedPlanId,
      requestedPlanName: requestedPlan ? requestedPlan.name : null,
      aiEnabled: access.aiEnabled,
      leadsCount: getLeads(gym.id).length,
      invoiceCount: invoices.length,
      latestInvoiceStatus: invoices.length > 0 ? invoices[0].status : null
    };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Full detail for one gym — everything the Gym Registry's detail
 * panel shows, plus what its action buttons need to decide whether
 * to render (subscription access flags, invoice history).
 * @returns {object|null}
 */
export function getGymDetail(gymId){
  const gym = getGymById(gymId);
  if(!gym) return null;

  const owner = getUserByIdForDeveloper(gym.ownerId);
  const sub = getSubscription(gymId);
  const plan = getPlan(sub.planId);
  const requestedPlan = sub.requestedPlanId ? getPlan(sub.requestedPlanId) : null;
  const access = getSubscriptionAccess(sub.status);
  const settings = getBusinessSettings(gymId);

  return {
    gym,
    isDeleted: isGymDeleted(gym),
    owner,
    subscription: sub,
    plan,
    requestedPlan,
    access,
    trialDaysRemaining: getTrialDaysRemaining(sub),
    amountDue: getAmountDue(sub),
    paymentStatusLabel: getPaymentStatusLabel(sub),
    leadsCount: getLeads(gymId).length,
    invoices: getInvoicesForGym(gymId),
    gymName: settings && settings.gymName ? settings.gymName : gym.name
  };
}

/**
 * Platform-wide counts + a simulated MRR estimate for the Overview
 * page. MRR is illustrative only — same honesty pattern as
 * OWNER_DEMO_METRICS: it sums priceMonthly for every gym currently in
 * an access-granting paid state, not real captured revenue (there is
 * still no payment gateway — see docs/PHASE6_NOTES.md).
 * @returns {object}
 */
export function getPlatformOverview(){
  const registry = getGymRegistry();
  // Soft-deleted gyms keep their subscription record untouched (deletion
  // only sets deletedAt on the gym, by design — see tenant-service.js),
  // so without this filter a deleted gym's old "Active" status would
  // keep inflating totalGyms/statusCounts/estimatedMrr forever. Excluded
  // from every aggregate below; still included in `recentGyms` further
  // down (unfiltered) since that's a recent-activity feed where seeing
  // "this gym was just deleted" is useful, not a live count.
  const liveRegistry = registry.filter(row => !row.isDeleted);
  const users = getAllUsersForDeveloper();

  const statusCounts = Object.values(SUBSCRIPTION_STATUS).reduce((acc, s) => {
    acc[s] = 0;
    return acc;
  }, {});
  let estimatedMrr = 0;
  let pendingUpgradeCount = 0;

  liveRegistry.forEach(row => {
    if(statusCounts[row.status] !== undefined) statusCounts[row.status]++;
    if(row.status === SUBSCRIPTION_STATUS.ACTIVE){
      estimatedMrr += getPlan(row.planId).priceMonthly;
    }
    if(row.requestedPlanId) pendingUpgradeCount++;
  });

  const needsAttentionCount =
    statusCounts[SUBSCRIPTION_STATUS.GRACE_PERIOD] +
    statusCounts[SUBSCRIPTION_STATUS.SUSPENDED] +
    statusCounts[SUBSCRIPTION_STATUS.DISABLED];

  return {
    totalGyms: liveRegistry.length,
    totalOwners: users.filter(u => u.role === "gym_owner").length,
    statusCounts,
    estimatedMrr,
    pendingUpgradeCount,
    needsAttentionCount,
    recentGyms: registry.slice(0, 5)
  };
}

/**
 * Phase 10: the Developer Dashboard's "Pending Payments" queue — every
 * Submitted GCash payment, joined with the gym/owner/plan context the
 * approval UI needs to render without a second lookup per row.
 * @returns {object[]} oldest-submitted-first (FIFO review order)
 */
export function getPendingPaymentsForDeveloper(){
  return getAllSubmittedPayments().map(payment => {
    const gym = getGymById(payment.gymId);
    const owner = gym ? getUserByIdForDeveloper(gym.ownerId) : null;
    return {
      payment,
      gymId: payment.gymId,
      gymName: gym ? gym.name : "(deleted gym)",
      ownerEmail: owner ? owner.email : "(no owner account)"
    };
  });
}

/**
 * Phase 13: the GCash Billing Center's "Payment History" tab — every
 * payment ever submitted, ANY status, same gym/owner join as
 * getPendingPaymentsForDeveloper() above so the history table doesn't
 * need a second lookup per row either. Newest-submitted-first (history
 * reading order, opposite of the FIFO review queue above).
 * @returns {object[]}
 */
export function getPaymentHistoryForDeveloper(){
  return getAllPaymentsForDeveloper().map(payment => {
    const gym = getGymById(payment.gymId);
    const owner = gym ? getUserByIdForDeveloper(gym.ownerId) : null;
    return {
      payment,
      gymId: payment.gymId,
      gymName: gym ? gym.name : "(deleted gym)",
      ownerEmail: owner ? owner.email : "(no owner account)"
    };
  });
}

/**
 * Fuller Developer Analytics panel (Phase 8) — everything
 * getPlatformOverview() has, plus platform-wide totals that only
 * matter to the Developer Dashboard's Analytics section specifically.
 * AI usage is a realistic PLACEHOLDER (see header comment on
 * OWNER_DEMO_METRICS in config.js for the same honesty pattern) — there's
 * no real per-conversation AI usage log yet, only the gyms that currently
 * have AI enabled.
 * @returns {object}
 */
export function getDeveloperAnalytics(){
  const overview = getPlatformOverview();
  const registry = getGymRegistry();

  const totalLeadsAllGyms = registry.reduce((sum, r) => sum + r.leadsCount, 0);
  const pendingPaymentCount =
    overview.statusCounts[SUBSCRIPTION_STATUS.PENDING_PAYMENT] +
    overview.statusCounts[SUBSCRIPTION_STATUS.GRACE_PERIOD];

  // Illustrative commission model: 15% of estimated MRR. Tunable once a
  // real billing/partner-commission structure exists.
  const estimatedCommissionRevenue = Math.round(overview.estimatedMrr * 0.15);

  const now = new Date();
  const newGymsThisMonth = registry.filter(r => {
    const d = new Date(r.createdAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;

  // Placeholder: gyms with AI currently enabled, standing in for a real
  // "conversations handled today" count until conversation logging exists.
  const aiUsageToday = registry.filter(r => r.aiEnabled).length;

  // Phase 10: real figures from actual GCash invoices/payments, replacing
  // the estimatedCommissionRevenue placeholder above with an honest total
  // for anything that's actually gone through the approval workflow.
  // estimatedMrr/estimatedCommissionRevenue (above) stay as-is — they're
  // still the only numbers available for gyms currently Active who
  // haven't gone through a fresh GCash approval yet (e.g. seeded/demo
  // data, or accounts activated manually pre-Phase-10).
  const allInvoices = getAllInvoicesForDeveloper();
  const paidInvoices = allInvoices.filter(inv => inv.status === INVOICE_STATUS.PAID);
  const overdueInvoices = allInvoices.filter(inv => inv.status === INVOICE_STATUS.OVERDUE);
  const totalSubscriptionRevenue = paidInvoices.reduce((sum, inv) => sum + inv.amount, 0);

  const approvedPayments = getAllPaymentsForDeveloper().filter(p => p.status === GCASH_PAYMENT_STATUS.APPROVED);
  const totalCommissionsCollected = approvedPayments.reduce((sum, p) => sum + (p.commissionAmount || 0), 0);

  const pendingPaymentsQueueCount = getPendingPaymentsForDeveloper().length;
  const estimatedArr = overview.estimatedMrr * 12;

  return Object.assign({}, overview, {
    totalLeadsAllGyms,
    pendingPaymentCount,
    estimatedCommissionRevenue,
    newGymsThisMonth,
    aiUsageToday,
    // Phase 10: GCash Billing & Commission Engine
    totalSubscriptionRevenue,
    totalCommissionsCollected,
    paidInvoicesCount: paidInvoices.length,
    overdueInvoicesCount: overdueInvoices.length,
    pendingPaymentsQueueCount,
    estimatedArr
  });
}
