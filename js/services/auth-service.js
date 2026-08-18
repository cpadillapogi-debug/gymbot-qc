/* ============================================================
   GYMBOT QC — AUTH SERVICE
   Users collection + session lifecycle. Pure logic + storage —
   no DOM. UI modules (auth-ui.js) and guards (auth-guard.js)
   are the only callers.

   PASSWORD HASHING — READ THIS BEFORE PRODUCTION:
   `hashPassword()` below is a placeholder. It is NOT
   cryptographically secure — it exists only so a plaintext
   password never sits in localStorage verbatim during
   development. Before any real account is created:
     - Move registration/login behind a server endpoint.
     - Hash with bcrypt/argon2 server-side, salted per user.
     - Never ship password verification in client-side JS at all,
       since anyone can read this file and see exactly how
       "hashing" works.
   Every call site below is written against verifyPassword() /
   hashPassword(), so swapping the implementation later — or
   replacing this whole module with fetch() calls to a real
   backend — doesn't require touching auth-ui.js or auth-guard.js.
   ============================================================ */
import { CONFIG, ROLES, AUDIT_ACTIONS } from "../config.js";
import { storage, sessionStorageAdapter } from "../storage.js";
import { generateId, isValidEmail, sanitizeRecords, parseDeviceInfo } from "../utils.js";
import { createGym, getGymByOwnerId, isGymDeleted } from "./tenant-service.js";
import { recordAuditEntry } from "./audit-log-service.js";
import { logSystemEvent, updateSystemLogMeta } from "./dev-console-service.js";
import { lookupApproximateLocation } from "./login-geo-service.js";
import { SYSTEM_LOG_LEVELS, SYSTEM_LOG_CATEGORIES } from "../config.js";

/* ---------- Users collection ---------- */

// Every user record needs id/email/role to be usable anywhere in this
// file — a record missing one of those (a hand-edited localStorage
// value, a partial backup restore) is filtered out in memory rather
// than left in to crash the first `.email.toLowerCase()` call that
// touches it. Nothing is deleted from storage; see sanitizeRecords().
function getAllUsers(){
  return sanitizeRecords(storage.getJSON("users", [], { requireArray: true }), ["id", "email", "role"]);
}

function saveAllUsers(users){
  return storage.setJSON("users", users);
}

function findUserByEmail(email){
  const normalized = (email || "").trim().toLowerCase();
  return getAllUsers().find(u => typeof u.email === "string" && u.email.toLowerCase() === normalized) || null;
}

/* ---------- Password placeholder (see file header) ---------- */

function hashPassword(password){
  // NOT SECURE. Placeholder only — see module header.
  return "placeholder$" + btoa(unescape(encodeURIComponent(password))).split("").reverse().join("");
}

function verifyPassword(password, hash){
  return hashPassword(password) === hash;
}

/* ---------- Seed a default Developer account ---------- */
// Developer accounts aren't self-registrable (there's no public
// "sign up as Developer" flow) — so on first load we seed one
// demo Developer account if none exists yet, purely so this
// phase is testable end-to-end without a backend.
const SEED_DEVELOPER_EMAIL = "idollodi063@gmail.com";
const SEED_DEVELOPER_PASSWORD = "Caloypogi2009";

export function ensureSeedDeveloper(){
  const users = getAllUsers();
  if(users.some(u => u.role === ROLES.DEVELOPER)) return;
  users.push({
    id: generateId("user"),
    email: SEED_DEVELOPER_EMAIL,
    passwordHash: hashPassword(SEED_DEVELOPER_PASSWORD),
    role: ROLES.DEVELOPER,
    gymId: null,
    createdAt: new Date().toISOString()
  });
  saveAllUsers(users);
}

export function getSeedDeveloperHint(){return null;}

/* ---------- Registration (Gym Owner only) ---------- */
// Developers are provisioned separately (seeded above, or later
// by another Developer from an admin tool) — the public register
// page only ever creates Gym Owner accounts + their gym.

/**
 * @param {{gymName:string, email:string, password:string, confirmPassword:string}} fields
 * @returns {{ok:boolean, error?:string, user?:object}}
 */
