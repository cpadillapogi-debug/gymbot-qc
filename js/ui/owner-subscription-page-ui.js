/* ============================================================
   GYMBOT QC — OWNER: SUBSCRIPTION PAGE (Phase 6)
   Replaces the Phase 3 static placeholder. Read-only view of
   this gym's OWN plan, status, billing cycle, and invoice
   history, plus a placeholder "request an upgrade" action.

   Deliberately still does NOT let a Gym Owner change plan
   prices, billing dates, or subscription status — every value
   rendered here comes from subscription-service.js /
   invoice-service.js, and the only write path this page uses is
   requestPlanUpgrade(), which records intent, never an actual
   change (see that function's own comment for why).

   Data layer: subscription-service.js (plans, state machine,
   billing cycle) + invoice-service.js (invoice history). This
   module is rendering + wiring only, same split as every other
   owner-*-page-ui.js file.
   ============================================================ */
import { SUBSCRIPTION_STATUS_LABELS, INVOICE_STATUS_LABELS } from "../config.js";
import { escapeHtml } from "../utils.js";
import {
  getSubscription, getAllPlans, getPlan, getSubscriptionAccess,
  getTrialDaysRemaining, getAmountDue, getPaymentStatusLabel, requestPlanUpgrade
} from "../services/subscription-service.js";
import { getInvoicesForGym } from "../services/invoice-service.js";
import { refreshBillingStatus } from "./owner-billing-banner-ui.js";
import { showToast } from "./toast-ui.js";
import { renderGcashBillingPanel, wireGcashBillingPanel } from "./owner-gcash-billing-ui.js";
import { downloadInvoiceReceipt } from "./owner-receipt-ui.js";

const STATUS_BADGE_CLASS = {
  trialing: "sub-status-info",
  active: "sub-status-ok",
  pending_payment: "sub-status-warn",
  grace_period: "sub-status-warn",
  suspended: "sub-status-danger",
  disabled: "sub-status-danger",
  canceled: "sub-status-warn",
  expired: "sub-status-danger"
};

const INVOICE_BADGE_CLASS = {
  pending: "sub-status-warn",
  paid: "sub-status-ok",
  overdue: "sub-status-danger",
  canceled: "sub-status-warn"
};

export function renderOwnerSubscriptionPage(gymId){
  const root = document.getElementById("ownerSubscriptionPageContent");
  if(!root) return;

  const sub = getSubscription(gymId);
  if(!sub){
    root.innerHTML = `<div class="owner-panel"><p class="help-text" style="margin:0;">No gym is associated with this account.</p></div>`;
    return;
  }

  const access = getSubscriptionAccess(sub.status);
  const plan = getPlan(sub.planId);
  const trialDaysLeft = getTrialDaysRemaining(sub);
  const amountDue = getAmountDue(sub);
  const invoices = getInvoicesForGym(gymId);

  root.innerHTML = `
    ${renderPlanPanel(sub, plan, access, trialDaysLeft, amountDue)}
    ${renderGcashBillingPanel(gymId)}
    ${renderUpgradePanel(sub, plan)}
    ${renderInvoicePanel(invoices)}
  `;

  wireUpgradeButtons(gymId, sub);
  wireGcashBillingPanel(gymId, () => renderOwnerSubscriptionPage(gymId));
  wireReceiptButtons(invoices);
}

/* ---------- Plan / status panel ---------- */

