/* ============================================================
   GYMBOT QC — CONNECTIVITY SERVICE (Phase 4)
   Thin wrapper around navigator.onLine and the browser's
   online/offline events. Lets the chat engine skip a network
   call it already knows will fail, and lets the UI react the
   moment connectivity comes back — without every caller
   re-implementing event wiring.

   navigator.onLine is a best-effort signal (it can be wrong on
   some captive-portal / flaky-wifi setups), which is exactly
   why gemini-service.js still treats a real fetch failure as
   its own signal rather than trusting this alone.
   ============================================================ */

const listeners = new Set();

/** @returns {boolean} */
export function isOnline(){
  return typeof navigator === "undefined" || typeof navigator.onLine !== "boolean"
    ? true // environments without the signal: assume online, let fetch itself fail if wrong
    : navigator.onLine;
}

/**
 * @param {(online:boolean) => void} fn
 * @returns {Function} unsubscribe
 */
export function onConnectivityChange(fn){
  if(typeof fn !== "function") return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(){
  const online = isOnline();
  listeners.forEach(fn => {
    try{ fn(online); }catch(err){ console.error("[connectivity-service] listener threw:", err); }
  });
}

let wired = false;
export function initConnectivityWatcher(){
  if(wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
}
