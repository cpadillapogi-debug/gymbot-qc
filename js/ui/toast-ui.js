/* ============================================================
   GYMBOT QC — TOAST UI
   ============================================================ */
import { CONFIG } from "../config.js";

let toastTimer = null;

export function showToast(message){
  const host = document.getElementById("toastHost");
  if(!host) return;
  host.innerHTML = "";

  const div = document.createElement("div");
  div.className = "toast";
  div.textContent = message;
  div.setAttribute("role", "status");
  host.appendChild(div);

  if(toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => div.remove(), CONFIG.TOAST_DURATION_MS);
}

/**
 * Phase 16: one-time "new device" heads-up, set by auth-ui.js right after
 * a login where auth-service.js's login() flagged newDeviceDetected. Reads
 * and immediately clears the sessionStorage flag so it only ever fires
 * once, on the very next dashboard render after that login — a page
 * refresh or later normal login won't repeat it. Call this once from each
 * dashboard's entry point (main-dashboard.js / main-owner-dashboard.js).
 */
export function showNewDeviceAlertIfFlagged(){
  try{
    if(window.sessionStorage.getItem("gymbot_new_device_alert") === "1"){
      window.sessionStorage.removeItem("gymbot_new_device_alert");
      showToast("New device detected for this login. Not you? Change your password and check Security Center.");
    }
  }catch(err){
    // best-effort only — sessionStorage unavailable is not worth surfacing
  }
}
