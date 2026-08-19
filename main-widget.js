/* ============================================================
   GYMBOT QC — PER-GYM CUSTOMER WIDGET ENTRY POINT (Phase 12)
   Real, embeddable customer-facing chat for ONE specific gym —
   unlike index.html's single generic sales-demo chat, this reads
   ?gym=<gymId> from the URL and builds everything (prompt,
   welcome message, captured leads) from THAT gym's own Business
   Settings, via ai-profile-service.js's buildProfileText() — the
   exact seam that file's own header comment calls out for this.

   Meant to be embedded two ways (see owner-ai-page-ui.js's
   "Embed" panel, which generates both for the owner to copy):
     - a direct link, e.g. for a Facebook Page's website button
     - an <iframe src="widget.html?gym=...">, for a website

   SUBSCRIPTION-AWARE: if this gym's AI Receptionist is disabled
   (suspended/unpaid — see subscription-service.js's
   getSubscriptionAccess), the widget shows a plain "temporarily
   unavailable" notice instead of a live chat. No API key, no
   Gemini call, no lead form — same enforcement the owner's own
   AI Receptionist page already reflects, just customer-facing.

   PERMISSION BOUNDARY: same as owner-ai-page-ui.js / onboarding-ui.js —
   never import api-key-service.js's setters or any Developer-only
   service. The Gemini key itself stays a single global,
   Developer-configured value (see index.html's Setup panel) —
   there is no per-gym key in this phase.

   PATCH (debug session, Aug 2026): now also passes this gym's own
   settings.faqs (Business Settings -> Frequently Asked Questions,
   editable per-gym by the owner) into chat-ui.js via the new
   getGymFaqs hook, so the owner's own Q&A pairs answer customers
   directly — no Gemini call needed for anything they've covered.
   ============================================================ */
import { getGymById } from "./services/tenant-service.js";
import { getBusinessSettings } from "./services/gym-settings-service.js";
import { buildProfileText } from "./services/ai-profile-service.js";
import { getSubscription, getSubscriptionAccess } from "./services/subscription-service.js";
import { initChatUI, appendMessage } from "./ui/chat-ui.js";
import { showBookingForm } from "./ui/booking-ui.js";

function getRequestedGymId(){
  const params = new URLSearchParams(window.location.search);
  return (params.get("gym") || "").trim();
}

function showUnavailable(message){
  document.getElementById("widgetLoading").hidden = true;
  const el = document.getElementById("widgetUnavailable");
  el.textContent = message;
  el.hidden = false;
}

function init(){
  const gymId = getRequestedGymId();
  if(!gymId){
    showUnavailable("This chat link is missing a gym ID. Ask your GymBot QC provider for the correct embed link.");
    return;
  }

  const gym = getGymById(gymId);
  if(!gym || gym.deletedAt){
    showUnavailable("This gym's GymBot QC chat isn't available right now.");
    return;
  }

  const sub = getSubscription(gymId);
  const access = getSubscriptionAccess(sub ? sub.status : null);
  if(!access.aiEnabled){
    showUnavailable(`${gym.name}'s AI Receptionist is temporarily unavailable. Please contact the gym directly for now.`);
    return;
  }

  const settings = getBusinessSettings(gymId);
  const profileText = buildProfileText(settings);

  // Header + welcome message, built from this gym's own settings —
  // same fallback spirit as ai-profile-service.js's other consumers
  // (never blank just because a field hasn't been filled in yet).
  document.getElementById("widgetGymName").textContent = settings.gymName || gym.name;
  document.title = `${settings.gymName || gym.name} — Chat`;

  document.getElementById("widgetLoading").hidden = true;
  document.getElementById("widgetChatCard").hidden = false;

  initChatUI({
    onBookingIntent: () => showBookingForm(gymId),
    getGymInfo: () => profileText,
    // PATCH: this gym's own Business Settings FAQ entries, checked
    // before the generic FAQ list / Gemini — see chat-ui.js / gemini-service.js.
    getGymFaqs: () => settings.faqs,
    // PATCH (#6): lets unanswered customer questions get logged against
    // this specific gym — see faq-response-service.js's logUnansweredQuestion.
    gymId: gymId
  });

  const greeting = settings.welcomeMessage && settings.welcomeMessage.trim()
    ? settings.welcomeMessage.trim()
    : `Hi po! Welcome to ${settings.gymName || gym.name} 💪 Ask me about membership, trainers, or book a free trial.`;
  appendMessage("bot", greeting);
}

try{
  init();
}catch(err){
  console.error("GymBot QC widget failed to initialize:", err);
  showUnavailable("Something went wrong loading this chat. Please try again shortly.");
}
