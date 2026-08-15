/* ============================================================
   GYMBOT QC — OWNER: BILLING STATUS BANNER + LOCK OVERLAY (Phase 6)
   Cross-cutting billing UI that has to show up on every owner
   page, not just Subscription — a "your account is suspended"
   warning is useless if it only appears on the one page an owner
   won't visit until they already know something's wrong. Kept
   as its own module (rather than folded into owner-shell-ui.js)
   for the same reason owner-lead-routing-ui.js is separate from
   owner-settings-page-ui.js: one concern per file.

   Reacts to the 8 subscription states via
   subscription-service.js's getSubscriptionAccess():
     - Trialing / Pending Payment / Grace Period / Canceled /
       Expired -> an informational or warning banner, rest of the
       dashboard stays fully usable.
     - Suspended -> a danger banner AND `.billing-readonly` is
       added to .owner-shell, which (see owner-dashboard.css)
       disables every input/select/textarea/button outside the
       Subscription and Help pages. The AI Receptionist page
       shows its own "disabled" panel — see owner-ai-page-ui.js.
     - Disabled -> a full-screen lock overlay replaces normal use
       entirely. No dismiss action other than logging out —
       Gym Owners can't reactivate a suspended/disabled account
       themselves (see subscription-service.js's header comment).
   ============================================================ */
import { ROUTES } from "../config.js";
import { escapeHtml } from "../utils.js";
import { getSubscription, getSubscriptionAccess, getPlan, getTrialDaysRemaining } from "../services/subscription-service.js";
import { logout } from "../services/auth-service.js";

const BANNER_COPY = {
  trial: sub => ({
    type: "info",
    text: `Free trial — ${getTrialDaysRemaining(sub)} day${getTrialDaysRemaining(sub) === 1 ? "" : "s"} left. Add a payment method before it ends to keep your AI Receptionist running.`
  }),
  payment_due: sub => ({
    type: "warning",
    text: `Payment due for your ${getPlan(sub.planId).name} plan (₱${getPlan(sub.planId).priceMonthly.toLocaleString()}/month) — verification pending.`
  }),
  grace: () => ({
    type: "warning",
    text: `Grace period active — your last payment is overdue. Your account will be suspended if it isn't resolved soon.`
  }),
  suspended: () => ({
    type: "danger",
    text: `Subscription suspended — your AI Receptionist is disabled and the rest of the dashboard is read-only until payment is resolved.`
  }),
  canceled: sub => ({
    type: "warning",
    text: `Subscription canceled — access continues until ${formatDate(sub.currentPeriodEnd)}.`
  }),
  expired: () => ({
    type: "danger",
    text: `Subscription expired — you can still view your data, but the AI Receptionist is disabled. Visit Subscription to resubscribe.`
  })
};

/**
 * Re-derives this gym's subscription state and applies every visible
 * effect of it (banner, readonly mode, lock overlay). Called once on
 * shell render and again on every page navigation, so a state that
 * became due mid-session (e.g. a trial ending) is never stale for long.
 * @param {string} gymId
 * @returns {{sub:object, access:object}}
 */
export function refreshBillingStatus(gymId){
  const sub = getSubscription(gymId);
  const access = getSubscriptionAccess(sub.status);

  renderBanner(sub, access);
  renderLockOverlay(sub, access);

  const shell = document.querySelector(".owner-shell");
  if(shell){
    shell.classList.toggle("billing-readonly", access.dashboardReadOnly && !access.accountLocked);
  }

  return { sub, access };
}

function renderBanner(sub, access){
  const host = document.getElementById("ownerBillingBannerHost");
  if(!host) return;

  if(access.accountLocked || !access.banner || !BANNER_COPY[access.banner]){
    host.innerHTML = "";
    return;
  }

  const { type, text } = BANNER_COPY[access.banner](sub);
  host.innerHTML = `<div class="owner-billing-banner owner-billing-banner-${type}" role="status">${escapeHtml(text)}</div>`;
}

function renderLockOverlay(sub, access){
  const overlay = document.getElementById("ownerAccountLockOverlay");
  if(!overlay) return;

  if(!access.accountLocked){
    overlay.hidden = true;
    overlay.innerHTML = "";
    return;
  }

  const plan = getPlan(sub.planId);
  overlay.hidden = false;
  overlay.innerHTML = `
    <div class="owner-lock-card" role="alertdialog" aria-labelledby="ownerLockTitle">
      <div class="owner-plan-badge" style="background:rgba(230,72,63,0.15);color:var(--red);">Account locked</div>
      <h2 id="ownerLockTitle">Your GymBot QC account is disabled</h2>
      <p class="help-text" style="margin-top:0;">Your ${escapeHtml(plan.name)} subscription was suspended and then automatically disabled after an extended unpaid period. Your AI Receptionist and dashboard are unavailable until this is resolved.</p>
      <p class="help-text">Gym Owners can't reactivate a suspended or disabled account directly — contact GymBot QC support to sort out billing and get reactivated.</p>
      <button class="btn btn-ghost btn-sm" id="ownerLockLogoutBtn" type="button">Log out</button>
    </div>
  `;

  const logoutBtn = document.getElementById("ownerLockLogoutBtn");
  if(logoutBtn){
    logoutBtn.addEventListener("click", () => {
      logout();
      window.location.replace(ROUTES.LOGIN);
    });
  }
}

function formatDate(iso){
  if(!iso) return "\u2014";
  try{ return new Date(iso).toLocaleDateString(); }catch(err){ return "\u2014"; }
}
