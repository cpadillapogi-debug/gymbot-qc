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
