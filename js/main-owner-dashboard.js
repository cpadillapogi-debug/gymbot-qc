/* ============================================================
   GYMBOT QC — GYM OWNER DASHBOARD PAGE ENTRY POINT (Phase 3,
   extended Phase 11 for Developer preview mode)
   Protected page: requireOwnerSession() redirects to login.html
   if there's no session, or to the Developer dashboard if this
   visitor is logged in as a Developer — a Developer session can
   never render this page's content.

   EXCEPTION (Phase 11): a `?devview=<gymId>` URL param lets a
   real, currently-logged-in Developer open a read/write preview
   of one gym's owner dashboard in a NEW TAB, without logging out
   of their Developer session in the original tab and without
   creating any Gym Owner login of their own. See
   getDevPreviewSession() below and owner-shell-ui.js's demo
   banner. This path still requires an authenticated Developer —
   it is not a way for an unauthenticated visitor, or a Gym Owner,
   to view another gym.
   ============================================================ */
import { requireOwnerSession, renderOwnerShell } from "./ui/owner-shell-ui.js";
import { getSession } from "./services/auth-service.js";
import { getGymById } from "./services/tenant-service.js";
import { showNewDeviceAlertIfFlagged } from "./ui/toast-ui.js";
import { ROLES } from "./config.js";

function getDevPreviewSession(){
  const params = new URLSearchParams(window.location.search);
  const gymId = params.get("devview");
  if(!gymId) return null;

  const realSession = getSession();
  if(!realSession || realSession.role !== ROLES.DEVELOPER){
    // Not a Developer — never honor this param for anyone else.
    // Fall through to the normal role-gated flow below, which will
    // redirect appropriately (login, or a Gym Owner's own dashboard).
    return null;
  }
  const gym = getGymById(gymId);
  if(!gym || gym.deletedAt) return null;

  return {
    role: ROLES.GYM_OWNER,
    gymId,
    userId: null,
    isDevPreview: true,
    previewedBy: realSession.userId || null
  };
}

try{
  const preview = getDevPreviewSession();
  if(preview){
    renderOwnerShell(preview);
  }else{
    const session = requireOwnerSession();
    if(session){
      renderOwnerShell(session);
      showNewDeviceAlertIfFlagged();
    }
    // If session is null, requireOwnerSession() has already redirected.
  }
}catch(err){
  console.error("GymBot QC owner dashboard failed to initialize:", err);
}
