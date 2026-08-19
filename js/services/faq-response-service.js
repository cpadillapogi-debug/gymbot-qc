/* ============================================================
   GYMBOT QC — FAQ RESPONSE SERVICE (v2 — Gemini-independent)
   Answers common gym questions from a fixed intent -> answer
   map. No API key, no proxy, no per-request cost, no "model
   retired" surprises, no network call at all.

   HOW TO EDIT ANSWERS (for gym owners / non-coders):
   Scroll down to the ANSWERS object. Each line is
   "intentName: `Your answer text here`,". Just change the text
   between the backticks ` ` — don't touch anything else on the
   line (commas, backticks, intent names).

   HOW MATCHING WORKS:
   1. STAFF_ESCALATION_KEYWORDS are checked FIRST, before anything
      else — emergencies, injuries, complaints, billing disputes,
      lost items, etc. never get a guessed FAQ answer; they always
      route to the escalation message. This is deliberate: a wrong
      guessed answer here is worse than admitting the bot can't help.
   2. AMBIGUOUS_PRICE_KEYWORDS are checked next — a bare "magkano?"
      / "hm?" / "how much?" with nothing else specific said doesn't
      guess which price the customer means; it asks them to clarify
      (membership vs walk-in vs PT), same as a real receptionist would.
   3. Then INTENT_KEYWORDS is checked in order — first matching
      intent wins, so more specific/rarer intents are listed above
      more common/generic ones on purpose. Don't reorder carelessly.

   If nothing matches, matchFaqIntent() returns null and the caller
   (gemini-service.js) shows the normal "let me have staff follow up"
   fallback message.
   ============================================================ */

// ---------- EDIT YOUR ANSWERS HERE ----------
// Replace the placeholder text with your real gym's info. Keep the
// backticks ` ` around each answer.
export const ANSWERS = {
  membership_price: `Our monthly membership is ₱1,200/month, no lock-in contract. We also have a student rate of ₱1,000/month with valid school ID. Want to know about walk-in rates or personal training too?`,

  walk_in: `Yes po, walk-ins are welcome! Walk-in rate is ₱150/session, no appointment needed — just come by during our open hours.`,

  day_pass: `Our day pass / walk-in rate is ₱150, valid for the whole day you visit. Just drop by anytime within our open hours, no need to book ahead.`,

  free_trial: `Yes po! We offer one free trial session, no commitment needed. Come try the gym before deciding on membership.`,

  operating_hours: `We're open Mon–Sat 5:00 AM–10:00 PM, and Sun 7:00 AM–8:00 PM.`,

  location: `We're located at [YOUR GYM ADDRESS HERE], near [NEARBY LANDMARK]. Let us know if you'd like directions!`,

  parking: `Yes po, we have free parking available for members. Limited street parking is available for walk-in guests.`,

  equipment: `We have a full range of equipment — free weights, machines, cardio (treadmills, bikes), squat racks, cable machines, and a dedicated stretching area. Let us know if you're looking for something specific!`,

  facilities: `We have showers, lockers, aircon, and a changing area available for all members.`,

  personal_training: `Yes po, we have 3 certified trainers! Personal training is ₱300/session as an add-on to your membership. Message us to book a session.`,

  discounts: `We offer a student discount (₱1,000/month with valid school ID). Ask us about any current promos too!`,

  registration: `You can sign up right here in the chat, or visit us in person — registration only takes a few minutes! You'll just need a valid ID.`,

  requirements: `Just bring a valid ID to register. For first-time visitors, that's really all you need — our staff will guide you through the rest.`,

  age_policy: `Members should generally be 16 years old and up. For minors, we may require a guardian's consent — feel free to ask our staff for specifics.`,

  guest_policy: `You're welcome to bring a guest! Guest walk-in rate is the same as our regular walk-in rate (₱150/session). A valid ID for your guest is appreciated.`,

  payment_methods: `We accept Cash, GCash, and Maya.`,

  membership_renewal: `Renewing is easy — just let us know at the front desk or through this chat, and we'll process it for you.`,

  membership_cancel: `You can reach out to our staff directly to process a cancellation — we'll walk you through it.`,

  membership_freeze: `We can freeze your membership for a limited period — message our staff with your preferred freeze dates.`,

  membership_transfer_upgrade: `For upgrades, downgrades, or transferring your membership, our staff can help sort that out for you directly — just let them know what you'd like to change.`,

  gym_rules: `Please wear proper gym attire and closed shoes. Please wipe down equipment and re-rack weights after use. Outside food isn't allowed inside the training area.`,

  filming_policy: `You're welcome to record or take photos of your own workout! Out of respect for other members' privacy, please avoid filming other people without their permission.`,

  crowding: `Our busiest hours are typically evenings (6–8 PM) on weekdays. Mornings and early afternoons tend to be quieter if you prefer a less crowded session!`,

  classes: `We currently offer Zumba (Mon/Wed/Fri 6PM) and Boxing Fitness (Tue/Thu 7PM). Both are included with membership!`,

  beginner_help: `No worries, first-timers are very welcome! Our staff and trainers can guide you through the equipment and help you get started — just let them know it's your first time.`,

  safety: `We have first aid on-site and staff available during all open hours for assistance.`,

  international_access: `Yes po, we welcome walk-ins and tourists! A valid ID (passport is fine) works for registration, and we accept cash, GCash, and Maya.`,

  app_account: `We don't have a mobile app yet, but our staff can check your membership status, payment history, and expiration date for you anytime — just ask through this chat or at the front desk.`,

  lost_found: `Sorry to hear that! Please message our staff directly with what you lost and roughly when — we keep a lost-and-found at the front desk and can also check with the team.`,

  broken_equipment: `Thanks for the heads up — please let our front desk staff know which machine, and we'll get it looked at as soon as possible. Sorry for the inconvenience!`,

  // Deliberately generic — real complaints, emergencies, billing disputes,
  // and anything needing a human decision should never get a guessed
  // answer. See STAFF_ESCALATION_KEYWORDS below.
  staff_escalation: `I want to make sure this gets handled properly by our team rather than guessing — please message our staff directly (or speak to whoever's at the front desk) and they'll take care of this for you right away.`,

  // Shown when the message is just "magkano?" / "hm?" with nothing
  // specific — asks which price the customer means instead of guessing.
  ambiguous_price_clarify: `Sure po! 😊 Are you asking about membership, walk-in/day pass, or personal training rates?`
};

