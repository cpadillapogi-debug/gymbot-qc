/* ============================================================
   GYMBOT QC — CONFIG
   Single source of truth for tunable values. Nothing outside
   this file should hard-code a storage key, a limit, or a
   business-math constant.
   ============================================================ */

export const ROLES = Object.freeze({
  DEVELOPER: "developer",
  GYM_OWNER: "gym_owner"
});

export const ROUTES = Object.freeze({
  HOME: "index.html",
  LOGIN: "login.html",
  REGISTER: "register.html",
  // Phase 3 split the single placeholder shell into two real,
  // role-specific pages. DASHBOARD is kept as the Developer
  // page's filename so existing links/bookmarks don't break;
  // DASHBOARD_OWNER is the new Gym Owner page. Always route by
  // role via auth-guard.js's roleHome() — never hard-code either
  // of these in a UI module.
  DASHBOARD: "dashboard.html",
  DASHBOARD_OWNER: "owner-dashboard.html",
  // Phase 11 (Launch Prep)
  PRICING: "pricing.html",
  ONBOARDING: "onboarding.html"
});

export const CONFIG = Object.freeze({
  STORAGE_KEYS: Object.freeze({
    apiKey: "gymbot_api_key",
    gymInfo: "gymbot_gym_info",
    leads: "gymbot_leads",
    users: "gymbot_users",
    gyms: "gymbot_gyms",
    session: "gymbot_session",
    // Phase 3
    businessSettings: "gymbot_business_settings", // { [gymId]: settingsObject }
    theme: "gymbot_theme",                          // "dark" | "light", global to the browser
    // Phase 5
    leadRouting: "gymbot_lead_routing",             // { [gymId]: { [providerId]: {...} } }
    // Phase 6
    subscriptions: "gymbot_subscriptions",          // { [gymId]: subscriptionRecord }
    invoices: "gymbot_invoices",                    // flat array, each invoice carries its own gymId (same pattern as `leads`)
    // Phase 8 (Developer Dashboard & Subscription Control)
    auditLog: "gymbot_audit_log",                   // flat array, newest last — see audit-log-service.js
    // Phase 9 (Hidden Developer Console)
    devAiConfig: "gymbot_dev_ai_config",             // Gemini tuning overrides — see dev-console-service.js
    masterPromptTemplate: "gymbot_master_prompt",    // editable master system-prompt template
    featureFlags: "gymbot_feature_flags",            // { [flagId]: boolean }
    integrations: "gymbot_integrations",             // { [integrationId]: { apiKey, webhookUrl } }
    systemLogs: "gymbot_system_logs",                // flat array, newest last, capped — see dev-console-service.js
    devConsolePassword: "gymbot_dev_console_password", // optional extra gate on top of the DEVELOPER role login
    // Phase 10 (GCash Billing & Commission Engine)
    gcashSettings: "gymbot_gcash_settings",          // single object — Developer-configured QR/number/account name, same for every gym
    gcashPayments: "gymbot_gcash_payments",          // flat array, each payment carries its own gymId — see gcash-payment-service.js
    commissionConfig: "gymbot_commission_config",    // single object — Developer-only fee mode + amounts, see commission-service.js
    notifications: "gymbot_notifications",           // flat array, each carries `audience` ("owner"|"developer") + gymId (owner-scoped) — see notification-service.js
    // Phase 11 (Launch Prep)
    demoGymId: "gymbot_demo_gym_id",                  // single string — the gym id demo-mode-service.js seeded, if any
    // Phase 14 (Global OS foundation)
    gymPlatformConfig: "gymbot_gym_platform_config"   // { [gymId]: { businessTypeId, countryCode, currencyCode, languageCode } } — see gym-config-service.js
  }),

  // Auth / sessions
  SESSION_DURATION_MS: 12 * 60 * 60 * 1000,        // 12h — used when "Remember me" is off (sessionStorage anyway clears on tab close, this is a belt-and-suspenders expiry)
  SESSION_DURATION_REMEMBER_MS: 30 * 24 * 60 * 60 * 1000, // 30 days
  MIN_PASSWORD_LEN: 8,

  // Gemini API
  GEMINI_MODEL: "gemini-2.0-flash",
  GEMINI_TIMEOUT_MS: 15000,
  GEMINI_HISTORY_WINDOW: 8,   // last N turns sent as context
  GEMINI_REPLY_MAX_LEN: 1200,
  // Phase 4: retry/backoff for transient failures only (timeout, network
  // error, 5xx). Never retried: missing/invalid key (401/403), rate
  // limit (429) — those are surfaced immediately, retrying won't help.
  GEMINI_MAX_RETRIES: 2,             // total attempts = 1 + this
  GEMINI_RETRY_BASE_MS: 600,         // doubles each retry (600, 1200, ...)
  GEMINI_TEST_TIMEOUT_MS: 10000,     // shorter budget for the manual "Test connection" check

  // Input limits
  CHAT_MESSAGE_MAX_LEN: 500,
  GYM_INFO_MAX_LEN: 4000,
  LEAD_NAME_MAX_LEN: 80,
  LEAD_PHONE_MAX_LEN: 20,
  LEAD_EMAIL_MAX_LEN: 120,
  LEAD_NOTES_MAX_LEN: 2000,

  // Front-desk math (illustrative only — shown on the dashboard)
  AVG_MEMBERSHIP_VALUE: 1200,        // PHP
  ASSUMED_TRIAL_TO_MEMBER_RATE: 0.4,
  MINUTES_SAVED_PER_LEAD: 6,

  // UI
  MAX_LEADS_RENDERED: 25,
  MAX_CRM_LEADS_RENDERED: 500,   // Phase 5 Leads CRM table — client-side only, generous cap
  TOAST_DURATION_MS: 3200,

  // Phase 6: Subscription & billing simulation. There is no real payment
  // gateway yet (see docs/PHASE6_NOTES.md) — these constants drive a
  // simulated, date-based state machine so every subscription state has
  // something concrete to demo. Only the Developer will be able to tune
  // these once real billing exists.
  SUBSCRIPTION_DEFAULT_PLAN_ID: "pro",     // plan a brand-new gym starts trialing on
  SUBSCRIPTION_TRIAL_DAYS: 14,             // Trialing -> Pending Payment
  SUBSCRIPTION_BILLING_INTERVAL_DAYS: 30,  // length of one billing period
  SUBSCRIPTION_GRACE_TRIGGER_DAYS: 3,      // Pending Payment -> Grace Period
  SUBSCRIPTION_GRACE_PERIOD_DAYS: 7,       // Grace Period -> Suspended
  SUBSCRIPTION_SUSPENSION_TRIGGER_DAYS: 14, // Suspended -> Disabled

  // Phase 8: Developer Dashboard manual overrides
  DEV_EXTEND_TRIAL_MAX_DAYS: 90,           // sanity cap on a single "extend trial" action
  AUDIT_LOG_MAX_ENTRIES: 2000,             // oldest entries are dropped past this, same idea as a rolling log file

  // Phase 9: Hidden Developer Console
  SYSTEM_LOG_MAX_ENTRIES: 2000,
  DEV_CONSOLE_CLICK_COUNT: 5,              // clicks on the sidebar brand to reveal the console gate
  DEV_CONSOLE_CLICK_WINDOW_MS: 3000,       // all clicks must land inside this window
  DEV_TEMPERATURE_MIN: 0,
  DEV_TEMPERATURE_MAX: 2,
  DEV_MAX_OUTPUT_TOKENS_MIN: 50,
  DEV_MAX_OUTPUT_TOKENS_MAX: 4000,
  DEV_TIMEOUT_MS_MIN: 3000,
  DEV_TIMEOUT_MS_MAX: 60000,
  DEV_RETRY_ATTEMPTS_MIN: 0,
  DEV_RETRY_ATTEMPTS_MAX: 5,
  APP_VERSION: "0.11.0",
  APP_BUILD: "phase11-1",
  APP_ENVIRONMENT: "Development",

  // Phase 10: GCash Billing & Commission Engine. There is still no real
  // payment gateway (see docs/PHASE6_NOTES.md's original honesty note) —
  // this is a manual "upload proof, Developer verifies" flow, the same
  // way Suspended/Disabled accounts have always been reactivated by a
  // Developer clicking a button rather than a webhook. Images are stored
  // as base64 data URLs in localStorage (the only storage this client-only
  // app has — see storage-adapter.js), so the size caps below exist to
  // keep any one image from blowing the ~5-10MB browser storage quota,
  // not because of any server-side upload limit.
  GCASH_QR_MAX_BYTES: 1_000_000,          // ~1MB raw file for the QR image
  PAYMENT_PROOF_MAX_BYTES: 1_500_000,     // ~1.5MB raw file for a proof-of-payment screenshot
  NOTIFICATIONS_MAX_ENTRIES: 500,         // rolling cap, same pattern as AUDIT_LOG_MAX_ENTRIES
  COMMISSION_PERCENTAGE_MAX: 100,
  COMMISSION_FIXED_MAX: 100000            // sanity cap on a fixed peso fee, not a real business limit
});

