/* ============================================================
   GYMBOT QC — MASTER ADMIN: GYM REGISTRY (Phase 7)
   The global, platform-wide list of every gym tenant. Search +
   filter + sort a client-side table (same technique as
   owner-leads-page-ui.js), plus a detail modal per gym with the
   two Developer-only overrides subscription-service.js exposes:
   applying a requested plan upgrade, and reactivating a
   Suspended/Disabled account.

   PERMISSION BOUNDARY: this page is only ever mounted from
   admin-shell-ui.js, which is gated by requireRole(ROLES.DEVELOPER)
   in main-dashboard.js. It reads across every gym on the platform
   on purpose — that's what a registry is.
   ============================================================ */
import { SUBSCRIPTION_STATUS, SUBSCRIPTION_STATUS_LABELS, INVOICE_STATUS_LABELS, SUBSCRIPTION_PLANS, AUDIT_ACTION_LABELS, ROUTES } from "../config.js";
import { escapeHtml } from "../utils.js";
import { getGymRegistry, getGymDetail } from "../services/admin-registry-service.js";
import {
  applyRequestedPlanUpgrade, reactivateSubscription, activateGymManually,
  suspendGymManually, disableGymManually, extendTrial, changeSubscriptionPlanDirect,
  changeBillingDate, setSubscriptionStatusManually
} from "../services/subscription-service.js";
import { deleteGymForDeveloper, restoreGymForDeveloper } from "../services/tenant-service.js";
import { resetPasswordPlaceholder, getCurrentUser } from "../services/auth-service.js";
import { getAuditLogForGym } from "../services/audit-log-service.js";
import { showToast } from "./toast-ui.js";

/** Every Developer action in this file is attributed to the signed-in
 *  Developer's email — the audit log's `performedBy` field. */
function currentDeveloperEmail(){
  const u = getCurrentUser();
  return u ? u.email : "(unknown developer)";
}

const PHP = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 });
const PAGE_SIZE = 25; // client-side pagination — same "generous cap, no server" posture as CONFIG.MAX_CRM_LEADS_RENDERED

let els = null;
let openGymId = null;
let currentPage = 1; // reset to 1 by resetPageAndRender(), called from every filter/search/sort control

export function initAdminGymRegistryPage(){
  els = {
    search: document.getElementById("adminRegistrySearch"),
    statusFilter: document.getElementById("adminRegistryStatusFilter"),
    planFilter: document.getElementById("adminRegistryPlanFilter"),
    aiFilter: document.getElementById("adminRegistryAiFilter"),
    dateFilter: document.getElementById("adminRegistryDateFilter"),
    sort: document.getElementById("adminRegistrySort"),
    showDeleted: document.getElementById("adminRegistryShowDeleted"),
    count: document.getElementById("adminRegistryCount"),
    list: document.getElementById("adminRegistryList"),
    pager: document.getElementById("adminRegistryPager"),
    modalScrim: document.getElementById("adminGymModalScrim"),
    modalTitle: document.getElementById("adminGymModalTitle"),
    modalBody: document.getElementById("adminGymModalBody"),
    modalClose: document.getElementById("adminGymModalClose")
  };
  if(!els.list) return;

  populateStatusFilter();
  populatePlanFilter();

  els.search.addEventListener("input", resetPageAndRender);
  els.statusFilter.addEventListener("change", resetPageAndRender);
  if(els.planFilter) els.planFilter.addEventListener("change", resetPageAndRender);
  if(els.aiFilter) els.aiFilter.addEventListener("change", resetPageAndRender);
  if(els.dateFilter) els.dateFilter.addEventListener("change", resetPageAndRender);
  els.sort.addEventListener("change", resetPageAndRender);
  if(els.showDeleted) els.showDeleted.addEventListener("change", resetPageAndRender);
  els.modalClose.addEventListener("click", closeModal);
  els.modalScrim.addEventListener("click", e => { if(e.target === els.modalScrim) closeModal(); });

  renderTable();
}

export function refreshAdminGymRegistryPage(){
  if(!els || !els.list) return;
  renderTable();
  if(openGymId) renderModal(openGymId);
}

