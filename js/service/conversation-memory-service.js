/* ============================================================
   GYMBOT QC — CONVERSATION MEMORY SERVICE (Phase 4)
   Lightweight, rule-based extraction of name / phone / preferred
   visit time / fitness goal from the customer's own chat
   messages, kept for the current session only (see state.js).
   No AI call, no storage — this only shapes what gets sent back
   to Gemini as context, so the bot stops re-asking for info the
   customer already gave.

   Deliberately simple regex/keyword matching, not NLP — good
   enough to catch "Ana here" or "09171234567" in a normal
   Taglish chat message. False negatives just mean the AI asks
   again, which is a fine fallback; false positives are the risk
   worth guarding against, so patterns stay conservative.

   Pure logic only — no DOM, no storage, no network.
   ============================================================ */

const PHONE_RE = /(?:\+63|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}/;

const NAME_INTRO_RE = /\b(?:i'?m|ako si|ako po si|this is|name ko ay|pangalan ko ay|my name is)\s+([A-Za-zÀ-ÿ.'-]{2,20}(?:\s+[A-Za-zÀ-ÿ.'-]{2,20}){0,2})/i;

const GOAL_PATTERNS = [
  { re: /weight\s*loss|magpapayat|pumayat|lose weight/i, value: "Weight loss" },
  { re: /muscle|bulk|magpalaki|lumaki|gain (?:mass|muscle)/i, value: "Muscle gain" },
  { re: /sports?\s*training|athlete|training para sa/i, value: "Sports training" },
  { re: /general fitness|fit lang|overall (?:health|fitness)|maging (?:fit|healthy)/i, value: "General fitness" }
];

const TIME_PATTERNS = [
  { re: /weekend|sat(?:urday)?|sun(?:day)?/i, value: "Weekend" },
  { re: /morning|umaga/i, value: "Weekday morning" },
  { re: /evening|night|gabi|hapon/i, value: "Weekday evening" }
];

/**
 * @param {string} text one customer message
 * @param {{name:?string, phone:?string, preferredTime:?string, goal:?string}} memory current memory
 * @returns {{name:?string, phone:?string, preferredTime:?string, goal:?string}} updated memory (never overwrites an already-known field with null)
 */
export function extractFromMessage(text, memory){
  const current = Object.assign({ name: null, phone: null, preferredTime: null, goal: null }, memory || {});
  if(typeof text !== "string" || !text.trim()) return current;

  const next = { ...current };

  if(!next.phone){
    const phoneMatch = text.match(PHONE_RE);
    if(phoneMatch) next.phone = phoneMatch[0].trim();
  }

  if(!next.name){
    const nameMatch = text.match(NAME_INTRO_RE);
    if(nameMatch) next.name = nameMatch[1].trim();
  }

  if(!next.goal){
    const goalHit = GOAL_PATTERNS.find(p => p.re.test(text));
    if(goalHit) next.goal = goalHit.value;
  }

  if(!next.preferredTime){
    const timeHit = TIME_PATTERNS.find(p => p.re.test(text));
    if(timeHit) next.preferredTime = timeHit.value;
  }

  return next;
}

/**
 * Builds a short instruction block fed back into the AI so it stops
 * re-asking for info it already has. Returns "" when nothing is known
 * yet (nothing to append to the prompt).
 * @param {{name:?string, phone:?string, preferredTime:?string, goal:?string}} memory
 * @returns {string}
 */
export function buildMemorySummary(memory){
  const m = memory || {};
  const known = [];
  if(m.name) known.push(`Name: ${m.name}`);
  if(m.phone) known.push(`Phone: ${m.phone}`);
  if(m.preferredTime) known.push(`Preferred visit time: ${m.preferredTime}`);
  if(m.goal) known.push(`Fitness goal: ${m.goal}`);

  if(known.length === 0) return "";

  return `You already know this about the customer from earlier in this chat — do NOT ask for it again, just use it naturally:\n${known.join("\n")}`;
}

/** @returns {boolean} true once enough is known to skip the booking form's matching fields */
export function hasMemoryFor(memory, field){
  return Boolean(memory && memory[field]);
}