/* ---------- Phase 9: Hidden Developer Console ---------- */

// Selectable Gemini models in the AI Configuration panel. CONFIG.GEMINI_MODEL
// (above) remains the hard-coded fallback if no override is saved.
export const GEMINI_SELECTABLE_MODELS = Object.freeze([
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-pro"
]);

// Default values for the Developer-only Gemini tuning overrides. Stored
// separately from the Gym Owner's own settings (gymInfo, businessSettings) —
// see dev-console-service.js. Gym Owners never see or edit any of this.
// NOTE: "gemini-2.0-flash" is repeated (not imported from CONFIG.GEMINI_MODEL)
// only because this object is a frozen module-level literal defined further
// down the same file than CONFIG — keep the two in sync by hand if the
// hard-coded fallback model ever changes.
export const DEFAULT_DEV_AI_CONFIG = Object.freeze({
  model: "gemini-2.0-flash",
  temperature: 0.7,
  maxOutputTokens: 300,
  timeoutMs: 15000,
  retryAttempts: 2,
  personality: "warm, professional, energetic Filipino gym front-desk staff",
  fallbackResponse: "Sorry po, hindi ko po ma-verify agad — I'll have staff follow up with you shortly!"
});

export const FEATURE_FLAG_DEFINITIONS = Object.freeze([
  { id: "aiReceptionist", label: "AI Receptionist", description: "Master switch for the Gemini-powered chat widget across every gym." },
  { id: "crm", label: "CRM", description: "The Leads CRM page and lead capture pipeline." },
  { id: "subscriptions", label: "Subscriptions", description: "Plan selection, trials, and billing states." },
  { id: "billing", label: "Billing", description: "Invoice generation and the owner-facing billing banner." },
  { id: "gcash", label: "GCash", description: "GCash shown as an accepted payment method / integration." },
  { id: "analytics", label: "Analytics", description: "Owner dashboard metrics and Developer analytics cards." },
  { id: "messengerIntegration", label: "Messenger Integration", description: "Facebook Messenger channel for the AI receptionist." },
  { id: "experimentalFeatures", label: "Experimental Features", description: "Umbrella flag for in-progress features not yet ready for every gym." }
]);

