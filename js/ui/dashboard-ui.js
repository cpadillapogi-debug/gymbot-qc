/* ============================================================
   GYMBOT QC — DASHBOARD UI
   Subscribes to AppState and re-renders whenever `leads`
   changes, instead of being called manually from every place
   a lead gets saved.
   ============================================================ */
import { CONFIG, DEMO_GYM_ID } from "../config.js";
import { escapeHtml } from "../utils.js";
import { appState } from "../state.js";
import { getLeads, clearLeads } from "../services/leads-service.js";
import { computeStats } from "../services/dashboard-service.js";
import { leadsToCsv, downloadCsv, todaysCsvFilename } from "../services/csv-service.js";
import { showToast } from "./toast-ui.js";

let els = null;

function cacheEls(){
  els = {
    statLeads: document.getElementById("statLeads"),
    statTrials: document.getElementById("statTrials"),
    statRevenue: document.getElementById("statRevenue"),
    statHours: document.getElementById("statHours"),
    leadList: document.getElementById("leadList"),
    clearLeadsBtn: document.getElementById("clearLeadsBtn"),
    exportCsvBtn: document.getElementById("exportCsvBtn")
  };
}

export function renderDashboard(){
  const leads = appState.get("leads");
  const stats = computeStats(leads);

  els.statLeads.textContent = String(stats.leadsToday);
  els.statTrials.textContent = String(stats.trialsToday);
  els.statRevenue.textContent = "₱" + stats.revenue.toLocaleString("en-PH");
  els.statHours.textContent = stats.hoursSaved + "h";

  els.leadList.innerHTML = "";
  if(leads.length === 0){
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.id = "leadEmpty";
    empty.textContent = "No leads yet — chat with the bot on the left, or run the demo.";
    els.leadList.appendChild(empty);
    return;
  }

  leads.slice(0, CONFIG.MAX_LEADS_RENDERED).forEach(lead => {
    const row = document.createElement("div");
    row.className = "lead-row";
    const safeName = escapeHtml(lead.name || "Unknown");
    const safePhone = escapeHtml(lead.phone || "—");
    const safeTime = escapeHtml(lead.preferredTime || "—");
    const safeGoal = escapeHtml(lead.goal || "—");
    row.innerHTML = `<div class="lead-name">${safeName}</div>` +
                     `<div class="lead-meta">${safePhone} · ${safeTime} · ${safeGoal}</div>`;
    els.leadList.appendChild(row);
  });
}

export async function initDashboardUI(){
  cacheEls();

  // Seed state from storage, then re-render any time it changes.
  appState.set({ leads: await getLeads(DEMO_GYM_ID) });
  appState.subscribe(state => {
    // Cheap enough to always re-render; this app has no perf
    // pressure that would justify a diffing layer.
    renderDashboard();
  });

  els.clearLeadsBtn.addEventListener("click", async () => {
    if(!window.confirm("Clear all saved leads on this device? This can't be undone.")) return;
    await clearLeads(DEMO_GYM_ID);
    appState.set({ leads: await getLeads(DEMO_GYM_ID) });
    showToast("Leads cleared.");
  });

  els.exportCsvBtn.addEventListener("click", () => {
    const leads = appState.get("leads");
    if(leads.length === 0){
      showToast("No leads to export yet.");
      return;
    }
    const ok = downloadCsv(leadsToCsv(leads), todaysCsvFilename());
    if(!ok) showToast("Export failed — please try again.");
  });

  renderDashboard();
}