// ---------- STAFF ESCALATION (checked FIRST, before anything else) ----------
// Never guess an answer for these — always route to a human.
const STAFF_ESCALATION_KEYWORDS = [
  "manager", "complaint", "reklamo", "kausapin manager",
  "emergency", "injured", "injury", "nasaktan", "nahulog", "aksidente", "accident",
  "nahimatay", "medical emergency", "first aid kit", "stole", "nawala", "ninakaw",
  "fraud", "fraudulent", "charged twice", "charged wrong", "na-charge ng mali",
  "wrong charge", "double charge", "dispute", "unauthorized", "hindi ko in-authorize",
  "harassment", "harass", "inappropriate behavior", "uncomfortable", "hindi ako komportable",
  "unsafe", "hindi safe", "legal", "refund" , "gusto ko po ng refund",
  "cctv footage", "report a staff", "report staff", "i-report"
];

// ---------- AMBIGUOUS PRICE (checked SECOND) ----------
// Only fires if the message is short/bare and doesn't already mention
// something specific (walk-in, membership, PT, etc.) — those go straight
// to their specific answer via INTENT_KEYWORDS instead.
const AMBIGUOUS_PRICE_KEYWORDS = ["magkano", "mag kano", "how much", "hm po", "hm?", " hm ", "presyo", "bayad po"];
const SPECIFIC_PRICE_CONTEXT_KEYWORDS = [
  "walk", "walkin", "walk-in", "membership", "monthly", "buwan", "day pass", "isang araw",
  "pt", "personal train", "trainer", "yearly", "taon", "week", "linggo", "class", "zumba", "boxing"
];

