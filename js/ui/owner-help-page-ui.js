/* ============================================================
   GYMBOT QC — OWNER: HELP & SUPPORT PAGE (Phase 3 placeholder)
   Static content only — no ticketing/chat backend yet.
   ============================================================ */
export function renderOwnerHelpPage(){
  const root = document.getElementById("ownerHelpPageContent");
  root.innerHTML = `
    <div class="owner-panel">
      <h3>Frequently asked questions</h3>
      <div class="owner-faq-static">
        <div><strong>How do I change what my AI Receptionist says?</strong><p class="help-text">Go to Business Settings — your gym's fees, hours, welcome message, and FAQs all feed the AI Receptionist automatically.</p></div>
        <div><strong>Where do my leads go?</strong><p class="help-text">The Leads page shows everyone your AI Receptionist has captured. You can export the list to CSV any time.</p></div>
        <div><strong>Can I change my plan?</strong><p class="help-text">Plan management is coming soon under Subscription — for now, contact us directly to make changes.</p></div>
      </div>
    </div>
    <div class="owner-panel">
      <h3>Contact support</h3>
      <p class="help-text" style="margin-top:0;">This is a demo build, so support requests aren't wired up yet — reach out to whoever set up GymBot QC for your gym.</p>
    </div>
  `;
}
