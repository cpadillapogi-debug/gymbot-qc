/* ============================================================
   GYMBOT QC — OWNER: HELP & SUPPORT PAGE (Phase 3 placeholder)
   Static content only — no ticketing/chat backend yet.
   ============================================================ */
import { CONFIG } from "../config.js";
import { escapeHtml } from "../utils.js";

export function renderOwnerHelpPage(){
  const root = document.getElementById("ownerHelpPageContent");
  const supportUrl = CONFIG.SUPPORT_CONTACT_URL;

  root.innerHTML = `
    <div class="owner-panel">
      <h3>Frequently asked questions</h3>
      <div class="owner-faq-static">
        <div><strong>How do I change what my AI Receptionist says?</strong><p class="help-text">Go to Business Settings — your gym's fees, hours, welcome message, and FAQs all feed the AI Receptionist automatically.</p></div>
        <div><strong>Where do my leads go?</strong><p class="help-text">The Leads page shows everyone your AI Receptionist has captured. You can export the list to CSV any time.</p></div>
        <div><strong>Can I change my plan?</strong><p class="help-text">Yes — head to <a href="#subscription">Subscription</a> and pick a plan. Requesting a change sends it to GymBot QC to apply.</p></div>
      </div>
    </div>
    <div class="owner-panel">
      <h3>Contact support</h3>
      <p class="help-text" style="margin-top:0;">This is a demo build, so support requests aren't wired up to a ticketing system yet.</p>
      ${supportUrl
        ? `<a class="btn btn-primary btn-sm" href="${escapeHtml(supportUrl)}" target="_blank" rel="noopener noreferrer">Message us on Facebook</a>`
        : `<p class="help-text">No support channel is set up yet — reach out to whoever set up GymBot QC for your gym.</p>`}
    </div>
  `;
}
