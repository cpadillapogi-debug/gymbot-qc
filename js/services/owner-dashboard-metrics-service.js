/* ============================================================
   GYMBOT QC — OWNER DASHBOARD METRICS (Phase 3)
   Assembles the Gym Owner Dashboard's summary-card numbers.
   No DOM here — pure calculation, same pattern as
   dashboard-service.js.

   HONESTY ABOUT WHAT'S REAL: leads captured today, trial
   bookings, and estimated revenue come from real localStorage
   lead data via dashboard-service.computeStats() — the same
   numbers the Phase 1/2 console already showed. Membership
   inquiries, converted members, AI response rate, and average
   response time have no real source yet (there's no AI
   conversation log or CRM until Phases 4–5), so those four are
   OWNER_DEMO_METRICS placeholders. The dashboard UI labels the
   card row as demo data rather than silently mixing real and
   fake numbers with no disclosure.
   ============================================================ */
import { OWNER_DEMO_METRICS } from "../config.js";
import { computeStats } from "./dashboard-service.js";

/**
 * @param {object[]} leads this gym's leads (already tenant-scoped by the caller)
 * @returns {{
 *   inquiriesToday:number, trialsToday:number, membershipInquiriesToday:number,
 *   newLeadsToday:number, convertedMembersThisMonth:number, revenue:number,
 *   estimatedMonthlyRevenue:number, aiResponseRate:number, avgResponseTimeSeconds:number
 * }}
 */
export function getOwnerDashboardMetrics(leads){
  const real = computeStats(leads || []);

  return {
    // Real, from captured leads:
    trialsToday: real.trialsToday,
    newLeadsToday: real.leadsToday,
    revenue: real.revenue,
    // Simple illustrative extrapolation (today's estimate × 30) — a
    // real monthly figure needs actual historical data (Phase 5).
    estimatedMonthlyRevenue: real.revenue * 30,
    // "Today's inquiries" = every chat that reached a lead-worthy
    // moment; in this MVP that's trials + the demo membership-only
    // inquiries figure below (people who asked but didn't book).
    inquiriesToday: real.trialsToday + OWNER_DEMO_METRICS.membershipInquiriesToday,
    // Demo placeholders (see file header):
    membershipInquiriesToday: OWNER_DEMO_METRICS.membershipInquiriesToday,
    convertedMembersThisMonth: OWNER_DEMO_METRICS.convertedMembersThisMonth,
    aiResponseRate: OWNER_DEMO_METRICS.aiResponseRate,
    avgResponseTimeSeconds: OWNER_DEMO_METRICS.avgResponseTimeSeconds
  };
}
