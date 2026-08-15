/* ============================================================
   GYMBOT QC — MASTER ADMIN DASHBOARD PAGE ENTRY POINT (Phase 7)
   dashboard.html is Developer-only. requireRole() redirects to
   login.html if there's no session, or to the visitor's own role
   home if they're logged in as a Gym Owner — so a Gym Owner can
   never land here, even via a stale link.
   ============================================================ */
import { ROLES } from "./config.js";
import { requireRole } from "./auth-guard.js";
import { renderAdminShell } from "./ui/admin-shell-ui.js";

try{
  const session = requireRole(ROLES.DEVELOPER);
  if(session){
    renderAdminShell(session);
  }
  // If session is null, requireRole() has already redirected.
}catch(err){
  console.error("GymBot QC Master Admin dashboard failed to initialize:", err);
}
