/* ============================================================
   GYMBOT QC — MASTER ADMIN SHELL UI (Phase 7)
   Sidebar + topbar chrome and the hash-based page router for
   dashboard.html — same composition-root pattern as
   owner-shell-ui.js is for owner-dashboard.html. This is the
   ONLY module that wires the Master Admin pages together.

   PERMISSION BOUNDARY: this file (and everything it imports —
   admin-registry-service.js, getAllGymsForDeveloper(),
   getAllUsersForDeveloper()) is only ever reached after
   requireRole(ROLES.DEVELOPER) passes in main-dashboard.js. None
   of it is imported from owner-facing code.
   ============================================================ */
import { ROUTES } from "../config.js";
import { getCurrentUser, logout } from "../services/auth-service.js";
import { initThemeToggle } from "./theme-toggle-ui.js";
import { renderAdminOverviewPage } from "./admin-overview-page-ui.js";
import { initAdminGymRegistryPage, refreshAdminGymRegistryPage } from "./admin-gym-registry-ui.js";
import { initAdminAuditLogPage, refreshAdminAuditLogPage } from "./admin-audit-log-ui.js";
import { initAdminDevConsolePage, refreshAdminDevConsolePage, wireHiddenDevConsoleTrigger } from "./admin-dev-console-ui.js";
import { initAdminBillingPage, refreshAdminBillingPage } from "./admin-billing-page-ui.js";
import { initNotificationBell, refreshNotificationBell } from "./notification-bell-ui.js";

const PAGES = Object.freeze(["overview", "gym-registry", "audit-log", "billing", "dev-console"]);
const DEFAULT_PAGE = "overview";
const PAGE_LABELS = Object.freeze({
  overview: "Overview",
  "gym-registry": "Gym Registry",
  "audit-log": "Audit Log",
  billing: "GCash Billing",
  "dev-console": "Developer Console"
});

export function renderAdminShell(session){
  const user = getCurrentUser();

  document.getElementById("shellUserEmail").textContent = user ? user.email : "";
  const roleBadgeEl = document.getElementById("shellRoleBadge");
  roleBadgeEl.textContent = "Master Admin";
  roleBadgeEl.classList.add("dev");

  document.getElementById("shellLogoutBtn").addEventListener("click", () => {
    logout();
    window.location.replace(ROUTES.LOGIN);
  });

  initThemeToggle(document.getElementById("shellThemeToggle"));
  wireMobileSidebar();
  wireNavLinks();

  renderAdminOverviewPage();
  initAdminGymRegistryPage();
  initAdminAuditLogPage();
  initAdminBillingPage();
  initAdminDevConsolePage();
  wireHiddenDevConsoleTrigger();
  initNotificationBell({ audience: "developer", hostId: "shellNotifBellHost" });

  window.addEventListener("hashchange", () => showPage(currentHashPage()));
  showPage(currentHashPage());
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
  document.title = `${PAGE_LABELS[page] || "Overview"} — Master Admin — GymBot QC`;

  // Both pages read live, cross-tenant data that other browser tabs
  // (or the passage of time, for subscription states) can change —
  // re-derive on every navigation, not just once at shell load.
  if(page === "overview") renderAdminOverviewPage();
  if(page === "gym-registry") refreshAdminGymRegistryPage();
  if(page === "audit-log") refreshAdminAuditLogPage();
  if(page === "billing") refreshAdminBillingPage();
  if(page === "dev-console") refreshAdminDevConsolePage();
  refreshNotificationBell();
}
