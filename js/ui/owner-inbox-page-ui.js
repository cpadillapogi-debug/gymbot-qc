/* ============================================================
   GYMBOT QC — OWNER: INBOX PAGE
   Read + reply-status view over one gym's chat conversations —
   list on the left, transcript + take-over controls on the right.
   Mirrors owner-leads-page-ui.js's structure (cacheEls / init /
   refresh / render). Data layer is conversation-service.js.

   DATA SOURCE CAVEAT: conversation-service.js is currently
   localStorage-backed, not the real gymbot-qc-api /conversations
   endpoint — see that file's header comment for why (the widget
   that writes conversations has no authenticated session to call
   the real API with yet). This page reads whatever
   conversation-service.js returns, so once that swap happens this
   page needs no changes.
   ============================================================ */
import { escapeHtml } from "../utils.js";
import {
  getConversations, getConversationById,
  setHandledBy, setConversationStatus
} from "../services/conversation-service.js";
import { showToast } from "./toast-ui.js";

const ROLE_LABEL = { customer: "Customer", bot: "GymBot", staff: "You" };

let els = null;
let currentGymId = null;
let selectedConversationId = null;
let filters = { status: "", search: "" };

function cacheEls(){
  els = {
    statusFilter: document.getElementById("ownerInboxStatusFilter"),
    search: document.getElementById("ownerInboxSearch"),
    count: document.getElementById("ownerInboxCount"),
    list: document.getElementById("ownerInboxList"),
    detailEmpty: document.getElementById("ownerInboxDetailEmpty"),
    detailPanel: document.getElementById("ownerInboxDetailPanel"),
    detailName: document.getElementById("ownerInboxDetailName"),
    detailMeta: document.getElementById("ownerInboxDetailMeta"),
    thread: document.getElementById("ownerInboxThread"),
    handledToggle: document.getElementById("ownerInboxHandledToggle"),
    resolveBtn: document.getElementById("ownerInboxResolveBtn")
  };
}

/** @param {string} gymId */
export function initOwnerInboxPage(gymId){
  cacheEls();
  currentGymId = gymId;

  els.statusFilter.addEventListener("change", () => { filters.status = els.statusFilter.value; renderList(); });
  els.search.addEventListener("input", () => { filters.search = els.search.value; renderList(); });

  els.handledToggle.addEventListener("click", async () => {
    if(!selectedConversationId) return;
    const convo = getConversationById(currentGymId, selectedConversationId);
    if(!convo) return;
    const next = convo.handledBy === "ai" ? "staff" : "ai";
    const result = setHandledBy(currentGymId, selectedConversationId, next);
    if(result.ok){
      showToast(next === "staff" ? "You've taken over this conversation." : "Returned to AI.");
      refreshOwnerInboxPage();
    }else{
      showToast(result.reason || "Couldn't update this conversation.");
    }
  });

  els.resolveBtn.addEventListener("click", async () => {
    if(!selectedConversationId) return;
    const convo = getConversationById(currentGymId, selectedConversationId);
    if(!convo) return;
    const next = convo.status === "open" ? "resolved" : "open";
    const result = setConversationStatus(currentGymId, selectedConversationId, next);
    if(result.ok){
      showToast(next === "resolved" ? "Marked resolved." : "Reopened.");
      refreshOwnerInboxPage();
    }else{
      showToast(result.reason || "Couldn't update this conversation.");
    }
  });

  refreshOwnerInboxPage();
}

export function refreshOwnerInboxPage(){
  if(!els) cacheEls();
  renderList();
  if(selectedConversationId) renderDetail(getConversationById(currentGymId, selectedConversationId));
}

/* ---------- List ---------- */

function getFilteredConversations(){
  const searchTerm = filters.search.trim().toLowerCase();
  let list = getConversations(currentGymId, { status: filters.status || undefined });
  if(searchTerm){
    list = list.filter(c => {
      const haystack = `${c.customerName || ""} ${c.customerPhone || ""}`.toLowerCase();
      return haystack.includes(searchTerm);
    });
  }
  return list;
}

