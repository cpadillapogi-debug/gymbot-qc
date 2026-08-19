/* ============================================================
   GYMBOT QC — MASTER ADMIN: NEEDS ATTENTION PANEL (Phase 13)
   Rendering + wiring only — all real data comes from
   admin-attention-service.js. Mounted inside the Overview page by
   admin-overview-page-ui.js, same composition pattern as
   goToRegistryGym() linking Overview -> Gym Registry.
   ============================================================ */
import { escapeHtml } from "../utils.js";
import { getAttentionIssues, ATTENTION_SEVERITY, ATTENTION_SEVERITY_LABELS } from "../services/admin-attention-service.js";
import { goToRegistryGym } from "./admin-gym-registry-ui.js";

const SEVERITY_ICON = Object.freeze({
  [ATTENTION_SEVERITY.CRITICAL]: "🔴",
  [ATTENTION_SEVERITY.HIGH]: "🟠",
  [ATTENTION_SEVERITY.MEDIUM]: "🟡",
  [ATTENTION_SEVERITY.LOW]: "🔵"
});

// Reuses the existing .sub-status-* badge palette from
// owner-dashboard.css instead of inventing new colors.
const SEVERITY_BADGE_CLASS = Object.freeze({
  [ATTENTION_SEVERITY.CRITICAL]: "sub-status-danger",
  [ATTENTION_SEVERITY.HIGH]: "sub-status-danger",
  [ATTENTION_SEVERITY.MEDIUM]: "sub-status-warn",
  [ATTENTION_SEVERITY.LOW]: "sub-status-info"
});

/**
 * Renders the panel's inner HTML into a host element you already have
 * in the DOM (the Overview page injects one — see
 * admin-overview-page-ui.js). Call again any time the page needs a
 * refresh (e.g. after approving a payment elsewhere in the shell).
 * @param {HTMLElement} root
 */
export function renderAttentionPanel(root){
  if(!root) return;
  const issues = getAttentionIssues();

  if(issues.length === 0){
    root.innerHTML = `
      <div class="owner-panel-head"><h3 style="margin:0;">Needs attention</h3></div>
      <p class="help-text" style="margin:0;">Nothing needs attention right now — every gym is current.</p>
    `;
    return;
  }

  root.innerHTML = `
    <div class="owner-panel-head" style="display:flex;align-items:center;justify-content:space-between;">
      <h3 style="margin:0;">Needs attention</h3>
      <span class="admin-status-chip-count">${issues.length}</span>
    </div>
    <div class="owner-activity-list">
      ${issues.map(i => `
        <div class="owner-activity-row admin-attention-row" data-severity="${escapeHtml(i.severity)}">
          <span aria-hidden="true">${SEVERITY_ICON[i.severity] || "🔵"}</span>
          <div style="flex:1;min-width:0;">
            <button type="button" class="owner-link-btn admin-attention-gym-btn" data-gym-id="${escapeHtml(i.gymId)}">${escapeHtml(i.gymName)}</button>
            <div class="owner-activity-meta">${escapeHtml(i.problem)}</div>
            <div class="owner-activity-meta admin-attention-action">${escapeHtml(i.recommendedAction)}${i.detectedAt ? ` · detected ${escapeHtml(new Date(i.detectedAt).toLocaleDateString())}` : ""}</div>
          </div>
          <span class="owner-sub-status-badge ${SEVERITY_BADGE_CLASS[i.severity]}">${escapeHtml(ATTENTION_SEVERITY_LABELS[i.severity])}</span>
        </div>
      `).join("")}
    </div>
  `;

  root.querySelectorAll(".admin-attention-gym-btn").forEach(btn => {
    btn.addEventListener("click", () => goToRegistryGym(btn.dataset.gymId));
  });
}
