/* ============================================================
   GYMBOT QC — OWNER: DASHBOARD PAGE (Phase 3)
   Summary cards + recent activity. Real numbers where they
   exist (leads/trials/revenue), clearly-labeled demo numbers
   where they don't yet (see owner-dashboard-metrics-service.js).
   ============================================================ */
import { escapeHtml } from "../utils.js";
import { getLeads } from "../services/leads-service.js";
import { getOwnerDashboardMetrics } from "../services/owner-dashboard-metrics-service.js";

let els = null;
let currentGymId = null;

function cacheEls(){
  els = {
    heading: document.getElementById("ownerWelcomeHeading"),
    gymNameSpan: document.getElementById("ownerWelcomeGymName"),
    metricGrid: document.getElementById("ownerMetricGrid"),
    activityList: document.getElementById("ownerRecentActivity")
  };
}

const CARD_DEFS = [
  { key: "inquiriesToday", label: "Today's inquiries" },
  { key: "trialsToday", label: "Trial bookings" },
  { key: "membershipInquiriesToday", label: "Membership inquiries", demo: true },
  { key: "newLeadsToday", label: "New leads" },
  { key: "convertedMembersThisMonth", label: "Converted members", demo: true },
  { key: "estimatedMonthlyRevenue", label: "Est. monthly revenue", format: "currency" },
  { key: "aiResponseRate", label: "AI response rate", format: "percent", demo: true },
  { key: "avgResponseTimeSeconds", label: "Avg. response time", format: "seconds", demo: true }
];

function formatValue(value, format){
  if(format === "currency") return "₱" + Math.round(value).toLocaleString("en-PH");
  if(format === "percent") return Math.round(value * 100) + "%";
  if(format === "seconds") return value + "s";
  return String(value);
}

/** Called once when the shell first sets up the page. */
export function initOwnerDashboardPage(gym){
  cacheEls();
  currentGymId = gym ? gym.id : null;
  const name = gym ? gym.name : "your gym";
  els.gymNameSpan.textContent = name;
  els.heading.textContent = `Welcome back${gym ? ", " + gym.name : ""}`;
  refreshOwnerDashboardPage();
}

/** Called every time the Dashboard nav item is opened, to reflect the latest leads. */
export function refreshOwnerDashboardPage(){
  if(!els) cacheEls();
  const leads = getLeads(currentGymId);
  const metrics = getOwnerDashboardMetrics(leads);

  els.metricGrid.innerHTML = CARD_DEFS.map(def => `
    <div class="owner-metric-card">
      <div class="owner-metric-num">${escapeHtml(formatValue(metrics[def.key], def.format))}</div>
      <div class="owner-metric-label">${escapeHtml(def.label)}${def.demo ? ' <span class="demo-tag">demo</span>' : ""}</div>
    </div>
  `).join("");

  renderActivity(leads);
}

function renderActivity(leads){
  if(leads.length === 0){
    els.activityList.innerHTML = `<div class="empty-state">No activity yet — once your AI Receptionist starts chatting with customers, bookings show up here.</div>`;
    return;
  }
  els.activityList.innerHTML = leads.slice(0, 6).map(lead => {
    const name = escapeHtml(lead.name || "Unknown");
    const when = escapeHtml(formatRelativeTime(lead.createdAt));
    const detail = escapeHtml([lead.preferredTime, lead.goal].filter(Boolean).join(" · ") || "Free trial booked");
    return `
      <div class="owner-activity-row">
        <div class="owner-activity-dot" aria-hidden="true"></div>
        <div class="owner-activity-body">
          <div class="owner-activity-title">${name} booked a free trial</div>
          <div class="owner-activity-meta">${detail} · ${when}</div>
        </div>
      </div>`;
  }).join("");
}

function formatRelativeTime(isoString){
  try{
    const then = new Date(isoString).getTime();
    const diffMs = Date.now() - then;
    const mins = Math.round(diffMs / 60000);
    if(mins < 1) return "just now";
    if(mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if(hours < 24) return `${hours}h ago`;
    return new Date(isoString).toLocaleDateString();
  }catch(err){
    return "";
  }
}