function renderPlanPanel(sub, plan, access, trialDaysLeft, amountDue){
  const badgeClass = STATUS_BADGE_CLASS[sub.status] || "sub-status-info";
  const statusLabel = SUBSCRIPTION_STATUS_LABELS[sub.status] || sub.status;

  return `
    <div class="owner-panel owner-plan-panel">
      <div class="owner-plan-badge">Current plan</div>
      <h2 class="owner-plan-name">${escapeHtml(plan.name)}</h2>
      <p class="help-text" style="margin-top:0;">${escapeHtml(plan.blurb || "")}</p>

      <div class="owner-sub-status-row">
        <span class="owner-sub-status-badge ${badgeClass}">${escapeHtml(statusLabel)}</span>
      </div>

      <dl class="owner-sub-detail-list">
        <div><dt>Monthly price</dt><dd>₱${plan.priceMonthly.toLocaleString()}/month</dd></div>
        <div><dt>Billing interval</dt><dd>Monthly</dd></div>
        <div><dt>Next billing date</dt><dd>${formatDate(sub.nextBillingDate)}</dd></div>
        ${sub.status === "trialing" ? `<div><dt>Trial days remaining</dt><dd>${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"}</dd></div>` : ""}
        <div><dt>Amount due</dt><dd>${amountDue > 0 ? `₱${amountDue.toLocaleString()}` : "₱0"}</dd></div>
        <div><dt>Payment status</dt><dd>${escapeHtml(getPaymentStatusLabel(sub))}</dd></div>
      </dl>

      <button class="btn btn-ghost btn-sm" type="button" disabled title="Real payment processing isn't built yet — see docs/PHASE6_NOTES.md">Manage billing</button>
    </div>
  `;
}

/* ---------- Upgrade panel (placeholder request only) ---------- */

function renderUpgradePanel(sub, currentPlan){
  const plans = getAllPlans();
  const requested = sub.requestedPlanId ? getPlan(sub.requestedPlanId) : null;

  return `
    <div class="owner-panel">
      <h3>Plans</h3>
      <p class="help-text" style="margin-top:0;">Plan prices are set by GymBot QC and can't be edited here. Request an upgrade and a developer will apply it manually for now — there's no automated billing yet.</p>
      ${requested ? `<div class="status-line ok" style="display:block;">Upgrade to ${escapeHtml(requested.name)} requested on ${formatDate(sub.upgradeRequestedAt)} — pending developer review.</div>` : ""}
      <div class="owner-plans-grid">
        ${plans.map(p => renderPlanCard(p, currentPlan, sub)).join("")}
      </div>
    </div>
  `;
}

function renderPlanCard(plan, currentPlan, sub){
  const isCurrent = plan.id === currentPlan.id;
  const isRequested = sub.requestedPlanId === plan.id;
  const btnLabel = isCurrent ? "Current plan" : (isRequested ? "Requested" : "Request upgrade");
  const btnDisabled = isCurrent || isRequested;

  return `
    <div class="owner-plan-card ${isCurrent ? "owner-plan-card-current" : ""}">
      <div class="owner-plan-card-name">${escapeHtml(plan.name)}</div>
      <div class="owner-plan-card-price">₱${plan.priceMonthly.toLocaleString()}<span>/mo</span></div>
      <p class="help-text" style="min-height:34px;">${escapeHtml(plan.blurb || "")}</p>
      <button class="btn btn-ghost btn-sm owner-plan-card-btn" type="button" data-plan-id="${escapeHtml(plan.id)}" ${btnDisabled ? "disabled" : ""}>${escapeHtml(btnLabel)}</button>
    </div>
  `;
}

function wireUpgradeButtons(gymId, sub){
  document.querySelectorAll(".owner-plan-card-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const planId = btn.dataset.planId;
      const result = requestPlanUpgrade(gymId, planId);
      if(result.ok){
        showToast(result.message);
      }else{
        showToast(result.reason || "Couldn't submit that request.");
      }
      renderOwnerSubscriptionPage(gymId);
      refreshBillingStatus(gymId);
    });
  });
}

/* ---------- Invoice history ---------- */

function renderInvoicePanel(invoices){
  if(invoices.length === 0){
    return `
      <div class="owner-panel">
        <h3>Invoice history</h3>
        <div class="empty-state">No invoices yet — one is created automatically at the end of your trial.</div>
      </div>
    `;
  }

  return `
    <div class="owner-panel">
      <h3>Invoice &amp; payment history</h3>
      <table class="owner-table owner-invoice-table">
        <thead>
          <tr>
            <th>Invoice</th><th>Plan</th><th>Amount</th><th>Status</th><th>Method</th><th>Created</th><th>Due</th><th>Paid</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${invoices.map(renderInvoiceRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderInvoiceRow(inv){
  const badgeClass = INVOICE_BADGE_CLASS[inv.status] || "sub-status-info";
  const statusLabel = INVOICE_STATUS_LABELS[inv.status] || inv.status;
  return `
    <tr>
      <td data-label="Invoice">${escapeHtml(inv.id)}</td>
      <td data-label="Plan">${escapeHtml(inv.planName)}</td>
      <td data-label="Amount">₱${inv.amount.toLocaleString()}</td>
      <td data-label="Status"><span class="owner-sub-status-badge ${badgeClass}">${escapeHtml(statusLabel)}</span></td>
      <td data-label="Method">${inv.paymentMethod ? escapeHtml(inv.paymentMethod.toUpperCase()) : "\u2014"}</td>
      <td data-label="Created">${formatDate(inv.createdAt)}</td>
      <td data-label="Due">${formatDate(inv.dueDate)}</td>
      <td data-label="Paid">${inv.paidDate ? formatDate(inv.paidDate) : "\u2014"}</td>
      <td data-label="">${inv.status === "paid" ? `<button class="btn btn-ghost btn-sm owner-receipt-btn" type="button" data-invoice-id="${escapeHtml(inv.id)}">Receipt</button>` : ""}</td>
    </tr>
  `;
}

function wireReceiptButtons(invoices){
  document.querySelectorAll(".owner-receipt-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const inv = invoices.find(i => i.id === btn.dataset.invoiceId);
      if(inv) downloadInvoiceReceipt(inv);
    });
  });
}

/* ---------- Shared helper ---------- */

function formatDate(iso){
  if(!iso) return "\u2014";
  try{ return new Date(iso).toLocaleDateString(); }catch(err){ return "\u2014"; }
}
