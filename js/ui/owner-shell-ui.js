/* ============================================================
   GYMBOT QC — OWNER SHELL UI (Phase 3)
   Sidebar + topbar chrome and the hash-based page router for
   owner-dashboard.html. This is the ONLY module that wires the
   six owner pages together — same composition-root pattern as
   main.js. Individual page modules don't know about each other.

   PERMISSION BOUNDARY: this file, and everything it imports,
   must never import tenant-service.js's getAllGymsForDeveloper,
   gemini-service.js, or api-key-service.js. A Gym Owner session
   only ever reads/writes its own gymId — see requireOwnerSession().
   ============================================================ */
import { ROLES, ROUTES } from "../config.js";
import { escapeHtml } from "../utils.js";
import { requireRole } from "../auth-guard.js";
import { getCurrentUser, logout } from "../services/auth-service.js";
import { getGymById } from "../services/tenant-service.js";
import { initThemeToggle } from "./theme-toggle-ui.js";
import { initOwnerDashboardPage, refreshOwnerDashboardPage } from "./owner-dashboard-page-ui.js";
import { initOwnerLeadsPage, refreshOwnerLeadsPage } from "./owner-leads-page-ui.js";
import { renderOwnerAiPage } from "./owner-ai-page-ui.js";
import { initOwnerSettingsPage } from "./owner-settings-page-ui.js";
import { initOwnerLeadRoutingPage } from "./owner-lead-routing-ui.js";
import { renderOwnerSubscriptionPage } from "./owner-subscription-page-ui.js";
import { renderOwnerHelpPage } from "./owner-help-page-ui.js";
import { refreshBillingStatus } from "./owner-billing-banner-ui.js";
import { initNotificationBell, refreshNotificationBell } from "./notification-bell-ui.js";

const PAGES = Object.freeze(["dashboard", "leads", "ai-receptionist", "settings", "subscription", "help"]);
const DEFAULT_PAGE = "dashboard";
const PAGE_LABELS = Object.freeze({
  dashboard: "Dashboard",
  leads: "Leads",
  "ai-receptionist": "AI Receptionist",
  settings: "Business Settings",
  subscription: "Subscription",
  help: "Help & Support"
});

/** Route guard for this page: Gym Owner role required, redirects otherwise. */
export async function requireOwnerSession(){
  return requireRole(ROLES.GYM_OWNER);
}

let currentSession = null;
let currentGym = null;

export async function renderOwnerShell(session){
  const gym = session.gymId ? getGymById(session.gymId) : null;
  currentSession = session;
  currentGym = gym;

  document.getElementById("ownerGymNameTop").textContent = gym ? gym.name : "Your Gym";

  if(session.isDevPreview){
    // Developer preview (Phase 11): no Gym Owner user is logged in here —
    // the real session in this tab is still the Developer's, untouched.
    // "Log out" would be misleading (there's no owner session to end), so
    // it closes the preview instead. See main-owner-dashboard.js.
    document.getElementById("ownerUserEmail").textContent = "Developer preview";
    const logoutBtn = document.getElementById("ownerLogoutBtn");
    logoutBtn.textContent = "Close preview";
    logoutBtn.addEventListener("click", () => {
      window.close();
      // window.close() only works on tabs opened via script (which this
      // one always is, from admin-gym-registry-ui.js / admin-dev-console-ui.js).
      // If it's a no-op (e.g. opened directly by URL), fall back to the
      // Developer dashboard instead of stranding the visitor.
      setTimeout(() => { window.location.href = ROUTES.DASHBOARD; }, 150);
    });
    renderDevPreviewBanner(gym);
  }else{
    const user = await getCurrentUser();
    document.getElementById("ownerUserEmail").textContent = user ? user.email : "";
    document.getElementById("ownerLogoutBtn").addEventListener("click", async () => {
      await logout();
      window.location.replace(ROUTES.LOGIN);
    });
  }

  initThemeToggle(document.getElementById("ownerThemeToggle"));
  wireMobileSidebar();
  wireNavLinks();

  // Pages that don't need per-visit refresh get set up once, up
  // front (their DOM stays alive — just hidden — while the shell
  // is open). Dashboard/Leads get an extra refresh on every visit
  // since their data can change.
  initOwnerDashboardPage(gym);
  initOwnerLeadsPage(session.gymId);
  initOwnerSettingsPage(session.gymId, { onSaved: () => renderOwnerAiPage(gym) });
  initOwnerLeadRoutingPage(session.gymId);
  refreshBillingStatus(session.gymId);
  renderOwnerAiPage(gym);
  renderOwnerSubscriptionPage(session.gymId);
  renderOwnerHelpPage();
  initNotificationBell({ audience: "owner", gymId: session.gymId, hostId: "ownerNotifBellHost" });

  window.addEventListener("hashchange", () => showPage(currentHashPage()));
  showPage(currentHashPage());
}

/** Phase 11: banner shown for the whole life of a Developer preview tab.
 *  Kept visually distinct (amber, top of page, above the billing banner)
 *  so it can never be mistaken for a real Gym Owner session. */
function renderDevPreviewBanner(gym){
  const host = document.getElementById("ownerDevPreviewBannerHost");
  if(!host) return;
  host.innerHTML = `
    <div class="owner-billing-banner owner-billing-banner-warning" role="status">
      🔎 Developer preview — viewing ${gym ? escapeHtml(gym.name) : "this gym"}'s dashboard as its owner would see it.
      Changes made here are saved for real. <a href="${ROUTES.DASHBOARD}" style="text-decoration:underline;">Back to Developer Console</a>
    </div>
  `;
}

function wireMobileSidebar(){
  const sidebar = document.getElementById("ownerSidebar");
  const menuBtn = document.getElementById("ownerMenuBtn");
  const scrim = document.getElementById("ownerSidebarScrim");
  if(!sidebar || !menuBtn || !scrim) return;

  const closeSidebar = () => {
    sidebar.classList.remove("open");
    scrim.classList.remove("show");
  };
  menuBtn.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    scrim.classList.toggle("show");
  });
  scrim.addEventListener("click", closeSidebar);
  // Keep it accessible from other handlers in this module.
  wireMobileSidebar._close = closeSidebar;
}

function wireNavLinks(){
  document.querySelectorAll(".owner-nav-link").forEach(link => {
    link.addEventListener("click", () => {
      if(typeof wireMobileSidebar._close === "function") wireMobileSidebar._close();
    });
  });
}

function currentHashPage(){
  const raw = (window.location.hash || "").replace("#", "");
  return PAGES.includes(raw) ? raw : DEFAULT_PAGE;
}

function showPage(page){
  document.querySelectorAll(".owner-page").forEach(sec => {
    sec.classList.toggle("active", sec.id === `page-${page}`);
  });
  document.querySelectorAll(".owner-nav-link").forEach(link => {
    link.classList.toggle("active", link.dataset.page === page);
  });
  document.title = `${PAGE_LABELS[page] || "Dashboard"} — GymBot QC`;

  if(page === "dashboard") refreshOwnerDashboardPage();
  if(page === "leads") refreshOwnerLeadsPage();

  // Billing status can become due purely from time passing (a trial
  // ending, a grace period lapsing) — re-derive it on every navigation,
  // not just once at shell load, so the banner/readonly/lock state
  // never goes stale for an owner who leaves the tab open.
  if(currentSession){
    refreshBillingStatus(currentSession.gymId);
    if(page === "ai-receptionist") renderOwnerAiPage(currentGym);
    if(page === "subscription") renderOwnerSubscriptionPage(currentSession.gymId);
    refreshNotificationBell();
  }
}
