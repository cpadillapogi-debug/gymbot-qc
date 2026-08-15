/* ============================================================
   GYMBOT QC — FALLBACK RESPONSE SERVICE (Phase 4)
   Rule-based replies answered straight from the configured gym
   info text, no AI call needed. Used whenever Gemini is down,
   times out, or the customer is offline — the customer should
   never see a raw error, just a slightly less clever reply.

   Strategy: the gym info blob is a loose "Label: value" list
   (see DEFAULT_GYM_INFO in config.js). We parse it into a
   label -> value map, then match the customer's message against
   a small set of category keyword groups. Each category tries a
   handful of label keywords against the parsed map; first hit
   wins. Anything unmatched gets an honest "I'll note this down"
   reply instead of a guess.

   Pure logic only — no DOM, no storage, no network.
   ============================================================ */

const CATEGORIES = [
  {
    id: "membership",
    intent: /magkano|presyo|price|rate|monthly|membership|fee/i,
    labelKeywords: ["membership", "monthly"],
    reply: v => `Monthly membership is ${v}. Gusto niyo po ba mag-book ng free trial para masubukan muna?`
  },
  {
    id: "walkin",
    intent: /walk-?in|per session|single session/i,
    labelKeywords: ["walk-in", "walk in"],
    reply: v => `Walk-in rate is ${v}. Pwede rin po kayo mag-avail ng free trial kung gusto niyo tryuhan muna.`
  },
  {
    id: "student",
    intent: /student|estudyante|discount/i,
    labelKeywords: ["student"],
    reply: v => `Meron po kaming student discount: ${v}. Bring a valid school ID lang po.`
  },
  {
    id: "hours",
    intent: /oras|hours|bukas|open|close|schedule ba kayo/i,
    labelKeywords: ["hours"],
    reply: v => `Our hours are ${v}.`
  },
  {
    id: "trainer",
    intent: /trainer|coach|personal training/i,
    labelKeywords: ["trainer"],
    reply: v => `Yes po, meron kaming trainers: ${v}.`
  },
  {
    id: "class",
    intent: /class|zumba|boxing|group/i,
    labelKeywords: ["class"],
    reply: v => `We have group classes: ${v}.`
  },
  {
    id: "payment",
    intent: /gcash|maya|bayad|payment|cash/i,
    labelKeywords: ["payment"],
    reply: v => `Payments accepted: ${v}.`
  },
  {
    id: "parking",
    intent: /parking|park/i,
    labelKeywords: ["parking"],
    reply: v => `Parking info: ${v}.`
  },
  {
    id: "trial",
    intent: /trial|book|schedule|visit|punta|pupunta|magpa-?trial/i,
    labelKeywords: ["free trial", "trial"],
    reply: v => `Yes po! ${v} — gusto niyo po ba mag-book na?`
  },
  {
    id: "location",
    intent: /saan|location|address|nasaan/i,
    labelKeywords: ["location"],
    reply: v => `We're located at ${v}.`
  }
];

const GENERIC_FALLBACK =
  "Sorry po, medyo may issue muna kami sa system namin ngayon. I'll note down your question and our staff will follow up shortly — pwede niyo po ba iwan ang contact number niyo?";

/**
 * @param {string} gymInfoText the freeform "Label: value" gym info blob
 * @returns {Record<string,string>} lowercased label -> value
 */
function parseGymInfo(gymInfoText){
  const map = {};
  String(gymInfoText || "").split("\n").forEach(line => {
    const idx = line.indexOf(":");
    if(idx === -1) return;
    const label = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if(label && value) map[label] = value;
  });
  return map;
}

function findValue(infoMap, keywords){
  const labels = Object.keys(infoMap);
  for(const kw of keywords){
    const hit = labels.find(l => l.includes(kw));
    if(hit) return infoMap[hit];
  }
  return null;
}

/**
 * @param {string} userMessage
 * @param {string} gymInfoText
 * @returns {string} a customer-safe reply — never a technical error
 */
export function getFallbackReply(userMessage, gymInfoText){
  const infoMap = parseGymInfo(gymInfoText);
  const text = String(userMessage || "");

  const category = CATEGORIES.find(c => c.intent.test(text));
  if(category){
    const value = findValue(infoMap, category.labelKeywords);
    if(value) return category.reply(value);
  }

  return GENERIC_FALLBACK;
}