export const DEFAULT_FEATURE_FLAGS = Object.freeze(
  FEATURE_FLAG_DEFINITIONS.reduce((acc, f) => {
    acc[f.id] = true;
    return acc;
  }, {})
);

// Integration Hub placeholders — no real backend behind any of these yet
// (same "placeholder" pattern as LEAD_ROUTING_PROVIDERS in Phase 5). Test
// Connection always surfaces a real, honest "not connected" result rather
// than faking success.
export const INTEGRATION_DEFINITIONS = Object.freeze([
  { id: "googleSheets", label: "Google Sheets", hasWebhook: false },
  { id: "n8n", label: "n8n", hasWebhook: true },
  { id: "zapier", label: "Zapier", hasWebhook: true },
  { id: "makeCom", label: "Make.com", hasWebhook: true },
  { id: "messenger", label: "Facebook Messenger", hasWebhook: false },
  { id: "whatsapp", label: "WhatsApp", hasWebhook: false },
  { id: "telegram", label: "Telegram", hasWebhook: false }
]);

export const SYSTEM_LOG_LEVELS = Object.freeze({
  ERROR: "error",
  WARNING: "warning",
  INFO: "info"
});

export const SYSTEM_LOG_CATEGORIES = Object.freeze({
  LOGIN_ATTEMPT: "login_attempt",
  API_ERROR: "api_error",
  SUBSCRIPTION_CHANGE: "subscription_change",
  LEAD_CREATED: "lead_created",
  AI_FAILURE: "ai_failure",
  PAYMENT_STATUS_CHANGE: "payment_status_change",
  DEVELOPER_ACTION: "developer_action"
});

