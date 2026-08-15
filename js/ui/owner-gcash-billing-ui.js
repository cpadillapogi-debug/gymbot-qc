/* ============================================================
   GYMBOT QC — OWNER: GCASH BILLING PANEL (Phase 10)
   Renders into the existing Subscription page's content mount
   (see owner-subscription-page-ui.js, which calls this module
   rather than duplicating GCash logic). Deliberately NOT a
   separate nav page/tab — this codebase's Subscription page
   already covers "your plan, billing, invoice history"
   (Phase 6), and splitting GCash payment + a second Payment
   History page apart from it would just be the same invoice
   table twice. See docs/PHASE10_NOTES.md for the full write-up
   of this consolidation decision.

   Shows exactly one of three states at a time:
     - Nothing due right now                 -> a quiet confirmation note
     - Amount due, GCash not configured yet   -> an honest "not set up" note
     - Amount due, GCash configured           -> QR + number + name + upload form
     - A payment is already Submitted         -> "awaiting verification" status, no form

   Data layer: gcash-payment-service.js. This module is
   rendering + wiring only, same split as every other
   owner-*-ui.js file.
   ============================================================ */
import { CONFIG, GCASH_PAYMENT_STATUS_LABELS } from "../config.js";
import { escapeHtml } from "../utils.js";
import { getSubscription, getAmountDue, getPlan } from "../services/subscription-service.js";
import {
  getGcashSettings, isGcashConfigured, validateImageFile,
  getPendingPaymentForGym, submitPaymentProof
} from "../services/gcash-payment-service.js";
import { showToast } from "./toast-ui.js";
import { refreshBillingStatus } from "./owner-billing-banner-ui.js";

/** @returns {string} HTML for the GCash panel — caller (owner-subscription-page-ui.js)
 *  splices this into its own root and calls wireGcashBillingPanel() after. */
export function renderGcashBillingPanel(gymId){
  const sub = getSubscription(gymId);
  const amountDue = getAmountDue(sub);
  const plan = getPlan(sub.planId);
  const pending = getPendingPaymentForGym(gymId);
  const settings = getGcashSettings();

  if(pending){
    return renderAwaitingVerification(pending);
  }
  if(amountDue <= 0){
    return `
      <div class="owner-panel">
        <h3>GCash Payment</h3>
        <p class="help-text" style="margin:0;">You're all paid up — nothing due right now.</p>
      </div>
    `;
  }
  if(!isGcashConfigured(settings)){
    return `
      <div class="owner-panel">
        <h3>GCash Payment</h3>
        <p class="help-text" style="margin:0;">₱${amountDue.toLocaleString()} is due for your ${escapeHtml(plan.name)} plan, but GCash payment details haven't been set up yet — check back soon or contact support.</p>
      </div>
    `;
  }

  return `
    <div class="owner-panel">
      <h3>Pay with GCash</h3>
      <p class="help-text" style="margin-top:0;">₱${amountDue.toLocaleString()} due for your ${escapeHtml(plan.name)} plan. Scan the QR or send to the number below, then upload your proof of payment.</p>

      <div class="gcash-pay-grid">
        <div class="gcash-qr-box">
          ${settings.qrImageDataUrl
            ? `<img src="${settings.qrImageDataUrl}" alt="GCash QR code" class="gcash-qr-img">`
            : `<div class="empty-state" style="padding:30px 8px;">No QR code uploaded yet</div>`}
        </div>
        <dl class="owner-sub-detail-list">
          <div><dt>GCash number</dt><dd>${escapeHtml(settings.gcashNumber)}</dd></div>
          <div><dt>Account name</dt><dd>${escapeHtml(settings.accountName)}</dd></div>
          <div><dt>Amount to send</dt><dd>₱${amountDue.toLocaleString()}</dd></div>
        </dl>
      </div>

      <form id="gcashProofForm" class="owner-settings-grid cols-2" style="margin-top:16px;">
        <div class="owner-field cols-span-2">
          <label for="gcashProofFile">Proof of payment (screenshot)</label>
          <div class="owner-file-row">
            <input type="file" id="gcashProofFile" accept="image/*">
          </div>
          <div class="owner-file-name" id="gcashProofFileName">No file chosen</div>
        </div>
        <div class="owner-field">
          <label for="gcashProofReference">Reference number (optional)</label>
          <input type="text" id="gcashProofReference" maxlength="120">
        </div>
        <div class="owner-field cols-span-2">
          <label for="gcashProofNote">Note (optional)</label>
          <textarea id="gcashProofNote" maxlength="500"></textarea>
        </div>
        <div class="owner-settings-actions cols-span-2">
          <button class="btn btn-primary" id="gcashProofSubmitBtn" type="submit">Submit payment</button>
          <div class="status-line" id="gcashProofStatusLine" role="status"></div>
        </div>
      </form>
    </div>
  `;
}

