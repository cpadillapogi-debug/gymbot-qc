/* ============================================================
   GYMBOT QC — MASTER ADMIN: AUDIT LOG PAGE (Phase 8)
   Read-only, searchable list of every entry audit-log-service.js
   has recorded. Simple client-side filter, same technique as
   admin-gym-registry-ui.js's table.

   PERMISSION BOUNDARY: only ever mounted from admin-shell-ui.js,
   gated by requireRole(ROLES.DEVELOPER) in main-dashboard.js.
   ============================================================ */
import { AUDIT_ACTION_LABELS } from "../config.js";
import { escapeHtml } from "../utils.js";
import { getAuditLog } from "../services/audit-log-service.js";
import { getGymById } from "../services/tenant-service.js";

let els = null;

export function initAdminAuditLogPage(){
  els = {
    search: document.getElementById("adminAuditSearch"),
    count: document.getElementById("adminAuditCount"),
    list: document.getElementById("adminAuditList")
  };
  if(!els.list) return;

  els.search.addEventListener("input", renderList);
  renderList();
}

export function refreshAdminAuditLogPage(){
  if(!els || !els.list) return;
  renderList();
}

function gymLabel(gymId){
  if(!gymId) return "—";
  const gym = getGymById(gymId);
  return gym ? gym.name : gymId;
}

function renderList(){
  const query = (els.search.value || "").trim().toLowerCase();
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

  els.count.textContent = `${entries.length} entr${entries.length === 1 ? "y" : "ies"}`;

  if(entries.length === 0){
    els.list.innerHTML = `<div class="empty-state">No matching audit log entries.</div>`;
    return;
  }

  els.list.innerHTML = `
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
}

function formatValue(v){
  if(v === null || v === undefined || v === "") return "—";
  return String(v);
}