/** Called from the Overview page's "recently registered" list — jumps
 *  to the Gym Registry page and opens that gym's detail modal. */
export function goToRegistryGym(gymId){
  window.location.hash = "gym-registry";
  currentPage = 1;
  renderTable();
  openModal(gymId);
}

function populateStatusFilter(){
  const options = [`<option value="">All statuses</option>`]
    .concat(Object.values(SUBSCRIPTION_STATUS).map(s =>
      `<option value="${s}">${escapeHtml(SUBSCRIPTION_STATUS_LABELS[s] || s)}</option>`
    ));
  els.statusFilter.innerHTML = options.join("");
}

function populatePlanFilter(){
  if(!els.planFilter) return;
  const options = [`<option value="">All plans</option>`]
    .concat(SUBSCRIPTION_PLANS.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`));
  els.planFilter.innerHTML = options.join("");
}

/** Every filter/search/sort control calls this (instead of renderTable
 *  directly) so changing a filter always lands back on page 1 — staying
 *  on, say, page 4 of an unrelated filter would otherwise silently show
 *  an empty page. */
function resetPageAndRender(){
  currentPage = 1;
  renderTable();
}

function getFilteredSortedRows(){
  const query = (els.search.value || "").trim().toLowerCase();
  const statusFilter = els.statusFilter.value;
  const planFilter = els.planFilter ? els.planFilter.value : "";
  const aiFilter = els.aiFilter ? els.aiFilter.value : "";
  const dateFilterDays = els.dateFilter ? Number(els.dateFilter.value || 0) : 0;
  const sort = els.sort.value;

  let rows = getGymRegistry();

  if(!(els.showDeleted && els.showDeleted.checked)){
    rows = rows.filter(r => !r.isDeleted);
  }

  if(query){
    rows = rows.filter(r =>
      r.gymName.toLowerCase().includes(query) ||
      r.ownerEmail.toLowerCase().includes(query) ||
      r.gymId.toLowerCase().includes(query)
    );
  }
  if(statusFilter){
    rows = rows.filter(r => r.status === statusFilter);
  }
  if(planFilter){
    rows = rows.filter(r => r.planId === planFilter);
  }
  if(aiFilter){
    rows = rows.filter(r => aiFilter === "on" ? r.aiEnabled : !r.aiEnabled);
  }
  if(dateFilterDays > 0){
    const cutoff = Date.now() - dateFilterDays * 24 * 60 * 60 * 1000;
    rows = rows.filter(r => new Date(r.createdAt).getTime() >= cutoff);
  }

  switch(sort){
    case "oldest":
      rows.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      break;
    case "name":
      rows.sort((a, b) => a.gymName.localeCompare(b.gymName));
      break;
    case "leads":
      rows.sort((a, b) => b.leadsCount - a.leadsCount);
      break;
    case "newest":
    default:
      rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  return rows;
}

function renderTable(){
  const allRows = getFilteredSortedRows();
  els.count.textContent = `${allRows.length} gym${allRows.length === 1 ? "" : "s"}`;

  if(allRows.length === 0){
    els.list.innerHTML = `<div class="empty-state">No gyms match your search/filter.</div>`;
    if(els.pager) els.pager.innerHTML = "";
    return;
  }

  const pageCount = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  if(currentPage > pageCount) currentPage = pageCount;
  const rows = allRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  els.list.innerHTML = `
    <table class="owner-table owner-leads-table">
      <thead>
        <tr>
          <th>Gym</th><th>Owner</th><th>Plan</th><th>Status</th><th>Trial</th><th>Next billing</th><th>Last login</th><th>AI</th><th>Leads</th><th>Invoice</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr${r.isDeleted ? ' style="opacity:0.6;"' : ""}>
            <td data-label="Gym"><strong>${escapeHtml(r.gymName)}</strong>${r.isDeleted ? ` <span class="owner-sub-status-badge sub-status-danger">Deleted</span>` : ""}<div class="owner-activity-meta"><code>${escapeHtml(r.gymId)}</code></div></td>
            <td data-label="Owner">${escapeHtml(r.ownerEmail)}</td>
            <td data-label="Plan">${escapeHtml(r.planName)}${r.requestedPlanId ? ` <span class="owner-sub-status-badge sub-status-info">→ ${escapeHtml(r.requestedPlanName)} requested</span>` : ""}</td>
            <td data-label="Status"><span class="owner-sub-status-badge ${statusBadgeClass(r.status)}">${escapeHtml(SUBSCRIPTION_STATUS_LABELS[r.status] || r.status)}</span></td>
            <td data-label="Trial">${r.trialDaysRemaining > 0 ? `${r.trialDaysRemaining}d` : "—"}</td>
            <td data-label="Next billing">${r.nextBillingDate ? escapeHtml(new Date(r.nextBillingDate).toLocaleDateString()) : "—"}</td>
            <td data-label="Last login">${r.ownerLastLogin ? escapeHtml(new Date(r.ownerLastLogin).toLocaleDateString()) : "Never"}</td>
            <td data-label="AI"><span class="owner-sub-status-badge ${r.aiEnabled ? "sub-status-ok" : "sub-status-danger"}">${r.aiEnabled ? "On" : "Off"}</span></td>
            <td data-label="Leads">${r.leadsCount}</td>
            <td data-label="Invoice">${r.latestInvoiceStatus ? escapeHtml(INVOICE_STATUS_LABELS[r.latestInvoiceStatus] || r.latestInvoiceStatus) : "—"}</td>
            <td data-label=""><button type="button" class="btn btn-ghost btn-sm admin-view-gym-btn" data-gym-id="${escapeHtml(r.gymId)}">View</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  els.list.querySelectorAll(".admin-view-gym-btn").forEach(btn => {
    btn.addEventListener("click", () => openModal(btn.dataset.gymId));
  });

  renderPager(pageCount, allRows.length);
}

function renderPager(pageCount, totalRows){
  if(!els.pager) return;
  if(pageCount <= 1){
    els.pager.innerHTML = "";
    return;
  }
  els.pager.innerHTML = `
    <button type="button" class="btn btn-ghost btn-sm" id="adminRegistryPrevPage" ${currentPage <= 1 ? "disabled" : ""}>← Prev</button>
    <span class="help-text">Page ${currentPage} of ${pageCount} (${totalRows} gyms)</span>
    <button type="button" class="btn btn-ghost btn-sm" id="adminRegistryNextPage" ${currentPage >= pageCount ? "disabled" : ""}>Next →</button>
  `;
  const prevBtn = document.getElementById("adminRegistryPrevPage");
  const nextBtn = document.getElementById("adminRegistryNextPage");
  if(prevBtn) prevBtn.addEventListener("click", () => { currentPage--; renderTable(); });
  if(nextBtn) nextBtn.addEventListener("click", () => { currentPage++; renderTable(); });
}

function openModal(gymId){
  openGymId = gymId;
  renderModal(gymId);
  els.modalScrim.hidden = false;
}

function closeModal(){
  openGymId = null;
  els.modalScrim.hidden = true;
}

function renderModal(gymId){
  const detail = getGymDetail(gymId);
  if(!detail){
    closeModal();
    return;
  }

  els.modalTitle.textContent = detail.gymName + (detail.isDeleted ? " (Deleted)" : "");

  const status = detail.subscription.status;
  const canReactivate = [SUBSCRIPTION_STATUS.SUSPENDED, SUBSCRIPTION_STATUS.DISABLED].includes(status);
  const canApplyUpgrade = !!detail.subscription.requestedPlanId;
  const gymAuditLog = getAuditLogForGym(gymId);

  els.modalBody.innerHTML = `
    <div class="owner-lead-detail-grid">
      <div>
        <span class="owner-lead-detail-label">Owner</span>
        <span>${escapeHtml(detail.owner ? detail.owner.email : "(no owner account)")}</span>
      </div>
      <div>
        <span class="owner-lead-detail-label">Gym ID</span>
        <span><code>${escapeHtml(detail.gym.id)}</code></span>
      </div>
      <div>
        <span class="owner-lead-detail-label">Joined</span>
        <span>${escapeHtml(new Date(detail.gym.createdAt).toLocaleDateString())}</span>
      </div>
      <div>
        <span class="owner-lead-detail-label">Last login</span>
        <span>${detail.owner && detail.owner.lastLoginAt ? escapeHtml(new Date(detail.owner.lastLoginAt).toLocaleString()) : "Never"}</span>
      </div>
      <div>
        <span class="owner-lead-detail-label">Leads captured</span>
        <span>${detail.leadsCount}</span>
      </div>
      <div>
        <span class="owner-lead-detail-label">AI receptionist</span>
        <span class="owner-sub-status-badge ${detail.access.aiEnabled ? "sub-status-ok" : "sub-status-danger"}">${detail.access.aiEnabled ? "Enabled" : "Disabled"}</span>
      </div>
    </div>

    ${detail.isDeleted ? `<div class="owner-lead-detail-section"><p class="owner-lead-detail-text" style="color:var(--red);">This account is deleted — the owner can't log in, but no data was removed. Restore it to bring it back.</p></div>` : ""}

    <div class="owner-lead-detail-section">
      <span class="owner-lead-detail-label">Subscription</span>
      <dl class="owner-sub-detail-list" style="margin-top:8px;">
        <div><dt>Plan</dt><dd>${escapeHtml(detail.plan.name)}${detail.requestedPlan ? ` <span class="owner-sub-status-badge sub-status-info">→ ${escapeHtml(detail.requestedPlan.name)} requested</span>` : ""}</dd></div>
        <div><dt>Status</dt><dd><span class="owner-sub-status-badge ${statusBadgeClass(status)}">${escapeHtml(SUBSCRIPTION_STATUS_LABELS[status] || status)}</span></dd></div>
        <div><dt>Payment</dt><dd>${escapeHtml(detail.paymentStatusLabel)}</dd></div>
        <div><dt>Next billing date</dt><dd>${detail.subscription.nextBillingDate ? escapeHtml(new Date(detail.subscription.nextBillingDate).toLocaleDateString()) : "—"}</dd></div>
        ${detail.trialDaysRemaining > 0 ? `<div><dt>Trial days left</dt><dd>${detail.trialDaysRemaining}</dd></div>` : ""}
        ${detail.amountDue > 0 ? `<div><dt>Amount due</dt><dd>₱${PHP.format(detail.amountDue)}</dd></div>` : ""}
      </dl>
    </div>

    <div class="owner-lead-detail-section admin-gym-actions">
      <span class="owner-lead-detail-label">Master Admin actions</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
        ${canApplyUpgrade ? `<button type="button" class="btn btn-primary btn-sm" id="adminApplyUpgradeBtn">Apply upgrade to ${escapeHtml(detail.requestedPlan.name)}</button>` : ""}
        ${canReactivate ? `<button type="button" class="btn btn-primary btn-sm" id="adminReactivateBtn">Reactivate account</button>` : ""}
        <button type="button" class="btn btn-ghost btn-sm" id="adminActivateBtn" ${status === "active" ? "disabled" : ""}>Activate</button>
        <button type="button" class="btn btn-ghost btn-sm" id="adminSuspendBtn" ${status === "suspended" ? "disabled" : ""}>Suspend</button>
        <button type="button" class="btn btn-ghost btn-sm" id="adminDisableBtn" ${status === "disabled" ? "disabled" : ""}>Disable</button>
        ${detail.isDeleted
          ? `<button type="button" class="btn btn-ghost btn-sm" id="adminRestoreBtn">Restore account</button>`
          : `<button type="button" class="btn btn-ghost btn-sm" id="adminDeleteBtn" style="color:var(--red);">Delete account</button>`}
        <button type="button" class="btn btn-ghost btn-sm" id="adminResetPasswordBtn">Reset owner password (placeholder)</button>
        <button type="button" class="btn btn-ghost btn-sm" id="adminPreviewOwnerBtn" ${detail.isDeleted ? "disabled" : ""}>Preview as Gym Owner ↗</button>
      </div>

      <div class="admin-gym-actions-forms" style="display:flex;flex-direction:column;gap:10px;margin-top:14px;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <label for="adminExtendTrialInput" class="help-text" style="margin:0;">Extend trial</label>
          <input type="number" id="adminExtendTrialInput" min="1" max="90" value="7" style="width:70px;">
          <span class="help-text">days</span>
          <button type="button" class="btn btn-ghost btn-sm" id="adminExtendTrialBtn">Apply</button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <label for="adminChangePlanSelect" class="help-text" style="margin:0;">Change plan</label>
          <select id="adminChangePlanSelect">
            ${SUBSCRIPTION_PLANS.map(p => `<option value="${p.id}" ${p.id === detail.plan.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
          </select>
          <button type="button" class="btn btn-ghost btn-sm" id="adminChangePlanBtn">Apply</button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <label for="adminChangeBillingDateInput" class="help-text" style="margin:0;">Billing date</label>
          <input type="date" id="adminChangeBillingDateInput" value="${detail.subscription.nextBillingDate ? new Date(detail.subscription.nextBillingDate).toISOString().slice(0,10) : ""}">
          <button type="button" class="btn btn-ghost btn-sm" id="adminChangeBillingDateBtn">Apply</button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <label for="adminChangeStatusSelect" class="help-text" style="margin:0;">Set status manually</label>
          <select id="adminChangeStatusSelect">
            ${Object.values(SUBSCRIPTION_STATUS).map(s => `<option value="${s}" ${s === status ? "selected" : ""}>${escapeHtml(SUBSCRIPTION_STATUS_LABELS[s] || s)}</option>`).join("")}
          </select>
          <button type="button" class="btn btn-ghost btn-sm" id="adminChangeStatusBtn">Apply</button>
        </div>
      </div>
    </div>

    <div class="owner-lead-detail-section">
      <span class="owner-lead-detail-label">Invoices / payment history (${detail.invoices.length})</span>
      ${detail.invoices.length === 0
        ? `<p class="owner-lead-detail-text">No invoices generated yet.</p>`
        : `<table class="owner-table owner-invoice-table" style="margin-top:8px;">
            <thead><tr><th>Plan</th><th>Amount</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              ${detail.invoices.map(inv => `
                <tr>
                  <td data-label="Plan">${escapeHtml(inv.planName)}</td>
                  <td data-label="Amount">₱${PHP.format(inv.amount)}</td>
                  <td data-label="Status"><span class="owner-sub-status-badge ${invoiceBadgeClass(inv.status)}">${escapeHtml(INVOICE_STATUS_LABELS[inv.status] || inv.status)}</span></td>
                  <td data-label="Created">${escapeHtml(new Date(inv.createdAt).toLocaleDateString())}</td>
                </tr>
              `).join("")}
            </tbody>
           </table>`
      }
    </div>

    <div class="owner-lead-detail-section">
      <span class="owner-lead-detail-label">Recent account activity (this gym)</span>
      ${gymAuditLog.length === 0
        ? `<p class="owner-lead-detail-text">No Developer actions recorded yet for this gym.</p>`
        : `<div class="owner-activity-list" style="margin-top:8px;">
            ${gymAuditLog.slice(0, 8).map(e => `
              <div class="owner-activity-row">
                <span class="owner-activity-dot"></span>
                <div style="flex:1;min-width:0;">
                  <strong>${escapeHtml(auditActionLabel(e.action))}</strong>
                  <div class="owner-activity-meta">${escapeHtml(e.performedBy)} · ${escapeHtml(new Date(e.timestamp).toLocaleString())}</div>
                </div>
              </div>
            `).join("")}
           </div>`
      }
    </div>
  `;

  wireAction("adminApplyUpgradeBtn", () => applyRequestedPlanUpgrade(gymId, currentDeveloperEmail()));
  wireAction("adminReactivateBtn", () => reactivateSubscription(gymId, currentDeveloperEmail()));
  wireAction("adminActivateBtn", () => activateGymManually(gymId, currentDeveloperEmail()));
  wireAction("adminSuspendBtn", () => {
    if(!window.confirm(`Suspend ${detail.gymName}? Their AI receptionist will go offline and their dashboard becomes read-only immediately.`)) return null;
    return suspendGymManually(gymId, currentDeveloperEmail());
  });
  wireAction("adminDisableBtn", () => {
    if(!window.confirm(`Disable ${detail.gymName}? The owner will be fully locked out until reactivated.`)) return null;
    return disableGymManually(gymId, currentDeveloperEmail());
  });
  wireAction("adminRestoreBtn", () => restoreGymForDeveloper(gymId, currentDeveloperEmail()));
  wireAction("adminDeleteBtn", () => {
    if(!window.confirm(`Delete ${detail.gymName}? The owner won't be able to log in anymore, but all their data (leads, settings, invoices) is kept and this can be restored later.`)) return null;
    return deleteGymForDeveloper(gymId, currentDeveloperEmail());
  });
  wireAction("adminResetPasswordBtn", () => {
    if(!detail.owner) return { ok: false, reason: "No owner account to reset." };
    if(!window.confirm(`Log a password-reset request for ${detail.owner.email}? This is a placeholder — no email is actually sent yet.`)) return null;
    return resetPasswordPlaceholder(detail.owner.id, currentDeveloperEmail());
  });
  // Read/write preview of this gym's own dashboard, in a new tab, without
  // touching this Developer's session here — see main-owner-dashboard.js's
  // `devview` handling and owner-shell-ui.js's demo banner.
  const previewBtn = document.getElementById("adminPreviewOwnerBtn");
  if(previewBtn) previewBtn.addEventListener("click", () => {
    window.open(`${ROUTES.DASHBOARD_OWNER}?devview=${encodeURIComponent(gymId)}`, "_blank", "noopener");
  });
  wireAction("adminExtendTrialBtn", () => {
    const days = document.getElementById("adminExtendTrialInput").value;
    return extendTrial(gymId, days, currentDeveloperEmail());
  });
  wireAction("adminChangePlanBtn", () => {
    const planId = document.getElementById("adminChangePlanSelect").value;
    return changeSubscriptionPlanDirect(gymId, planId, currentDeveloperEmail());
  });
  wireAction("adminChangeBillingDateBtn", () => {
    const dateVal = document.getElementById("adminChangeBillingDateInput").value;
    return changeBillingDate(gymId, dateVal, currentDeveloperEmail());
  });
  wireAction("adminChangeStatusBtn", () => {
    const newStatus = document.getElementById("adminChangeStatusSelect").value;
    if(!window.confirm(`Manually set ${detail.gymName}'s subscription status to "${SUBSCRIPTION_STATUS_LABELS[newStatus] || newStatus}"?`)) return null;
    return setSubscriptionStatusManually(gymId, newStatus, currentDeveloperEmail());
  });

  /** Wires a button by id to an action function that returns
   *  {ok, message|reason} — or null to mean "user canceled the confirm,
   *  do nothing." Re-renders the modal + table on success. */
  function wireAction(btnId, action){
    const btn = document.getElementById(btnId);
    if(!btn) return;
    btn.addEventListener("click", () => {
      const result = action();
      if(result === null) return; // user canceled a confirm()
      showToast(result.ok ? result.message : result.reason);
      if(result.ok){ renderModal(gymId); renderTable(); }
    });
  }
}

function auditActionLabel(action){
  return AUDIT_ACTION_LABELS[action] || action;
}

function statusBadgeClass(status){
  const map = {
    trialing: "sub-status-info",
    active: "sub-status-ok",
    pending_payment: "sub-status-warn",
    grace_period: "sub-status-warn",
    suspended: "sub-status-danger",
    disabled: "sub-status-danger",
    canceled: "sub-status-warn",
    expired: "sub-status-danger"
  };
  return map[status] || "sub-status-info";
}

function invoiceBadgeClass(status){
  const map = { pending: "sub-status-warn", paid: "sub-status-ok", overdue: "sub-status-danger", canceled: "sub-status-warn" };
  return map[status] || "sub-status-info";
}
