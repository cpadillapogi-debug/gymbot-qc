/* ============================================================
   GYMBOT QC — MASTER ADMIN: BILLING PAGE (Phase 10)
   New top-level Developer page — GCash Billing & Commission
   Engine. Kept as its own page (not folded into the Phase 9
   Developer Console) because it's tenant-facing billing
   configuration + payment review, not internal system/AI
   tuning — a different concern from the Dev Console's AI
   config/logs/backups/feature-flags grab-bag. Same tab-strip
   *look* as the Dev Console (reuses its CSS classes) but its
   own scoped `.billing-tab` class for JS wiring, so the two
   tab strips living in the same DOM at once don't collide.

   Four tabs:
     - Pending Payments: the approval queue (approve/reject).
     - GCash Settings: QR image, number, account name (global).
     - Commission Engine: fee mode + live example.
     - Revenue: real + simulated platform financial totals.

   This module owns NOTHING but rendering/wiring — all real
   read/write goes through gcash-payment-service.js,
   commission-service.js, and admin-registry-service.js.
   ============================================================ */
import { COMMISSION_MODES, COMMISSION_MODE_LABELS, CONFIG, GCASH_PAYMENT_STATUS, GCASH_PAYMENT_STATUS_LABELS } from "../config.js";
import { escapeHtml } from "../utils.js";
import { getCurrentUser } from "../services/auth-service.js";
import { showToast } from "./toast-ui.js";
import { getPendingPaymentsForDeveloper, getPaymentHistoryForDeveloper, getDeveloperAnalytics } from "../services/admin-registry-service.js";
import { approvePayment, rejectPayment, setPaymentInternalNote, getGcashSettings, saveGcashSettings, validateImageFile } from "../services/gcash-payment-service.js";
import { getCommissionConfig, saveCommissionConfig, calculateCommission } from "../services/commission-service.js";

const TABS = Object.freeze(["pending", "history", "gcash", "commission", "revenue"]);
const TAB_LABELS = Object.freeze({
  pending: "Pending Payments",
  history: "Payment History",
  gcash: "GCash Settings",
  commission: "Commission Engine",
  revenue: "Revenue"
});
const HISTORY_PAGE_SIZE = 25;
let historyPage = 1; // reset to 1 whenever a history filter changes — see resetHistoryPageAndRender()

const PHP = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 });

export function initAdminBillingPage(){
  wireTabNav();
  renderActiveTab();
}

export function refreshAdminBillingPage(){
  renderActiveTab();
}

function currentTab(){
  const raw = document.querySelector(".billing-tab.active");
  return (raw && raw.dataset.billingTab) || "pending";
}

function wireTabNav(){
  document.querySelectorAll(".billing-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".billing-tab").forEach(t => t.classList.toggle("active", t === tab));
      renderActiveTab();
    });
  });
}

function renderActiveTab(){
  const root = document.getElementById("adminBillingContent");
  if(!root) return;
  const tab = currentTab();
  const headingEl = document.getElementById("adminBillingHeading");
  if(headingEl) headingEl.textContent = TAB_LABELS[tab] || "Billing";

  switch(tab){
    case "pending": return renderPendingTab(root);
    case "history": return renderHistoryTab(root);
    case "gcash": return renderGcashTab(root);
    case "commission": return renderCommissionTab(root);
    case "revenue": return renderRevenueTab(root);
    default: return renderPendingTab(root);
  }
}

async function performedBy(){
  const user = await getCurrentUser();
  return user ? user.email : null;
}

/* ---------------- Pending Payments ---------------- */

