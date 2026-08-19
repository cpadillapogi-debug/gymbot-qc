/* ============================================================
   GYMBOT QC — CHAT UI
   Renders the chat log and drives the send flow. Doesn't know
   about leads or booking forms directly — it reports "this
   looks like a booking intent" through the onBookingIntent
   hook passed into initChatUI, so main.js decides what modules
   get wired together (keeps this module reusable / testable
   on its own).

   Phase 4: owns the Gemini -> fallback handoff. callGemini()
   only ever returns a typed reason (see gemini-service.js) —
   this module is where that becomes an actual customer-safe
   reply, via fallback-response-service.js, plus a one-time
   friendly system note so repeated failures don't spam the chat.

   PATCH (debug session, Aug 2026): added a getGymFaqs hook,
   parallel to the existing getGymInfo hook, so a gym owner's own
   Business Settings FAQ entries reach callGemini() and get
   checked before Gemini is ever called. See main-widget.js for
   where it's wired in.
   ============================================================ */
import { CONFIG } from "../config.js";
import { clampText } from "../utils.js";
import { appState } from "../state.js";
import { callGemini, detectsBookingIntent } from "../services/gemini-service.js";
import { loadGymInfo } from "../services/gym-info-service.js";
import { getFallbackReply } from "../services/fallback-response-service.js";
import { extractFromMessage, buildMemorySummary } from "../services/conversation-memory-service.js";
import { isOnline, onConnectivityChange, initConnectivityWatcher } from "../services/connectivity-service.js";
import { startConversation, logMessage } from "../services/conversation-service.js";

let els = null;
let onBookingIntent = null;
let getGymInfo = null; // Phase 12: () => string override for the real per-gym widget — see main-widget.js
let getGymFaqs = null; // PATCH: () => {question,answer}[] override for the real per-gym widget — see main-widget.js
let currentGymId = null; // PATCH (#6): this gym's id, for logging unanswered questions — see main-widget.js
let lastUserRow = null; // most recent user message row, for the "Seen" placeholder
let currentConversationId = null; // one conversation per widget session, started lazily on first message

function cacheEls(){
  els = {
    chatLog: document.getElementById("chatLog"),
    chatForm: document.getElementById("chatForm"),
    chatInput: document.getElementById("chatInput"),
    sendBtn: document.getElementById("sendBtn"),
    quickReplies: document.getElementById("quickReplies"),
    statusDot: document.getElementById("chatStatusDot"),
    statusText: document.getElementById("chatStatusText")
  };
}

function formatTime(date){
  try{
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }catch(err){
    return "";
  }
}

/**
 * @param {'user'|'bot'|'system'} role
 * @param {string} text
 * @returns {HTMLElement} the row wrapper (so callers like sendUserMessage can mark it "Seen" later)
 */
export function appendMessage(role, text){
  const row = document.createElement("div");
  row.className = "msg-row msg-row-" + role;

  const bubble = document.createElement("div");
  bubble.className = "msg " + (role === "user" ? "msg-user" : role === "system" ? "msg-system" : "msg-bot");
  bubble.textContent = text; // textContent, never innerHTML, for user/AI text
  row.appendChild(bubble);

  if(role !== "system"){
    const meta = document.createElement("div");
    meta.className = "msg-meta";
    meta.textContent = formatTime(new Date());
    row.appendChild(meta);
  }

  els.chatLog.appendChild(row);
  scrollChatToBottom();
  return row;
}

/** Appends " · Seen" to a previously-sent user row's timestamp, Messenger-style. */
function markSeen(userRow){
  if(!userRow) return;
  const meta = userRow.querySelector(".msg-meta");
  if(meta && !meta.classList.contains("seen")){
    meta.textContent = meta.textContent + " · Seen";
    meta.classList.add("seen");
  }
}

export function appendNode(node){
  els.chatLog.appendChild(node);
  scrollChatToBottom();
}

export function showTypingIndicator(){
  const div = document.createElement("div");
  div.className = "msg msg-typing";
  div.id = "typingIndicator";
  div.innerHTML = '<span class="typing-dots" aria-label="GymBot is typing"><span></span><span></span><span></span></span>';
  els.chatLog.appendChild(div);
  scrollChatToBottom();
}

export function removeTypingIndicator(){
  const el = document.getElementById("typingIndicator");
  if(el) el.remove();
}

export function scrollChatToBottom(){
  // Preserve smooth UX without fighting the user if they've scrolled up to read.
  const nearBottom = els.chatLog.scrollHeight - els.chatLog.scrollTop - els.chatLog.clientHeight < 120;
  if(nearBottom){
    els.chatLog.scrollTop = els.chatLog.scrollHeight;
  }
}

