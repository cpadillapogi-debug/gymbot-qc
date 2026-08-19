/* ============================================================
   GYMBOT QC — GEMINI SERVICE
   PATCH (this session): re-enabled. GEMINI_DISABLED flipped back
   to false — the Cloudflare proxy at CONFIG.AI_PROXY_URL is live
   and holds the real key server-side (see
   docs/AI_PROXY_SETUP.md), so calling it is now safe: no key
   ever reaches the browser.

   Order of resolution, unchanged from the disabled period:
     1. The gym owner's own saved FAQs (Business Settings)
     2. The built-in generic FAQ list (faq-response-service.js)
     3. Gemini, via the proxy — only reached if neither above matched
     4. A plain fallback message if that also fails
   This keeps FAQ answers instant/free and only spends Gemini
   quota on questions nothing else covers.

   BUGFIX (this session): attemptGemini() used to require a
   locally-saved API key (loadApiKey()) before it would even
   check whether a proxy is configured. That's backwards for the
   real per-gym widget — an actual customer on their own phone has
   never saved anything into the Setup panel (that's the
   Developer's own single global key), so every real customer hit
   "no_key" and the proxy path — the entire point of which is
   "customers on their own devices get a response" — was
   unreachable. Now: when CONFIG.AI_PROXY_URL is set, no local key
   is required at all, since the proxy doesn't need one from the
   browser. The direct-to-Google fallback path (no proxy
   configured) still requires a locally-saved key, same as before.

   Typed reasons still returned when nothing matches/fails:
   "no_faq_match" (nothing in owner FAQs, the generic list, or
   Gemini covered this message) — chat-ui.js turns any failure
   reason into the normal customer-safe fallback reply via
   fallback-response-service.js.
   ============================================================ */
import { CONFIG } from "../config.js";
import { clampText, delay } from "../utils.js";
import { loadApiKey } from "./api-key-service.js";
import { loadGymInfo, buildSystemPrompt } from "./gym-info-service.js";
import { isOnline } from "./connectivity-service.js";
import { getDevAiConfig, logSystemEvent } from "./dev-console-service.js";
import { SYSTEM_LOG_LEVELS, SYSTEM_LOG_CATEGORIES } from "../config.js";
import { matchFaqIntent, matchOwnerFaq, logUnansweredQuestion } from "./faq-response-service.js";

// Flip to true to force everything back to FAQ-only with zero network
// calls (e.g. if the proxy or Gemini quota is ever having problems).
const GEMINI_DISABLED = false;

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

  // A local key is only required for the direct-to-Google fallback path.
  // When a proxy is configured, the browser never needs (or has) a key —
  // see this file's header for why the old unconditional check was a bug.
  const apiKey = loadApiKey().trim();
  if(!apiKey && !CONFIG.AI_PROXY_URL){
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
 *  */
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
 *
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
 * @param {string} [apiKeyOverride] test an unsaved key straight from the input
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function testGeminiConnection(apiKeyOverride){
  if(GEMINI_DISABLED){
    return { ok:false, reason:"no_faq_match" };
  }
  const apiKey = (apiKeyOverride !== undefined ? apiKeyOverride : loadApiKey()).trim();
  if(!apiKey && !CONFIG.AI_PROXY_URL) return { ok:false, reason:"no_key" };
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
