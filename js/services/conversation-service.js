/* ============================================================
   GYMBOT QC — CONVERSATION SERVICE
   Persistence for chat transcripts, mirroring leads-service.js's
   pattern: one flat array in storage, every record tagged with
   its own gymId, every exported function scoped to a gymId.

   WHY THIS IS LOCALSTORAGE, NOT THE REAL API YET: gymbot-qc-api
   already has a working /conversations backend (see
   src/routes/conversations.js), but every route there sits behind
   requireAuth — it only accepts a logged-in GYM OWNER session.
   The chat widget (main-widget.js) is used by anonymous customers
   with no session at all, so it has no way to call that API today.
   Until a public, gym-scoped endpoint exists (e.g. POST
   /widget/:gymId/conversations, rate-limited, no cookie required),
   this stays local — same as leads-service.js already does for
   captureLead(). Swapping this file for a real fetch-based one
   later won't require touching chat-ui.js again, since the
   exported function names/shapes below are what it calls.
   ============================================================ */
import { storage } from "../storage.js";
import { CONFIG } from "../config.js";
import { clampText, generateId, sanitizeRecords } from "../utils.js";

const MESSAGE_TEXT_MAX_LEN = 4000;
const HANDLED_BY_VALUES = ["ai", "staff"];
const STATUS_VALUES = ["open", "resolved"];
const ROLE_VALUES = ["customer", "bot", "staff"];

/* ---------- Raw storage (all gyms, flat array) ---------- */

function getAllConversationsRaw(){
  return sanitizeRecords(storage.getJSON("conversations", [], { requireArray: true }), ["id", "gymId"]);
}

function saveAllConversationsRaw(conversations){
  return storage.setJSON("conversations", conversations);
}

/** @returns {object[]} this gym's conversations, most recently active first */
export function getConversations(gymId, { status } = {}){
  if(!gymId) return [];
  let list = getAllConversationsRaw().filter(c => c && c.gymId === gymId);
  if(status && STATUS_VALUES.includes(status)){
    list = list.filter(c => c.status === status);
  }
  return list.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
}

export function getConversationById(gymId, conversationId){
  if(!gymId || !conversationId) return null;
  return getAllConversationsRaw().find(c => c && c.gymId === gymId && c.id === conversationId) || null;
}

function replaceConversation(updated){
  const all = getAllConversationsRaw();
  const idx = all.findIndex(c => c && c.id === updated.id && c.gymId === updated.gymId);
  if(idx === -1) return false;
  all[idx] = updated;
  return saveAllConversationsRaw(all);
}

/* ---------- Widget-side entry points ---------- */

/**
 * Starts a new conversation thread for a gym. Called once per widget
 * session (see chat-ui.js's initChatUI), not per message.
 * @param {{gymId:string, leadId?:string, customerName?:string, customerPhone?:string}} fields
 * @returns {object} the created conversation
 */
export function startConversation(fields){
  const f = fields || {};
  if(!f.gymId) throw new Error("startConversation: gymId is required.");

  const now = new Date().toISOString();
  const conversation = {
    id: generateId("convo"),
    gymId: f.gymId,
    leadId: f.leadId || null,
    customerName: clampText((f.customerName || "").trim(), CONFIG.LEAD_NAME_MAX_LEN),
    customerPhone: clampText((f.customerPhone || "").trim(), CONFIG.LEAD_PHONE_MAX_LEN),
    handledBy: "ai",
    status: "open",
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    messages: []
  };

  const all = getAllConversationsRaw();
  all.unshift(conversation);
  saveAllConversationsRaw(all);
  return conversation;
}

/**
 * Appends one message to an existing conversation, bumping lastMessageAt.
 * @param {string} gymId
 * @param {string} conversationId
 * @param {'customer'|'bot'|'staff'} role
 * @param {string} text
 * @returns {{ok:boolean, conversation?:object, reason?:string}}
 */
export function logMessage(gymId, conversationId, role, text){
  if(!ROLE_VALUES.includes(role)){
    return { ok:false, reason:"Not a valid message role." };
  }
  const conversation = getConversationById(gymId, conversationId);
  if(!conversation) return { ok:false, reason:"Conversation not found." };

  const now = new Date().toISOString();
  const message = {
    id: generateId("msg"),
    conversationId,
    role,
    text: clampText(String(text || ""), MESSAGE_TEXT_MAX_LEN),
    createdAt: now
  };

  const updated = Object.assign({}, conversation, {
    messages: (conversation.messages || []).concat([message]),
    updatedAt: now,
    lastMessageAt: now
  });
  replaceConversation(updated);
  return { ok:true, conversation: updated };
}

/** Links a conversation to a lead once booking-ui.js captures one
 *  mid-chat — lets the future owner inbox jump from thread to CRM record. */
export function linkConversationToLead(gymId, conversationId, leadId){
  const conversation = getConversationById(gymId, conversationId);
  if(!conversation) return { ok:false, reason:"Conversation not found." };

  const updated = Object.assign({}, conversation, { leadId, updatedAt: new Date().toISOString() });
  replaceConversation(updated);
  return { ok:true, conversation: updated };
}

/* ---------- Owner-side inbox actions (future owner-inbox-page-ui.js) ---------- */

/** @param {'ai'|'staff'} handledBy */
export function setHandledBy(gymId, conversationId, handledBy){
  if(!HANDLED_BY_VALUES.includes(handledBy)){
    return { ok:false, reason:"Not a valid handledBy value." };
  }
  const conversation = getConversationById(gymId, conversationId);
  if(!conversation) return { ok:false, reason:"Conversation not found." };

  const updated = Object.assign({}, conversation, { handledBy, updatedAt: new Date().toISOString() });
  replaceConversation(updated);
  return { ok:true, conversation: updated };
}

/** @param {'open'|'resolved'} status */
export function setConversationStatus(gymId, conversationId, status){
  if(!STATUS_VALUES.includes(status)){
    return { ok:false, reason:"Not a valid status." };
  }
  const conversation = getConversationById(gymId, conversationId);
  if(!conversation) return { ok:false, reason:"Conversation not found." };

  const updated = Object.assign({}, conversation, { status, updatedAt: new Date().toISOString() });
  replaceConversation(updated);
  return { ok:true, conversation: updated };
}

export function clearConversations(gymId){
  if(!gymId) return false;
  const remaining = getAllConversationsRaw().filter(c => !(c && c.gymId === gymId));
  return saveAllConversationsRaw(remaining);
}
