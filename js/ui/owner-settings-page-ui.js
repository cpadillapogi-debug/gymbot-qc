/* ============================================================
   GYMBOT QC — OWNER: BUSINESS SETTINGS PAGE (Phase 3)
   The one page a Gym Owner can actually edit data on. Every
   field here belongs to their own gym only — see
   gym-settings-service.js for the tenant-scoped storage.

   PERMISSION BOUNDARY: this module must never read or write
   CONFIG.STORAGE_KEYS.apiKey, never import gemini-service.js or
   api-key-service.js, and never render subscription pricing,
   commission, or other gyms' data. If a future field needs any
   of that, it belongs on a Developer-only page instead.
   ============================================================ */
import { escapeHtml, generateId } from "../utils.js";
import { getBusinessSettings, saveBusinessSettings } from "../services/gym-settings-service.js";
import { FAQ_MAX_COUNT } from "../config.js";
import { showToast } from "./toast-ui.js";

// Phase 12: curated starter questions drawn from common gym-customer
// inquiries (pricing, policies, facilities, etc.) that this app has no
// dedicated Business Settings field for. One-click adds the question
// with a blank answer for the owner to fill in — feeds both the real
// AI (via ai-profile-service.js's buildProfileText) and the fallback's
// new FAQ matching (see fallback-response-service.js). Deliberately a
// top-~25 subset, not all 258 possible gym FAQs — see this feature's
// own design note: quality/coverage over an overwhelming checklist.
const FAQ_SUGGESTIONS = Object.freeze([
  "Do you have promos or ongoing discounts?",
  "What's included in the membership?",
  "Do you have a day pass / walk-in rate?",
  "What's the minimum age to join?",
  "Do minors need parental consent?",
  "Do you have lockers?",
  "Do you have showers?",
  "Can I bring a guest?",
  "How do I cancel my membership?",
  "Can I freeze/pause my membership?",
  "How do I renew my membership?",
  "What equipment do you have?",
  "Do you have squat racks / power racks?",
  "Do you have dumbbells and barbells?",
  "What are your gym rules?",
  "Is a dress code required?",
  "Do I need to sign a waiver?",
  "Can I register online?",
  "Do you offer fitness classes?",
  "What's your class schedule?",
  "Are you open on holidays?",
  "Do you have Wi-Fi?",
  "Is the gym air-conditioned?",
  "Do you have a beginner program?",
  "Can I get a tour before joining?"
]);

let els = null;
let currentGymId = null;
let faqRows = []; // in-memory working copy while the form is open
let selectedLogoFileName = ""; // placeholder: filename only, never the file's bytes
let onSaved = null; // Phase 4: lets owner-shell-ui.js keep the AI Receptionist status page in sync

function cacheEls(){
  els = {
    form: document.getElementById("ownerSettingsForm"),
    gymName: document.getElementById("settingsGymName"),
    logoInput: document.getElementById("settingsLogoInput"),
    logoFileNameLabel: document.getElementById("settingsLogoFileName"),
    address: document.getElementById("settingsAddress"),
    contactNumber: document.getElementById("settingsContactNumber"),
    facebookUrl: document.getElementById("settingsFacebookUrl"),
    instagramUrl: document.getElementById("settingsInstagramUrl"),
    hours: document.getElementById("settingsHours"),
    description: document.getElementById("settingsDescription"),
    membershipFee: document.getElementById("settingsMembershipFee"),
    walkInFee: document.getElementById("settingsWalkInFee"),
    studentDiscount: document.getElementById("settingsStudentDiscount"),
    ptRate: document.getElementById("settingsPtRate"),
    parkingAvailable: document.getElementById("settingsParkingAvailable"),
    trainerAvailable: document.getElementById("settingsTrainerAvailable"),
    freeTrialAvailable: document.getElementById("settingsFreeTrialAvailable"),
    welcomeMessage: document.getElementById("settingsWelcomeMessage"),
    faqList: document.getElementById("settingsFaqList"),
    addFaqBtn: document.getElementById("settingsAddFaqBtn"),
    saveBtn: document.getElementById("settingsSaveBtn"),
    statusLine: document.getElementById("settingsStatusLine")
  };
}

/**
 * @param {string} gymId
 * @param {{onSaved?: Function}} [hooks] onSaved(settings) fires after a successful save —
 *   owner-shell-ui.js uses this to refresh the AI Receptionist status page without
 *   requiring the owner to click over to it manually.
 */
export function initOwnerSettingsPage(gymId, hooks = {}){
  cacheEls();
  currentGymId = gymId;
  onSaved = hooks.onSaved || null;
  const settings = getBusinessSettings(gymId);
  populateForm(settings);

  els.addFaqBtn.addEventListener("click", () => {
    if(faqRows.length >= FAQ_MAX_COUNT){
      showToast(`You can add up to ${FAQ_MAX_COUNT} FAQs.`);
      return;
    }
    faqRows.push({ id: generateId("faq"), question: "", answer: "" });
    renderFaqRows();
  });

  els.logoInput.addEventListener("change", () => {
    const file = els.logoInput.files && els.logoInput.files[0];
    selectedLogoFileName = file ? file.name : "";
    els.logoFileNameLabel.textContent = selectedLogoFileName || "No file chosen";
  });

  els.form.addEventListener("submit", e => {
    e.preventDefault();
    handleSave();
  });
}

