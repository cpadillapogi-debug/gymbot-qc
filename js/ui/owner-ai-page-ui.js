/* ============================================================
   GYMBOT QC — OWNER: AI RECEPTIONIST PAGE (Phase 4)
   Status + live preview of what the AI Receptionist currently
   knows how to say, built entirely from this gym's own Business
   Settings via ai-profile-service.js.

   PERMISSION BOUNDARY: this page must NEVER import
   gemini-service.js or api-key-service.js — the Gemini API key
   and the AI system prompt are Developer/setup-only concerns
   (see index.html's Setup panel). A Gym Owner gets a status +
   preview view, not the configuration underneath it.

   "Live-refreshing": owner-shell-ui.js re-calls renderOwnerAiPage()
   right after a successful Business Settings save (via the
   onSaved hook passed into initOwnerSettingsPage), so this page
   is always current even if the owner never navigates to it.
   ============================================================ */
import { escapeHtml } from "../utils.js";
import { getBusinessSettings } from "../services/gym-settings-service.js";
import { buildProfileText, profileCompleteness } from "../services/ai-profile-service.js";
import { getSubscription, getSubscriptionAccess } from "../services/subscription-service.js";
import { SUBSCRIPTION_STATUS_LABELS } from "../config.js";

export function renderOwnerAiPage(gym){
  const root = document.getElementById("ownerAiPageContent");
  const settings = gym ? getBusinessSettings(gym.id) : null;
  const faqCount = settings ? settings.faqs.length : 0;
  const completeness = settings ? profileCompleteness(settings) : { ok:false, missing:[] };
  const previewText = settings ? buildProfileText(settings) : "";

  // Phase 6: subscription status can turn the AI Receptionist off.
  // This is a visual reflection only — actually blocking the live
  // customer-facing widget per tenant needs a real backend (see
  // docs/PHASE6_NOTES.md), same caveat as the Phase 5 lead routing
  // placeholders being honest about what's simulated vs. wired up.
  const sub = gym ? getSubscription(gym.id) : null;
  const access = sub ? getSubscriptionAccess(sub.status) : { aiEnabled: true };

  root.innerHTML = `
    <div class="owner-panel">
      <div class="owner-ai-status">
        <span class="owner-ai-status-dot ${access.aiEnabled ? "" : "owner-ai-status-dot-off"}" aria-hidden="true"></span>
        <div>
          <div class="owner-ai-status-title">${access.aiEnabled ? "Your AI Receptionist is live" : "Your AI Receptionist is disabled"}</div>
          <div class="owner-ai-status-sub">${access.aiEnabled
            ? "Answering Messenger questions 24/7 using your Business Settings."
            : `Turned off because your subscription is ${escapeHtml((sub && SUBSCRIPTION_STATUS_LABELS[sub.status]) || "not active")}. Resolve this from the Subscription page to bring it back online.`}</div>
        </div>
      </div>
    </div>

    ${completeness.missing.length > 0 ? `
    <div class="owner-panel">
      <h3>Fill these in for a stronger AI Receptionist</h3>
      <ul class="owner-plain-list">
        ${completeness.missing.map(label => `<li>${escapeHtml(label)} — not set yet</li>`).join("")}
      </ul>
      <p class="help-text">Add these in <strong>Business Settings</strong> so the AI Receptionist doesn't have to guess or say "I'll check with staff."</p>
    </div>` : ""}

    <div class="owner-panel">
      <h3>What it's using right now</h3>
      <ul class="owner-plain-list">
        <li>${settings && settings.welcomeMessage ? "A custom welcome message you wrote" : "The default welcome message — add your own in Business Settings"}</li>
        <li>${faqCount > 0 ? `${escapeHtml(String(faqCount))} FAQ${faqCount === 1 ? "" : "s"} you've added` : "No custom FAQs yet — add some in Business Settings"}</li>
        <li>Your gym's fees, hours, and contact info from Business Settings</li>
        <li>Rule-based fallback replies if the AI service is ever briefly unavailable — customers never see a technical error</li>
      </ul>
    </div>

    <div class="owner-panel">
      <h3>Preview: what the AI Receptionist knows</h3>
      <p class="help-text" style="margin-top:0;">This is the exact info block it answers from — nothing more.</p>
      <pre class="owner-ai-preview">${escapeHtml(previewText || "Nothing set yet — fill in Business Settings to get started.")}</pre>
    </div>

    ${renderEmbedPanel(gym, access)}

    <div class="owner-panel">
      <h3>Coming in Phase 5</h3>
      <p class="help-text" style="margin-top:0;">A full conversation log, lead pipeline, and tone/escalation controls will live here. Anything touching the underlying AI configuration or API connection stays a Developer setting.</p>
    </div>
  `;
  wireEmbedPanel();
}

/* ---------- Phase 12: real per-gym customer widget ----------
   The public sales-demo chat on index.html is generic and shared —
   this is what an owner actually hands out: a link/iframe tied to
   THIS gym's own Business Settings, via widget.html?gym=<id> (see
   main-widget.js). Same access.aiEnabled flag as the status card
   above, so the copy here is honest if billing has turned it off. */
function renderEmbedPanel(gym, access){
  if(!gym) return "";
  const widgetUrl = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "")}widget.html?gym=${encodeURIComponent(gym.id)}`;
  const iframeSnippet = `<iframe src="${widgetUrl}" style="width:100%;max-width:480px;height:640px;border:0;border-radius:16px;" title="${escapeHtml(gym.name)} chat"></iframe>`;

  return `
    <div class="owner-panel">
      <h3>Embed your AI Receptionist</h3>
      <p class="help-text" style="margin-top:0;">${access.aiEnabled
        ? "Share this link on Messenger or your Facebook Page, or paste the snippet into your website to embed the chat directly."
        : "Your AI Receptionist is currently disabled (see the status above), so visitors to this link will see a temporarily-unavailable notice instead of the chat."}</p>

      <div class="owner-field">
        <label for="ownerEmbedLink">Chat link (Messenger / Facebook Page button)</label>
        <div class="owner-file-row">
          <input type="text" id="ownerEmbedLink" readonly value="${escapeHtml(widgetUrl)}">
          <button class="btn btn-ghost btn-sm" type="button" id="ownerEmbedLinkCopyBtn" data-copy-target="ownerEmbedLink">Copy</button>
        </div>
      </div>

      <div class="owner-field">
        <label for="ownerEmbedIframe">Website embed code</label>
        <textarea id="ownerEmbedIframe" readonly style="min-height:70px;">${escapeHtml(iframeSnippet)}</textarea>
        <div class="owner-file-row" style="margin-top:6px;">
          <button class="btn btn-ghost btn-sm" type="button" id="ownerEmbedIframeCopyBtn" data-copy-target="ownerEmbedIframe">Copy embed code</button>
        </div>
      </div>
    </div>
  `;
}

function wireEmbedPanel(){
  document.querySelectorAll("[data-copy-target]").forEach(btn => {
    btn.addEventListener("click", () => {
      const field = document.getElementById(btn.dataset.copyTarget);
      if(!field) return;
      field.select();
      field.setSelectionRange(0, field.value.length);
      try{
        navigator.clipboard.writeText(field.value);
        const original = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = original; }, 1500);
      }catch(err){
        // Clipboard API can be unavailable (older browser, non-HTTPS) —
        // the field is still selected, so the visitor can Ctrl/Cmd+C manually.
      }
    });
  });
}
