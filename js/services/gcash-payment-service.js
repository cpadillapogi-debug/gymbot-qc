/* ============================================================
   GYMBOT QC — GCASH PAYMENT SERVICE (Phase 10)
   GCash payment settings (global, Developer-configured) + the
   payment-proof submission/approval/rejection workflow. Pure
   logic + storage only, no DOM — same layering as every other
   *-service.js file in this codebase.

   THERE IS STILL NO REAL PAYMENT GATEWAY. This is a manual
   "owner uploads a screenshot, Developer eyeballs it and clicks
   Approve or Reject" flow — the same honesty this codebase has
   used since Phase 6 for billing (see subscription-service.js's
   header comment). Nothing here calls GCash's API or verifies a
   transaction actually happened; it only records what the owner
   claims and what the Developer decided.

   TENANT SCOPING: gcashPayments is a flat array, each record
   carries its own gymId, same pattern as invoices/leads.
   getPaymentsForGym() is the owner-facing read path.
   getAllPaymentsForDeveloper() (used by admin-registry-service.js
   to build the Pending Payments queue) is the deliberate
   cross-tenant exception — same PERMISSION BOUNDARY style as
   invoice-service.js's getAllInvoicesForDeveloper().

   GCash settings (QR image, number, account name) are Developer-only
   writes but readable by every Gym Owner — there's one shared payment
   destination for the whole platform, not one per gym (see the brief:
   "Store these settings globally so all gym owners see the same
   payment information").
   ============================================================ */
import { storage } from "../storage.js";
import { CONFIG, GCASH_PAYMENT_STATUS, DEFAULT_GCASH_SETTINGS, AUDIT_ACTIONS } from "../config.js";
import { generateId, sanitizeRecords } from "../utils.js";
import { getSubscription, getAmountDue, getPlan, markSubscriptionAwaitingVerification, approveGymPayment, rejectGymPayment } from "./subscription-service.js";
import { generateInvoice, getLatestOpenInvoiceForGym, markInvoicePaid, markInvoiceUnpaid } from "./invoice-service.js";
import { calculateCommission } from "./commission-service.js";
import { createNotification } from "./notification-service.js";
import { recordAuditEntry } from "./audit-log-service.js";

/* ---------- GCash settings (global, Developer-configured) ---------- */

export function getGcashSettings(){
  const raw = storage.getJSON("gcashSettings", null);
  return Object.assign({}, DEFAULT_GCASH_SETTINGS, (raw && typeof raw === "object") ? raw : {});
}

/** @returns {{ok:boolean, reason?:string}} whether owners currently have
 *  anything to pay to — used by the owner Billing panel to decide
 *  whether to show the QR/upload form or a "not configured yet" note. */
export function isGcashConfigured(settings = getGcashSettings()){
  return Boolean(settings.gcashNumber && settings.accountName);
}

/** Developer-only write (audited). Gating is the Master Admin UI's
 *  requireRole(DEVELOPER) guard, not this function. */
export function saveGcashSettings(partial, performedBy){
  const previous = getGcashSettings();
  const next = Object.assign({}, previous, {
    qrImageDataUrl: typeof partial.qrImageDataUrl === "string" ? partial.qrImageDataUrl : previous.qrImageDataUrl,
    qrImageFileName: typeof partial.qrImageFileName === "string" ? partial.qrImageFileName : previous.qrImageFileName,
    gcashNumber: (partial.gcashNumber || "").trim().slice(0, 40),
    accountName: (partial.accountName || "").trim().slice(0, 120),
    updatedAt: new Date().toISOString()
  });
  storage.setJSON("gcashSettings", next);

  recordAuditEntry({
    action: AUDIT_ACTIONS.SAVE_GCASH_SETTINGS, gymId: null, performedBy,
    previousValue: previous.gcashNumber || "(none)", newValue: next.gcashNumber || "(none)"
  });

  return next;
}

/** Pure validation of a File's browser-reported type/size — actual
 *  reading into a data URL happens in the UI layer via FileReader
 *  (no DOM/File APIs belong in a service module). Shared by both the
 *  QR-image upload (Developer) and the proof-of-payment upload (Owner). */
export function validateImageFile(file, maxBytes){
  if(!file) return { ok: false, reason: "Choose an image file." };
  if(!file.type || !file.type.startsWith("image/")){
    return { ok: false, reason: "Only image files are accepted (PNG, JPG, etc.)." };
  }
  if(file.size > maxBytes){
    return { ok: false, reason: `Image is too large — max ${(maxBytes / 1_000_000).toFixed(1)}MB.` };
  }
  return { ok: true };
}

/* ---------- Payment records ---------- */

