/* ============================================================
   GYMBOT QC — NOTIFICATION BELL (Phase 10)
   Small shared topbar widget for both dashboards — a bell
   button with an unread-count badge that opens a dropdown list.
   Same component used by owner-dashboard.html (audience:"owner")
   and dashboard.html (audience:"developer"); which list it reads
   is the only thing that differs, via notification-service.js.

   Deliberately minimal: no polling, no push — it re-derives the
   list on init and whenever refreshNotificationBell() is called
   (shell page-navigation, same "re-derive on every navigation"
   pattern owner-billing-banner-ui.js already uses for billing
   status), plus once when the dropdown itself is opened.
   ============================================================ */
import { escapeHtml } from "../utils.js";
import {
  getOwnerNotifications, getDeveloperNotifications,
  getUnreadCount, markNotificationsRead
} from "../services/notification-service.js";

let currentGetList = () => [];
let currentHostId = null;

/**
 * @param {{audience:"owner"|"developer", gymId?:string, hostId:string}} opts
 */
export function initNotificationBell({ audience, gymId, hostId }){
  currentHostId = hostId;
  currentGetList = audience === "developer"
    ? () => getDeveloperNotifications()
    : () => getOwnerNotifications(gymId);

  const host = document.getElementById(hostId);
  if(!host) return;

  host.innerHTML = `
    <div class="notif-bell-wrap">
      <button class="btn btn-ghost btn-sm notif-bell-btn" id="notifBellBtn" type="button" aria-label="Notifications">
        🔔<span class="notif-badge" id="notifBellBadge" hidden></span>
      </button>
      <div class="notif-panel" id="notifBellPanel" hidden></div>
    </div>
  `;

  document.getElementById("notifBellBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const panel = document.getElementById("notifBellPanel");
    const opening = panel.hidden;
    panel.hidden = !opening;
    if(opening) openPanel();
  });

  document.addEventListener("click", (e) => {
    const panel = document.getElementById("notifBellPanel");
    const host2 = document.getElementById(currentHostId);
    if(panel && !panel.hidden && host2 && !host2.contains(e.target)){
      panel.hidden = true;
    }
  });

  renderBadge();
}

/** Re-derives the unread badge count. Call on every page navigation —
 *  the underlying list can change from another action in the same
 *  session (a payment just got approved, etc.). Does not re-open or
 *  re-render the dropdown itself if it's closed. */
export function refreshNotificationBell(){
  renderBadge();
}

function renderBadge(){
  if(!currentHostId) return;
  const badge = document.getElementById("notifBellBadge");
  if(!badge) return;
  const count = getUnreadCount(currentGetList());
  badge.hidden = count === 0;
  badge.textContent = count > 9 ? "9+" : String(count);
}

function openPanel(){
  const panel = document.getElementById("notifBellPanel");
  if(!panel) return;
  const list = currentGetList().slice(0, 20);

  if(list.length === 0){
    panel.innerHTML = `<div class="notif-empty">No notifications yet.</div>`;
  }else{
    panel.innerHTML = `
      <div class="notif-panel-head">
        <span>Notifications</span>
        <button class="owner-link-btn" id="notifMarkAllReadBtn" type="button">Mark all read</button>
      </div>
      ${list.map(renderNotifItem).join("")}
    `;
    document.getElementById("notifMarkAllReadBtn").addEventListener("click", () => {
      markNotificationsRead(list.map(n => n.id));
      openPanel();
      renderBadge();
    });
  }

  // Opening the panel is also treated as "seen" — mark everything
  // currently visible as read, same as most notification UIs.
  const unreadIds = list.filter(n => !n.read).map(n => n.id);
  if(unreadIds.length > 0){
    markNotificationsRead(unreadIds);
    renderBadge();
  }
}

function renderNotifItem(n){
  return `
    <div class="notif-item ${n.read ? "" : "unread"}">
      <div class="notif-item-title">${escapeHtml(n.title)}</div>
      <div class="notif-item-message">${escapeHtml(n.message)}</div>
      <div class="notif-item-meta">${formatDate(n.createdAt)}</div>
    </div>
  `;
}

function formatDate(iso){
  if(!iso) return "\u2014";
  try{ return new Date(iso).toLocaleString(); }catch(err){ return "\u2014"; }
}
