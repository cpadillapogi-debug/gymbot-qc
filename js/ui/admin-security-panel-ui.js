/* ============================================================
   GYMBOT QC — MASTER ADMIN: SECURITY CENTER PANEL (Phase 13)
   Rendering + wiring only — all real data comes from
   admin-security-service.js. Mounted as a tab inside the
   Audit Log page — see admin-audit-log-ui.js.
   ============================================================ */
import { escapeHtml } from "../utils.js";
import { getSecurityOverview } from "../services/admin-security-service.js";
import { getSession } from "../services/auth-service.js";
import { SYSTEM_LOG_LEVELS } from "../config.js";

export function renderSecurityPanel(root){
  if(!root) return;
  const sec = getSecurityOverview();
  const session = getSession();

  root.innerHTML = `
    <div class="owner-metric-grid">
      <div class="owner-metric-card">
        <div class="owner-metric-num">${sec.successfulLoginCount}</div>
        <div class="owner-metric-label">Successful logins recorded</div>
      </div>
      <div class="owner-metric-card">
        <div class="owner-metric-num">${sec.failedLoginCount}</div>
        <div class="owner-metric-label">Failed login attempts (all-time)</div>
      </div>
      <div class="owner-metric-card">
        <div class="owner-metric-num">${sec.failedLoginsLast7Days}</div>
        <div class="owner-metric-label">Failed attempts — last 7 days</div>
      </div>
    </div>

    <div class="owner-panel">
      <div class="owner-panel-head"><h3 style="margin:0;">This session</h3></div>
      ${session
        ? `<dl class="owner-sub-detail-list">
            <div><dt>Role</dt><dd>${escapeHtml(session.role)}</dd></div>
            <div><dt>Signed in</dt><dd>${escapeHtml(new Date(session.issuedAt).toLocaleString())}</dd></div>
            <div><dt>Expires</dt><dd>${escapeHtml(new Date(session.expiresAt).toLocaleString())}</dd></div>
            <div><dt>Remember me</dt><dd>${session.rememberMe ? "On" : "Off"}</dd></div>
           </dl>
           <p class="help-text" style="margin:10px 0 0;">This app stores one session per browser (no server-side session table), so only this browser's session can be shown — sessions on other devices aren't visible here.</p>`
        : `<p class="help-text" style="margin:0;">No active session found.</p>`
      }
    </div>

    <div class="owner-panel">
      <div class="owner-panel-head"><h3 style="margin:0;">Developer account logins</h3></div>
      ${sec.developerAccounts.length === 0
        ? `<p class="help-text" style="margin:0;">No Developer accounts on file.</p>`
        : `<table class="owner-table owner-leads-table">
            <thead><tr><th>Email</th><th>Last login</th></tr></thead>
            <tbody>
              ${sec.developerAccounts.map(u => `
                <tr>
                  <td data-label="Email">${escapeHtml(u.email)}</td>
                  <td data-label="Last login">${u.lastLoginAt ? escapeHtml(new Date(u.lastLoginAt).toLocaleString()) : "Never"}</td>
                </tr>
              `).join("")}
            </tbody>
           </table>`
      }
    </div>

    <div class="owner-panel">
      <div class="owner-panel-head"><h3 style="margin:0;">Recent login activity</h3></div>
      ${sec.recentLogins.length === 0
        ? `<p class="help-text" style="margin:0;">No login activity recorded yet.</p>`
        : `<div class="owner-activity-list">
            ${sec.recentLogins.map(l => `
              <div class="owner-activity-row">
                <span class="owner-sub-status-badge ${l.level === SYSTEM_LOG_LEVELS.WARNING ? "sub-status-danger" : "sub-status-ok"}">${l.level === SYSTEM_LOG_LEVELS.WARNING ? "Failed" : "Success"}</span>
                <div style="flex:1;min-width:0;">
                  <div>${escapeHtml(l.message)}</div>
                  <div class="owner-activity-meta">${escapeHtml(new Date(l.timestamp).toLocaleString())}</div>
                </div>
              </div>
            `).join("")}
           </div>`
      }
    </div>

    <div class="owner-panel">
      <div class="owner-panel-head"><h3 style="margin:0;">Not implemented yet</h3></div>
      <p class="help-text" style="margin:0;">
        Two-factor authentication, multi-role permissions (Billing Admin / Support Admin / Read Only), and
        cross-device session listing don't exist in this codebase yet — see the header comment in
        admin-security-service.js for exactly what's missing and why it isn't faked here.
      </p>
    </div>
  `;
}