function setHeaderStatus(online){
  if(!els.statusDot || !els.statusText) return;
  els.statusDot.classList.toggle("status-dot-offline", !online);
  els.statusText.classList.toggle("status-dot-offline", !online);
  els.statusText.textContent = online ? "Active now" : "Offline — replies may be delayed";
}

/** Resolves what the bot actually says for a failed Gemini call, and
 *  shows the one-time "having trouble" note the first time it happens. */
function resolveFallbackReply(userText, reason){
  if(!appState.get("fallbackNoticeShown")){
    appendMessage("system", "Having a little trouble connecting to our AI right now — here's what I can tell you:");
    appState.set({ fallbackNoticeShown: true });
  }
  const gymInfo = typeof getGymInfo === "function" ? getGymInfo() : loadGymInfo();
  return getFallbackReply(userText, gymInfo);
}

export async function sendUserMessage(rawText){
  const text = clampText((rawText || "").trim(), CONFIG.CHAT_MESSAGE_MAX_LEN);
  if(!text || appState.get("isWaitingForReply")) return; // guard: empty input or already sending

  appState.set({ isWaitingForReply: true });
  if(els.sendBtn) els.sendBtn.disabled = true;

  // Everything below is wrapped in try/finally: callGemini() itself is
  // documented to never throw, but conversation-memory parsing, DOM
  // node creation, and appState updates all run in between. Without
  // this guard, any one unexpected error here would leave
  // isWaitingForReply stuck true and the send button disabled forever,
  // with no recovery short of a page reload.
  try{
    // Mark the previous user message "Seen" now that a new one is coming in —
    // mirrors how Messenger only ever shows Seen under the latest message.
    markSeen(lastUserRow);
    lastUserRow = appendMessage("user", text);

    // Lazily start the conversation thread on the first message rather than
    // on widget load — avoids logging empty threads for visitors who open
    // the widget but never type anything.
    if(currentGymId && !currentConversationId){
      currentConversationId = startConversation({ gymId: currentGymId }).id;
    }
    if(currentGymId && currentConversationId){
      logMessage(currentGymId, currentConversationId, "customer", text);
    }

    const history = appState.get("conversationHistory").concat([{ role:"user", text }]);
    const memory = extractFromMessage(text, appState.get("conversationMemory"));
    appState.set({ conversationHistory: history, conversationMemory: memory });
    if(els.chatInput) els.chatInput.value = "";

    showTypingIndicator();
    const gymInfo = typeof getGymInfo === "function" ? getGymInfo() : undefined;
    const gymFaqs = typeof getGymFaqs === "function" ? getGymFaqs() : undefined;
    const result = await callGemini(text, history, buildMemorySummary(memory), gymInfo, gymFaqs, currentGymId);
    removeTypingIndicator();

    const replyText = result.ok ? result.text : resolveFallbackReply(text, result.reason);
    appendMessage("bot", replyText);
    markSeen(lastUserRow);
    appState.set({ conversationHistory: appState.get("conversationHistory").concat([{ role:"bot", text: replyText }]) });
    if(currentGymId && currentConversationId){
      logMessage(currentGymId, currentConversationId, "bot", replyText);
    }

    if(detectsBookingIntent(text) && typeof onBookingIntent === "function"){
      onBookingIntent();
    }
  }catch(err){
    removeTypingIndicator();
    appendMessage("system", "Something went wrong sending that — please try again.");
    console.warn("[chat-ui] sendUserMessage failed", err);
  }finally{
    appState.set({ isWaitingForReply: false });
    if(els.sendBtn) els.sendBtn.disabled = false;
  }
  if(els.chatInput) els.chatInput.focus();
}

/**
 * @param {{onBookingIntent?: Function, getGymInfo?: Function, getGymFaqs?: Function}} [hooks]
 *   getGymInfo (Phase 12): () => string, returns this specific gym's profile
 *   text instead of the single global demo blob. See main-widget.js.
 *   getGymFaqs (PATCH): () => {question,answer}[], returns this specific
 *   gym's own saved FAQ pairs from Business Settings. See main-widget.js.
 *   gymId (PATCH #6): string, this gym's id, used only to log unanswered
 *   questions. See main-widget.js / faq-response-service.js.
 */
export function initChatUI(hooks = {}){
  cacheEls();
  onBookingIntent = hooks.onBookingIntent || null;
  getGymInfo = hooks.getGymInfo || null;
  getGymFaqs = hooks.getGymFaqs || null;
  currentGymId = hooks.gymId || null;

  els.chatForm.addEventListener("submit", e => {
    e.preventDefault();
    sendUserMessage(els.chatInput.value);
  });

  els.quickReplies.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if(!chip) return;
    sendUserMessage(chip.getAttribute("data-msg") || "");
  });

  initConnectivityWatcher();
  setHeaderStatus(isOnline());
  onConnectivityChange(online => {
    appState.set({ isOnline: online });
    setHeaderStatus(online);
  });
}