// ---------- KEYWORD TRIGGERS (edit with care — see notes above) ----------
const INTENT_KEYWORDS = [
  ["free_trial", ["free trial", "trial session", "libreng subok", "free session", "try muna", "libre subok", "libreng trial", "trial pass", "pwede mag-try", "try the gym"]],

  ["broken_equipment", ["not working", "isn't working", "broken", "sira ", "sira po", "hindi gumagana", "malfunctioned", "stuck", "damaged equipment", "paayos"]],

  ["lost_found", ["lost my", "i lost", "nawawala", "naiwan ko", "lost and found", "left my", "found someone", "nakita ko", "nag-turn in"]],

  ["app_account", ["app po", "mobile app", "online account", "log in", "login", "password", "hindi ako makalogin", "payment history", "expiration date", "membership status online", "digital membership", "qr code"]],

  ["day_pass", ["day pass", "one day", "isang araw", "single day"]],

  ["walk_in", ["walk-in", "walk in", "walkin", "wi hm", "pwede walkin", "pwede ba walk", "pede walkin", "walkin po", "walkin hm"]],

  ["membership_transfer_upgrade", ["upgrade", "downgrade", "transfer membership", "ilipat sa ibang tao", "palitan ang membership plan"]],

  ["membership_freeze", ["freeze", "i-freeze", "pause membership", "ipa-freeze"]],

  ["membership_cancel", ["cancel", "refund", "cancellation", "pwede cancel", "gusto mag-cancel"]],

  ["membership_renewal", ["renew", "renewal", "paano mag-renew", "expired na membership", "pa-renew"]],

  ["discounts", ["discount", "disc", "promo", "student rate", "senior discount", "pwd", "family discount", "group discount", "barkada", "stud disc"]],

  ["membership_price", ["membership fee", "monthly rate", "monthly membership", "monthly hm", "mem hm", "yearly hm", "3 months", "6 months", "1 year", "annual", "weekly membership", "joining fee", "registration fee"]],

  ["personal_training", ["personal trainer", "pt hm", "pt available", "may pt", "trainer", "coaching", "personal training"]],

  ["operating_hours", ["open po", "open pa", "close ", "closing", "opening", "anong oras", "oras?", "bukas po", "bukas pa", "sarado", "24 hours", "24/7", "schedule", "sched", "last entry", "hours", "open today", "open holiday", "open sunday", "open saturday"]],

  ["location", ["saan po", "saan kau", "saan kayo", "san po", "location", "loc?", "loc ", "address", "add?", "branch", "where are you", "landmark", "paano pumunta", "how to get there", "malapit sa"]],

  ["parking", ["parking", "motorcycle parking", "car parking"]],

  ["classes", ["zumba", "yoga", "boxing", "hiit", "dance class", "spinning", "pilates", "group class", "class schedule"]],

  ["equipment", ["treadmill", "dumbbell", "barbell", "squat rack", "bench press", "cable machine", "equipment", "machines", "leg press", "pull-up", "punching bag", "elliptical", "stairmaster", "smith machine", "kagamitan"]],

  ["facilities", ["shower", "locker", "changing room", "restroom", "sauna", "aircon", "wifi", "wi-fi", "towel", "cr po", "steam room"]],

  ["filming_policy", ["take photos", "mag-picture", "mag-video", "tiktok", "film", "livestream", "live po", "tripod", "camera", "record my workout", "magfilm"]],

  ["registration", ["paano mag-member", "paano mag sign up", "how to register", "sign up", "paano magmember", "how do i become a member", "register online", "register onsite"]],

  ["requirements", ["requirements", "valid id", "need id", "kailangan dalhin", "ano kailangan", "kailangan ko dalhin", "need to bring"]],

  ["age_policy", ["minor", "age limit", "age requirement", "ilang taon", "senior citizen", "under 18", "high school", "pwede minor"]],

  ["guest_policy", ["guest", "bring a friend", "magdala guest", "guest pass", "magdala kasama", "boyfriend", "girlfriend", "kaibigan"]],

  ["payment_methods", ["gcash", "maya", "cash po", "bank transfer", "credit card", "debit card", "payment method", "paano magbayad", "installment", "hulugan"]],

  ["gym_rules", ["dress code", "slippers", "pwede shorts", "rules", "policy", "outside food", "gym attire"]],

  ["crowding", ["crowded", "matao", "busy ba", "maraming tao", "peak hours", "konti tao", "marami bang tao"]],

  ["beginner_help", ["beginner po ako", "first time ko", "baguhan", "walang experience", "first time", "hindi ko alam paano", "never been to a gym"]],

  ["safety", ["first aid", "security", "cctv"]],

  ["international_access", ["tourist", "foreigner", "passport", "international card", "usd", "foreign currency", "visiting the philippines"]]
];

/** Finds the single best-matching intent name for a message fragment,
 *  or null. Internal helper shared by matchFaqIntent and the multi-intent
 *  splitter below. */