function populateForm(settings){
  els.gymName.value = settings.gymName;
  selectedLogoFileName = settings.logoFileName || "";
  els.logoFileNameLabel.textContent = selectedLogoFileName || "No file chosen";
  els.address.value = settings.address;
  els.contactNumber.value = settings.contactNumber;
  els.facebookUrl.value = settings.facebookUrl;
  els.instagramUrl.value = settings.instagramUrl;
  els.hours.value = settings.hours;
  els.description.value = settings.description;
  els.membershipFee.value = settings.membershipFee;
  els.walkInFee.value = settings.walkInFee;
  els.studentDiscount.value = settings.studentDiscount;
  els.ptRate.value = settings.ptRate;
  els.parkingAvailable.value = settings.parkingAvailable;
  els.trainerAvailable.value = settings.trainerAvailable;
  els.freeTrialAvailable.value = settings.freeTrialAvailable;
  els.welcomeMessage.value = settings.welcomeMessage;
  faqRows = settings.faqs.map(f => ({ ...f }));
  renderFaqRows();
}

function renderFaqRows(){
  const existingQuestions = new Set(faqRows.map(r => r.question.trim().toLowerCase()));
  const suggestionsHtml = renderFaqSuggestions(existingQuestions);

  if(faqRows.length === 0){
    els.faqList.innerHTML = `<div class="empty-state">No FAQs yet — add one so your AI Receptionist can answer it directly.</div>${suggestionsHtml}`;
    wireFaqSuggestions();
    return;
  }
  els.faqList.innerHTML = faqRows.map((row, i) => `
    <div class="owner-faq-row" data-faq-id="${escapeHtml(row.id)}">
      <div class="owner-faq-fields">
        <input type="text" class="faq-question" placeholder="Question (e.g. Do you have aircon?)" value="${escapeHtml(row.question)}">
        <input type="text" class="faq-answer" placeholder="Answer" value="${escapeHtml(row.answer)}">
      </div>
      <button type="button" class="btn btn-danger-outline btn-sm owner-faq-remove" data-index="${i}" aria-label="Remove FAQ">✕</button>
    </div>
  `).join("") + suggestionsHtml;

  els.faqList.querySelectorAll(".owner-faq-row").forEach((row, i) => {
    row.querySelector(".faq-question").addEventListener("input", e => { faqRows[i].question = e.target.value; });
    row.querySelector(".faq-answer").addEventListener("input", e => { faqRows[i].answer = e.target.value; });
  });
  els.faqList.querySelectorAll(".owner-faq-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      faqRows.splice(idx, 1);
      renderFaqRows();
    });
  });
  wireFaqSuggestions();
}

/** Suggestion chips for common questions this gym hasn't added yet.
 *  Already-added ones (matched by question text) are hidden so the
 *  list shrinks as the owner works through it. */
function renderFaqSuggestions(existingQuestions){
  const remaining = FAQ_SUGGESTIONS.filter(q => !existingQuestions.has(q.trim().toLowerCase()));
  if(remaining.length === 0) return "";
  return `
    <div class="owner-faq-suggestions" style="margin-top:14px;">
      <p class="help-text" style="margin:0 0 8px;">Common questions customers ask — click to add, then fill in your answer:</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${remaining.map(q => `<button type="button" class="btn btn-ghost btn-sm owner-faq-suggestion-chip" data-question="${escapeHtml(q)}">+ ${escapeHtml(q)}</button>`).join("")}
      </div>
    </div>
  `;
}

function wireFaqSuggestions(){
  els.faqList.querySelectorAll(".owner-faq-suggestion-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      if(faqRows.length >= FAQ_MAX_COUNT){
        showToast(`You can add up to ${FAQ_MAX_COUNT} FAQs.`);
        return;
      }
      faqRows.push({ id: generateId("faq"), question: btn.dataset.question, answer: "" });
      renderFaqRows();
      // Focus the newly added row's answer field so the owner can type right away.
      const rows = els.faqList.querySelectorAll(".owner-faq-row .faq-answer");
      const lastAnswerInput = rows[rows.length - 1];
      if(lastAnswerInput) lastAnswerInput.focus();
    });
  });
}

function handleSave(){
  const fields = {
    gymName: els.gymName.value,
    // Logo upload is a placeholder for now (see panel note in HTML) —
    // we only remember the chosen filename, never the file itself.
    logoFileName: selectedLogoFileName,
    address: els.address.value,
    contactNumber: els.contactNumber.value,
    facebookUrl: els.facebookUrl.value,
    instagramUrl: els.instagramUrl.value,
    hours: els.hours.value,
    description: els.description.value,
    membershipFee: els.membershipFee.value,
    walkInFee: els.walkInFee.value,
    studentDiscount: els.studentDiscount.value,
    ptRate: els.ptRate.value,
    parkingAvailable: els.parkingAvailable.value,
    trainerAvailable: els.trainerAvailable.value,
    freeTrialAvailable: els.freeTrialAvailable.value,
    welcomeMessage: els.welcomeMessage.value,
    faqs: faqRows
  };

  const result = saveBusinessSettings(currentGymId, fields);
  els.statusLine.className = "status-line " + (result.ok ? "ok" : "err");
  els.statusLine.textContent = result.ok
    ? "Saved. Your AI Receptionist will use this the next time it replies."
    : (result.reason || "Couldn't save.");

  if(result.ok){
    populateForm(result.settings);
    showToast("Business settings saved.");
    if(typeof onSaved === "function") onSaved(result.settings);
  }
}
