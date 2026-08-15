/* ============================================================
   GYMBOT QC — DASHBOARD SERVICE
   Pure calculations over leads data. No DOM.
   ============================================================ */
import { CONFIG } from "../config.js";
import { isToday } from "../utils.js";

/**
 * @param {object[]} leads
 * @returns {{leadsToday:number, trialsToday:number, revenue:number, hoursSaved:number}}
 */
export function computeStats(leads){
  const todaysLeads = leads.filter(l => l && l.createdAt && isToday(l.createdAt));

  // In this MVP, every captured lead = a trial booking.
  const leadsToday = todaysLeads.length;
  const trialsToday = todaysLeads.length;
  const revenue = Math.round(trialsToday * CONFIG.ASSUMED_TRIAL_TO_MEMBER_RATE * CONFIG.AVG_MEMBERSHIP_VALUE);
  const hoursSaved = Math.round(((trialsToday * CONFIG.MINUTES_SAVED_PER_LEAD) / 60) * 10) / 10;

  return { leadsToday, trialsToday, revenue, hoursSaved };
}
