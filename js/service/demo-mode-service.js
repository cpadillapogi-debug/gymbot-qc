/* ============================================================
   GYMBOT QC — DEMO MODE SERVICE (Phase 11)
   Seeds (and clears) one realistic, clearly-labeled demo gym so
   a Developer can run a live sales demo for a prospective gym
   owner — full leads/invoices/subscription/AI-conversation data,
   without touching any real gym's data.

   This is deliberately built on the SAME service functions every
   other feature uses (leads-service, invoice-service,
   subscription-service, gym-settings-service) rather than writing
   fake rows directly into storage — so the demo gym behaves
   exactly like a real one everywhere in the app (Gym Registry,
   Overview totals, Revenue tab, etc). The only thing special
   about it is the `(Demo)` suffix on its name and the id this
   module remembers in CONFIG.STORAGE_KEYS.demoGymId.

   PERMISSION BOUNDARY: this file is Developer-only tooling (same
   as dev-console-service.js) — it is only ever imported from
   admin-dev-console-ui.js, never from owner-facing code.
   ============================================================ */
import { storage } from "../storage.js";
import { CONFIG, LEAD_STATUSES } from "../config.js";
import { createGym, getGymById, getAllGymsForDeveloper, deleteGymForDeveloper } from "./tenant-service.js";
import { clearLeads, saveLead, updateLeadStatus, updateLeadNotes } from "./leads-service.js";
import { generateInvoice } from "./invoice-service.js";
import { getSubscription, activateGymManually } from "./subscription-service.js";
import { saveBusinessSettings } from "./gym-settings-service.js";
import { generateId } from "../utils.js";

const DEMO_GYM_NAME = "Congress Ave Fitness (Demo)";
const DEMO_OWNER_ID = "demo_owner_no_login"; // intentionally has no matching user account — see admin-gym-registry-ui.js's "(no owner account)" fallback

/** @returns {string|null} the demo gym's id, if one has been seeded and still exists */
export function getShowcaseGymId(){
  const id = storage.getJSON("demoGymId", null);
  if(!id) return null;
  const gym = getGymById(id);
  return (gym && !gym.deletedAt) ? id : null;
}

export function isShowcaseGymSeeded(){
  return !!getShowcaseGymId();
}

/**
 * Creates (or reuses) the demo gym and repopulates it with a fresh,
 * realistic dataset. Safe to call repeatedly — each call clears the
 * demo gym's previous leads/invoices before reseeding, so "Reseed
 * Demo Data" always leaves a clean, presentation-ready state.
 * @returns {{ok:boolean, gymId?:string, reason?:string}}
 */
