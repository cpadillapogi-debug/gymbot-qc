# GymBot QC — Phase 9 Notes: Hidden Developer Console & Internal System Configuration

> **Naming note:** this repo's own `docs/PHASE8_NOTES.md` already used
> "Phase 8" for an earlier, different round of Developer Dashboard work
> (audit log, full account lifecycle controls, expanded Gym Registry,
> Developer analytics — built on the Phase 7 Master Admin shell). The
> brief for *this* round — a hidden console with a secret click-trigger,
> Gemini AI tuning, a master system-prompt editor, diagnostics, logs,
> backup/restore, an integration hub, database utilities, and feature
> flags — is a distinct, later piece of work. To keep the repo's phase
> numbering sequential and honest, it's filed as **Phase 9**. Nothing
> from Phase 7 or 8 was replaced; this extends the existing Master Admin
> shell in place.

## What shipped

- **A new "Developer Console" page** inside the existing Master Admin
  shell (`dashboard.html` / `admin-shell-ui.js`), with its own left-hand
  tab strip: AI Configuration, Master System Prompt, System Diagnostics,
  Logs, Backup & Restore, Integration Hub, Database Utilities, Feature
  Flags, and Version. All rendering/wiring lives in
  `js/ui/admin-dev-console-ui.js`; all real logic and storage lives in
  the new `js/services/dev-console-service.js` — same split every other
  page in this codebase already follows.
- **A hidden access trigger**: clicking the sidebar's "GB" brand mark
  5 times within 3 seconds reveals a `Developer Console` nav link that
  is `hidden` by default (`wireHiddenDevConsoleTrigger()`). If a console
  password has been set (Version tab → "Console access password"), a
  `window.prompt()` gate must be passed first; if none is set yet, the
  click-pattern alone reveals it. See **Security considerations** below
  for what this trigger does and doesn't protect.
- **AI Configuration**: model (from a fixed list of selectable Gemini
  models), temperature, max output tokens, response timeout, retry
  attempts, an AI personality string, and a default fallback response —
  all stored separately from Gym Owner data (`gymbot_dev_ai_config`,
  never touched by `gym-settings-service.js` or any owner-facing code).
  `gemini-service.js` now reads these overrides instead of the old
  hard-coded `temperature: 0.7, maxOutputTokens: 300` and
  `CONFIG.GEMINI_MODEL` / `CONFIG.GEMINI_TIMEOUT_MS` /
  `CONFIG.GEMINI_MAX_RETRIES` — with those same values as the defaults,
  so behavior is unchanged until a Developer edits something. A "Test
  connection" button reuses `testGeminiConnection()`.
- **Master System Prompt Editor**: the system-prompt template that used
  to be hard-coded inside `gym-info-service.js`'s `buildSystemPrompt()`
  now lives in `dev-console-service.js` as an editable
  `masterPromptTemplate`, with `{gymInfo}` and `{memoryBlock}`
  placeholders. Edit / Save / Reset to default / Preview are all wired;
  "Version history" is an explicit **placeholder** (see Known
  placeholders) — every save currently overwrites the previous template
  with no diff or rollback. Gym Owners have no path to this data at all;
  `owner-ai-page-ui.js`'s existing permission-boundary comment (never
  import `gemini-service.js` or the raw prompt) still holds.
- **System Diagnostics**: a "Run Diagnostics" button computes, live and
  read-only: API-key-saved status, an estimated `localStorage` byte
  usage, and counts of gyms/users/leads/invoices/subscriptions, plus
  `navigator.userAgent`, the build number, and app version.
- **Logs**: a new, separate log stream (`gymbot_system_logs`, capped at
  `CONFIG.SYSTEM_LOG_MAX_ENTRIES`) from the existing Developer **audit**
  log (`gymbot_audit_log`, Phase 8) — the audit log is specifically
  Developer-mutation actions on gym accounts; this new log is
  broader/technical: login attempts, AI failures, and lead creation are
  wired end-to-end (`auth-service.js`, `gemini-service.js`,
  `leads-service.js` each call `logSystemEvent()` at the point of the
  event). API errors, subscription changes, and payment-status changes
  have categories defined (`SYSTEM_LOG_CATEGORIES`) but **no emitting
  call sites yet** — see Known placeholders. Filterable by level and
  date in the UI.
- **Backup & Restore**: `exportBackup()` walks every key in
  `CONFIG.STORAGE_KEYS` and serializes it into one JSON file, downloaded
  client-side. `importBackup()` restores only recognized logical keys
  (unknown keys in an uploaded file are ignored rather than guessed
  about) and requires a `window.confirm()` before it runs.
- **Integration Hub**: placeholder cards for Google Sheets, n8n, Zapier,
  Make.com, Facebook Messenger, WhatsApp, and Telegram — API key +
  webhook URL fields (where applicable) can be saved, but
  `testIntegrationConnection()` always returns a real, honest "not wired
  to a backend yet" result rather than faking success — same pattern
  Phase 5's `LEAD_ROUTING_PROVIDERS` placeholders already use.
