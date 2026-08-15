/* ============================================================
   GYMBOT QC — UTILS
   Small, pure, dependency-free helpers. No DOM, no storage,
   no state — safe to import from anywhere without creating
   circular dependencies.
   ============================================================ */

/** Escapes text before it's ever placed via innerHTML. Always
 *  prefer textContent for user/AI text; this is for the few
 *  spots (e.g. lead rows) that build small HTML fragments. */
export function escapeHtml(str){
  if(typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function clampText(str, maxLen){
  if(typeof str !== "string") return "";
  return str.slice(0, maxLen);
}

export function delay(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function isToday(isoString){
  try{
    const d = new Date(isoString);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth() === now.getMonth() &&
           d.getDate() === now.getDate();
  }catch(err){
    return false;
  }
}

/** Deliberately simple — good enough to catch typos, not RFC 5322 complete. */
export function isValidEmail(email){
  if(typeof email !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Returns a new Date `days` after `date` (accepts an ISO string or a
 *  Date). Pure — never mutates its input. Used by subscription-service.js
 *  to calculate trial ends, billing periods, and grace/suspension timers. */
export function addDays(date, days){
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function generateId(prefix){
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Digits-only phone comparison key, used for lead duplicate detection.
 *  Strips everything but digits, then normalizes the PH country/trunk
 *  prefix so "0917 123 4567" and "+63 917 123 4567" match as the same
 *  number. Deliberately simple — good enough for de-duping within one
 *  gym's leads, not a general phone-number library. */
export function normalizePhoneForMatch(phone){
  if(typeof phone !== "string") return "";
  let digits = phone.replace(/\D/g, "");
  if(digits.startsWith("63") && digits.length > 10) digits = digits.slice(2);
  if(digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

/** Wraps a value for safe CSV output — handles commas, quotes,
 *  newlines, and emoji by quote-wrapping and escaping quotes.
 *  Also guards against CSV/formula injection: a cell that starts with
 *  =, +, -, @, or a tab/CR is treated as an executable formula by
 *  Excel, Google Sheets, and LibreOffice the moment the file is
 *  opened. Since exported rows (e.g. lead names) can originate from
 *  an untrusted public chat widget, a leading apostrophe is added to
 *  force those cells to render as plain text instead. */
export function csvEscape(value){
  let str = (value === null || value === undefined) ? "" : String(value);
  if(/^[=+\-@\t\r]/.test(str)){
    str = "'" + str;
  }
  return '"' + str.replace(/"/g, '""') + '"';
}

/**
 * Filters an array down to well-formed objects, dropping any entry
 * that is null, not a plain object, or missing one of the given
 * required (non-empty) keys. Used at collection read-boundaries
 * (getAllUsers, getAllGyms, getAllInvoices, ...) so a single
 * corrupted or malformed record — from a hand-edited localStorage
 * value, a partial backup restore, or a future migration bug —
 * can never crash every page that reads that collection by throwing
 * on `null.someProperty`. Nothing is deleted from storage; this only
 * filters the in-memory copy handed to callers.
 * @param {any[]} arr
 * @param {string[]} [requiredKeys] keys that must be present and non-empty
 * @returns {object[]}
 */
export function sanitizeRecords(arr, requiredKeys = []){
  if(!Array.isArray(arr)) return [];
  return arr.filter(item => {
    if(!item || typeof item !== "object" || Array.isArray(item)) return false;
    return requiredKeys.every(key => item[key] !== undefined && item[key] !== null && item[key] !== "");
  });
}
