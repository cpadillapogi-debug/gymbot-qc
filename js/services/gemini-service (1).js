/* ============================================================
   GYMBOT QC — GEMINI SERVICE
   The only network call the app makes. Every failure path
   returns a typed `reason` instead of throwing or baking in
   customer-facing text — callers (chat-ui.js) decide what the
   customer sees, usually by handing off to
   fallback-response-service.js. This module never crashes and
   never needs a try/catch at the call site.

   Typed reasons: "no_key" | "invalid_key" | "rate_limited" |
   "timeout" | "offline" | "network_error" | "server_error" |
   "empty_reply"

   PATCH (debug session, Aug 2026): model name is now forced to a
   known-current Gemini API model ("gemini-2.0-flash") instead of
   trusting CONFIG.GEMINI_MODEL / the Dev Console override, because
   an outdated model string (e.g. "gemini-pro") was causing Google
   to 404, which the proxy was reporting as a 502 upstream_error.
   If you later confirm your CONFIG.GEMINI_MODEL / Dev Console
   model field is correct and current, you can remove the
   FORCED_MODEL override below and go back to trusting devConfig.
   ============================================================ */
import { CONFIG } from "../config.js";
import { clampText, delay } from "../utils.js";
import { loadApiKey } from "./api-key-service.js";
import { loadGymInfo, buildSystemPrompt } from "./gym-info-service.js";
import { isOnline } from "./connectivity-service.js";
import { getDevAiConfig, logSystemEvent } from "./dev-console-service.js";
import { SYSTEM_LOG_LEVELS, SYSTEM_LOG_CATEGORIES } from "../config.js";

// PATCH: known-good current model name, used instead of devConfig.model /
// CONFIG.GEMINI_MODEL until those are confirmed current. gemini-2.0-flash
// was retired by Google (confirmed via direct API test, Aug 2026) — Google's
// own error message pointed to gemini-3.6-flash as the replacement.
const FORCED_MODEL = "gemini-3.6-flash";

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
 * @returns {Promise<{ok:boolean, text?:string, reason?:string}>}
 */
export async function callGemini(userMessage, history, memorySummary, gymInfoOverride){
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

/** @returns {Promise<{ok:boolean, text?:string, reason?:string}>} single attempt, never throws */
async function attemptGemini(apiKey, systemPrompt, contents, timeoutMs, devConfig){
  // PATCH: force known-good model instead of trusting devConfig/CONFIG.
  const model = FORCED_MODEL;
  const temperature = devConfig ? devConfig.temperature : 0.7;
  const maxOutputTokens = devConfig ? devConfig.maxOutputTokens : 300;

  // Phase 15: proxy mode — no key leaves the browser at all, the proxy
  // holds its own server-side secret. See CONFIG.AI_PROXY_URL's comment.
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
 * Phase 15: same contract as the direct-call path above (identical typed
 * `reason`s), just POSTing to your own proxy instead of Google, and never
 * putting a key in the URL/body at all — the proxy attaches its own secret
 * server-side. See /server/gemini-proxy-worker.js for the proxy itself.
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
 * Manual "Test connection" check for the Setup panel — a minimal,
 * cheap request that only confirms the key + endpoint work, no
 * retries (the owner is watching, a fast answer matters more here).
 * @param {string} [apiKeyOverride] test an unsaved key straight from the input
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function testGeminiConnection(apiKeyOverride){
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
  empty_reply: "The AI didn't return a reply."
});

export function detectsBookingIntent(text){
  return /trial|book|schedule|visit|punta|pupunta|magpa-?trial/i.test(text);
}
