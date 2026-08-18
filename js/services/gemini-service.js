/* ============================================================
   GYMBOT QC — GEMINI SERVICE (Gemini fully disabled, Aug 2026)
   PATCH: this module no longer calls the Gemini API or the
   Cloudflare proxy at all. GymBot QC now answers entirely from:
     1. The gym owner's own saved FAQs (Business Settings)
     2. The built-in generic FAQ list (faq-response-service.js)
     3. A plain fallback message if neither matches
   This removes any dependency on an API key, a working proxy,
   or Google's model availability — nothing here makes a network
   call. The original Gemini/proxy code is kept below but is now
   unreachable (GEMINI_DISABLED short-circuits before it), in case
   you ever want to re-enable it later by flipping that flag back
   to false.

   Typed reasons still returned when nothing matches:
   "no_faq_match" (nothing in owner FAQs or the generic list
   covered this message) — chat-ui.js turns this into the normal
   customer-safe fallback reply via fallback-response-service.js.
   ============================================================ */
import { CONFIG } from "../config.js";
import { clampText, delay } from "../utils.js";
import { loadApiKey } from "./api-key-service.js";
import { loadGymInfo, buildSystemPrompt } from "./gym-info-service.js";
import { isOnline } from "./connectivity-service.js";
import { getDevAiConfig, logSystemEvent } from "./dev-console-service.js";
import { SYSTEM_LOG_LEVELS, SYSTEM_LOG_CATEGORIES } from "../config.js";
import { matchFaqIntent, matchOwnerFaq, logUnansweredQuestion } from "./faq-response-service.js";

// PATCH: flip to false to re-enable the Gemini/proxy call path below for
// anything the FAQ lists don't cover. Currently forced true — no Gemini
// calls happen anywhere in this app while this is true.
const GEMINI_DISABLED = true;

// Reasons worth retrying with backoff — everything else is either
// permanent (bad key) or the customer's own connection (offline),
// where retrying immediately can't help.
const RETRYABLE_REASONS = new Set(["timeout", "network_error", "server_error"]);

/**
 * @param {string} userMessage
 * @param {{role:'user'|'bot', text:string}[]} history
 * @param {string} [memorySummary] optional "don't re-ask" block from conversation-memory-service.js
 * @param {string} [gymInfoOverride] Phase 12: per-gym profile text (see ai-profile-service.js's
 *   buildProfileText) for the real per-gym widget. Falls back to the single global demo blob
 *   (gym-info-service.js) when omitted, so the index.html sales demo is unaffected.
 * @param {{question:string, answer:string}[]} [ownerFaqs] this gym's own saved FAQ
 *   pairs from Business Settings — checked before the generic FAQ list / Gemini.
 * @param {string} [gymId] PATCH (#6): this gym's id, used only to log a message
 *   here when nothing matched — see faq-response-service.js's logUnansweredQuestion.
 *   Omit for the sales-demo widget (index.html), which has no real gymId.
 * @returns {Promise<{ok:boolean, text?:string, reason?:string}>}
 */
export async function callGemini(userMessage, history, memorySummary, gymInfoOverride, ownerFaqs, gymId){
  // Owner's own FAQs first, then the generic list — no API call, no key
  // needed, no "model retired" surprises.
  const ownerFaqAnswer = matchOwnerFaq(userMessage, ownerFaqs);
  if(ownerFaqAnswer){
    return { ok:true, text: ownerFaqAnswer };
  }
  const faqAnswer = matchFaqIntent(userMessage);
  if(faqAnswer){
    return { ok:true, text: faqAnswer };
  }

  // PATCH (#6): nothing matched — log it against this gym so the owner
  // can see what customers are actually asking that isn't covered yet.
  if(gymId){
    logUnansweredQuestion(gymId, userMessage);
  }

  if(GEMINI_DISABLED){
    // Nothing matched and Gemini is off — let chat-ui.js show the normal
    // customer-safe fallback message instead of calling any API.
    return { ok:false, reason:"no_faq_match" };
  }

  const apiKey = loadApiKey().trim();
  if(!apiKey){
    return { ok:false, reason:"no_key" };
  }
  if(!isOnline()){
    return { ok:false, reason:"offline" };
  }

  const gymInfo = gymInfoOverride !== undefined ? gymInfoOverride : loadGymInfo();
  const systemPrompt = buildSystemPrompt(gymInfo, memorySummary);
  const recentHistory = history.slice(-CONFIG.GEMINI_HISTORY_WINDOW).map(m => ({
    role: m.role === "bot" ? "model" : "user",
    parts: [{ text: m.text }]
  }));
  const contents = recentHistory.concat([{ role:"user", parts:[{ text: userMessage }] }]);

  // Phase 9: Developer Console overrides (model/temperature/tokens/timeout/
  // retries) — falls back to the same CONFIG constants as before when the
  // Developer hasn't saved anything, so existing behavior is unchanged.
  const devConfig = getDevAiConfig();
  const maxRetries = devConfig.retryAttempts;

  let lastResult = null;
  for(let attempt = 0; attempt <= maxRetries; attempt++){
    if(attempt > 0){
      await delay(CONFIG.GEMINI_RETRY_BASE_MS * Math.pow(2, attempt - 1));
      if(!isOnline()) return { ok:false, reason:"offline" };
    }
    lastResult = await attemptGemini(apiKey, systemPrompt, contents, devConfig.timeoutMs, devConfig);
    if(lastResult.ok || !RETRYABLE_REASONS.has(lastResult.reason)) break;
  }
  if(!lastResult.ok){
    logSystemEvent({ level: SYSTEM_LOG_LEVELS.ERROR, category: SYSTEM_LOG_CATEGORIES.AI_FAILURE, message: `Gemini call failed: ${lastResult.reason}` });
  }
  return lastResult;
}

