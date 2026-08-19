# GymBot QC — Phase 11 Notes: Production Hardening, Security & Launch Preparation

## A naming note first
Your brief called this "Phase 10." This codebase's `docs/PHASE10_NOTES.md`
already documents a different, earlier round of work (GCash Billing &
Commission Engine). To keep the phase numbers meaning "the order things
were actually built in" rather than colliding, this round is filed as
**Phase 11** — same convention Phase 9 and Phase 10 each used when their
own brief's number collided with something already on disk. Nothing from
the real Phase 10 was touched or renamed.

## Where this round starts from
Before writing anything, this round audited what the Phase 1–10 codebase
already had, because a large fraction of the brief was already built:

- **Security**: `escapeHtml()`/`clampText()` in `utils.js`, used
  everywhere user/AI text reaches `innerHTML`; every `storage.getJSON()`
  call is corruption-safe by construction (`StorageAdapter` never
  throws); `csvEscape()` for exports; image-type + byte-size validation
  on every upload (GCash QR, payment proofs); duplicate-submission
  guards (`getPendingPaymentForGym`); `window.confirm`/`window.prompt`
  gates on every destructive Developer action; a full audit log
  (`audit-log-service.js`); no `eval`, `new Function()`, hidden iframes,
  or obfuscation anywhere in the codebase.
- **Stability**: try/catch around every storage read/write, a 15s Gemini
  timeout with capped retries, `navigator.onLine` detection with a
  rule-based fallback reply, empty/loading states throughout the owner
  dashboard, corrupted-JSON auto-reset instead of a crash.
- **Backup & Recovery**: `dev-console-service.js`'s `exportBackup()` /
  `importBackup()`, already wired into a "Backup & Restore" Dev Console
  tab, already shape-validates an uploaded file before restoring.