export function registerGymOwner({ gymName, email, password, confirmPassword }){
  const cleanGymName = (gymName || "").trim();
  const cleanEmail = (email || "").trim().toLowerCase();

  if(!cleanGymName){
    return { ok:false, error:"Please enter your gym's name." };
  }
  if(!cleanEmail || !isValidEmail(cleanEmail)){
    return { ok:false, error:"Please enter a valid email address." };
  }
  if(!password || password.length < CONFIG.MIN_PASSWORD_LEN){
    return { ok:false, error:`Password must be at least ${CONFIG.MIN_PASSWORD_LEN} characters.` };
  }
  if(password !== confirmPassword){
    return { ok:false, error:"Passwords don't match." };
  }
  if(findUserByEmail(cleanEmail)){
    return { ok:false, error:"An account with that email already exists." };
  }

  const userId = generateId("user");
  const gym = createGym({ name: cleanGymName, ownerId: userId });

  const user = {
    id: userId,
    email: cleanEmail,
    passwordHash: hashPassword(password),
    role: ROLES.GYM_OWNER,
    gymId: gym.id,
    createdAt: new Date().toISOString()
  };

  const users = getAllUsers();
  users.push(user);
  saveAllUsers(users);

  return { ok:true, user: toSafeUser(user) };
}

/* ---------- Login / session ---------- */

/**
 * @param {{email:string, password:string, rememberMe:boolean}} fields
 * @returns {{ok:boolean, error?:string, user?:object}}
 */
export function login({ email, password, rememberMe }){
  const cleanEmail = (email || "").trim();
  if(!cleanEmail || !isValidEmail(cleanEmail)){
    return { ok:false, error:"Please enter a valid email address." };
  }
  if(!password){
    return { ok:false, error:"Please enter your password." };
  }

  const user = findUserByEmail(cleanEmail);
  if(!user || !verifyPassword(password, user.passwordHash)){
    logLoginAttempt({ level: SYSTEM_LOG_LEVELS.WARNING, message: `Failed login attempt for ${cleanEmail}` });
    // Same message for "no such user" and "wrong password" —
    // don't leak which one it was.
    return { ok:false, error:"Incorrect email or password." };
  }

  // Phase 8: a Developer-deleted gym account can't log back in. Data
  // stays put (see tenant-service.js's deleteGymForDeveloper) — this
  // only blocks the session, same "soft" spirit as Disabled.
  if(user.role === ROLES.GYM_OWNER && user.gymId){
    const gym = getGymByOwnerId(user.id);
    if(isGymDeleted(gym)){
      return { ok:false, error:"This account has been deleted. Contact GymBot QC support if you believe this is a mistake." };
    }
  }

  recordLastLogin(user.id);
  issueSession(user, !!rememberMe);
  logLoginAttempt({ level: SYSTEM_LOG_LEVELS.INFO, message: `Successful login: ${cleanEmail}` });
  return { ok:true, user: toSafeUser(user) };
}

/**
 * Records a login-attempt system-log entry with device info attached
 * immediately (from navigator.userAgent, always available synchronously),
 * then kicks off a best-effort IP-geolocation lookup and patches the same
 * entry's meta once/if it resolves — see login-geo-service.js for why
 * that lookup is async and allowed to fail silently.
 * Never blocks or throws; the login flow completes the same either way.
 * @param {{level:string, message:string}} fields
 */
function logLoginAttempt({ level, message }){
  const device = parseDeviceInfo(typeof navigator !== "undefined" ? navigator.userAgent : "");
  const entry = logSystemEvent({
    level,
    category: SYSTEM_LOG_CATEGORIES.LOGIN_ATTEMPT,
    message,
    meta: { device }
  });

  lookupApproximateLocation()
    .then(location => {
      if(location) updateSystemLogMeta(entry.id, { location });
    })
    .catch(() => { /* best-effort, see login-geo-service.js */ });

  return entry;
}

/** Stamps lastLoginAt on the user record — read by the Developer Dashboard's
 *  Gym Registry ("Last login" column). Best-effort only, never blocks login. */