/* ---------- Phase 8: Developer Audit Log ---------- */
export const AUDIT_ACTIONS = Object.freeze({
  ACTIVATE: "activate_account",
  SUSPEND: "suspend_account",
  DISABLE: "disable_account",
  RESTORE: "restore_account",
  DELETE: "delete_account",
  EXTEND_TRIAL: "extend_trial",
  CHANGE_PLAN: "change_plan",
  CHANGE_BILLING_DATE: "change_billing_date",
  CHANGE_STATUS: "change_status",
  APPLY_UPGRADE: "apply_requested_upgrade",
  RESET_PASSWORD: "reset_password_placeholder",
  // Phase 9
  SAVE_AI_CONFIG: "save_ai_config",
  SAVE_MASTER_PROMPT: "save_master_prompt",
  RESET_MASTER_PROMPT: "reset_master_prompt",
  TOGGLE_FEATURE_FLAG: "toggle_feature_flag",
  SAVE_INTEGRATION: "save_integration",
  EXPORT_BACKUP: "export_backup",
  IMPORT_BACKUP: "import_backup",
  SEED_DEMO_DATA: "seed_demo_data",
  CLEAR_DEMO_DATA: "clear_demo_data",
  RESET_APPLICATION: "reset_application",
  CLEAR_CACHE: "clear_cache",
  // Phase 10
  APPROVE_PAYMENT: "approve_gcash_payment",
  REJECT_PAYMENT: "reject_gcash_payment",
  SAVE_GCASH_SETTINGS: "save_gcash_settings",
  SAVE_COMMISSION_CONFIG: "save_commission_config",
  // Phase 13
  SAVE_PAYMENT_NOTE: "save_payment_internal_note"
});

export const AUDIT_ACTION_LABELS = Object.freeze({
  [AUDIT_ACTIONS.ACTIVATE]: "Activated account",
  [AUDIT_ACTIONS.SUSPEND]: "Suspended account",
  [AUDIT_ACTIONS.DISABLE]: "Disabled account",
  [AUDIT_ACTIONS.RESTORE]: "Restored account",
  [AUDIT_ACTIONS.DELETE]: "Deleted account",
  [AUDIT_ACTIONS.EXTEND_TRIAL]: "Extended trial",
  [AUDIT_ACTIONS.CHANGE_PLAN]: "Changed plan",
  [AUDIT_ACTIONS.CHANGE_BILLING_DATE]: "Changed billing date",
  [AUDIT_ACTIONS.CHANGE_STATUS]: "Changed subscription status",
  [AUDIT_ACTIONS.APPLY_UPGRADE]: "Applied requested upgrade",
  [AUDIT_ACTIONS.RESET_PASSWORD]: "Reset password (placeholder)",
  [AUDIT_ACTIONS.SAVE_AI_CONFIG]: "Updated AI configuration",
  [AUDIT_ACTIONS.SAVE_MASTER_PROMPT]: "Updated master system prompt",
  [AUDIT_ACTIONS.RESET_MASTER_PROMPT]: "Reset master system prompt to default",
  [AUDIT_ACTIONS.TOGGLE_FEATURE_FLAG]: "Toggled feature flag",
  [AUDIT_ACTIONS.SAVE_INTEGRATION]: "Updated integration settings",
  [AUDIT_ACTIONS.EXPORT_BACKUP]: "Exported full backup",
  [AUDIT_ACTIONS.IMPORT_BACKUP]: "Imported backup",
  [AUDIT_ACTIONS.SEED_DEMO_DATA]: "Seeded demo data",
  [AUDIT_ACTIONS.CLEAR_DEMO_DATA]: "Cleared demo data",
  [AUDIT_ACTIONS.RESET_APPLICATION]: "Reset application data",
  [AUDIT_ACTIONS.CLEAR_CACHE]: "Cleared local cache",
  [AUDIT_ACTIONS.APPROVE_PAYMENT]: "Approved GCash payment",
  [AUDIT_ACTIONS.REJECT_PAYMENT]: "Rejected GCash payment",
  [AUDIT_ACTIONS.SAVE_GCASH_SETTINGS]: "Updated GCash payment settings",
  [AUDIT_ACTIONS.SAVE_COMMISSION_CONFIG]: "Updated commission engine settings",
  [AUDIT_ACTIONS.SAVE_PAYMENT_NOTE]: "Updated internal payment note"
});

