/* ============================================================
   GYMBOT QC — LEAD CRM METRICS (Phase 5)
   Pure calculations over one gym's leads for the Leads page's
   stat cards. No DOM, no storage — mirrors dashboard-service.js's
   pattern but works off real lead statuses instead of the
   Phase 3 "every lead = a trial" shortcut.
   ============================================================ */
import { CONFIG } from "../config.js";
import { isToday } from "../utils.js";

// Statuses that mean "this person has actually come in for a trial",
// i.e. the pipeline moved past just being scheduled.
const TRIAL_BOOKED_STATUSES = new Set(["Scheduled", "Trial Completed", "Converted"]);

/**
 * @param {object[]} leads this gym's leads (already tenant-scoped by the caller)
 * @returns {{
 *   totalLeads:number, newLeadsToday:number, trialBookings:number,
 *   convertedMembers:number, conversionRate:number, estimatedRevenue:number
 * }}
 */
export function getLeadCrmMetrics(leads){
  const list = Array.isArray(leads) ? leads : [];

  const totalLeads = list.length;
  const newLeadsToday = list.filter(l => l && l.createdAt && isToday(l.createdAt)).length;
  const trialBookings = list.filter(l => l && TRIAL_BOOKED_STATUSES.has(l.status)).length;
  const convertedMembers = list.filter(l => l && l.status === "Converted").length;
  const conversionRate = totalLeads > 0 ? convertedMembers / totalLeads : 0;
  // Illustrative, same assumption dashboard-service.js already uses
  // elsewhere: a converted member is worth one membership's value.
  const estimatedRevenue = Math.round(convertedMembers * CONFIG.AVG_MEMBERSHIP_VALUE);

  return { totalLeads, newLeadsToday, trialBookings, convertedMembers, conversionRate, estimatedRevenue };
}