async function renderPendingTab(root){
  const queue = await getPendingPaymentsForDeveloper();

  if(queue.length === 0){
    root.innerHTML = `<div class="owner-panel"><div class="empty-state">No payments awaiting review.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="owner-panel">
      <p class="help-text" style="margin-top:0;">${queue.length} payment${queue.length === 1 ? "" : "s"} awaiting verification, oldest first.</p>
      <div class="gcash-pending-list">
        ${queue.map(renderPendingRow).join("")}
      </div>
    </div>
  `;

  root.querySelectorAll(".gcash-proof-thumb").forEach(img => {
    img.addEventListener("click", () => window.open(img.src, "_blank"));
  });
  root.querySelectorAll(".gcash-approve-btn").forEach(btn => {
    btn.addEventListener("click", () => handleApprove(btn.dataset.paymentId));
  });
  root.querySelectorAll(".gcash-reject-btn").forEach(btn => {
    btn.addEventListener("click", () => handleReject(btn.dataset.paymentId));
  });
}

function renderPendingRow({ payment, gymName, ownerEmail }){
  return `
    <div class="gcash-pending-row">
      <img class="gcash-proof-thumb" src="${payment.proofImageDataUrl}" alt="Proof of payment" title="Click to view full size">
      <div class="gcash-pending-info">
        <div class="gcash-pending-title">${escapeHtml(gymName)} <span class="help-text">— ${escapeHtml(ownerEmail)}</span></div>
        <dl class="owner-sub-detail-list">
          <div><dt>Plan</dt><dd>${escapeHtml(payment.planName)}</dd></div>
          <div><dt>Amount</dt><dd>₱${payment.amount.toLocaleString()}</dd></div>
          <div><dt>Billing period</dt><dd>${formatDate(payment.billingPeriodStart)} \u2013 ${formatDate(payment.billingPeriodEnd)}</dd></div>
          <div><dt>Reference</dt><dd>${payment.reference ? escapeHtml(payment.reference) : "\u2014"}</dd></div>
          <div><dt>Submitted</dt><dd>${formatDate(payment.submittedAt)}</dd></div>
          ${payment.note ? `<div><dt>Note</dt><dd>${escapeHtml(payment.note)}</dd></div>` : ""}
        </dl>
        <div class="panel-actions">
          <button class="btn btn-primary btn-sm gcash-approve-btn" type="button" data-payment-id="${escapeHtml(payment.id)}">Approve</button>
          <button class="btn btn-danger-outline btn-sm gcash-reject-btn" type="button" data-payment-id="${escapeHtml(payment.id)}">Reject</button>
        </div>
      </div>
    </div>
  `;
}

async function handleApprove(paymentId){
  if(!window.confirm("Approve this payment? The subscription will become Active for another 30 days.")) return;
  const result = approvePayment(paymentId, await performedBy());
  showToast(result.ok ? result.message : (result.reason || "Couldn't approve that payment."));
  renderActiveTab();
}

async function handleReject(paymentId){
  const reason = window.prompt("Reason for rejecting this payment (shown to the owner):");
  if(reason === null) return; // canceled
  if(!reason.trim()){
    showToast("A rejection reason is required.");
    return;
  }
  if(!window.confirm("Reject this payment? The owner will be notified with your reason.")) return;
  const result = rejectPayment(paymentId, await performedBy(), reason);
  showToast(result.ok ? result.message : (result.reason || "Couldn't reject that payment."));
  renderActiveTab();
}

/* ---------------- Payment History ---------------- */
// Every payment ever submitted, any status — search/filter/sort over a
// client-side table, same technique as admin-gym-registry-ui.js's
// getFilteredSortedRows()/pagination. Statuses shown are exactly the
// three that exist on disk (Submitted/Approved/Rejected — see
// GCASH_PAYMENT_STATUS in config.js). There is no "Refunded" or
// "Requires Review" status yet because there's no real refund path or
// review-flagging workflow behind either — adding those to the filter
// list without real logic behind them would be exactly the kind of
// fake status this codebase's honesty rule (see file header) exists
// to avoid. Use the internal note field for a manual "flagged, needs
// a second look" trail in the meantime.

async function renderHistoryTab(root){
  root.innerHTML = `
    <div class="owner-panel">
      <div class="owner-leads-toolbar">
        <input type="text" id="paymentHistorySearch" class="owner-leads-search" placeholder="Search by gym, owner email, or transaction ID…">
        <select id="paymentHistoryStatusFilter" aria-label="Filter by status">
          <option value="">All statuses</option>
          ${Object.values(GCASH_PAYMENT_STATUS).map(s => `<option value="${s}">${escapeHtml(GCASH_PAYMENT_STATUS_LABELS[s] || s)}</option>`).join("")}
        </select>
        <select id="paymentHistoryDateFilter" aria-label="Filter by submitted date">
          <option value="">Any date</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
        <input type="number" id="paymentHistoryMinAmount" placeholder="Min ₱" min="0" style="width:100px;">
        <input type="number" id="paymentHistoryMaxAmount" placeholder="Max ₱" min="0" style="width:100px;">
        <span class="owner-leads-count" id="paymentHistoryCount">0 payments</span>
      </div>
      <div id="paymentHistoryList"></div>
      <div class="owner-leads-toolbar" id="paymentHistoryPager" style="justify-content:center;"></div>
    </div>
  `;

  document.getElementById("paymentHistorySearch").addEventListener("input", resetHistoryPageAndRender);
  document.getElementById("paymentHistoryStatusFilter").addEventListener("change", resetHistoryPageAndRender);
  document.getElementById("paymentHistoryDateFilter").addEventListener("change", resetHistoryPageAndRender);
  document.getElementById("paymentHistoryMinAmount").addEventListener("input", resetHistoryPageAndRender);
  document.getElementById("paymentHistoryMaxAmount").addEventListener("input", resetHistoryPageAndRender);

  await renderHistoryList();
}

async function resetHistoryPageAndRender(){
  historyPage = 1;
  await renderHistoryList();
}

async function getFilteredHistoryRows(){
  const query = (document.getElementById("paymentHistorySearch").value || "").trim().toLowerCase();
  const statusFilter = document.getElementById("paymentHistoryStatusFilter").value;
  const dateDays = Number(document.getElementById("paymentHistoryDateFilter").value || 0);
  const minAmount = Number(document.getElementById("paymentHistoryMinAmount").value || 0);
  const maxAmount = Number(document.getElementById("paymentHistoryMaxAmount").value || 0);

  let rows = await getPaymentHistoryForDeveloper();

  if(query){
    rows = rows.filter(r =>
      r.gymName.toLowerCase().includes(query) ||
      r.ownerEmail.toLowerCase().includes(query) ||
      r.payment.id.toLowerCase().includes(query)
    );
  }
  if(statusFilter){
    rows = rows.filter(r => r.payment.status === statusFilter);
  }
  if(dateDays > 0){
    const cutoff = Date.now() - dateDays * 24 * 60 * 60 * 1000;
    rows = rows.filter(r => new Date(r.payment.submittedAt).getTime() >= cutoff);
  }
  if(minAmount > 0){
    rows = rows.filter(r => r.payment.amount >= minAmount);
  }
  if(maxAmount > 0){
    rows = rows.filter(r => r.payment.amount <= maxAmount);
  }

  return rows;
}

async function renderHistoryList(){
  const allRows = await getFilteredHistoryRows();
  document.getElementById("paymentHistoryCount").textContent = `${allRows.length} payment${allRows.length === 1 ? "" : "s"}`;

  const listEl = document.getElementById("paymentHistoryList");
  const pagerEl = document.getElementById("paymentHistoryPager");

  if(allRows.length === 0){
    listEl.innerHTML = `<div class="empty-state">No payments match your search/filter.</div>`;
    pagerEl.innerHTML = "";
    return;
  }

  const pageCount = Math.max(1, Math.ceil(allRows.length / HISTORY_PAGE_SIZE));
  if(historyPage > pageCount) historyPage = pageCount;
  const rows = allRows.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE);

  listEl.innerHTML = `
    <table class="owner-table owner-leads-table">
      <thead>
        <tr>
          <th>Transaction ID</th><th>Gym</th><th>Owner</th><th>Amount</th><th>Plan</th>
          <th>Submitted</th><th>Verified</th><th>Status</th><th>Verified by</th><th>Internal note</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td data-label="Transaction ID"><code>${escapeHtml(r.payment.id)}</code></td>
            <td data-label="Gym">${escapeHtml(r.gymName)}</td>
            <td data-label="Owner">${escapeHtml(r.ownerEmail)}</td>
            <td data-label="Amount">₱${r.payment.amount.toLocaleString()}</td>
            <td data-label="Plan">${escapeHtml(r.payment.planName)}</td>
            <td data-label="Submitted">${formatDate(r.payment.submittedAt)}</td>
            <td data-label="Verified">${r.payment.decidedAt ? formatDate(r.payment.decidedAt) : "\u2014"}</td>
            <td data-label="Status"><span class="owner-sub-status-badge ${paymentBadgeClass(r.payment.status)}">${escapeHtml(GCASH_PAYMENT_STATUS_LABELS[r.payment.status] || r.payment.status)}</span></td>
            <td data-label="Verified by">${r.payment.decidedBy ? escapeHtml(r.payment.decidedBy) : "\u2014"}</td>
            <td data-label="Internal note">
              <input type="text" class="payment-note-input" data-payment-id="${escapeHtml(r.payment.id)}" value="${escapeHtml(r.payment.internalNote || "")}" placeholder="Add a note…" maxlength="500" style="width:160px;">
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  listEl.querySelectorAll(".payment-note-input").forEach(input => {
    input.addEventListener("change", async () => {
      const result = setPaymentInternalNote(input.dataset.paymentId, input.value, await performedBy());
      if(!result.ok) showToast(result.reason || "Couldn't save that note.");
    });
  });

  renderHistoryPager(pageCount, allRows.length);
}

function renderHistoryPager(pageCount, totalRows){
  const pagerEl = document.getElementById("paymentHistoryPager");
  if(!pagerEl) return;
  if(pageCount <= 1){
    pagerEl.innerHTML = "";
    return;
  }
  pagerEl.innerHTML = `
    <button type="button" class="btn btn-ghost btn-sm" id="paymentHistoryPrevPage" ${historyPage <= 1 ? "disabled" : ""}>\u2190 Prev</button>
    <span class="help-text">Page ${historyPage} of ${pageCount} (${totalRows} payments)</span>
    <button type="button" class="btn btn-ghost btn-sm" id="paymentHistoryNextPage" ${historyPage >= pageCount ? "disabled" : ""}>Next \u2192</button>
  `;
  const prevBtn = document.getElementById("paymentHistoryPrevPage");
  const nextBtn = document.getElementById("paymentHistoryNextPage");
  if(prevBtn) prevBtn.addEventListener("click", () => { historyPage--; renderHistoryList(); });
  if(nextBtn) nextBtn.addEventListener("click", () => { historyPage++; renderHistoryList(); });
}

function paymentBadgeClass(status){
  const map = {
    [GCASH_PAYMENT_STATUS.SUBMITTED]: "sub-status-warn",
    [GCASH_PAYMENT_STATUS.APPROVED]: "sub-status-ok",
    [GCASH_PAYMENT_STATUS.REJECTED]: "sub-status-danger"
  };
  return map[status] || "sub-status-info";
}

/* ---------------- GCash Settings ---------------- */

function renderGcashTab(root){
  const settings = getGcashSettings();

  root.innerHTML = `
    <div class="owner-panel">
      <h3>GCash payment details</h3>
      <p class="help-text" style="margin-top:0;">Shown to every Gym Owner on their Subscription page when a payment is due. One set of details for the whole platform.</p>
      <form id="gcashSettingsForm" class="owner-settings-grid cols-2">
        <div class="owner-field cols-span-2">
          <label for="gcashQrFile">QR code image</label>
          <div class="owner-file-row">
            <input type="file" id="gcashQrFile" accept="image/*">
          </div>
          <div class="owner-file-name" id="gcashQrFileName">${settings.qrImageFileName ? escapeHtml(settings.qrImageFileName) : "No file chosen"}</div>
          ${settings.qrImageDataUrl ? `<img src="${settings.qrImageDataUrl}" alt="Current QR code" class="gcash-qr-img" style="margin-top:10px;">` : ""}
        </div>
        <div class="owner-field">
          <label for="gcashNumberInput">GCash number</label>
          <input type="text" id="gcashNumberInput" maxlength="40" value="${escapeHtml(settings.gcashNumber)}" placeholder="0917 123 4567">
        </div>
        <div class="owner-field">
          <label for="gcashAccountNameInput">Account name</label>
          <input type="text" id="gcashAccountNameInput" maxlength="120" value="${escapeHtml(settings.accountName)}" placeholder="Juan Dela Cruz">
        </div>
        <div class="owner-settings-actions cols-span-2">
          <button class="btn btn-primary" id="gcashSettingsSaveBtn" type="submit">Save GCash settings</button>
          <div class="status-line" id="gcashSettingsStatusLine" role="status"></div>
        </div>
      </form>
    </div>
  `;

  let newQrDataUrl = null;
  let newQrFileName = null;

  const fileInput = document.getElementById("gcashQrFile");
  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if(!file) return;
    const validation = validateImageFile(file, CONFIG.GCASH_QR_MAX_BYTES);
    if(!validation.ok){
      showToast(validation.reason);
      fileInput.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      newQrDataUrl = reader.result;
      newQrFileName = file.name;
      document.getElementById("gcashQrFileName").textContent = file.name;
    };
    reader.onerror = () => {
      newQrDataUrl = null;
      newQrFileName = null;
      const nameEl = document.getElementById("gcashQrFileName");
      if(nameEl) nameEl.textContent = "No file chosen";
      fileInput.value = "";
      showToast("Couldn't read that image — please try a different file.");
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("gcashSettingsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    saveGcashSettings({
      qrImageDataUrl: newQrDataUrl !== null ? newQrDataUrl : undefined,
      qrImageFileName: newQrFileName !== null ? newQrFileName : undefined,
      gcashNumber: document.getElementById("gcashNumberInput").value,
      accountName: document.getElementById("gcashAccountNameInput").value
    }, await performedBy());
    setStatus(document.getElementById("gcashSettingsStatusLine"), "GCash settings saved.", true);
    showToast("GCash settings saved.");
  });
}

/* ---------------- Commission Engine ---------------- */

function renderCommissionTab(root){
  const cfg = getCommissionConfig();

  root.innerHTML = `
    <div class="owner-panel">
      <h3>GymBot QC Service Fee</h3>
      <p class="help-text" style="margin-top:0;">Controls how much of each approved GCash payment GymBot QC keeps as a service fee. Applied automatically whenever a Developer approves a payment.</p>
      <form id="commissionForm" class="owner-settings-grid cols-2">
        <div class="owner-field">
          <label for="commissionModeSelect">Fee mode</label>
          <select id="commissionModeSelect">
            ${Object.values(COMMISSION_MODES).map(m => `<option value="${m}" ${cfg.mode === m ? "selected" : ""}>${escapeHtml(COMMISSION_MODE_LABELS[m])}</option>`).join("")}
          </select>
        </div>
        <div></div>
        <div class="owner-field">
          <label for="commissionFixedInput">Fixed fee (₱)</label>
          <input type="number" id="commissionFixedInput" min="0" max="${CONFIG.COMMISSION_FIXED_MAX}" value="${cfg.fixedAmount}">
        </div>
        <div class="owner-field">
          <label for="commissionPercentInput">Percentage fee (%)</label>
          <input type="number" id="commissionPercentInput" min="0" max="${CONFIG.COMMISSION_PERCENTAGE_MAX}" value="${cfg.percentage}">
        </div>
        <div class="owner-settings-actions cols-span-2">
          <button class="btn btn-primary" id="commissionSaveBtn" type="submit">Save fee settings</button>
          <div class="status-line" id="commissionStatusLine" role="status"></div>
        </div>
      </form>
      <div id="commissionExample" style="margin-top:16px;"></div>
    </div>
  `;

  const modeSelect = document.getElementById("commissionModeSelect");
  const fixedInput = document.getElementById("commissionFixedInput");
  const percentInput = document.getElementById("commissionPercentInput");

  function renderExample(){
    const previewCfg = {
      mode: modeSelect.value,
      fixedAmount: Number(fixedInput.value) || 0,
      percentage: Number(percentInput.value) || 0
    };
    const exampleAmount = 1200;
    const { commissionAmount, gymReceives } = calculateCommission(exampleAmount, previewCfg);
    document.getElementById("commissionExample").innerHTML = `
      <dl class="owner-sub-detail-list">
        <div><dt>Example: membership</dt><dd>₱${exampleAmount.toLocaleString()}</dd></div>
        <div><dt>GymBot QC fee</dt><dd>₱${commissionAmount.toLocaleString()}</dd></div>
        <div><dt>Gym receives</dt><dd>₱${gymReceives.toLocaleString()}</dd></div>
      </dl>
    `;
  }
  [modeSelect, fixedInput, percentInput].forEach(el => el.addEventListener("input", renderExample));
  renderExample();

  document.getElementById("commissionForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    saveCommissionConfig({
      mode: modeSelect.value,
      fixedAmount: fixedInput.value,
      percentage: percentInput.value
    }, await performedBy());
    setStatus(document.getElementById("commissionStatusLine"), "Commission settings saved.", true);
    showToast("Commission settings saved.");
  });
}

/* ---------------- Revenue ---------------- */

async function renderRevenueTab(root){
  const a = await getDeveloperAnalytics();

  root.innerHTML = `
    <div class="owner-metric-grid">
      <div class="owner-metric-card">
        <div class="owner-metric-num">₱${PHP.format(a.totalSubscriptionRevenue)}</div>
        <div class="owner-metric-label">Total subscription revenue</div>
      </div>
      <div class="owner-metric-card">
        <div class="owner-metric-num">₱${PHP.format(a.totalCommissionsCollected)}</div>
        <div class="owner-metric-label">Total commissions collected</div>
      </div>
      <div class="owner-metric-card">
        <div class="owner-metric-num">${a.pendingPaymentsQueueCount}</div>
        <div class="owner-metric-label">Pending payments</div>
      </div>
      <div class="owner-metric-card">
        <div class="owner-metric-num">${a.paidInvoicesCount}</div>
        <div class="owner-metric-label">Paid invoices</div>
      </div>
      <div class="owner-metric-card">
        <div class="owner-metric-num">${a.overdueInvoicesCount}</div>
        <div class="owner-metric-label">Overdue invoices</div>
      </div>
      <div class="owner-metric-card">
        <div class="owner-metric-num">₱${PHP.format(a.estimatedMrr)}</div>
        <div class="owner-metric-label">Monthly recurring revenue <span class="demo-tag">simulated</span></div>
      </div>
      <div class="owner-metric-card">
        <div class="owner-metric-num">₱${PHP.format(a.estimatedArr)}</div>
        <div class="owner-metric-label">Est. annual recurring revenue <span class="demo-tag">simulated</span></div>
      </div>
    </div>
    <div class="owner-panel">
      <p class="help-text" style="margin:0;">"Total subscription revenue" and "Total commissions collected" are real totals from actually-approved GCash payments. MRR/ARR are still simulated — they project from gyms currently in an Active status, the same way Phase 7's Overview page always has, since there's no recurring auto-charge yet (see docs/PHASE6_NOTES.md).</p>
    </div>
  `;
}

/* ---------------- Shared helpers ---------------- */

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
