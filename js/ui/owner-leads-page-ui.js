/* ============================================================
   GYMBOT QC — OWNER: LEADS PAGE (Phase 5 Lead CRM)
   Full CRM view over one gym's leads: pipeline stats, search /
   filter / sort, a lead detail panel (notes, status, history),
   delete, and export (All / Filtered / Date range × CSV / JSON).

   Rebuilt from the Phase 3 read-only placeholder — see
   docs/PHASE3_NOTES.md and docs/PHASE5_NOTES.md for the history.
   Data layer is leads-service.js (CRUD + dedup) and
   leads-metrics-service.js (stat cards); this module is
   rendering + wiring only.
   ============================================================ */
import { CONFIG, LEAD_STATUSES } from "../config.js";
import { escapeHtml } from "../utils.js";
import {
  getLeads, getLeadById, updateLeadStatus, updateLeadNotes,
  deleteLead, clearLeads
} from "../services/leads-service.js";
import { getLeadCrmMetrics } from "../services/leads-metrics-service.js";
import {
  leadsToCsv, leadsToJson, downloadCsv, downloadJson,
  todaysCsvFilename, todaysJsonFilename, filterLeadsByDateRange
} from "../services/csv-service.js";
import { showToast } from "./toast-ui.js";

const METRIC_DEFS = [
  { key: "totalLeads", label: "Total leads" },
  { key: "newLeadsToday", label: "New leads today" },
  { key: "trialBookings", label: "Trial bookings" },
  { key: "convertedMembers", label: "Converted members" },
  { key: "conversionRate", label: "Conversion rate", format: "percent" },
  { key: "estimatedRevenue", label: "Est. revenue", format: "currency" }
];

const STATUS_CLASS = {
  "New": "lead-status-new",
  "Contacted": "lead-status-contacted",
  "Scheduled": "lead-status-scheduled",
  "Trial Completed": "lead-status-trial-completed",
  "Converted": "lead-status-converted",
  "Lost": "lead-status-lost"
};

let els = null;
let currentGymId = null;
let selectedLeadId = null;
let filters = { search: "", status: "", sort: "newest" };
let exportScope = "all"; // "all" | "filtered" | "range"

function cacheEls(){
  els = {
    metricGrid: document.getElementById("ownerLeadsMetricGrid"),
    search: document.getElementById("ownerLeadsSearch"),
    statusFilter: document.getElementById("ownerLeadsStatusFilter"),
    sort: document.getElementById("ownerLeadsSort"),
    count: document.getElementById("ownerLeadsCount"),
    list: document.getElementById("ownerLeadsList"),
    exportBtn: document.getElementById("ownerLeadsExportBtn"),
    exportPanel: document.getElementById("ownerExportPanel"),
    clearBtn: document.getElementById("ownerLeadsClearBtn"),
    modalScrim: document.getElementById("ownerLeadModalScrim"),
    modalTitle: document.getElementById("ownerLeadModalTitle"),
    modalClose: document.getElementById("ownerLeadModalClose"),
    modalBody: document.getElementById("ownerLeadModalBody")
  };
}

/** @param {string} gymId */
export function initOwnerLeadsPage(gymId){
  cacheEls();
  currentGymId = gymId;

  els.statusFilter.innerHTML = `<option value="">All statuses</option>` +
    LEAD_STATUSES.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");

  els.search.addEventListener("input", () => { filters.search = els.search.value; renderList(); });
  els.statusFilter.addEventListener("change", () => { filters.status = els.statusFilter.value; renderList(); });
  els.sort.addEventListener("change", () => { filters.sort = els.sort.value; renderList(); });

  els.exportBtn.addEventListener("click", () => {
    els.exportPanel.hidden = !els.exportPanel.hidden;
  });
  wireExportPanel();

  els.clearBtn.addEventListener("click", async () => {
    if(!window.confirm("Delete every lead for this gym? This can't be undone.")) return;
    try{
      await clearLeads(currentGymId);
      await refreshOwnerLeadsPage();
      showToast("Leads cleared.");
    }catch(err){
      showToast(err.message || "Couldn't clear leads.");
    }
  });

  els.modalClose.addEventListener("click", closeLeadModal);
  els.modalScrim.addEventListener("click", e => { if(e.target === els.modalScrim) closeLeadModal(); });

  refreshOwnerLeadsPage();
}

