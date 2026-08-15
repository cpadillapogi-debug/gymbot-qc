/* ============================================================
   GYMBOT QC — AI PROFILE SERVICE (Phase 4)
   Converts a gym's structured Business Settings record into the
   plain-text "gym info" block the AI Receptionist's prompt is
   built from — and into a short human-readable preview an owner
   can read on their AI Receptionist page.

   This is the seam Phase 5's real per-gym chat will plug into
   (today's public chat demo on index.html still runs off the
   single freeform blob in gym-info-service.js). Keeping this
   conversion in one place means Phase 5 doesn't re-derive it.

   Pure logic only — no DOM, no storage, no network.
   ============================================================ */

const YES_NO_LABEL = Object.freeze({
  yes: "Available",
  no: "Not available",
  unspecified: "Not specified"
});

/**
 * @param {object} settings a record from gym-settings-service.js's getBusinessSettings()
 * @returns {string} plain-text block suitable as the GYM INFO section of a system prompt
 */
export function buildProfileText(settings){
  const s = settings || {};
  const lines = [];

  if(s.gymName) lines.push(`Gym name: ${s.gymName}`);
  if(s.description) lines.push(`About: ${s.description}`);
  if(s.address) lines.push(`Location: ${s.address}`);
  if(s.hours) lines.push(`Hours: ${s.hours}`);
  if(s.membershipFee) lines.push(`Monthly membership: ${s.membershipFee}`);
  if(s.walkInFee) lines.push(`Walk-in rate: ${s.walkInFee}`);
  if(s.studentDiscount) lines.push(`Student discount: ${s.studentDiscount}`);
  if(s.ptRate) lines.push(`Personal training: ${s.ptRate}`);
  if(s.trainerAvailable !== "unspecified") lines.push(`Trainers on staff: ${YES_NO_LABEL[s.trainerAvailable]}`);
  if(s.freeTrialAvailable !== "unspecified") lines.push(`Free trial: ${YES_NO_LABEL[s.freeTrialAvailable]}`);
  if(s.parkingAvailable !== "unspecified") lines.push(`Parking: ${YES_NO_LABEL[s.parkingAvailable]}`);
  if(s.contactNumber) lines.push(`Contact number: ${s.contactNumber}`);
  if(s.facebookUrl) lines.push(`Facebook: ${s.facebookUrl}`);
  if(s.instagramUrl) lines.push(`Instagram: ${s.instagramUrl}`);

  const faqs = Array.isArray(s.faqs) ? s.faqs.filter(f => f && f.question && f.answer) : [];
  if(faqs.length > 0){
    lines.push("FAQs:");
    faqs.forEach(f => lines.push(`- Q: ${f.question} A: ${f.answer}`));
  }

  return lines.join("\n");
}

/**
 * @param {object} settings
 * @returns {{ok:boolean, missing:string[]}} which core fields are still empty —
 *   used by the owner-facing AI Receptionist status page, never by the prompt itself.
 */
export function profileCompleteness(settings){
  const s = settings || {};
  const checks = [
    ["gymName", "Gym name"],
    ["hours", "Operating hours"],
    ["membershipFee", "Membership fee"],
    ["welcomeMessage", "Welcome message"]
  ];
  const missing = checks.filter(([key]) => !String(s[key] || "").trim()).map(([, label]) => label);
  return { ok: missing.length === 0, missing };
}