function recordLastLogin(userId){
  try{
    const users = getAllUsers();
    const user = users.find(u => u.id === userId);
    if(!user) return;
    user.lastLoginAt = new Date().toISOString();
    saveAllUsers(users);
  }catch(err){ /* non-fatal */ }
}

function issueSession(user, rememberMe){
  const now = Date.now();
  const durationMs = rememberMe ? CONFIG.SESSION_DURATION_REMEMBER_MS : CONFIG.SESSION_DURATION_MS;
  const session = {
    userId: user.id,
    role: user.role,
    gymId: user.gymId,
    rememberMe: !!rememberMe,
    issuedAt: now,
    expiresAt: now + durationMs
  };

  // Remembered sessions go in localStorage (survive closing the
  // browser); non-remembered sessions go in sessionStorage
  // (cleared when the tab closes) with a shorter expiry as a
  // backstop. Clear the other store so stale sessions can't
  // linger in both places at once.
  if(rememberMe){
    storage.setJSON("session", session);
    sessionStorageAdapter.remove("session");
  }else{
    sessionStorageAdapter.setJSON("session", session);
    storage.remove("session");
  }
}

/** @returns {object|null} the active session, or null if absent/expired (and clears it if expired) */
export function getSession(){
  const fromLocal = storage.getJSON("session", null);
  const fromSession = sessionStorageAdapter.getJSON("session", null);
  const session = fromLocal || fromSession;
  if(!session) return null;

  if(!session.expiresAt || Date.now() > session.expiresAt){
    logout();
    return null;
  }
  return session;
}

export function isAuthenticated(){
  return getSession() !== null;
}

export function getCurrentUser(){
  const session = getSession();
  if(!session) return null;
  const user = getAllUsers().find(u => u.id === session.userId) || null;
  return user ? toSafeUser(user) : null;
}

export function logout(){
  storage.remove("session");
  sessionStorageAdapter.remove("session");
}

/** Strips passwordHash before anything crosses into UI code.
 *  Defense-in-depth null guard: getAllUsers() already filters out
 *  malformed records, but this is cheap insurance against any future
 *  call site that doesn't go through it. */
function toSafeUser(user){
  if(!user || typeof user !== "object") return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

/* ---------- Developer-only reads (Master Admin) ----------
   Same boundary style as tenant-service.js's getAllGymsForDeveloper():
   these don't gate access themselves, route guards (auth-guard.js) do.
   Never imported from owner-facing code (see owner-shell-ui.js's
   permission-boundary comment). */

/** @returns {object[]} every user on the platform, passwordHash stripped. */
export function getAllUsersForDeveloper(){
  return getAllUsers().map(toSafeUser);
}

/** @returns {object|null} a single user by id, passwordHash stripped. */
export function getUserByIdForDeveloper(userId){
  if(!userId) return null;
  const user = getAllUsers().find(u => u.id === userId) || null;
  return user ? toSafeUser(user) : null;
}

/**
 * PLACEHOLDER ONLY — see this file's header comment on password
 * hashing. There is no email/SMS delivery and no backend yet, so this
 * cannot actually send or set a new password. It exists so the
 * Developer Dashboard has a real, honest action to click: it logs the
 * request to the audit log and returns instructions, rather than
 * silently pretending to reset anything.
 * @returns {{ok:boolean, reason?:string, message?:string}}
 */
export function resetPasswordPlaceholder(userId, performedBy){
  const user = getAllUsers().find(u => u.id === userId);
  if(!user) return { ok: false, reason: "User not found." };

  recordAuditEntry({
    action: AUDIT_ACTIONS.RESET_PASSWORD,
    gymId: null,
    performedBy,
    newValue: user.email,
    note: `Placeholder only — no real reset email was sent. Follow up with ${user.email} out of band until a real reset flow exists.`
  });

  return {
    ok: true,
    message: `Logged a password-reset request for ${user.email}. This is a placeholder — there's no email/reset backend yet, so nothing was actually changed. Follow up with the owner directly for now.`
  };
}
