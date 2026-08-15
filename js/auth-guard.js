/* ============================================================
   GYMBOT QC — AUTH GUARD
   Route-protection placeholder for a static, multi-page site.
   There's no server-side session check here (there's no server
   yet) — this only prevents the *page content* from rendering
   for the wrong visitor. Anything genuinely sensitive (other
   gyms' data, Developer-only actions) must also be enforced
   server-side once a backend exists; a client-side redirect is
   a UX guard, not a security boundary.

   Usage — at the top of a protected page's entry script:
     import { requireAuth, requireRole } from "../auth-guard.js";
     const session = requireAuth();       // any logged-in user
     if(!session) return;                 // a redirect is already underway
     // or:
     const session = requireRole(ROLES.DEVELOPER);
   ============================================================ */
import { ROUTES, ROLES } from "./config.js";
import { getSession } from "./services/auth-service.js";

/**
 * Redirects to the login page (preserving the current page as a
 * `redirect` param) if there's no valid session.
 * @returns {object|null} the session if present, otherwise null (redirect is already underway)
 */
export function requireAuth(){
  const session = getSession();
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
export function requireRole(role){
  const session = requireAuth();
  if(!session) return null;
  if(session.role !== role){
    window.location.replace(roleHome(session.role));
    return null;
  }
  return session;
}

/** For login/register pages: bounce an already-logged-in visitor straight to their dashboard. */
export function redirectIfAuthenticated(){
  const session = getSession();
  if(session){
    window.location.replace(roleHome(session.role));
    return true;
  }
  return false;
}

export function roleHome(role){
  // Phase 3: Developer and Gym Owner now have separate pages.
  // dashboard.html is Developer-only; owner-dashboard.html is
  // Gym-Owner-only. Both pages guard themselves with requireRole()
  // too, so a stale/bookmarked link can't land the wrong role on
  // the wrong page even if this function is bypassed.
  return role === ROLES.DEVELOPER ? ROUTES.DASHBOARD : ROUTES.DASHBOARD_OWNER;
}