// Sanitized at the source (id/gymId required) — same reasoning as
// invoice-service.js's getAllInvoices().
function getAllPayments(){
  return sanitizeRecords(storage.getJSON("gcashPayments", [], { requireArray: true }), ["id", "gymId"]);
}

function saveAllPayments(list){
  return storage.setJSON("gcashPayments", list);
}

/** @returns {object[]} this gym's payment submissions, newest first. */
export function getPaymentsForGym(gymId){
  if(!gymId) return [];
  return getAllPayments()
    .filter(p => p.gymId === gymId)
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

/** @returns {object|null} this gym's currently-submitted (awaiting
 *  verification) payment, if any — used both to block duplicate
 *  submissions and to render "already submitted" state in the UI. */
export function getPendingPaymentForGym(gymId){
  if(!gymId) return null;
  return getAllPayments().find(p => p.gymId === gymId && p.status === GCASH_PAYMENT_STATUS.SUBMITTED) || null;
}

/** Developer-only, cross-tenant read — see header PERMISSION BOUNDARY
 *  note. @returns {object[]} every Submitted payment on the platform,
 *  oldest first (so the queue works like a FIFO review list). */
export function getAllSubmittedPayments(){
  return getAllPayments()
    .filter(p => p.status === GCASH_PAYMENT_STATUS.SUBMITTED)
    .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
}

/** Developer-only, cross-tenant read of every payment ever submitted
 *  (any status) — backs the Revenue Dashboard's real commission totals. */
export function getAllPaymentsForDeveloper(){
  return getAllPayments().slice().sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

/**
 * Owner action: submits a proof-of-payment for the gym's current
 * amount due. Creates the payment record, attaches it to (or creates)
 * the current open invoice, flips the subscription to "awaiting
 * verification", and notifies both the owner (ack) and the Developer
 * (new review item). Blocks a second submission while one is already
 * pending — see SECURITY note in docs/PHASE10_NOTES.md.
 * @param {string} gymId
 * @param {{proofImageDataUrl:string, proofFileName:string, reference?:string, note?:string}} proof
 * @returns {{ok:boolean, reason?:string, message?:string, payment?:object}}
 */
export function submitPaymentProof(gymId, proof){
  if(!gymId) return { ok: false, reason: "No gym is associated with this account." };
  if(!proof || !proof.proofImageDataUrl){
    return { ok: false, reason: "Upload a proof-of-payment image first." };
  }

  if(getPendingPaymentForGym(gymId)){
    return { ok: false, reason: "You already have a payment awaiting verification — wait for that one to be reviewed before submitting another." };
  }

  const sub = getSubscription(gymId);
  const amountDue = getAmountDue(sub);
  if(amountDue <= 0){
    return { ok: false, reason: "There's no amount currently due on your account." };
  }
  const plan = getPlan(sub.planId);

  let invoice = getLatestOpenInvoiceForGym(gymId);
  if(!invoice){
    // Defensive fallback only — every Pending Payment period should already
    // have generated one via subscription-service.js's transition side
    // effects. Covers the edge case of a Suspended/Grace-period owner
    // catching up without a fresh invoice on file.
    invoice = generateInvoice(gymId, plan, {
      periodStart: sub.currentPeriodStart, periodEnd: sub.currentPeriodEnd
    });
  }

  const payment = {
    id: generateId("pay"),
    gymId,
    invoiceId: invoice.id,
    planId: plan.id,
    planName: plan.name,
    amount: amountDue,
    billingPeriodStart: invoice.billingPeriodStart,
    billingPeriodEnd: invoice.billingPeriodEnd,
    proofImageDataUrl: proof.proofImageDataUrl,
    proofFileName: (proof.proofFileName || "").slice(0, 200),
    reference: (proof.reference || "").trim().slice(0, 120),
    note: (proof.note || "").trim().slice(0, 500),
    status: GCASH_PAYMENT_STATUS.SUBMITTED,
    submittedAt: new Date().toISOString(),
    decidedAt: null,
    decidedBy: null,
    rejectionReason: null,
    commissionAmount: null,
    gymReceives: null,
    internalNote: "" // Phase 13: Developer-only scratchpad, never shown to the owner — see setPaymentInternalNote()
  };

  const all = getAllPayments();
  all.push(payment);
  saveAllPayments(all);

  markSubscriptionAwaitingVerification(gymId);

  createNotification({
    audience: "owner", gymId, category: "payment_received",
    title: "Payment received", message: `Your proof of payment for the ${plan.name} plan (₱${amountDue.toLocaleString()}) was submitted and is awaiting verification.`
  });
  createNotification({
    audience: "developer", gymId, category: "payment_uploaded",
    title: "New payment proof uploaded", message: `${plan.name} plan — ₱${amountDue.toLocaleString()} — awaiting review.`
  });

  return { ok: true, message: "Payment submitted — we'll verify it and update your account shortly.", payment };
}

/**
 * Developer-only, any-status write: attaches/updates a free-text
 * internal note on a payment record (e.g. "called owner to confirm
 * reference number"). Never shown to the Gym Owner — this is the
 * Developer's own scratchpad, same spirit as a CRM's internal notes
 * field. Works on a payment in ANY status (unlike approve/reject,
 * which only apply to Submitted), since a note is useful history
 * regardless of the outcome. Audited like every other Developer
 * write in this file.
 * @returns {{ok:boolean, reason?:string, message?:string}}
 */
export function setPaymentInternalNote(paymentId, note, performedBy){
  const all = getAllPayments();
  const payment = all.find(p => p.id === paymentId);
  if(!payment) return { ok: false, reason: "Payment not found." };

  const previous = payment.internalNote || "";
  const next = (note || "").trim().slice(0, 500);
  payment.internalNote = next;
  saveAllPayments(all);

  recordAuditEntry({
    action: AUDIT_ACTIONS.SAVE_PAYMENT_NOTE, gymId: payment.gymId, performedBy,
    previousValue: previous, newValue: next
  });

  return { ok: true, message: "Note saved." };
}

/**
 * Developer action: approves a submitted payment. Marks the invoice
 * Paid, applies the commission split, activates the subscription for
 * a fresh 30-day period, and notifies the owner. Requires confirmation
 * in the UI layer before this is called (see admin-billing-page-ui.js).
 * @returns {{ok:boolean, reason?:string, message?:string}}
 */
export function approvePayment(paymentId, performedBy){
  const all = getAllPayments();
  const payment = all.find(p => p.id === paymentId);
  if(!payment) return { ok: false, reason: "Payment not found." };
  if(payment.status !== GCASH_PAYMENT_STATUS.SUBMITTED){
    return { ok: false, reason: `This payment was already ${payment.status}.` };
  }

  const { commissionAmount, gymReceives } = calculateCommission(payment.amount);
  payment.status = GCASH_PAYMENT_STATUS.APPROVED;
  payment.decidedAt = new Date().toISOString();
  payment.decidedBy = performedBy || "(unknown developer)";
  payment.commissionAmount = commissionAmount;
  payment.gymReceives = gymReceives;
  saveAllPayments(all);

  markInvoicePaid(payment.invoiceId, { paymentMethod: "gcash", paymentProofRef: payment.id });
  approveGymPayment(payment.gymId, performedBy);

  createNotification({
    audience: "owner", gymId: payment.gymId, category: "payment_approved",
    title: "Payment approved", message: `Your payment for the ${payment.planName} plan was approved. Your subscription is Active for another 30 days.`
  });
  createNotification({
    audience: "owner", gymId: payment.gymId, category: "subscription_activated",
    title: "Subscription activated", message: `Your ${payment.planName} plan is now Active.`
  });

  return { ok: true, message: "Payment approved and subscription activated." };
}

/**
 * Developer action: rejects a submitted payment with a required reason.
 * Reverts the invoice to unpaid and the subscription to Pending Payment
 * so the owner can resubmit. Requires confirmation in the UI layer.
 * @returns {{ok:boolean, reason?:string, message?:string}}
 */
export function rejectPayment(paymentId, performedBy, reason){
  const cleanReason = (reason || "").trim();
  if(!cleanReason){
    return { ok: false, reason: "A rejection reason is required." };
  }

  const all = getAllPayments();
  const payment = all.find(p => p.id === paymentId);
  if(!payment) return { ok: false, reason: "Payment not found." };
  if(payment.status !== GCASH_PAYMENT_STATUS.SUBMITTED){
    return { ok: false, reason: `This payment was already ${payment.status}.` };
  }

  payment.status = GCASH_PAYMENT_STATUS.REJECTED;
  payment.decidedAt = new Date().toISOString();
  payment.decidedBy = performedBy || "(unknown developer)";
  payment.rejectionReason = cleanReason.slice(0, 500);
  saveAllPayments(all);

  markInvoiceUnpaid(payment.invoiceId);
  rejectGymPayment(payment.gymId, performedBy, cleanReason);

  createNotification({
    audience: "owner", gymId: payment.gymId, category: "payment_rejected",
    title: "Payment rejected", message: `Your payment for the ${payment.planName} plan was rejected: ${cleanReason}`
  });

  return { ok: true, message: "Payment rejected — owner has been notified with the reason." };
}