function matchSingleIntent(msg){
  for(const kw of STAFF_ESCALATION_KEYWORDS){
    if(msg.includes(kw)) return "staff_escalation";
  }
  const mentionsAmbiguousPrice = AMBIGUOUS_PRICE_KEYWORDS.some(kw => msg.includes(kw));
  const mentionsSpecificContext = SPECIFIC_PRICE_CONTEXT_KEYWORDS.some(kw => msg.includes(kw));
  if(mentionsAmbiguousPrice && !mentionsSpecificContext){
    return "ambiguous_price_clarify";
  }
  for(const [intent, keywords] of INTENT_KEYWORDS){
    for(const kw of keywords){
      if(msg.includes(kw)) return intent;
    }
  }
  return null;
}

// Splits a message into rough sub-questions on common joiners, so
// "magkano walk in and open pa ba kayo" is treated as two separate
// questions instead of only ever matching the first one found.
const MULTI_INTENT_SPLIT_REGEX = /\b(and|tapos|tsaka|saka|at)\b|[,;]|\?/gi;

/**
 * Matches a user message to a known intent and returns the answer text,
 * or null if nothing matched (caller decides the fallback behavior).
 * Checks staff-escalation triggers first, then ambiguous-price
 * clarification, then the full intent list. If the message contains
 * more than one distinct question (split on "and"/"tapos"/"tsaka"/
 * commas/question marks), answers each matched part and joins them.
 * @param {string} userMessage
 * @returns {string|null}
 */
export function matchFaqIntent(userMessage){
  if(!userMessage || typeof userMessage !== "string") return null;
  const msg = userMessage.toLowerCase();

  // Staff escalation always wins outright, even inside a multi-part
  // message — never mix an escalation with a guessed FAQ answer.
  for(const kw of STAFF_ESCALATION_KEYWORDS){
    if(msg.includes(kw)) return ANSWERS.staff_escalation;
  }

  const fragments = msg.split(MULTI_INTENT_SPLIT_REGEX).map(f => (f || "").trim()).filter(Boolean);

  if(fragments.length <= 1){
    const intent = matchSingleIntent(msg);
    return intent ? ANSWERS[intent] : null;
  }

  // Multi-part message: match each fragment separately, dedupe repeated
  // intents (e.g. "magkano" appearing twice shouldn't answer twice),
  // and join into one reply. Falls back to single-message behavior if
  // splitting didn't actually turn up more than one real match.
  const seenIntents = new Set();
  const answers = [];
  for(const frag of fragments){
    const intent = matchSingleIntent(frag);
    if(intent && !seenIntents.has(intent)){
      seenIntents.add(intent);
      answers.push(ANSWERS[intent]);
    }
  }

  if(answers.length === 0) return null;
  if(answers.length === 1) return answers[0];
  return answers.join("\n\n");
}

/**
 * Checks the gym owner's OWN saved FAQs (Business Settings -> Frequently
 * Asked Questions panel, one {question, answer} pair per entry) against
 * the customer's message. A loose word-overlap match — not exact string
 * match — since customers rarely type a question exactly the way the
 * owner wrote it (typos, Taglish, shortened phrasing, etc.).
 * @param {string} userMessage
 * @param {{question:string, answer:string}[]} [ownerFaqs]
 * @returns {string|null}
 */
export function matchOwnerFaq(userMessage, ownerFaqs){
  if(!userMessage || !Array.isArray(ownerFaqs) || ownerFaqs.length === 0) return null;
  const msg = userMessage.toLowerCase();
  const msgWords = new Set(msg.split(/\W+/).filter(w => w.length > 2));
  if(msgWords.size === 0) return null;

  let bestMatch = null;
  let bestScore = 0;

  for(const faq of ownerFaqs){
    if(!faq || !faq.question || !faq.answer) continue;
    const qWords = faq.question.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    if(qWords.length === 0) continue;

    let overlap = 0;
    for(const w of qWords){
      if(msgWords.has(w)) overlap++;
    }
    const score = overlap / qWords.length;

    if(score >= 0.5 && score > bestScore){
      bestScore = score;
      bestMatch = faq.answer;
    }
  }
  return bestMatch;
}

// ---------- #6: UNANSWERED QUESTIONS LOG ----------
// A rolling, per-gym list of customer messages that matched NOTHING
// (not the owner's own FAQs, not the generic list) — surfaced on the
// Gym Owner dashboard so owners know exactly what to add next, instead
// of guessing. Capped so it can't grow forever in localStorage.
const UNANSWERED_LOG_STORAGE_KEY = "gymbot_unanswered_questions";
const UNANSWERED_LOG_MAX_ENTRIES_PER_GYM = 200;

