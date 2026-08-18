/* ============================================================
   GYMBOT QC — FAQ RESPONSE SERVICE
   Answers common gym questions from a fixed intent -> answer
   map instead of calling the Gemini API. No API key, no proxy,
   no per-request cost, no "model retired" surprises.

   HOW TO EDIT ANSWERS (for gym owners / non-coders):
   Scroll down to the ANSWERS object below. Each line is
   "intentName: `Your answer text here`,". Just change the text
   between the backticks ` ` — don't touch anything else on the
   line (commas, backticks, intent names).

   HOW MATCHING WORKS:
   Each intent has a list of trigger words/phrases in KEYWORDS.
   If the customer's message contains ANY of those words
   (case-insensitive, works with Tagalog/English/Taglish/typos
   like "hm", "loc", "walkin"), that intent's answer is used.
   First matching intent wins, so more specific intents are
   listed first on purpose — don't reorder carelessly.

   If nothing matches, matchFaqIntent() returns null and the
   caller (gemini-service.js) decides what happens next (currently:
   falls through to the Gemini API if configured, otherwise the
   normal "no_key" fallback message).
   ============================================================ */

// ---------- EDIT YOUR ANSWERS HERE ----------
// Replace the placeholder text (₱1,200/month, 5AM–10PM, etc.)
// with your real gym's info. Keep the backticks ` ` around each answer.
export const ANSWERS = {
  membership_price: `Our monthly membership is ₱1,200/month, no lock-in contract. We also have a student rate of ₱1,000/month with valid school ID. Want to know about walk-in rates too?`,

  walk_in: `Yes po, walk-ins are welcome! Walk-in rate is ₱150/session, no appointment needed — just come by during our open hours.`,

  day_pass: `Our day pass / walk-in rate is ₱150. Just drop by anytime within our open hours, no need to book ahead.`,

  free_trial: `Yes po! We offer one free trial session, no commitment needed. Come try the gym before deciding on membership.`,

  operating_hours: `We're open Mon–Sat 5:00 AM–10:00 PM, and Sun 7:00 AM–8:00 PM.`,

  location: `We're located at [YOUR GYM ADDRESS HERE], near [NEARBY LANDMARK]. Let us know if you'd like directions!`,

  parking: `Yes po, we have free parking available for members. Limited street parking is available for walk-in guests.`,

  equipment: `We have a full range of equipment — free weights, machines, cardio (treadmills, bikes), and a dedicated stretching area. Let us know if you're looking for something specific!`,

  facilities: `We have showers, lockers, aircon, and a changing area available for all members.`,

  personal_training: `Yes po, we have 3 certified trainers! Personal training is ₱300/session as an add-on to your membership.`,

  discounts: `We offer a student discount (₱1,000/month with valid school ID). Ask us about any current promos too!`,

  registration: `You can sign up right here in the chat, or visit us in person — registration only takes a few minutes!`,

  requirements: `Just bring a valid ID to register. For first-time visitors, that's really all you need — our staff will guide you through the rest.`,

  age_policy: `Members should generally be 16 years old and up. For minors, we may require a guardian's consent — feel free to ask our staff for specifics.`,

  guest_policy: `You're welcome to bring a guest! Guest walk-in rate is the same as our regular walk-in rate (₱150/session).`,

  payment_methods: `We accept Cash, GCash, and Maya.`,

  membership_renewal: `Renewing is easy — just let us know at the front desk or through this chat, and we'll process it for you.`,

  membership_cancel: `You can reach out to our staff directly to process a cancellation — we'll walk you through it.`,

  membership_freeze: `We can freeze your membership for a limited period — message our staff with your preferred freeze dates.`,

  gym_rules: `Please wear proper gym attire and closed shoes. Please wipe down equipment and re-rack weights after use. Outside food isn't allowed inside the training area.`,

  crowding: `Our busiest hours are typically evenings (6–8 PM) on weekdays. Mornings and early afternoons tend to be quieter if you prefer a less crowded session!`,

  classes: `We currently offer Zumba (Mon/Wed/Fri 6PM) and Boxing Fitness (Tue/Thu 7PM). Both are included with membership!`,

  beginner_help: `No worries, first-timers are very welcome! Our staff and trainers can guide you through the equipment and help you get started — just let them know it's your first time.`,

  safety: `We have first aid on-site and staff available during all open hours for assistance.`,

  international_access: `Yes po, we welcome walk-ins and tourists! A valid ID (passport is fine) works for registration, and we accept cash, GCash, and Maya.`
};

