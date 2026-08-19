/* ============================================================
   GYMBOT QC — MASTER ADMIN: AUDIT LOG & SECURITY PAGE (Phase 8,
   expanded Phase 13)
   Two tabs sharing one page: the original read-only, searchable
   audit log table (now with an action filter, date range, and
   pagination — same technique as admin-gym-registry-ui.js), and
   a new Security Center tab (see admin-security-panel-ui.js).

   PERMISSION BOUNDARY: only ever mounted from admin-shell-ui.js,
   gated by requireRole(ROLES.DEVELOPER) in main-dashboard.js.
   ============================================================ */
import { AUDIT_ACTIONS, AUDIT_ACTION_LABELS } from "../config.js";
import { escapeHtml } from "../utils.js";
import { getAuditLog } from "../services/audit-log-service.js";
import { getGymById } from "../services/tenant-service.js";
import { renderSecurityPanel } from "./admin-security-panel-ui.js";

const PAGE_SIZE = 25;
let currentPage = 1; // reset to 1 whenever a log filter changes

export function initAdminAuditLogPage(){
  const root = document.getElementById("adminAuditContent");
  if(!root) return;

  wireTabNav();
  renderActiveTab();
}

export function refreshAdminAuditLogPage(){
  renderActiveTab();
}

function currentTab(){
  const raw = document.querySelector(".audit-tab.active");
  return (raw && raw.dataset.auditTab) || "log";
}

function wireTabNav(){
  document.querySelectorAll(".audit-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".audit-tab").forEach(t => t.classList.toggle("active", t === tab));
      currentPage = 1;
      renderActiveTab();
    });
  });
}

function renderActiveTab(){
  const root = document.getElementById("adminAuditContent");
  if(!root) return;
  const tab = currentTab();
  const headingEl = document.getElementById("adminAuditLogHeading");
  if(headingEl) headingEl.textContent = tab === "security" ? "Security Center" : "Developer Audit Log";

  if(tab === "security"){
    renderSecurityPanel(root); // async — fires and updates DOM when ready, nothing here awaits it
    return;
  }
  renderLogTab(root);
}

/* ---------------- Audit Log ---------------- */

function renderLogTab(root){
  root.innerHTML = `
    <div class="owner-panel">
      <div class="owner-leads-toolbar">
        <input type="text" id="adminAuditSearch" class="owner-leads-search" placeholder="Search by gym, action, or performed-by…">
        <select id="adminAuditActionFilter" aria-label="Filter by action">
          <option value="">All actions</option>
          ${Object.values(AUDIT_ACTIONS).map(a => `<option value="${escapeHtml(a)}">${escapeHtml(AUDIT_ACTION_LABELS[a] || a)}</option>`).join("")}
        </select>
        <select id="adminAuditDateFilter" aria-label="Filter by date">
          <option value="">Any date</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
        <span class="owner-leads-count" id="adminAuditCount">0 entries</span>
      </div>
      <div id="adminAuditList"><!-- injected --></div>
      <div class="owner-leads-toolbar" id="adminAuditPager" style="justify-content:center;"><!-- injected --></div>
    </div>
  `;

  document.getElementById("adminAuditSearch").addEventListener("input", resetPageAndRender);
  document.getElementById("adminAuditActionFilter").addEventListener("change", resetPageAndRender);
  document.getElementById("adminAuditDateFilter").addEventListener("change", resetPageAndRender);

  renderList();
}

function resetPageAndRender(){
  currentPage = 1;
  renderList();
}

function gymLabel(gymId){
  if(!gymId) return "—";
  const gym = getGymById(gymId);
  return gym ? gym.name : gymId;
}

function getFilteredEntries(){
  const query = (document.getElementById("adminAuditSearch").value || "").trim().toLowerCase();
  const actionFilter = document.getElementById("adminAuditActionFilter").value;
  const dateDays = Number(document.getElementById("adminAuditDateFilter").value || 0);

  let entries = getAuditLog();

  if(query){
    entries = entries.filter(e =>
      (e.gymId || "").toLowerCase().includes(query) ||
      (e.action || "").toLowerCase().includes(query) ||
      (AUDIT_ACTION_LABELS[e.action] || "").toLowerCase().includes(query) ||
      (e.performedBy || "").toLowerCase().includes(query) ||
      gymLabel(e.gymId).toLowerCase().includes(query)
    );
  }
  if(actionFilter){
    entries = entries.filter(e => e.action === actionFilter);
  }
  if(dateDays > 0){
    const cutoff = Date.now() - dateDays * 24 * 60 * 60 * 1000;
    entries = entries.filter(e => new Date(e.timestamp).getTime() >= cutoff);
  }

  return entries;
}

function renderList(){
  const allEntries = getFilteredEntries();
  document.getElementById("adminAuditCount").textContent = `${allEntries.length} entr${allEntries.length === 1 ? "y" : "ies"}`;

  const listEl = document.getElementById("adminAuditList");
  const pagerEl = document.getElementById("adminAuditPager");

  if(allEntries.length === 0){
    listEl.innerHTML = `<div class="empty-state">No matching audit log entries.</div>`;
    pagerEl.innerHTML = "";
    return;
  }

  const pageCount = Math.max(1, Math.ceil(allEntries.length / PAGE_SIZE));
  if(currentPage > pageCount) currentPage = pageCount;
  const entries = allEntries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  listEl.innerHTML = `
    <table class="owner-table owner-leads-table">
      <thead>
        <tr><th>Action</th><th>Gym</th><th>Previous</th><th>New</th><th>Performed by</th><th>When</th></tr>
      </thead>
      <tbody>
        ${entries.map(e => `
          <tr>
            <td data-label="Action">${escapeHtml(AUDIT_ACTION_LABELS[e.action] || e.action)}${e.note ? `<div class="owner-activity-meta">${escapeHtml(e.note)}</div>` : ""}</td>
            <td data-label="Gym">${escapeHtml(gymLabel(e.gymId))}${e.gymId ? `<div class="owner-activity-meta"><code>${escapeHtml(e.gymId)}</code></div>` : ""}</td>
            <td data-label="Previous">${escapeHtml(formatValue(e.previousValue))}</td>
            <td data-label="New">${escapeHtml(formatValue(e.newValue))}</td>
            <td data-label="Performed by">${escapeHtml(e.performedBy)}</td>
            <td data-label="When">${escapeHtml(new Date(e.timestamp).toLocaleString())}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  renderPager(pageCount, allEntries.length);
}

function renderPager(pageCount, totalEntries){
  const pagerEl = document.getElementById("adminAuditPager");
  if(!pagerEl) return;
  if(pageCount <= 1){
    pagerEl.innerHTML = "";
    return;
  }
  pagerEl.innerHTML = `
    <button type="button" class="btn btn-ghost btn-sm" id="adminAuditPrevPage" ${currentPage <= 1 ? "disabled" : ""}>← Prev</button>
    <span class="help-text">Page ${currentPage} of ${pageCount} (${totalEntries} entries)</span>
    <button type="button" class="btn btn-ghost btn-sm" id="adminAuditNextPage" ${currentPage >= pageCount ? "disabled" : ""}>Next →</button>
  `;
  const prevBtn = document.getElementById("adminAuditPrevPage");
  const nextBtn = document.getElementById("adminAuditNextPage");
  if(prevBtn) prevBtn.addEventListener("click", () => { currentPage--; renderList(); });
  if(nextBtn) nextBtn.addEventListener("click", () => { currentPage++; renderList(); });
}

function formatValue(v){
  if(v === null || v === undefined || v === "") return "—";
  return String(v);
}