function renderAwaitingVerification(payment){
  const label = GCASH_PAYMENT_STATUS_LABELS[payment.status] || payment.status;
  return `
    <div class="owner-panel">
      <h3>GCash Payment</h3>
      <div class="owner-sub-status-row">
        <span class="owner-sub-status-badge sub-status-warn">${escapeHtml(label)}</span>
      </div>
      <p class="help-text" style="margin:0;">Your payment of ₱${payment.amount.toLocaleString()} for the ${escapeHtml(payment.planName)} plan was submitted on ${formatDate(payment.submittedAt)} and is awaiting Developer review.${payment.reference ? ` Reference: ${escapeHtml(payment.reference)}.` : ""}</p>
    </div>
  `;
}

/** Wires the upload form. No-op if the panel is currently showing the
 *  "awaiting verification" or "nothing due" state (no form present).
 *  @param {Function} onSubmitted called after a successful submission so
 *    the caller (owner-subscription-page-ui.js) can re-render the whole
 *    page — avoids this module importing that one back (circular). */
export function wireGcashBillingPanel(gymId, onSubmitted){
  const form = document.getElementById("gcashProofForm");
  if(!form) return;

  const fileInput = document.getElementById("gcashProofFile");
  const fileNameEl = document.getElementById("gcashProofFileName");
  let proofDataUrl = "";
  let proofFileName = "";

  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    proofDataUrl = "";
    proofFileName = "";
    fileNameEl.textContent = "No file chosen";
    if(!file) return;

    const validation = validateImageFile(file, CONFIG.PAYMENT_PROOF_MAX_BYTES);
    if(!validation.ok){
      showToast(validation.reason);
      fileInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      proofDataUrl = reader.result;
      proofFileName = file.name;
      fileNameEl.textContent = file.name;
    };
    reader.onerror = () => {
      proofDataUrl = "";
      proofFileName = "";
      fileNameEl.textContent = "No file chosen";
      fileInput.value = "";
      showToast("Couldn't read that image — please try a different file.");
    };
    reader.readAsDataURL(file);
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const statusLine = document.getElementById("gcashProofStatusLine");

    if(!proofDataUrl){
      setStatus(statusLine, "Choose a proof-of-payment image first.", false);
      return;
    }

    const result = submitPaymentProof(gymId, {
      proofImageDataUrl: proofDataUrl,
      proofFileName,
      reference: document.getElementById("gcashProofReference").value,
      note: document.getElementById("gcashProofNote").value
    });

    if(result.ok){
      showToast(result.message);
      refreshBillingStatus(gymId);
      // Re-render the whole Subscription page so it now shows the
      // "awaiting verification" state instead of the form.
      if(typeof onSubmitted === "function") onSubmitted();
    }else{
      setStatus(statusLine, result.reason || "Couldn't submit that payment.", false);
    }
  });
}

function setStatus(el, text, ok){
  if(!el) return;
  el.textContent = text;
  el.classList.remove("ok", "err");
  el.classList.add(ok ? "ok" : "err");
}

function formatDate(iso){
  if(!iso) return "\u2014";
  try{ return new Date(iso).toLocaleDateString(); }catch(err){ return "\u2014"; }
}
