/* ============================================================
   GYMBOT QC — AUTH GUARD
   Route-protection for a static frontend talking to a real
   backend. This still only prevents *page content* from
   rendering for the wrong visitor on the client — the actual
   security boundary is server-side now (the API checks the
   session cookie + role on every request, see gymbot-qc-api's
   requireAuth/requireRole middleware). A bypassed client guard
   can no longer read another gym's data, because the server
   won't return it without a valid cookie either way.

   Usage — at the top of a protected page's entry script:
     import { requireAuth, requireRole } from "../auth-guard.js";
     const session = await requireAuth();       // any logged-in user
     if(!session) return;                        // a redirect is already underway
     // or:
     const session = await requireRole(ROLES.DEVELOPER);
   ============================================================ */
import { ROUTES, ROLES } from "./config.js";
import { getSession } from "./services/auth-service.js";

/**
 * Redirects to the login page (preserving the current page as a
 * `redirect` param) if there's no valid session.
 * @returns {Promise<object|null>} the session if present, otherwise null (redirect is already underway)
 */
export async function requireAuth(){
  const session = await getSession();
  if(!session){
    const here = window.location.pathname.split("/").pop() || ROUTES.HOME;
    window.location.replace(`${ROUTES.LOGIN}?redirect=${encodeURIComponent(here)}`);
    return null;
  }
  return session;
}

/**
 * Like requireAuth(), but also redirects (to that role's home)
 * if the logged-in user has the wrong role for this page.
 * @param {string} role one of ROLES.*
 */
export async function requireRole(role){
  const session = await requireAuth();
  if(!session) return null;
  if(session.role !== role){
    window.location.replace(roleHome(session.role));
    return null;
  }
  return session;
}

/** For login/register pages: bounce an already-logged-in visitor straight to their dashboard. */
export async function redirectIfAuthenticated(){
  const session = await getSession();
  if(session){
    window.location.replace(roleHome(session.role));
    return true;
  }
  return false;
}

export function roleHome(role){
  return role === ROLES.DEVELOPER ? ROUTES.DASHBOARD : ROUTES.DASHBOARD_OWNER;
}
