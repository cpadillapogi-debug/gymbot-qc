/* ============================================================
   GYMBOT QC — AUTH SERVICE (backend-backed)
   Same exported function names/shapes as the old localStorage
   version, so auth-ui.js / auth-guard.js / onboarding-ui.js don't
   need a rewrite — but every function is now async and talks to
   the real API (see gymbot-qc-api) instead of localStorage.

   SESSION MODEL: the server sets an httpOnly cookie on login/
   register — JS can't read or forge it, unlike the old
   localStorage session object. getSession()/getCurrentUser() ask
   the server "who am I?" on every call (via GET /auth/me) rather
   than trusting anything stored client-side. This is the actual
   security boundary now; the old client-only version never had one.
   ============================================================ */
import { ROLES } from "../config.js";
import { mirrorGymFromServer } from "./tenant-service.js";

// Point this at your deployed API. During local dev this is usually
// http://localhost:3000; in production, your Railway/Render URL.
const API_BASE = window.GYMBOT_API_BASE || "http://localhost:3000";

async function apiFetch(path, options = {}){
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include", // sends/receives the httpOnly session cookie
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  let body = null;
  try{ body = await res.json(); }catch(err){ /* empty body, e.g. 204s */ }
  return { ok: res.ok, status: res.status, body };
}

/* ---------- Registration (Gym Owner only) ---------- */

/**
 * @param {{gymName:string, email:string, password:string, confirmPassword:string}} fields
 * @returns {Promise<{ok:boolean, error?:string, user?:object}>}
 */
export async function registerGymOwner({ gymName, email, password, confirmPassword }){
  const { ok, body } = await apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({ gymName, email, password, confirmPassword })
  });
  if(!ok) return { ok:false, error: body?.error || "Registration failed. Please try again." };
  mirrorGymFromServer(body.user?.gym, body.user?.id);
  return { ok:true, user: body.user };
}

/* ---------- Login / session ---------- */

/**
 * @param {{email:string, password:string, rememberMe:boolean}} fields
 * @returns {Promise<{ok:boolean, error?:string, user?:object}>}
 */
export async function login({ email, password }){
  // rememberMe isn't passed to the server yet — the API issues a fixed
  // 7-day cookie either way for now. Wire this through later if you
  // want a shorter session for "not remembered" logins.
  const { ok, body } = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  if(!ok) return { ok:false, error: body?.error || "Incorrect email or password." };
  mirrorGymFromServer(body.user?.gym, body.user?.id);
  return { ok:true, user: body.user };
}

export async function logout(){
  await apiFetch("/auth/logout", { method: "POST" });
}

/** Asks the server who's currently logged in (via the session cookie).
 *  @returns {Promise<object|null>} a session-shaped object, or null. */
export async function getSession(){
  const { ok, body } = await apiFetch("/auth/me");
  if(!ok || !body?.user) return null;
  const user = body.user;
  mirrorGymFromServer(user.gym, user.id);
  return { userId: user.id, role: user.role, gymId: user.gymId };
}

export async function isAuthenticated(){
  return (await getSession()) !== null;
}

export async function getCurrentUser(){
  const { ok, body } = await apiFetch("/auth/me");
  if(!ok || !body?.user) return null;
  mirrorGymFromServer(body.user.gym, body.user.id);
  return body.user;
}

/* ---------- No-ops kept for backward compatibility ----------
   The old app seeded a demo Developer account client-side since
   there was no backend to provision one. Real Developer accounts
   are now created directly in the database (or via a future
   Developer-invite endpoint) — there's nothing to seed from the
   browser anymore. These stay as harmless no-ops so main-*.js
   entry points don't need edits beyond adding `await`. */
export async function ensureSeedDeveloper(){ /* no-op — see comment above */ }
export function getSeedDeveloperHint(){ return null; }

/* ---------- Developer-only reads (Master Admin) ----------
   Backed by /admin/* routes, which themselves require a valid
   Developer session cookie server-side — so even if this file were
   somehow called from the wrong place, the server refuses the data,
   not just the UI. */

/** @returns {Promise<object[]>} */
export async function getAllUsersForDeveloper(){
  const { ok, body } = await apiFetch("/admin/users");
  if(!ok) return [];
  return body.users;
}

/** @returns {Promise<object|null>} */
export async function getUserByIdForDeveloper(userId){
  const { ok, body } = await apiFetch(`/admin/users/${encodeURIComponent(userId)}`);
  if(!ok) return null;
  return body.user;
}

/**
 * PLACEHOLDER — still true even with a real backend, since there's no
 * email delivery wired up yet. The server logs the request to the
 * audit log so there's a real record either way.
 * @returns {Promise<{ok:boolean, reason?:string, message?:string}>}
 */
export async function resetPasswordPlaceholder(userId, performedBy){
  const { ok, body } = await apiFetch(`/admin/users/${encodeURIComponent(userId)}/reset-password`, {
    method: "POST"
  });
  if(!ok) return { ok:false, reason: body?.error || "Reset request failed." };
  return { ok:true, message: body.message };
}