- **Database Utilities**: seed demo gyms/leads/invoices (tagged
  `_demo: true`, never mixed with real tenant records), clear demo data,
  reset application (full wipe, double-`confirm()`-gated), and clear
  cache (clears only `gymbot_system_logs` — never gym/user/lead/invoice/
  settings data). "Rebuild local indexes" from the brief has no concept
  to rebuild in this client-only architecture (there's no index to
  build) and was intentionally left out rather than faked.
- **Feature Flags**: `aiReceptionist`, `crm`, `subscriptions`,
  `billing`, `gcash`, `analytics`, `messengerIntegration`, and
  `experimentalFeatures` toggles, defaulting to **on**. Stored and
  readable via `isFeatureEnabled()`, but — see Known placeholders — no
  existing page currently checks these flags before rendering. They are
  wired for storage/toggling/audit-logging, not yet for enforcement.
- **Version**: static display of `CONFIG.APP_VERSION` /
  `APP_BUILD` / a fixed release date / `APP_ENVIRONMENT`. No real update
  mechanism exists (there's no backend to check against in this
  architecture) — the brief's "placeholder for future update
  management" is exactly that, a placeholder, and is documented as such
  in the UI copy rather than implied to do more.
- **Every mutating Developer Console action is audit-logged** the same
  way Phase 8 already established: `recordAuditEntry()` is called at
  the point of mutation (inside the UI's event handlers here, since
  `dev-console-service.js` functions are mostly pure config
  read/writes rather than tenant-scoped actions) with new
  `AUDIT_ACTIONS` entries (`SAVE_AI_CONFIG`, `SAVE_MASTER_PROMPT`,
  `RESET_MASTER_PROMPT`, `TOGGLE_FEATURE_FLAG`, `SAVE_INTEGRATION`,
  `EXPORT_BACKUP`, `IMPORT_BACKUP`, `SEED_DEMO_DATA`,
  `CLEAR_DEMO_DATA`, `RESET_APPLICATION`, `CLEAR_CACHE`).

## Files touched vs. added

**Added:** `js/services/dev-console-service.js`,
`js/ui/admin-dev-console-ui.js`, `docs/PHASE9_NOTES.md`.

**Touched:**
- `js/config.js` — new storage keys, `DEFAULT_DEV_AI_CONFIG`,
  `GEMINI_SELECTABLE_MODELS`, `FEATURE_FLAG_DEFINITIONS`,
  `DEFAULT_FEATURE_FLAGS`, `INTEGRATION_DEFINITIONS`,
  `SYSTEM_LOG_LEVELS`/`SYSTEM_LOG_CATEGORIES`, new `AUDIT_ACTIONS` +
  labels, new tunable constants (click-trigger timing, clamp ranges,
  app version/build/environment).
- `js/services/gemini-service.js` — reads `getDevAiConfig()` for
  model/temperature/maxOutputTokens/timeoutMs/retryAttempts instead of
  hard-coded values; logs AI failures via `logSystemEvent()`.
- `js/services/gym-info-service.js` — `buildSystemPrompt()` now renders
  from the editable master template via `dev-console-service.js`'s
  `buildSystemPromptFromTemplate()`, instead of a hard-coded template
  string. Identical default output.
- `js/services/auth-service.js` — `login()` logs successful/failed
  login attempts via `logSystemEvent()`.
- `js/services/leads-service.js` — `captureLead()` logs new-lead
  creation via `logSystemEvent()`.
- `js/ui/admin-shell-ui.js` — registers the `dev-console` page/route,
  calls `initAdminDevConsolePage()` / `refreshAdminDevConsolePage()` /
  `wireHiddenDevConsoleTrigger()`.
- `dashboard.html` — hidden nav link + the Developer Console page
  markup (tab strip + content mount point).
- `css/admin-dashboard.css` — tab strip, form-group, and hidden-link
  styling for the console.

## Hidden access mechanism, explained

`dashboard.html` was already 100% Developer-only end to end — Gym
Owners are redirected away by `requireRole(ROLES.DEVELOPER)` in
`main-dashboard.js` before any of this code even runs, the same as
Phase 7/8's Gym Registry and Audit Log pages. So the click-trigger is
**not** the thing standing between a Gym Owner and this console; the
login-gated role check already is. What the click-trigger adds is:

