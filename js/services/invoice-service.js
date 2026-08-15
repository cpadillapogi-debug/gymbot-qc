/* ============================================================
   GYMBOT QC — INVOICE SERVICE (Phase 6, expanded Phase 10)
   Simple invoice model + storage. Pure logic + storage only,
   no DOM — same shape as leads-service.js: one flat array under
   StorageAdapter, every record carries its own `gymId`, and
   every read path filters by it internally.

   Invoices are created as a SIDE EFFECT of subscription state
   transitions (see subscription-service.js's
   handleTransitionSideEffects()) — nothing in the UI layer
   creates an invoice directly. That keeps "when does a bill get
   generated" defined in exactly one place, next to the billing
   state machine it mirrors.

   TENANT SCOPING: everything here is keyed by gymId. getInvoicesForGym()
   is the only read path for owner-facing UI code, same reasoning as
   leads-service.js. getAllInvoicesForDeveloper() (Phase 10) is the one
   deliberate exception — same PERMISSION BOUNDARY style as
   tenant-service.js's getAllGymsForDeveloper(): gated by the caller's
   requireRole(DEVELOPER) guard, not by this file, and never imported
   from owner-facing code.

   Phase 10 (GCash Billing) expands the invoice model with
   subscriptionId (== gymId — subscriptions are 1:1 per gym, see
   subscription-service.js), billingPeriodStart/End, paymentMethod, and
   paymentProofRef (a gcashPayments record id). Every field is optional
   and defaults to null so Phase 6/7/8 invoices already on disk still
   read back fine — no migration needed.
   ============================================================ */
import { storage } from "../storage.js";
import { INVOICE_STATUS } from "../config.js";
import { generateId, sanitizeRecords } from "../utils.js";

// Sanitized at the source (id/gymId required) — same reasoning as
// leads-service.js's getAllLeadsRaw(): every filter/find below assumes
// a well-formed record, so a corrupted one is dropped in memory here
// instead of crashing the first property access downstream.
function getAllInvoices(){
  return sanitizeRecords(storage.getJSON("invoices", [], { requireArray: true }), ["id", "gymId"]);
}

function saveAllInvoices(invoices){
  return storage.setJSON("invoices", invoices);
}

/**
 * @param {string} gymId
 * @param {{id:string, name:string, priceMonthly:number}} plan snapshot of the plan at invoice time —
 *   stored by value (planId + planName + amount) so a later price change
 *   (Developer-only, future phase) never rewrites history on old invoices.
 * @param {{createdAt?:string, dueDate?:string, status?:string, periodStart?:string, periodEnd?:string}} opts
 * @returns {object} the created invoice
 */
export function generateInvoice(gymId, plan, opts = {}){
  const now = new Date().toISOString();
  const invoice = {
    id: generateId("inv"),
    gymId,
    subscriptionId: gymId, // subscriptions are 1:1 per gym — see subscription-service.js header comment
    planId: plan.id,
    planName: plan.name,
    amount: plan.priceMonthly,
    status: opts.status || INVOICE_STATUS.PENDING,
    createdAt: opts.createdAt || now,
    dueDate: opts.dueDate || opts.createdAt || now,
    paidDate: null,
    billingPeriodStart: opts.periodStart || opts.createdAt || now,
    billingPeriodEnd: opts.periodEnd || null,
    paymentMethod: null,      // set on approval — see markInvoicePaid()
    paymentProofRef: null     // gcashPayments record id — set on approval
  };
  const all = getAllInvoices();
  all.push(invoice);
  saveAllInvoices(all);
  return invoice;
}

/** @returns {object[]} this gym's invoices, newest first */
export function getInvoicesForGym(gymId){
  if(!gymId) return [];
  return getAllInvoices()
    .filter(inv => inv.gymId === gymId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/** Flips this gym's most recent Pending invoice to Overdue. Called when
 *  a subscription transitions Pending Payment -> Grace Period. No-op
 *  (returns null) if there's no pending invoice — defensive only, this
 *  shouldn't happen given every Pending Payment period starts by
 *  generating exactly one invoice. */
export function markLatestPendingInvoiceOverdue(gymId){
  const all = getAllInvoices();
  const pending = all.filter(inv => inv.gymId === gymId && inv.status === INVOICE_STATUS.PENDING);
  if(pending.length === 0) return null;

  const latest = pending.reduce((a, b) => new Date(a.createdAt) > new Date(b.createdAt) ? a : b);
  latest.status = INVOICE_STATUS.OVERDUE;
  saveAllInvoices(all);
  return latest;
}

/* ---------- Phase 10: GCash Billing ---------- */

/** @returns {object|null} this gym's newest still-owed invoice (Pending
 *  or Overdue), or null if nothing is currently owed. This is "the
 *  current invoice" a GCash proof-of-payment upload attaches to. */
export function getLatestOpenInvoiceForGym(gymId){
  if(!gymId) return null;
  const open = getAllInvoices().filter(inv =>
    inv.gymId === gymId && (inv.status === INVOICE_STATUS.PENDING || inv.status === INVOICE_STATUS.OVERDUE)
  );
  if(open.length === 0) return null;
  return open.reduce((a, b) => new Date(a.createdAt) > new Date(b.createdAt) ? a : b);
}

/** @returns {object|null} the invoice by id, or null. Single-record
 *  lookup — used by gcash-payment-service.js when approving/rejecting
 *  a payment that already carries an invoiceId. */
export function getInvoiceById(invoiceId){
  if(!invoiceId) return null;
  return getAllInvoices().find(inv => inv.id === invoiceId) || null;
}

/** Marks an invoice Paid — the only place an invoice's paidDate,
 *  paymentMethod, or paymentProofRef ever get set. Called from
 *  gcash-payment-service.js's approvePayment(), never directly from UI
 *  code (mirrors "invoices are a side effect, not a direct write" from
 *  the header comment above). */
export function markInvoicePaid(invoiceId, { paidDate, paymentMethod, paymentProofRef } = {}){
  const all = getAllInvoices();
  const invoice = all.find(inv => inv.id === invoiceId);
  if(!invoice) return null;
  invoice.status = INVOICE_STATUS.PAID;
  invoice.paidDate = paidDate || new Date().toISOString();
  invoice.paymentMethod = paymentMethod || "gcash";
  invoice.paymentProofRef = paymentProofRef || null;
  saveAllInvoices(all);
  return invoice;
}

/** Reverts an invoice back to Pending — used when a Developer rejects
 *  a submitted GCash payment, so the owner sees it as still owed
 *  (rather than silently stuck on whatever status it was mid-review). */
export function markInvoiceUnpaid(invoiceId){
  const all = getAllInvoices();
  const invoice = all.find(inv => inv.id === invoiceId);
  if(!invoice) return null;
  invoice.status = INVOICE_STATUS.PENDING;
  invoice.paidDate = null;
  invoice.paymentMethod = null;
  invoice.paymentProofRef = null;
  saveAllInvoices(all);
  return invoice;
}

/** Developer-only, cross-tenant read — see header PERMISSION BOUNDARY
 *  note. Backs the Revenue Dashboard's real (not simulated) totals.
 *  @returns {object[]} every invoice on the platform, newest first. */
export function getAllInvoicesForDeveloper(){
  return getAllInvoices().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