/** @returns {Promise<{ok:boolean, text?:string, reason?:string}>} single attempt, never throws
 *  NOTE: unreachable while GEMINI_DISABLED is true (kept for future re-enable). */
async function attemptGemini(apiKey, systemPrompt, contents, timeoutMs, devConfig){
  const model = (devConfig && devConfig.model) || CONFIG.GEMINI_MODEL;
  const temperature = devConfig ? devConfig.temperature : 0.7;
  const maxOutputTokens = devConfig ? devConfig.maxOutputTokens : 300;

  if(CONFIG.AI_PROXY_URL){
    return attemptGeminiViaProxy({ model, temperature, maxOutputTokens, systemPrompt, contents, timeoutMs });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try{
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature, maxOutputTokens }
      })
    });
    clearTimeout(timeoutId);

    if(response.status === 401 || response.status === 403) return { ok:false, reason:"invalid_key" };
    if(response.status === 429) return { ok:false, reason:"rate_limited" };
    if(response.status >= 500) return { ok:false, reason:"server_error" };
    if(!response.ok) return { ok:false, reason:"server_error" };

    const data = await response.json();
    const candidate = data && data.candidates && data.candidates[0];
    const parts = candidate && candidate.content && candidate.content.parts;
    const text = parts && parts[0] && typeof parts[0].text === "string" ? parts[0].text.trim() : "";

    if(!text) return { ok:false, reason:"empty_reply" };
    return { ok:true, text: clampText(text, CONFIG.GEMINI_REPLY_MAX_LEN) };

  }catch(err){
    clearTimeout(timeoutId);
    if(err && err.name === "AbortError") return { ok:false, reason:"timeout" };
    return { ok:false, reason:"network_error" };
  }
}

/**
 * NOTE: unreachable while GEMINI_DISABLED is true (kept for future re-enable).
 */
async function attemptGeminiViaProxy({ model, temperature, maxOutputTokens, systemPrompt, contents, timeoutMs }){
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try{
    const response = await fetch(CONFIG.AI_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ model, temperature, maxOutputTokens, systemPrompt, contents })
    });
    clearTimeout(timeoutId);

    if(response.status === 401 || response.status === 403) return { ok:false, reason:"invalid_key" };
    if(response.status === 429) return { ok:false, reason:"rate_limited" };
    if(response.status >= 500) return { ok:false, reason:"server_error" };
    if(!response.ok) return { ok:false, reason:"server_error" };

    const data = await response.json();
    const text = typeof data.text === "string" ? data.text.trim() : "";
    if(!text) return { ok:false, reason:"empty_reply" };
    return { ok:true, text: clampText(text, CONFIG.GEMINI_REPLY_MAX_LEN) };

  }catch(err){
    clearTimeout(timeoutId);
    if(err && err.name === "AbortError") return { ok:false, reason:"timeout" };
    return { ok:false, reason:"network_error" };
  }
}

/**
 * Manual "Test connection" check for the Setup panel.
 * NOTE: with GEMINI_DISABLED true this will report reason "no_faq_match"
 * for any test message, since no Gemini call happens — that's expected.
 * @param {string} [apiKeyOverride] test an unsaved key straight from the input
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function testGeminiConnection(apiKeyOverride){
  if(GEMINI_DISABLED){
    return { ok:false, reason:"no_faq_match" };
  }
  const apiKey = (apiKeyOverride !== undefined ? apiKeyOverride : loadApiKey()).trim();
  if(!apiKey) return { ok:false, reason:"no_key" };
  if(!isOnline()) return { ok:false, reason:"offline" };

  const result = await attemptGemini(
    apiKey,
    "You are a connection test. Reply with the single word: OK",
    [{ role:"user", parts:[{ text:"ping" }] }],
    CONFIG.GEMINI_TEST_TIMEOUT_MS
  );
  return { ok: result.ok, reason: result.ok ? undefined : result.reason };
}

/** Customer-safe, non-technical copy for each typed reason — used for the
 *  one-time system note shown before a fallback reply, never as the reply itself. */
export const FAILURE_REASON_LABEL = Object.freeze({
  no_key: "Setup needed: no API key saved yet.",
  invalid_key: "The saved API key looks invalid or expired.",
  rate_limited: "Getting a lot of messages right now.",
  timeout: "The AI took too long to answer.",
  offline: "Looks like you're offline.",
  network_error: "Couldn't reach the AI service.",
  server_error: "The AI service returned an error.",
  empty_reply: "The AI didn't return a reply.",
  no_faq_match: "That wasn't something in our common questions list."
});

export function detectsBookingIntent(text){
  return /trial|book|schedule|visit|punta|pupunta|magpa-?trial/i.test(text);
}