1. A quieter default nav (the console link is `hidden` until revealed,
   so it doesn't clutter the sidebar for the vast majority of visits
   that don't need it).
2. An optional **second, deliberate gate** — a password, set once from
   the console's own Version tab — for the specific case where the
   Developer wants a "did I really mean to open this" check before
   reaching AI keys and destructive database tools, even on their own
   already-authenticated machine.

If no password has ever been set, 5 clicks alone reveal the link — this
is the state a brand-new install starts in, matching the brief's literal
click-count/timing requirement while leaving the password step opt-in
rather than mandatory friction on day one.

## Configuration management, explained

Every Developer-only setting introduced here (`devAiConfig`,
`masterPromptTemplate`, `featureFlags`, `integrations`, `systemLogs`,
`devConsolePassword`) lives under its own `CONFIG.STORAGE_KEYS` entry,
completely separate from Gym Owner data (`businessSettings`, `gymInfo`
as the Owner sees it via Business Settings, `leadRouting`, etc.). No
owner-facing UI module imports `dev-console-service.js`, and no
Developer-console code imports owner-facing UI modules — the same
one-directional boundary Phase 7's header comment on
`admin-shell-ui.js` already documents for the rest of Master Admin.

## Backup and restore, explained

`exportBackup()` is a flat, honest dump: it iterates every logical key
in `CONFIG.STORAGE_KEYS`, JSON-parses whatever's there (falling back to
the raw string for non-JSON values like the API key or theme), and
wraps it with an `exportedAt` timestamp and the current app version.
`importBackup()` only ever writes back logical keys that exist in
`CONFIG.STORAGE_KEYS` today — if you feed it a backup from a future
version with unknown keys, those are silently skipped rather than
guessed about or partially applied. The UI requires a native
`window.confirm()` naming the filename before any restore runs, and a
successful restore is audit-logged.

## Security considerations

- **The hidden console is obscurity, not a second authentication
  system.** The real security boundary is `requireRole(DEVELOPER)` at
  the top of `main-dashboard.js`, exactly as before this phase. The
  click-pattern and the optional password are both plain client-side
  JavaScript in a static app with no backend — anyone with browser
  dev tools open on an already-authenticated Developer session (or
  anyone who reads this repo's source) can find the password check or
  read `gymbot_dev_console_password` straight out of `localStorage`.
  Treat the password as a "don't fat-finger this" speed bump for
  yourself, not as protection against another party who already has
  access to the machine.
- **The Gemini API key is stored in `localStorage` in plaintext**, same
  as it always was pre-Phase-9 (`api-key-service.js`) — this phase
  doesn't change that exposure, it just adds more Developer-only
  settings living the same way. In a fully client-side app, anyone with
  access to that browser profile's storage can read it. If this ever
  needs to be genuinely secret (e.g., a shared/public machine, or
  multiple people with Developer-role logins), the key needs to move
  behind a real backend that the browser never sees directly — that's
  a bigger architectural change than this phase, flagged here rather
  than silently left implied as "handled."
- **Destructive actions require `window.confirm()`**, and "Reset
  application" requires two, per the brief's "prevent accidental data
  deletion" requirement. These are UI-level guards only — there is no
  server-side undo; a Developer who confirms through both prompts has
  genuinely deleted the data (recoverable only via a prior exported
  backup).
- **Feature flags are stored/toggled/audit-logged but not yet
  enforced** anywhere else in the app (see Known placeholders) —
  flipping "CRM" off right now does not actually hide the Leads CRM
  page. Don't rely on them for access control until that wiring exists.

## Known placeholders (explicitly not implemented, and why)

- **Master prompt version history** — no diff/rollback; each save
  overwrites the last. Flagged in the UI copy itself, not just here.
- **Feature flag enforcement** — flags exist and persist, but no
  existing page/route checks them yet.
- **Integration Hub connections** — no real OAuth/webhook backend
  exists for any of the seven listed services; "Test connection"
  always reports this honestly rather than simulating success.
- **"Rebuild local indexes"** — omitted entirely rather than faked;
  there's no index structure in this client-only storage model for it
  to apply to.
- **Update management** — Version tab is a static display; there's no
  backend to check for updates against.
- **Logs coverage** — login attempts, AI failures, and lead creation
  emit real log entries. API errors (beyond AI failures), subscription
  changes, and payment-status changes have categories defined but no
  call sites wired yet — the existing Phase 8 audit log already covers
  the Developer-driven subset of those (plan/status/billing-date
  changes), so this is a smaller gap than it looks: what's missing is
  logging the *owner-triggered or automatic* side of those same
  transitions (e.g. the scheduled Trialing → Pending Payment rollover
  in `subscription-service.js`) to this new, broader log.

## What Phase 10 should build next

1. **Wire feature-flag enforcement** into the pages/routes each flag
   names (e.g. gate the Leads CRM nav item on `isFeatureEnabled('crm')`,
   gate the chat widget on `aiReceptionist`).
2. **Emit the remaining log categories** — subscription-service.js's
   automatic status transitions and invoice-service.js's status changes
   should call `logSystemEvent()` alongside their existing
   `recordAuditEntry()` calls where the actor is the system itself, not
   a Developer.
3. **A real master-prompt version history** — keep the last N templates
   with timestamps, add a rollback action.
4. **Decide the real security posture for secrets** before any of this
   goes near a genuinely shared/public deployment — move the Gemini key
   (and the console password check) behind a server boundary rather
   than client-side `localStorage`, per the caveats above.
5. **Pick one real integration to actually wire up** (webhook POST on
   new lead is the smallest lift, reusing the existing `saveLead` /
   `captureLead` path) so the Integration Hub has at least one non-
   placeholder entry to point to.

Stop after Phase 9 and wait for approval before continuing, per the
brief.
