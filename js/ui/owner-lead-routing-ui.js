/* ============================================================
   GYMBOT QC — OWNER: LEAD ROUTING (Phase 5)
   Renders the "Lead Routing" panel inside Business Settings.
   Pure rendering + wiring; all state lives in
   lead-routing-service.js.

   PERMISSION BOUNDARY: same as the rest of Business Settings —
   a Gym Owner only ever touches their own gymId's routing
   config, never another gym's, and this page never exposes
   "developer integration" internals (API secrets, request
   logs) — just connect/disconnect status for their own account.
   ============================================================ */
import { escapeHtml } from "../utils.js";
import {
  getRoutingSettings, testPlaceholderConnection,
  resetPlaceholderConnection, setWebhookUrl
} from "../services/lead-routing-service.js";
import { showToast } from "./toast-ui.js";

const STATUS_LABEL = {
  connected: "Connected",
  not_connected: "Not Connected",
  error: "Error"
};

let currentGymId = null;
let root = null;

export function initOwnerLeadRoutingPage(gymId){
  root = document.getElementById("ownerLeadRoutingContent");
  currentGymId = gymId;
  render();
}

function render(){
  if(!root) return;
  const { providers } = getRoutingSettings(currentGymId);

  root.innerHTML = providers.map(providerRowHtml).join("");

  providers.forEach(p => {
    if(p.kind !== "placeholder") return;

    const testBtn = root.querySelector(`[data-test-connection="${p.id}"]`);
    if(testBtn){
      testBtn.addEventListener("click", () => {
        testPlaceholderConnection(currentGymId, p.id);
        render();
        showToast(`${p.label}: connection test failed — see details below.`);
      });
    }
    const resetBtn = root.querySelector(`[data-reset-connection="${p.id}"]`);
    if(resetBtn){
      resetBtn.addEventListener("click", () => {
        resetPlaceholderConnection(currentGymId, p.id);
        render();
      });
    }
    if(p.hasUrl){
      const urlInput = root.querySelector(`[data-webhook-url="${p.id}"]`);
      if(urlInput){
        urlInput.addEventListener("change", () => {
          setWebhookUrl(currentGymId, p.id, urlInput.value);
          showToast("Webhook URL saved.");
        });
      }
    }
  });
}

function providerRowHtml(p){
  const dotClass = "owner-routing-dot-" + p.status;
  const isPlaceholder = p.kind === "placeholder";

  return `
    <div class="owner-routing-row">
      <div class="owner-routing-status">
        <span class="owner-routing-dot ${dotClass}" aria-hidden="true"></span>
        <span class="owner-routing-status-text">${escapeHtml(STATUS_LABEL[p.status] || "Not Connected")}</span>
      </div>
      <div class="owner-routing-info">
        <div class="owner-routing-name">
          ${escapeHtml(p.label)}
          ${isPlaceholder ? '<span class="demo-tag">placeholder</span>' : ""}
        </div>
        <div class="owner-routing-desc">${escapeHtml(p.description || "")}</div>
        ${p.hasUrl ? `
          <input type="text" class="owner-routing-webhook-input" data-webhook-url="${escapeHtml(p.id)}"
            placeholder="https://your-n8n-instance.com/webhook/..." value="${escapeHtml(p.webhookUrl || "")}">
        ` : ""}
        ${p.status === "error" && p.error ? `<div class="owner-routing-error">${escapeHtml(p.error)}</div>` : ""}
      </div>
      <div class="owner-routing-actions">
        ${renderActions(p)}
      </div>
    </div>
  `;
}

function renderActions(p){
  if(p.kind === "core"){
    return `<span class="help-text" style="margin:0;">Always on</span>`;
  }
  if(p.kind === "working"){
    return `<span class="help-text" style="margin:0;">Use Export on the Leads page</span>`;
  }
  // placeholder
  if(p.status === "error"){
    return `
      <button type="button" class="btn btn-ghost btn-sm" data-test-connection="${escapeHtml(p.id)}">Retry</button>
      <button type="button" class="btn btn-ghost btn-sm" data-reset-connection="${escapeHtml(p.id)}">Reset</button>
    `;
  }
  return `<button type="button" class="btn btn-ghost btn-sm" data-test-connection="${escapeHtml(p.id)}">Connect</button>`;
}
