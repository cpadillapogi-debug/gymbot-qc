/* ============================================================
   GYMBOT QC — BOOKING UI
   Renders the inline "book a free trial" card inside the chat
   log and validates/confirms it through the leads service.
   ============================================================ */
import { escapeHtml } from "../utils.js";
import { DEMO_GYM_ID } from "../config.js";
import { appState } from "../state.js";
import { appendMessage, appendNode } from "./chat-ui.js";
import { captureLead, validateBookingInput, getLeads } from "../services/leads-service.js";

/**
 * @param {string} [gymId] Phase 12: which gym this booking belongs to.
 *   Defaults to DEMO_GYM_ID so index.html's sales demo is unchanged;
 *   main-widget.js passes the real gym's id for the per-gym widget.
 */
export function showBookingForm(gymId){
  const targetGymId = gymId || DEMO_GYM_ID;
  // Avoid stacking duplicate forms if the user keeps asking about trials.
  if(document.getElementById("activeBookingCard")) return;

  // Phase 4: prefill from whatever conversation-memory-service.js has
  // already picked up this session, so we don't re-ask for it.
  const memory = appState.get("conversationMemory") || {};

  const card = document.createElement("div");
  card.className = "booking-card";
  card.id = "activeBookingCard";
  card.innerHTML = `
    <h4>Book your free trial</h4>
    <label for="bkName">Name</label>
    <input type="text" id="bkName" maxlength="80" autocomplete="off" value="${escapeHtml(memory.name || "")}">
    <div class="field-error" id="bkNameErr">Please enter your name.</div>

    <label for="bkPhone">Phone number</label>
    <input type="text" id="bkPhone" maxlength="20" autocomplete="off" placeholder="09XX XXX XXXX" value="${escapeHtml(memory.phone || "")}">
    <div class="field-error" id="bkPhoneErr">Please enter a valid phone number.</div>

    <label for="bkTime">Preferred visit time</label>
    <select id="bkTime">
      <option value="Weekday morning">Weekday morning</option>
      <option value="Weekday evening">Weekday evening</option>
      <option value="Weekend">Weekend</option>
    </select>

    <label for="bkGoal">Fitness goal</label>
    <select id="bkGoal">
      <option value="Weight loss">Weight loss</option>
      <option value="Muscle gain">Muscle gain</option>
      <option value="General fitness">General fitness</option>
      <option value="Sports training">Sports training</option>
    </select>

    <div class="booking-actions">
      <button type="button" class="btn btn-primary btn-sm" id="confirmBookingBtn">Confirm booking</button>
      <button type="button" class="btn btn-ghost btn-sm" id="cancelBookingBtn">Cancel</button>
    </div>
  `;
  appendNode(card);

  if(memory.preferredTime) card.querySelector("#bkTime").value = memory.preferredTime;
  if(memory.goal) card.querySelector("#bkGoal").value = memory.goal;

  card.querySelector("#cancelBookingBtn").addEventListener("click", () => card.remove());
  card.querySelector("#confirmBookingBtn").addEventListener("click", () => confirmBooking(card, targetGymId));
}

function confirmBooking(card, gymId){
  const nameInput = card.querySelector("#bkName");
  const phoneInput = card.querySelector("#bkPhone");
  const timeSelect = card.querySelector("#bkTime");
  const goalSelect = card.querySelector("#bkGoal");
  const nameErr = card.querySelector("#bkNameErr");
  const phoneErr = card.querySelector("#bkPhoneErr");

  const { valid, errors, cleanName, cleanPhone } = validateBookingInput({
    name: nameInput.value,
    phone: phoneInput.value
  });

  nameErr.style.display = errors.name ? "block" : "none";
  phoneErr.style.display = errors.phone ? "block" : "none";
  if(!valid) return;

  // Phase 12: real per-gym widget passes its own gymId here so the lead
  // lands in that gym's actual Leads CRM instead of the reserved demo id.
  const { lead } = captureLead({
    gymId,
    name: cleanName,
    phone: cleanPhone,
    preferredTime: timeSelect.value,
    goal: goalSelect.value,
    source: "Website"
  });

  // Keep AppState in sync so the dashboard re-renders (index.html demo only).
  appState.set({ leads: getLeads(gymId) });

  card.innerHTML = `<div class="booking-confirmed">✓ Booked! See you soon, ${escapeHtml(lead.name)}.</div>`;
  appendMessage("bot", `Salamat, ${lead.name}! Trial session confirmed for ${lead.preferredTime.toLowerCase()}. Bring a towel and water — see you at the gym! 💪`);
  appState.set({ conversationHistory: appState.get("conversationHistory").concat([{ role:"bot", text:"Trial confirmed." }]) });
}