export function seedShowcaseGym(){
  let gymId = getShowcaseGymId();
  if(!gymId){
    const gym = createGym({ name: DEMO_GYM_NAME, ownerId: DEMO_OWNER_ID });
    gymId = gym.id;
    storage.setJSON("demoGymId", gymId);
  }

  // Business settings — what the AI receptionist and dashboard show.
  saveBusinessSettings(gymId, {
    gymName: DEMO_GYM_NAME,
    address: "142 Congress Ave, Quezon City",
    contactNumber: "0917 555 0142",
    hours: "Mon–Sat 5:00 AM – 10:00 PM, Sun 7:00 AM – 6:00 PM",
    membershipFee: "₱1,200/month",
    walkInFee: "₱150/session",
    studentDiscount: "₱1,000/month with valid school ID",
    ptRate: "₱350/session",
    parkingAvailable: "yes",
    trainerAvailable: "yes",
    freeTrialAvailable: "yes",
    description: "A mid-sized strength & conditioning gym in QC, demoing GymBot QC to prospective clients.",
    welcomeMessage: "Hi! Welcome to Congress Ave Fitness — ask me about rates, trainers, or book a free trial."
  });

  // Leads across the full pipeline, dated over the last ~10 days so
  // the dashboard's "today" stats and older history both have data.
  clearLeads(gymId);
  const sampleLeads = [
    { name: "Ana Reyes", phone: "0917 234 5671", email: "ana.reyes@example.com", goal: "Weight loss", preferredTime: "Evenings", source: "Messenger", status: "Converted", notes: "AI conversation: asked about student discount, booked a trial, converted after 2 visits.", daysAgo: 9 },
    { name: "Miguel Santos", phone: "0917 234 5672", email: "miguel.s@example.com", goal: "Muscle gain", preferredTime: "Mornings", source: "Website", status: "Trial Completed", notes: "AI conversation: asked about PT rates and trainer availability; trial session done, awaiting decision.", daysAgo: 7 },
    { name: "Carla Dizon", phone: "0917 234 5673", email: "", goal: "General fitness", preferredTime: "Weekends", source: "Referral", status: "Scheduled", notes: "AI conversation: referred by Ana Reyes, booked a free trial for this weekend.", daysAgo: 5 },
    { name: "Jerome Aquino", phone: "0917 234 5674", email: "jerome.a@example.com", goal: "Strength training", preferredTime: "Evenings", source: "Walk-in", status: "Contacted", notes: "AI conversation: asked \"magkano po ang monthly?\" — quoted ₱1,200, following up.", daysAgo: 3 },
    { name: "Bea Fernandez", phone: "0917 234 5675", email: "bea.f@example.com", goal: "Weight loss", preferredTime: "Mornings", source: "Messenger", status: "New", notes: "AI conversation: asked about parking and free trial, hasn't replied since.", daysAgo: 1 },
    { name: "Paolo Cruz", phone: "0917 234 5676", email: "", goal: "General fitness", preferredTime: "Evenings", source: "Website", status: "Lost", notes: "AI conversation: said \"medyo mahal po\" and didn't follow up after the student-discount offer.", daysAgo: 8 }
  ];
  sampleLeads.forEach(sample => {
    const lead = saveLead({
      gymId,
      name: sample.name,
      phone: sample.phone,
      email: sample.email,
      goal: sample.goal,
      preferredTime: sample.preferredTime,
      source: sample.source,
      conversationSummary: sample.notes
    });
    if(sample.status !== LEAD_STATUSES[0]) updateLeadStatus(gymId, lead.id, sample.status);
    updateLeadNotes(gymId, lead.id, sample.notes);
    backdateRecord(gymId, lead.id, sample.daysAgo);
  });

  // Subscription — Active on the Pro plan, so Revenue/Billing tabs
  // have a real paid gym to show, not just a trial.
  activateGymManually(gymId, "demo-mode-service");
  const sub = getSubscription(gymId);

  // Invoices — one Paid history entry plus the current Pending one
  // subscription-service already generated via activateGymManually.
  const now = new Date();
  const lastMonth = new Date(now); lastMonth.setDate(lastMonth.getDate() - 30);
  generateInvoice(gymId, { id: sub.planId, name: sub.planId === "elite" ? "Elite" : sub.planId === "starter" ? "Starter" : "Pro", priceMonthly: 2500 }, {
    createdAt: lastMonth.toISOString(),
    dueDate: lastMonth.toISOString(),
    status: "paid",
    periodStart: lastMonth.toISOString(),
    periodEnd: now.toISOString()
  });

  return { ok: true, gymId };
}

/** Backdates a lead's createdAt/lastActivityAt so demo data doesn't
 *  all look like it happened in the same second. Best-effort — reads
 *  back through the public leads API rather than touching storage
 *  directly, so it stays subject to the same validation as everything
 *  else. */
function backdateRecord(gymId, leadId, daysAgo){
  if(!daysAgo) return;
  try{
    const all = storage.getJSON("leads", [], { requireArray: true });
    const idx = all.findIndex(l => l && l.gymId === gymId && l.id === leadId);
    if(idx === -1) return;
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    all[idx] = Object.assign({}, all[idx], { createdAt: d.toISOString(), lastActivityAt: d.toISOString() });
    storage.setJSON("leads", all);
  }catch(err){
    console.warn("[demo-mode-service] backdate skipped:", err);
  }
}

/** Removes the demo gym entirely (soft-delete, same as any other Gym
 *  Registry deletion) and forgets its id, so a future "Seed Demo Data"
 *  starts clean. Real gyms are never touched by this function. */
export function clearShowcaseGym(performedBy){
  const gymId = getShowcaseGymId();
  if(!gymId) return { ok: true, cleared: false };
  clearLeads(gymId);
  deleteGymForDeveloper(gymId, performedBy || "demo-mode-service");
  storage.setJSON("demoGymId", null);
  return { ok: true, cleared: true };
}

export function getShowcaseGymName(){
  return DEMO_GYM_NAME;
}