// ---------- KEYWORD TRIGGERS (edit with care — see notes above) ----------
const INTENT_KEYWORDS = [
  ["free_trial", ["trial", "libreng subok", "free session", "try muna", "libre subok"]],
  ["day_pass", ["day pass", "one day", "isang araw"]],
  ["walk_in", ["walk-in", "walk in", "walkin", "wi hm", "pwede walkin", "pwede ba walk"]],
  ["membership_price", ["magkano", "mag kano", "how much", "price", "rate", "rates", "hm", "membership fee", "monthly", "per month", "per week", "3 months", "6 months", "1 year", "annual", "weekly", "joining fee", "registration fee"]],
  ["discounts", ["discount", "disc", "promo", "student rate", "senior discount", "pwd", "family discount", "group discount", "barkada"]],
  ["operating_hours", ["open", "close", "closing", "opening", "anong oras", "oras", "bukas", "sarado", "24 hours", "24/7", "schedule", "sched", "last entry", "hours"]],
  ["location", ["saan", "san ", "location", "loc?", "loc ", "address", "add?", "branch", "where are you", "landmark", "paano pumunta", "how to get there"]],
  ["parking", ["parking", "motorcycle parking", "car parking"]],
  ["equipment", ["treadmill", "dumbbell", "barbell", "squat rack", "bench press", "cable machine", "equipment", "machines", "leg press", "pull-up", "punching bag"]],
  ["facilities", ["shower", "locker", "changing room", "restroom", "sauna", "aircon", "wifi", "wi-fi", "towel"]],
  ["personal_training", ["personal trainer", "pt hm", "pt available", "may pt", "trainer", "coaching"]],
  ["registration", ["paano mag-member", "paano mag sign up", "how to register", "sign up", "paano magmember"]],
  ["requirements", ["requirements", "valid id", "need id", "kailangan dalhin", "ano kailangan"]],
  ["age_policy", ["minor", "age limit", "age requirement", "ilang taon", "senior citizen", "under 18"]],
  ["guest_policy", ["guest", "bring a friend", "magdala guest", "guest pass"]],
  ["payment_methods", ["gcash", "maya", "cash po", "bank transfer", "credit card", "debit card", "payment method", "paano magbayad"]],
  ["membership_renewal", ["renew", "renewal", "paano mag-renew"]],
  ["membership_cancel", ["cancel", "refund", "cancellation"]],
  ["membership_freeze", ["freeze", "i-freeze", "pause membership"]],
  ["gym_rules", ["dress code", "slippers", "pwede shorts", "rules", "policy", "outside food"]],
  ["crowding", ["crowded", "matao", "busy ba", "maraming tao", "peak hours", "konti tao"]],
  ["classes", ["zumba", "yoga", "boxing", "hiit", "dance class", "spinning", "pilates", "group class", "class schedule"]],
  ["beginner_help", ["beginner po ako", "first time ko", "baguhan", "walang experience", "first time"]],
  ["safety", ["first aid", "emergency", "injured", "security"]],
  ["international_access", ["tourist", "foreigner", "passport", "international card", "usd"]]
];

/**
 * Matches a user message to a known intent and returns the answer text,
 * or null if nothing matched (caller decides the fallback behavior).
 * @param {string} userMessage
 * @returns {string|null}
 */
export function matchFaqIntent(userMessage){
  if(!userMessage || typeof userMessage !== "string") return null;
  const msg = userMessage.toLowerCase();

  for(const [intent, keywords] of INTENT_KEYWORDS){
    for(const kw of keywords){
      if(msg.includes(kw)){
        return ANSWERS[intent] || null;
      }
    }
  }
  return null;
}
