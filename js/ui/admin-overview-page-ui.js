/* ============================================================
   GYMBOT QC — MASTER ADMIN: OVERVIEW PAGE (Phase 7)
   Platform-wide stat cards + a status breakdown + a shortcut list
   of the most recently registered gyms. Rendering + wiring only —
   all real data comes from admin-registry-service.js.
   ============================================================ */
import { SUBSCRIPTION_STATUS, SUBSCRIPTION_STATUS_LABELS } from "../config.js";
import { escapeHtml } from "../utils.js";
import { getDeveloperAnalytics } from "../services/admin-registry-service.js";
import { goToRegistryGym } from "./admin-gym-registry-ui.js";

const PHP = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 });

export function renderAdminOverviewPage(){
  const root = document.getElementById("adminOverviewContent");
  if(!root) return;

  const ov = getDeveloperAnalytics();

  root.innerHTML = `
    <div class="owner-metric-grid">
      <div class="owner-metric-card">
        <div class="owner-metric-num">${ov.totalGyms}</div>
        <div class="owner-metric-label">Total gyms</div>
      </div>
      <div class="owner-metric-card">
        <div class="owner-metric-num">${ov.statusCounts[SUBSCRIPTION_STATUS.ACTIVE]}</div>
        <div class="owner-metric-label">Active subscriptions</div>
      </div>
      <div class="owner-metric-card">
        <div class="owner-metric-num">${ov.statusCounts[SUBSCRIPTION_STATUS.TRIALING]}</div>
        <div class="owner-metric-label">Trial accounts</div>
      </div>
      <div class="owner-metric-card">
        <div class="owner-metric-num">${ov.statusCounts[SUBSCRIPTION_STATUS.SUSPENDED]}</div>
        <div class="owner-metric-label">Suspended accounts</div>
      </div>
      <div class="owner-metric-card">
        <div class="owner-metric-num">${ov.statusCounts[SUBSCRIPTION_STATUS.DISABLED]}</div>
        <div class="owner-metric-label">Disabled accounts</div>
      </div>
      <div class="owner-metric-card">
        <div class="owner-metric-num">₱${PHP.format(ov.estimatedMrr)}</div>
        <div class="owner-metric-label">Monthly recurring revenue <span class="demo-tag">simulated</span></div>
      </div>
      <div class="owner-metric-card">
        <div class="owner-metric-num">${ov.pendingPaymentCount}</div>
        <div class="owner-metric-label">Pending payments</div>
      </div>
      <div class="owner-metric-card">
        <div class="owner-metric-num">₱${PHP.format(ov.estimatedCommissionRevenue)}</div>
        <div class="owner-metric-label">Est. commission revenue <span class="demo-tag">simulated</span></div>
      </div>
      <div class="owner-metric-card">
        <div class="owner-metric-num">${ov.totalLeadsAllGyms}</div>
        <div class="owner-metric-label">Total leads (all gyms)</div>
      </div>
      <div class="owner-metric-card">
        <div class="owner-metric-num">${ov.aiUsageToday}</div>
        <div class="owner-metric-label">Gyms with AI active today <span class="demo-tag">simulated</span></div>
      </div>
      <div class="owner-metric-card">
        <div class="owner-metric-num">${ov.newGymsThisMonth}</div>
        <div class="owner-metric-label">New gyms this month</div>
      </div>
      <div class="owner-metric-card">
        <div class="owner-metric-num">${ov.needsAttentionCount}</div>
        <div class="owner-metric-label">Gyms needing attention</div>
      </div>
    </div>

    <div class="owner-panel">
      <div class="owner-panel-head"><h3 style="margin:0;">Subscription status breakdown</h3></div>
      <div class="admin-status-chip-row">
        ${Object.entries(ov.statusCounts).map(([status, count]) => `
          <div class="admin-status-chip">
            <span class="owner-sub-status-badge ${statusBadgeClass(status)}">${escapeHtml(SUBSCRIPTION_STATUS_LABELS[status] || status)}</span>
            <span class="admin-status-chip-count">${count}</span>
          </div>
        `).join("")}
      </div>
      ${ov.pendingUpgradeCount > 0
        ? `<p class="help-text" style="margin:14px 0 0;">${ov.pendingUpgradeCount} gym${ov.pendingUpgradeCount === 1 ? "" : "s"} ${ov.pendingUpgradeCount === 1 ? "has" : "have"} a pending plan upgrade request — see the Gym Registry.</p>`
        : ""}
    </div>

    <div class="owner-panel">
      <div class="owner-panel-head"><h3 style="margin:0;">Recently registered gyms</h3></div>
      ${ov.recentGyms.length === 0
        ? `<p class="help-text" style="margin:0;">No gyms have registered yet.</p>`
        : `<div class="owner-activity-list">
            ${ov.recentGyms.map(g => `
              <div class="owner-activity-row">
                <span class="owner-activity-dot"></span>
                <div style="flex:1;min-width:0;">
                  <button type="button" class="owner-link-btn admin-recent-gym-btn" data-gym-id="${escapeHtml(g.gymId)}">${escapeHtml(g.gymName)}</button>
                  <div class="owner-activity-meta">${escapeHtml(g.ownerEmail)} · joined ${escapeHtml(new Date(g.createdAt).toLocaleDateString())}</div>
                </div>
                <span class="owner-sub-status-badge ${statusBadgeClass(g.status)}">${escapeHtml(SUBSCRIPTION_STATUS_LABELS[g.status] || g.status)}</span>
              </div>
            `).join("")}
           </div>`
      }
    </div>
  `;

  root.querySelectorAll(".admin-recent-gym-btn").forEach(btn => {
    btn.addEventListener("click", () => goToRegistryGym(btn.dataset.gymId));
  });
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