/* ---------- Phase 10: GCash Billing & Commission Engine ---------- */

export const GCASH_PAYMENT_STATUS = Object.freeze({
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected"
});

export const GCASH_PAYMENT_STATUS_LABELS = Object.freeze({
  [GCASH_PAYMENT_STATUS.SUBMITTED]: "Awaiting verification",
  [GCASH_PAYMENT_STATUS.APPROVED]: "Approved",
  [GCASH_PAYMENT_STATUS.REJECTED]: "Rejected"
});

export const COMMISSION_MODES = Object.freeze({
  FIXED: "fixed",
  PERCENTAGE: "percentage",
  DISABLED: "disabled"
});

export const COMMISSION_MODE_LABELS = Object.freeze({
  [COMMISSION_MODES.FIXED]: "Fixed peso fee",
  [COMMISSION_MODES.PERCENTAGE]: "Percentage fee",
  [COMMISSION_MODES.DISABLED]: "Disabled — no fee"
});

// Defaults: fee disabled until a Developer turns it on, same "off until
// explicitly configured" posture as devConsolePassword.
export const DEFAULT_COMMISSION_CONFIG = Object.freeze({
  mode: COMMISSION_MODES.DISABLED,
  fixedAmount: 50,
  percentage: 5
});

export const DEFAULT_GCASH_SETTINGS = Object.freeze({
  qrImageDataUrl: "",
  qrImageFileName: "",
  gcashNumber: "",
  accountName: ""
});

/* ---------- Phase 5: Lead CRM ---------- */

/** Ordered pipeline — index order is used for "sort by status" too. */
export const LEAD_STATUSES = Object.freeze([
  "New", "Contacted", "Scheduled", "Trial Completed", "Converted", "Lost"
]);

export const LEAD_SOURCES = Object.freeze([
  "Messenger", "Website", "Walk-in", "Referral"
]);

// The public marketing demo widget (index.html) has no logged-in gym and
// no tenant session — it's a standalone sales-demo page, not a real
// customer-facing widget for any gym in the system. Leads it captures
// are tagged with this reserved id so they're clearly separated from
// real gyms' CRM data and never show up in any Gym Owner's Leads page.
// A real per-gym public widget (Phase 6+) would pass the actual gymId.
export const DEMO_GYM_ID = "gym_demo_widget";

/** Phase 5 Lead Routing. "core" always shows Connected and can't be
 *  turned off (every captured lead always lands in the local CRM).
 *  "working" providers are real, functioning, client-side features.
 *  "placeholder" providers have no backend behind them yet — Test
 *  Connection always surfaces a real (not faked) error so the status
 *  colors reflect what's actually true, not a simulated success. */
export const LEAD_ROUTING_PROVIDERS = Object.freeze([
  { id: "localCrm", label: "Local CRM", kind: "core", description: "Every captured lead is always saved here — this is the Leads page." },
  { id: "csvExport", label: "CSV Export", kind: "working", description: "Download any set of leads as a CSV file, on demand." },
  { id: "jsonExport", label: "JSON Export", kind: "working", description: "Download any set of leads as a JSON file, on demand." },
  { id: "googleSheets", label: "Google Sheets", kind: "placeholder", description: "Auto-append new leads to a Google Sheet." },
  { id: "n8nWebhook", label: "n8n Webhook", kind: "placeholder", description: "POST new leads to an n8n workflow webhook.", hasUrl: true },
  { id: "zapier", label: "Zapier", kind: "placeholder", description: "Trigger a Zap whenever a new lead comes in." },
  { id: "makeCom", label: "Make.com", kind: "placeholder", description: "Trigger a Make.com scenario whenever a new lead comes in." }
]);

