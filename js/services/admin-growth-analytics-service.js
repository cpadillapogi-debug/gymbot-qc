/* ============================================================
   GYMBOT QC — MASTER ADMIN: GROWTH ANALYTICS SERVICE (Phase 16)
   Buckets real, timestamped records into a time series for the
   Overview page's growth charts. Pure logic + composition, no DOM.

   WHAT'S CHARTED (both have a real timestamp on every record):
     - New gyms per period (gym.createdAt, tenant-service.js)
     - Approved GCash payments per period, count + amount
       (payment.decidedAt, gcash-payment-service.js) — this is
       real settled revenue, not MRR (MRR is a point-in-time
       snapshot of current subscriptions, not a historical series,
       since this app doesn't log subscription-amount history).

   WHAT'S DELIBERATELY NOT CHARTED, AND WHY: the original wishlist
   also asked for "AI adoption over time" and "churn over time."
   Neither has a real historical trail in this codebase — AI
   enabled/disabled is a current boolean with no change log, and
   subscription status transitions aren't stored as a time series
   either (only the CURRENT status, plus discrete audit-log
   entries for status-change actions, which is a different shape
   than a clean daily series). Charting either would mean
   inventing a smooth trend line from a single data point, which
   is exactly the "do not hardcode fake analytics" rule the
   platform's own spec calls out. When a real subscription-history
   table exists, add those series here the same way the two below
   are built.
   ============================================================ */
import { getGymRegistry, getPaymentHistoryForDeveloper } from "./admin-registry-service.js";
import { GCASH_PAYMENT_STATUS } from "../config.js";

export const GROWTH_RANGES = Object.freeze({
  DAYS_7: "7d",
  DAYS_30: "30d",
  DAYS_90: "90d",
  MONTHS_12: "12m"
});

const RANGE_LABELS = Object.freeze({
  [GROWTH_RANGES.DAYS_7]: "Last 7 days",
  [GROWTH_RANGES.DAYS_30]: "Last 30 days",
  [GROWTH_RANGES.DAYS_90]: "Last 90 days",
  [GROWTH_RANGES.MONTHS_12]: "Last 12 months"
});

export function getRangeLabel(rangeKey){
  return RANGE_LABELS[rangeKey] || RANGE_LABELS[GROWTH_RANGES.DAYS_30];
}

function buildBuckets(rangeKey){
  const now = new Date();
  const buckets = [];

  if(rangeKey === GROWTH_RANGES.MONTHS_12){
    for(let i = 11; i >= 0; i--){
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        label: d.toLocaleDateString(undefined, { month: "short" }),
        start: d,
        end: new Date(d.getFullYear(), d.getMonth() + 1, 1)
      });
    }
    return buckets;
  }

  const days = rangeKey === GROWTH_RANGES.DAYS_7 ? 7 : rangeKey === GROWTH_RANGES.DAYS_90 ? 90 : 30;
  for(let i = days - 1; i >= 0; i--){
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    buckets.push({
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      start: d,
      end: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
    });
  }
  return buckets;
}

function inBucket(dateStr, bucket){
  const t = new Date(dateStr).getTime();
  return t >= bucket.start.getTime() && t < bucket.end.getTime();
}

/**
 * @param {string} rangeKey one of GROWTH_RANGES
 * @returns {{labels:string[], newGyms:number[], approvedPaymentsCount:number[], approvedPaymentsAmount:number[], totalNewGyms:number, totalApprovedAmount:number}}
 */
export function getGrowthSeries(rangeKey){
  const buckets = buildBuckets(rangeKey);
  const gyms = getGymRegistry().filter(g => !g.isDeleted);
  const payments = getPaymentHistoryForDeveloper()
    .map(r => r.payment)
    .filter(p => p.status === GCASH_PAYMENT_STATUS.APPROVED && p.decidedAt);

  const newGyms = buckets.map(b => gyms.filter(g => inBucket(g.createdAt, b)).length);
  const approvedPaymentsCount = buckets.map(b => payments.filter(p => inBucket(p.decidedAt, b)).length);
  const approvedPaymentsAmount = buckets.map(b =>
    payments.filter(p => inBucket(p.decidedAt, b)).reduce((sum, p) => sum + p.amount, 0)
  );

  return {
    labels: buckets.map(b => b.label),
    newGyms,
    approvedPaymentsCount,
    approvedPaymentsAmount,
    totalNewGyms: newGyms.reduce((a, b) => a + b, 0),
    totalApprovedAmount: approvedPaymentsAmount.reduce((a, b) => a + b, 0)
  };
}