function readUnansweredLog(){
  try{
    const raw = localStorage.getItem(UNANSWERED_LOG_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
  }catch(err){
    return {};
  }
}

function writeUnansweredLog(map){
  try{
    localStorage.setItem(UNANSWERED_LOG_STORAGE_KEY, JSON.stringify(map));
    return true;
  }catch(err){
    return false;
  }
}

/**
 * Records a customer message that GymBot QC couldn't answer, scoped to
 * one gym. Call this from callGemini() whenever both matchOwnerFaq and
 * matchFaqIntent return null. Safe to call even if storage fails — it
 * just won't log that one, same "never break the chat" spirit as the
 * rest of this app's storage code.
 * @param {string} gymId
 * @param {string} userMessage
 */
export function logUnansweredQuestion(gymId, userMessage){
  if(!gymId || !userMessage || !userMessage.trim()) return;
  const map = readUnansweredLog();
  const list = Array.isArray(map[gymId]) ? map[gymId] : [];

  list.push({
    text: userMessage.trim().slice(0, 500),
    at: new Date().toISOString()
  });

  // Keep only the most recent N entries per gym.
  const trimmed = list.slice(-UNANSWERED_LOG_MAX_ENTRIES_PER_GYM);
  map[gymId] = trimmed;
  writeUnansweredLog(map);
}

/**
 * Reads back this gym's unanswered-question log, newest first, for
 * display on the owner dashboard.
 * @param {string} gymId
 * @returns {{text:string, at:string}[]}
 */
export function getUnansweredQuestions(gymId){
  if(!gymId) return [];
  const map = readUnansweredLog();
  const list = Array.isArray(map[gymId]) ? map[gymId] : [];
  return list.slice().reverse();
}

/**
 * Clears this gym's unanswered-question log (e.g. after the owner has
 * reviewed and added FAQs for the common ones).
 * @param {string} gymId
 * @returns {boolean}
 */
export function clearUnansweredQuestions(gymId){
  if(!gymId) return false;
  const map = readUnansweredLog();
  delete map[gymId];
  return writeUnansweredLog(map);
}

/**
 * Renders a simple "Unanswered questions" panel into a container element
 * on the Gym Owner dashboard — plain DOM, no framework, matching this
 * app's existing UI style (see owner-dashboard.html's other "injected"
 * containers). Call this once after the page loads, passing the gymId
 * from the owner's session and a container element to render into.
 * @param {HTMLElement} containerEl
 * @param {string} gymId
 */
export function renderUnansweredQuestionsPanel(containerEl, gymId){
  if(!containerEl || !gymId) return;

  function draw(){
    const items = getUnansweredQuestions(gymId);
    containerEl.innerHTML = "";

    const heading = document.createElement("h3");
    heading.textContent = "Unanswered questions";
    containerEl.appendChild(heading);

    const sub = document.createElement("p");
    sub.className = "help-text";
    sub.style.marginTop = "0";
    sub.textContent = "Customer questions your AI Receptionist couldn't answer from your FAQs — add these as new FAQs above so future customers get a real answer.";
    containerEl.appendChild(sub);

    if(items.length === 0){
      const empty = document.createElement("p");
      empty.className = "help-text";
      empty.textContent = "Nothing unanswered yet — nice.";
      containerEl.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "owner-faq-list"; // reuse existing FAQ list styling
    items.slice(0, 50).forEach(item => {
      const row = document.createElement("div");
      row.className = "owner-field";
      row.style.marginBottom = "8px";

      const text = document.createElement("div");
      text.textContent = item.text;
      row.appendChild(text);

      const meta = document.createElement("div");
      meta.className = "help-text";
      try{
        meta.textContent = new Date(item.at).toLocaleString();
      }catch(err){
        meta.textContent = "";
      }
      row.appendChild(meta);

      list.appendChild(row);
    });
    containerEl.appendChild(list);

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn btn-ghost btn-sm";
    clearBtn.textContent = "Clear this list";
    clearBtn.addEventListener("click", () => {
      clearUnansweredQuestions(gymId);
      draw();
    });
    containerEl.appendChild(clearBtn);
  }

  draw();
}