export const DEFAULT_GYM_INFO =
`Gym name: Commonwealth Fitness Hub
Location: Commonwealth Ave, near San Francisco High School, Quezon City
Hours: Mon–Sat 5:00 AM–10:00 PM, Sun 7:00 AM–8:00 PM
Monthly membership: ₱1,200/month, no lock-in contract
Walk-in rate: ₱150/session
Student discount: ₱1,000/month with valid school ID
Free trial: one free session, no commitment
Trainers: 3 certified trainers, personal training ₱300/session add-on
Group classes: Zumba (Mon/Wed/Fri 6PM), Boxing fitness (Tue/Thu 7PM)
Payments accepted: Cash, GCash, Maya
Parking: Free parking for members, limited street parking for walk-ins
Amenities: Free weights, machines, aircon, showers, lockers`;

/* ---------- Phase 6: Subscription Plans & Billing ---------- */

// Hard-coded and NOT editable by Gym Owners. Only a future Developer
// billing-admin tool changes these — see subscription-service.js and
// owner-subscription-page-ui.js, neither of which exposes an edit path.
// `features` (Phase 11) is additive metadata for the public pricing page's
// comparison table ONLY — it drives no billing logic. It's kept on this
// same record (rather than a parallel list in pricing.html) specifically
// so the pricing page can never quote a plan/price the subscription
// system doesn't also charge — see docs/PHASE11_NOTES.md.
export const SUBSCRIPTION_PLANS = Object.freeze([
  { id: "starter", name: "Starter", priceMonthly: 1500, blurb: "Core AI receptionist for a single-location gym just getting started.",
    features: Object.freeze({ branches: "1 branch", messenger: true, sheetsSync: false, dailySummary: false, customScript: false, whatsapp: false, prioritySupport: false }) },
  { id: "pro",     name: "Pro",     priceMonthly: 2500, blurb: "Everything in Starter, plus the full Lead CRM and routing options.",
    features: Object.freeze({ branches: "1 branch", messenger: true, sheetsSync: true, dailySummary: true, customScript: true, whatsapp: false, prioritySupport: false }) },
  { id: "elite",   name: "Elite",   priceMonthly: 4000, blurb: "For gyms that want priority support and every feature on day one.",
    features: Object.freeze({ branches: "Multi-branch", messenger: true, sheetsSync: true, dailySummary: true, customScript: true, whatsapp: true, prioritySupport: true }) }
]);

export const PLAN_FEATURE_ROWS = Object.freeze([
  { key: "branches",        label: "Branches" },
  { key: "messenger",       label: "Messenger auto-replies" },
  { key: "sheetsSync",      label: "Google Sheets lead sync" },
  { key: "dailySummary",    label: "Daily lead & conversion summary" },
  { key: "customScript",    label: "Custom gym info & pricing script" },
  { key: "whatsapp",        label: "WhatsApp + Messenger" },
  { key: "prioritySupport", label: "Priority setup & changes" }
]);

export const SUBSCRIPTION_STATUS = Object.freeze({
  TRIALING: "trialing",
  ACTIVE: "active",
  PENDING_PAYMENT: "pending_payment",
  GRACE_PERIOD: "grace_period",
  SUSPENDED: "suspended",
  DISABLED: "disabled",
  CANCELED: "canceled",
  EXPIRED: "expired"
});