- **Deployment**: already a static, no-build, relative-path site (see
  `index.html`'s own "Deployment checklist" `<details>` block).
- **A landing page + pricing section + Setup panel + Security/Bug/
  Deployment audits** already live on `index.html` itself.

Re-documenting all of that as if it were new would misrepresent the
codebase. What follows is what this round actually *added*, plus
pointers to the pre-existing work above where the brief asked for it.

## What Phase 11 added

### 1. Sales Demo (Dev Console → "Sales Demo" tab)
`js/services/demo-mode-service.js` seeds one realistic, presentable gym
(business settings, a lead pipeline spanning New→Converted/Lost, an
active paid subscription, invoice history) — distinct from the existing
"Database Utilities" tab, which generates bulk throwaway records
(`Demo Lead 1`, `Demo Gym 2`, ...) for stress-testing tables. Sales Demo
is for showing a real prospective gym owner what their dashboard will
look like; Database Utilities is a developer test-data generator. Seed,
reseed, and clear are all one click, and the seeded gym is a completely
normal row in the Gym Registry — nothing about it is hard-coded into
any other page.

### 2. "Preview as Gym Owner" (Developer View ⇄ Gym Owner View)
A Developer can open `owner-dashboard.html?devview=<gymId>` — via a new
button in both the Sales Demo tab and the existing Gym Registry "View"
modal — in a **new tab**, without logging out of their Developer session
in the original tab. `main-owner-dashboard.js` only honors `?devview=`
when the *real*, currently-authenticated session (checked server-side-
equivalent via `getSession()`, not the URL) has the Developer role; a
Gym Owner or an unauthenticated visitor can never use this param to see
another gym. The preview tab shows a persistent amber banner ("🔎
Developer preview...") so it's never mistaken for a real owner login,
and a "Close preview" button in place of "Log out" (there's no owner
session here to log out of).

This satisfies the brief's "switch between Developer View and Gym Owner
View without logging out" — implemented as two tabs rather than an
in-page toggle, because the app's session model is genuinely one role
per session (see `auth-guard.js`'s comments on why); a same-tab toggle
would mean secretly swapping out the Developer's session, which is a
worse security story than what's here.

### 3. Dedicated pricing page (`pricing.html`)
Plan cards + a feature comparison table, both rendered from
`SUBSCRIPTION_PLANS`/`PLAN_FEATURE_ROWS` in `config.js` — the exact
records `subscription-service.js` bills against. This was a deliberate
single-source-of-truth choice: the pricing page cannot quote a plan or
price the subscription system doesn't also charge, because they're
the same object. `SUBSCRIPTION_PLANS` gained a `features` map per plan;
nothing about billing math changed.

### 4. Customer onboarding wizard (`onboarding.html`)
A 7-step flow — Create account → Gym info → Pricing → Hours → Test AI
Receptionist → Review → Start trial — with a progress rail. Every step
writes through the *same* service calls Business Settings / Auth
already use (`registerGymOwner`, `saveBusinessSettings`,
`getBusinessSettings`) — there's no parallel "onboarding data" model, so
a gym that finishes this wizard is indistinguishable, to every other
page, from one set up by hand. Step 5 ("Test AI Receptionist") reuses
the same static profile-text preview `owner-ai-page-ui.js` already
shows — it does **not** call the Gemini API, preserving that page's
existing permission boundary ("never import gemini-service.js from
owner-facing code"). Step 7 doesn't do anything special to "start" the
trial beyond what already happens: `getSubscription(gymId)` lazily
creates a Trialing record on first read, same as it always has.
An owner who already has an account is dropped straight into step 2
(gym info) if they open the wizard again, instead of being asked to
re-register.

### 5. Landing page: FAQ + Contact sections
`index.html` already had Hero, chat demo, Pricing, Setup, and Audits.
Added a `#faq` section (six questions gym owners actually ask) and a
`#contact` section (placeholder email/Messenger, clearly labeled as
such — see the Launch Guide for what to fill in before a real launch).
Nav links updated to point at the new sections and at `pricing.html`/
`onboarding.html`.

### 6. Documentation
This file, plus `README.md` (Launch Guide), `docs/DEPLOYMENT_CHECKLIST.md`,
`docs/SECURITY_AUDIT.md`, `docs/BUG_PREVENTION_AUDIT.md`,
`docs/PERFORMANCE_SUMMARY.md`, and `docs/ROADMAP_V2.md` — separated out
as standalone deliverables rather than only living inside `index.html`'s
`<details>` blocks, per the brief's "Final Deliverables" list. The
in-page audits on `index.html` are left in place (a prospective gym
owner reads those, not this `docs/` folder) and now cross-reference the
standalone versions.

## What this round deliberately did NOT do
- **No real payment gateway, no server backend, no real Gemini-key
  security fix.** Those all require infrastructure this static site
  doesn't have — see `docs/SECURITY_AUDIT.md`'s "Known limitation" and
  `docs/ROADMAP_V2.md`. Building a fake version of either would be worse
  than being honest that they're still placeholders, same stance every
  prior phase has taken.
- **No rewrite of existing security/stability code.** It was already
  solid; this round verified and documented it rather than touching
  working code for its own sake.
- **No change to `js/demo.js`** (the landing-page 60-second chat demo) —
  it's a different, older feature (a scripted chat sequence for
  anonymous visitors) from the new Sales Demo (a seeded gym a Developer
  can log into and show around). Both are called "demo" in normal
  conversation; they don't share code.

## What Phase 12 should build next
1. A real backend for the Gemini key (see Security Audit) — the single
   highest-priority item before onboarding a paying gym with a public
   link.
2. Recurring billing automation (carried over from Phase 10's own
   "what's next" list — still true).
3. An actual analytics/observability story once there's a server to
   collect it from — right now "performance" is entirely client-side
   and un-instrumented in production (see Performance Summary).
4. Notification read/unread sync across tabs (also carried over from
   Phase 10).

Stopping here per your instructions.