export async function refreshOwnerLeadsPage(){
  if(!els) cacheEls();
  await renderMetrics();
  await renderList();
  if(selectedLeadId) renderModalBody(await getLeadById(currentGymId, selectedLeadId));
}

/* ---------- Stat cards ---------- */

function formatMetric(value, format){
  if(format === "currency") return "₱" + Math.round(value).toLocaleString("en-PH");
  if(format === "percent") return Math.round(value * 100) + "%";
  return String(value);
}

async function renderMetrics(){
  const metrics = getLeadCrmMetrics(await getLeads(currentGymId));
  els.metricGrid.innerHTML = METRIC_DEFS.map(def => `
    <div class="owner-metric-card">
      <div class="owner-metric-num">${escapeHtml(formatMetric(metrics[def.key], def.format))}</div>
      <div class="owner-metric-label">${escapeHtml(def.label)}</div>
    </div>
  `).join("");
}

/* ---------- Filter / sort / search ---------- */

async function getFilteredSortedLeads(){
  const searchTerm = filters.search.trim().toLowerCase();
  let leads = (await getLeads(currentGymId)).filter(l => {
    if(filters.status && l.status !== filters.status) return false;
    if(!searchTerm) return true;
    const haystack = `${l.name || ""} ${l.phone || ""}`.toLowerCase();
    return haystack.includes(searchTerm);
  });

  if(filters.sort === "oldest"){
    leads = leads.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }else if(filters.sort === "status"){
    leads = leads.slice().sort((a, b) => LEAD_STATUSES.indexOf(a.status) - LEAD_STATUSES.indexOf(b.status));
  }else{
    leads = leads.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  return leads;
}

/* ---------- Table ---------- */

async function renderList(){
  const leads = await getFilteredSortedLeads();
  const total = (await getLeads(currentGymId)).length;
  els.count.textContent = filters.search || filters.status
    ? `${leads.length} of ${total} lead${total === 1 ? "" : "s"}`
    : `${total} lead${total === 1 ? "" : "s"}`;

  if(total === 0){
    els.list.innerHTML = `<div class="empty-state">No leads yet — once your AI Receptionist captures a name and phone number, it shows up here.</div>`;
    return;
  }
  if(leads.length === 0){
    els.list.innerHTML = `<div class="empty-state">No leads match your search/filter.</div>`;
    return;
  }

  els.list.innerHTML = `
    <table class="owner-table owner-leads-table">
      <thead>
        <tr>
          <th>Name</th><th>Phone</th><th>Goal</th><th>Preferred time</th>
          <th>Source</th><th>Status</th><th>Captured</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${leads.slice(0, CONFIG.MAX_CRM_LEADS_RENDERED).map(rowHtml).join("")}
      </tbody>
    </table>
  `;

  els.list.querySelectorAll("[data-view-lead]").forEach(btn => {
    btn.addEventListener("click", () => openLeadModal(btn.getAttribute("data-view-lead")));
  });
  els.list.querySelectorAll("[data-status-select]").forEach(select => {
    select.addEventListener("change", async () => {
      const result = await updateLeadStatus(currentGymId, select.getAttribute("data-status-select"), select.value);
      if(result.ok){
        showToast(`Status updated to "${select.value}".`);
        await refreshOwnerLeadsPage();
      }else{
        showToast(result.reason || "Couldn't update status.");
      }
    });
  });
}

function rowHtml(lead){
  const statusClass = STATUS_CLASS[lead.status] || "lead-status-new";
  return `
    <tr data-label-row>
      <td data-label="Name"><button type="button" class="owner-link-btn" data-view-lead="${escapeHtml(lead.id)}">${escapeHtml(lead.name || "Unknown")}</button></td>
      <td data-label="Phone">${escapeHtml(lead.phone || "—")}</td>
      <td data-label="Goal">${escapeHtml(lead.goal || "—")}</td>
      <td data-label="Preferred time">${escapeHtml(lead.preferredTime || "—")}</td>
      <td data-label="Source">${escapeHtml(lead.source || "—")}</td>
      <td data-label="Status">
        <select class="owner-status-select ${statusClass}" data-status-select="${escapeHtml(lead.id)}" aria-label="Status for ${escapeHtml(lead.name || "lead")}">
          ${LEAD_STATUSES.map(s => `<option value="${escapeHtml(s)}" ${s === lead.status ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
        </select>
      </td>
      <td data-label="Captured">${escapeHtml(new Date(lead.createdAt).toLocaleDateString())}</td>
      <td data-label=""><button type="button" class="btn btn-ghost btn-sm" data-view-lead="${escapeHtml(lead.id)}">View</button></td>
    </tr>
  `;
}

/* ---------- Lead detail modal ---------- */

async function openLeadModal(leadId){
  const lead = await getLeadById(currentGymId, leadId);
  if(!lead) return;
  selectedLeadId = leadId;
  els.modalTitle.textContent = lead.name || "Lead details";
  renderModalBody(lead);
  els.modalScrim.hidden = false;
}

function closeLeadModal(){
  selectedLeadId = null;
  els.modalScrim.hidden = true;
}

function formatDateTime(iso){
  if(!iso) return "—";
  try{ return new Date(iso).toLocaleString(); }catch(err){ return "—"; }
}

function renderModalBody(lead){
  if(!lead){ closeLeadModal(); return; }
  const statusClass = STATUS_CLASS[lead.status] || "lead-status-new";

  els.modalBody.innerHTML = `
    <div class="owner-lead-detail-grid">
      <div><span class="owner-lead-detail-label">Phone</span><div>${escapeHtml(lead.phone || "—")}</div></div>
      <div><span class="owner-lead-detail-label">Email</span><div>${escapeHtml(lead.email || "—")}</div></div>
      <div><span class="owner-lead-detail-label">Fitness goal</span><div>${escapeHtml(lead.goal || "—")}</div></div>
      <div><span class="owner-lead-detail-label">Preferred visit time</span><div>${escapeHtml(lead.preferredTime || "—")}</div></div>
      <div><span class="owner-lead-detail-label">Source</span><div>${escapeHtml(lead.source || "—")}</div></div>
      <div><span class="owner-lead-detail-label">Last activity</span><div>${escapeHtml(formatDateTime(lead.lastActivityAt))}</div></div>
    </div>

    <div class="owner-lead-detail-section">
      <span class="owner-lead-detail-label">Conversation summary</span>
      <p class="owner-lead-detail-text">${escapeHtml(lead.conversationSummary || "No conversation summary captured for this lead yet.")}</p>
    </div>

    <div class="owner-lead-detail-section">
      <label for="leadStatusSelect" class="owner-lead-detail-label">Status</label>
      <select id="leadStatusSelect" class="owner-status-select ${statusClass}">
        ${LEAD_STATUSES.map(s => `<option value="${escapeHtml(s)}" ${s === lead.status ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
      </select>
    </div>

    <div class="owner-lead-detail-section">
      <label for="leadNotesInput" class="owner-lead-detail-label">Notes</label>
      <textarea id="leadNotesInput" maxlength="${CONFIG.LEAD_NOTES_MAX_LEN}" placeholder="Anything staff should know about this lead...">${escapeHtml(lead.notes || "")}</textarea>
      <button type="button" class="btn btn-ghost btn-sm" id="leadNotesSaveBtn" style="margin-top:8px;">Save notes</button>
    </div>

    <div class="owner-lead-detail-section">
      <span class="owner-lead-detail-label">Status history</span>
      <ul class="owner-status-history">
        ${(lead.statusHistory || []).slice().reverse().map(h => `<li>${escapeHtml(h.status)} — ${escapeHtml(formatDateTime(h.at))}</li>`).join("")}
      </ul>
    </div>

    <div class="owner-lead-detail-footer">
      <span class="help-text" style="margin:0;">Created ${escapeHtml(formatDateTime(lead.createdAt))} · Updated ${escapeHtml(formatDateTime(lead.updatedAt))}</span>
      <button type="button" class="btn btn-danger-outline btn-sm" id="leadDeleteBtn">Delete lead</button>
    </div>
  `;

  document.getElementById("leadStatusSelect").addEventListener("change", async e => {
    const result = await updateLeadStatus(currentGymId, lead.id, e.target.value);
    if(result.ok){
      showToast(`Status updated to "${e.target.value}".`);
      await refreshOwnerLeadsPage();
    }else{
      showToast(result.reason || "Couldn't update status.");
    }
  });

  document.getElementById("leadNotesSaveBtn").addEventListener("click", async () => {
    const notes = document.getElementById("leadNotesInput").value;
    const result = await updateLeadNotes(currentGymId, lead.id, notes);
    if(result.ok){
      showToast("Notes saved.");
      await refreshOwnerLeadsPage();
    }else{
      showToast(result.reason || "Couldn't save notes.");
    }
  });

  document.getElementById("leadDeleteBtn").addEventListener("click", async () => {
    if(!window.confirm(`Delete ${lead.name || "this lead"}? This can't be undone.`)) return;
    await deleteLead(currentGymId, lead.id);
    closeLeadModal();
    await refreshOwnerLeadsPage();
    showToast("Lead deleted.");
  });
}

/* ---------- Export panel ---------- */

function wireExportPanel(){
  els.exportPanel.innerHTML = `
    <div class="owner-export-row">
      <label><input type="radio" name="exportScope" value="all" checked> All leads</label>
      <label><input type="radio" name="exportScope" value="filtered"> Currently filtered/searched leads</label>
      <label><input type="radio" name="exportScope" value="range"> Date range</label>
    </div>
    <div class="owner-export-row owner-export-range" id="ownerExportRangeRow" hidden>
      <label>From <input type="date" id="ownerExportFrom"></label>
      <label>To <input type="date" id="ownerExportTo"></label>
    </div>
    <div class="owner-export-row">
      <button type="button" class="btn btn-primary btn-sm" id="ownerExportCsvBtn">Download CSV</button>
      <button type="button" class="btn btn-ghost btn-sm" id="ownerExportJsonBtn">Download JSON</button>
    </div>
  `;

  els.exportPanel.querySelectorAll('input[name="exportScope"]').forEach(radio => {
    radio.addEventListener("change", () => {
      exportScope = radio.value;
      document.getElementById("ownerExportRangeRow").hidden = exportScope !== "range";
    });
  });

  document.getElementById("ownerExportCsvBtn").addEventListener("click", () => runExport("csv"));
  document.getElementById("ownerExportJsonBtn").addEventListener("click", () => runExport("json"));
}

async function getExportLeads(){
  if(exportScope === "filtered") return getFilteredSortedLeads();
  if(exportScope === "range"){
    const from = document.getElementById("ownerExportFrom").value;
    const to = document.getElementById("ownerExportTo").value;
    return filterLeadsByDateRange(await getLeads(currentGymId), from, to);
  }
  return getLeads(currentGymId);
}

async function runExport(format){
  const leads = await getExportLeads();
  if(leads.length === 0){
    showToast("No leads to export for that selection.");
    return;
  }
  const ok = format === "csv"
    ? downloadCsv(leadsToCsv(leads), todaysCsvFilename())
    : downloadJson(leadsToJson(leads), todaysJsonFilename());
  if(!ok) showToast("Export failed — please try again.");
}