export const SUBSCRIPTION_STATUS_LABELS = Object.freeze({
  [SUBSCRIPTION_STATUS.TRIALING]: "Trialing",
  [SUBSCRIPTION_STATUS.ACTIVE]: "Active",
  [SUBSCRIPTION_STATUS.PENDING_PAYMENT]: "Pending Payment",
  [SUBSCRIPTION_STATUS.GRACE_PERIOD]: "Grace Period",
  [SUBSCRIPTION_STATUS.SUSPENDED]: "Suspended",
  [SUBSCRIPTION_STATUS.DISABLED]: "Disabled",
  [SUBSCRIPTION_STATUS.CANCELED]: "Canceled",
  [SUBSCRIPTION_STATUS.EXPIRED]: "Expired"
});

export const INVOICE_STATUS = Object.freeze({
  PENDING: "pending",
  PAID: "paid",
  OVERDUE: "overdue",
  CANCELED: "canceled"
});

export const INVOICE_STATUS_LABELS = Object.freeze({
  [INVOICE_STATUS.PENDING]: "Pending",
  [INVOICE_STATUS.PAID]: "Paid",
  [INVOICE_STATUS.OVERDUE]: "Overdue",
  [INVOICE_STATUS.CANCELED]: "Canceled"
});

/* ---------- Phase 3: Business Settings ---------- */
// Shape of one gym's editable settings record. gym-settings-service.js
// merges saved data over this default so a brand-new gym always has
// every field defined (never undefined in the form).
export const DEFAULT_BUSINESS_SETTINGS = Object.freeze({
  gymName: "",
  logoFileName: "",           // placeholder only — see Business Settings panel note
  address: "",
  contactNumber: "",
  facebookUrl: "",
  instagramUrl: "",
  hours: "",
  membershipFee: "",
  walkInFee: "",
  studentDiscount: "",
  ptRate: "",
  parkingAvailable: "unspecified", // "yes" | "no" | "unspecified"
  welcomeMessage: "",
  faqs: [],                   // [{ id, question, answer }]

  // Phase 4: AI Settings — feed the AI Receptionist's prompt (via
  // ai-profile-service.js) without touching the Gemini key or the
  // raw system prompt, which stay Developer-only concerns.
  description: "",            // free-text: what the gym is, vibe, specialties
  trainerAvailable: "unspecified",   // "yes" | "no" | "unspecified"
  freeTrialAvailable: "unspecified"  // "yes" | "no" | "unspecified"
});

export const BUSINESS_SETTINGS_FIELD_MAX_LEN = 300;
export const WELCOME_MESSAGE_MAX_LEN = 600;
export const DESCRIPTION_MAX_LEN = 600;
export const FAQ_MAX_COUNT = 20;
export const FAQ_FIELD_MAX_LEN = 500;

/* ---------- Phase 3: Owner dashboard demo metrics ----------
   Everything here is illustrative placeholder data for metrics
   that need a real backend / AI conversation log to compute for
   real (Phase 4 AI Receptionist, Phase 5 Lead CRM). Leads, trials,
   and revenue are NOT here — those already come from real captured
   leads via dashboard-service.js. */
export const OWNER_DEMO_METRICS = Object.freeze({
  membershipInquiriesToday: 7,
  convertedMembersThisMonth: 5,
  aiResponseRate: 0.97,
  avgResponseTimeSeconds: 8
});

export const DEMO_SCRIPT = Object.freeze([
  { role:"system", text:"— Demo started —" },
  { role:"user", text:"Magkano po monthly membership?" },
  { role:"bot", text:"Hi po! Monthly membership is ₱1,200, no lock-in contract. May student rate din po kami at ₱1,000/month with valid ID." },
  { role:"user", text:"Medyo mahal po." },
  { role:"bot", text:"Gets po! We actually have a free trial session so you can try the gym before deciding — walang commitment. Gusto niyo po ba mag-book?" },
  { role:"user", text:"Sige po, gusto ko mag free trial." },
  { role:"bot", text:"Perfect! Filling up a quick booking for you now." },
  { role:"booking", data:{ name:"Marikit Santos", phone:"0917 123 4567", preferredTime:"Weekend", goal:"Weight loss" } },
  { role:"bot", text:"Booked na po si Marikit for the weekend! Dashboard on the right just updated. 💪" },
  { role:"system", text:"— Demo complete — this is what happens automatically, 24/7, while you sleep — " }
]);