function renderList(){
  const conversations = getFilteredConversations();
  const total = getConversations(currentGymId).length;
  els.count.textContent = filters.search || filters.status
    ? `${conversations.length} of ${total} conversation${total === 1 ? "" : "s"}`
    : `${total} conversation${total === 1 ? "" : "s"}`;

  if(total === 0){
    els.list.innerHTML = `<div class="empty-state">No conversations yet — once a customer messages your AI Receptionist, it shows up here.</div>`;
    return;
  }
  if(conversations.length === 0){
    els.list.innerHTML = `<div class="empty-state">No conversations match your search/filter.</div>`;
    return;
  }

  els.list.innerHTML = conversations.map(rowHtml).join("");
  els.list.querySelectorAll("[data-open-convo]").forEach(row => {
    row.addEventListener("click", () => openConversation(row.getAttribute("data-open-convo")));
  });
}

function lastMessagePreview(convo){
  const last = (convo.messages || [])[convo.messages.length - 1];
  if(!last) return "No messages yet.";
  const prefix = last.role === "customer" ? "" : `${ROLE_LABEL[last.role] || last.role}: `;
  return prefix + last.text;
}

function rowHtml(convo){
  const isSelected = convo.id === selectedConversationId;
  const isOpen = convo.status === "open";
  return `
    <button type="button" class="owner-inbox-row${isSelected ? " owner-inbox-row-selected" : ""}" data-open-convo="${escapeHtml(convo.id)}">
      <div class="owner-inbox-row-top">
        <span class="owner-inbox-row-name">${escapeHtml(convo.customerName || "Anonymous visitor")}</span>
        <span class="owner-inbox-badge ${isOpen ? "owner-inbox-badge-open" : "owner-inbox-badge-resolved"}">${isOpen ? "Open" : "Resolved"}</span>
      </div>
      <div class="owner-inbox-row-preview">${escapeHtml(lastMessagePreview(convo))}</div>
      <div class="owner-inbox-row-meta">${escapeHtml(convo.handledBy === "staff" ? "You're handling" : "AI handling")} · ${escapeHtml(formatDateTime(convo.lastMessageAt))}</div>
    </button>
  `;
}

/* ---------- Detail / transcript ---------- */

function openConversation(conversationId){
  selectedConversationId = conversationId;
  renderList();
  renderDetail(getConversationById(currentGymId, conversationId));
}

function formatDateTime(iso){
  if(!iso) return "—";
  try{ return new Date(iso).toLocaleString(); }catch(err){ return "—"; }
}

function renderDetail(convo){
  if(!convo){
    selectedConversationId = null;
    els.detailEmpty.hidden = false;
    els.detailPanel.hidden = true;
    return;
  }

  els.detailEmpty.hidden = true;
  els.detailPanel.hidden = false;
  els.detailName.textContent = convo.customerName || "Anonymous visitor";
  els.detailMeta.textContent = `${convo.customerPhone || "No phone captured"} · Started ${formatDateTime(convo.createdAt)}`;

  els.thread.innerHTML = (convo.messages || []).map(msgHtml).join("")
    || `<div class="empty-state">No messages in this conversation yet.</div>`;
  els.thread.scrollTop = els.thread.scrollHeight;

  els.handledToggle.textContent = convo.handledBy === "ai" ? "Take over" : "Return to AI";
  els.resolveBtn.textContent = convo.status === "open" ? "Mark resolved" : "Reopen";
}

function msgHtml(msg){
  const roleClass = msg.role === "customer" ? "owner-inbox-msg-customer" : "owner-inbox-msg-us";
  return `
    <div class="owner-inbox-msg ${roleClass}">
      <div class="owner-inbox-msg-role">${escapeHtml(ROLE_LABEL[msg.role] || msg.role)}</div>
      <div class="owner-inbox-msg-text">${escapeHtml(msg.text)}</div>
      <div class="owner-inbox-msg-time">${escapeHtml(formatDateTime(msg.createdAt))}</div>
    </div>
  `;
}
