/* ============================================================
   GYMBOT QC — MASTER ADMIN: SECURITY SERVICE (Phase 13)
   Composes the Security Center from data that's already real in
   this codebase: login/logout system-log entries (see
   dev-console-service.js's logSystemEvent(), called from every
   login attempt in auth-service.js) and each user's lastLoginAt.
   Pure logic + composition, no DOM — same layering as
   admin-registry-service.js.

   WHAT THIS DELIBERATELY DOES NOT INVENT:
     - "Active admin sessions" across devices — this app stores a
       single session object per browser storage (see
       auth-service.js's issueSession()), not a server-side session
       table, so there is no way to know about sessions on other
       devices/browsers. Only THIS browser's current session is
       real and shown as such.
     - 2FA status — not implemented anywhere in this codebase.
       Rather than show a fake "Enabled/Disabled" toggle, this is
       left out of getSecurityOverview() entirely; the UI layer
       shows an explicit "not implemented" note instead.
     - The 5-role RBAC model (Master Admin / Admin / Billing Admin
       / Support Admin / Read Only) from the original wishlist —
       the auth model only has ROLES.DEVELOPER and
       ROLES.GYM_OWNER (see config.js). Inventing extra roles here
       with no actual permission checks behind them would be a
       fake control, not a real one.
   ============================================================ */
import { SYSTEM_LOG_CATEGORIES, SYSTEM_LOG_LEVELS, ROLES } from "../config.js";
import { getSystemLogs } from "./dev-console-service.js";
import { getAllUsersForDeveloper } from "./auth-service.js";

/**
 * @returns {object} everything the Security Center panel needs, built
 *   only from real stored data.
 */
export function getSecurityOverview(){
  const loginLogs = getSystemLogs({ category: SYSTEM_LOG_CATEGORIES.LOGIN_ATTEMPT });
  const failedLogins = loginLogs.filter(l => l.level === SYSTEM_LOG_LEVELS.WARNING);
  const successfulLogins = loginLogs.filter(l => l.level === SYSTEM_LOG_LEVELS.INFO);

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const failedLoginsLast7Days = failedLogins.filter(l => new Date(l.timestamp).getTime() >= sevenDaysAgo).length;

  const users = getAllUsersForDeveloper();
  const developerAccounts = users
    .filter(u => u.role === ROLES.DEVELOPER)
    .map(u => ({ id: u.id, email: u.email, lastLoginAt: u.lastLoginAt || null }))
    .sort((a, b) => new Date(b.lastLoginAt || 0) - new Date(a.lastLoginAt || 0));

  return {
    recentLogins: loginLogs.slice(0, 25), // newest-first already, see getSystemLogs()
    failedLoginCount: failedLogins.length,
    failedLoginsLast7Days,
    successfulLoginCount: successfulLogins.length,
    developerAccounts
  };
}
