# GymBot QC — Phase 8 Notes: Developer Dashboard & Subscription Control

> **Naming note:** the codebase's own Phase 7 (`docs/PHASE7_NOTES.md`)
> already shipped the Master Admin shell, the Gym Registry, and two
> narrow Developer overrides (apply upgrade / reactivate). The brief
> for *this* round asked for full account lifecycle controls (activate/
> suspend/disable/restore/delete), manual trial/plan/billing/status
> overrides, a real audit log, and a fuller analytics panel — building
> **on top of** that Phase 7 work rather than replacing it. To keep the
> repo's own phase numbering honest (each `docs/PHASE*_NOTES.md` is a
> real, sequential increment), this round is filed as **Phase 8**.
> Nothing from Phase 7 was thrown away — it was extended in place.

## What shipped

- **A real Developer Audit Log** (`audit-log-service.js`, flat array
  under `gymbot_audit_log`, capped at `CONFIG.AUDIT_LOG_MAX_ENTRIES`
  entries). Every Developer-only mutation — activate, suspend, disable,
  restore, delete, extend trial, change plan, change billing date,
  change status, apply upgrade, reset-password placeholder — calls
  `recordAuditEntry()` **at the point of mutation**, inside
  `subscription-service.js` / `tenant-service.js` / `auth-service.js`
  themselves, not from the UI layer. That means there's no code path
  that can fire one of these actions and forget to log it. Each entry
  stores `action`, `gymId`, `previousValue`, `newValue`, `performedBy`
  (the signed-in Developer's email), an optional `note`, and a
  timestamp. A new **Audit Log page** (`admin-audit-log-ui.js`) lists
  every entry, searchable by gym/action/performer.
- **Full account lifecycle controls**, added as new Developer-only
  exports and exposed as buttons + small inline forms in the Gym
  Registry detail modal:
  - `activateGymManually` / `suspendGymManually` / `disableGymManually`
    — direct status overrides, distinct from the existing
    `reactivateSubscription` (which only ever fires from
    Suspended/Disabled) so a Developer can also, say, manually suspend
    an Active gym or activate one straight out of any state.
  - `deleteGymForDeveloper` / `restoreGymForDeveloper` (in
    `tenant-service.js`) — a **soft** delete: sets `gym.deletedAt`,
    which blocks that owner's `login()` with a clear message, and
    hides the gym from the registry by default (a "Show deleted"
    checkbox reveals it). Nothing scoped to the gym — leads, business
    settings, conversations, invoices, subscription record, or
    anything else — is ever touched or removed. Restore just clears
    the flag.
  - `extendTrial(gymId, days)` — only valid while Trialing; extends
    `trialEndDate` (and `nextBillingDate`, since during a trial that's
    the same date) by 1–90 days.
  - `changeSubscriptionPlanDirect(gymId, planId)` — sets `planId`
    directly to *any* plan, independent of `applyRequestedPlanUpgrade`
    (which can only ever apply what the owner already requested). Also
    clears any pending request so the two paths don't fight.
  - `changeBillingDate(gymId, isoDate)` — sets `nextBillingDate` (and
    keeps `currentPeriodEnd`/`trialEndDate` consistent with it where
    one is open).
  - `setSubscriptionStatusManually(gymId, status)` — the generic
    escape hatch for any of the 8 statuses, for cases the narrower
    actions above don't cover. Every other action is preferred where
    it fits; this one skips the derived-field bookkeeping the others
    do.
  - `resetPasswordPlaceholder(userId)` (in `auth-service.js`) — see
    "Known placeholders" below.
- **Suspension/disable enforcement** was already fully built in Phase
  6/7 (`subscription-service.js`'s `getSubscriptionAccess()` +
  `owner-billing-banner-ui.js`) and needed no changes: Suspended
  disables the AI receptionist and puts `.billing-readonly` on the
  owner shell (which disables every input/button outside Subscription/
  Help — this is what satisfies "new leads cannot be created" and
  "business settings locked"), Disabled shows a full-screen lock
  overlay. Existing leads/settings/conversations/invoices are never
  touched by either state, and reactivating restores full access
  immediately — this phase's new manual `suspendGymManually` /
  `disableGymManually` / `activateGymManually` just give a Developer
  more ways to *reach* those same, already-correct states.
- **A login-time enforcement point for deletion**: `login()` now
  checks `isGymDeleted()` for a Gym Owner and refuses the session with
  an explicit message, rather than letting a deleted account's owner
  reach the dashboard at all.
- **Expanded Gym Registry** (`admin-gym-registry-ui.js`,
  `admin-registry-service.js`): the table now also shows Trial days
  remaining, Next billing date, Owner's last login, AI status
  (on/off), and latest invoice status. The detail modal adds an
  "Account activity" section (this gym's own audit trail, most recent
  8 entries) and the full set of action controls above.
- **Owner last-login tracking**: `login()` stamps `lastLoginAt` on the
  user record (best-effort, never blocks login on failure) — this is
  what "Last login" in the registry reads.
- **Developer Analytics**, expanded from Phase 7's `getPlatformOverview()`
  into `getDeveloperAnalytics()`: total gyms, active/trial/suspended/
  disabled counts, MRR, pending payments, an illustrative 15%-of-MRR
  commission estimate, total leads across every gym, new gyms this
  month, and a placeholder "AI usage today" (gyms currently AI-enabled
  — see "Known placeholders"). All rendered as metric cards on the
  Overview page.

## Files touched vs. added

**Added:** `js/services/audit-log-service.js`,
`js/ui/admin-audit-log-ui.js`, `docs/PHASE8_NOTES.md`.

**Touched:** `js/config.js` (audit log storage key, `AUDIT_ACTIONS` /
`AUDIT_ACTION_LABELS`, two new tunables), `js/services/tenant-service.js`
(`deletedAt` field + delete/restore/isGymDeleted), `js/services/auth-service.js`
(`lastLoginAt`, deleted-gym login block, `resetPasswordPlaceholder`),
`js/services/subscription-service.js` (six new Developer actions +
audit logging added to the two Phase 7 actions), `js/services/admin-registry-service.js`
(richer registry rows, `getDeveloperAnalytics()`), `js/ui/admin-gym-registry-ui.js`
(full action UI + confirmations + "Show deleted"), `js/ui/admin-overview-page-ui.js`
(full analytics grid), `js/ui/admin-shell-ui.js` + `dashboard.html`
(Audit Log page/nav, Show-deleted toggle).

Nothing from Phases 1–7 was rewritten wholesale. The permission
boundary is unchanged: every Developer-only read/write in this phase
still trusts `dashboard.html` → `main-dashboard.js`'s
`requireRole(ROLES.DEVELOPER)` guard rather than checking the caller
itself — same pattern `tenant-service.js`'s `getAllGymsForDeveloper()`
established. None of it is imported from `owner-shell-ui.js` or
anything it imports.

---

## 1. Permission enforcement (Gym Owners vs. Developer)

Unchanged in *mechanism* from Phase 7, extended in *surface area*:

- **Route level**: `main-dashboard.js` calls
  `requireRole(ROLES.DEVELOPER)` before `admin-shell-ui.js` ever
  mounts; `main-owner-dashboard.js` calls `requireRole(ROLES.GYM_OWNER)`
  before `owner-shell-ui.js` mounts. A Gym Owner session hitting
  `dashboard.html` is redirected before any Developer-only module
  (including every new one in this phase) ever loads.
- **Import boundary**: `admin-registry-service.js`,
  `audit-log-service.js`'s write path usage, and every new function in
  `subscription-service.js`/`tenant-service.js`/`auth-service.js` are
  reachable from owner-facing code *technically* (they're just
  exports), but `owner-shell-ui.js`'s header comment (unchanged) still
  says never to import `getAllGymsForDeveloper`/`admin-registry-service.js`
  from there, and no owner-facing module does.
- **What a Gym Owner literally cannot do**, verified per the brief's
  list: change subscription status (`owner-subscription-page-ui.js`
  only ever calls `requestPlanUpgrade()`, which writes `requestedPlanId`
  and nothing else), extend their own subscription (no such export is
  imported anywhere in owner code), reactivate themselves (the lock
  overlay's only button is "Log out" — see `owner-billing-banner-ui.js`),
  modify plan pricing/billing rules (`SUBSCRIPTION_PLANS` is a frozen
  `config.js` export with no setter anywhere), view other gyms or
  Developer analytics/audit logs (no owner module imports
  `admin-registry-service.js` or `audit-log-service.js`).
- **Still client-side only.** Exactly like Phase 6/7 said: there is no
  backend yet, so this is a UX boundary, not a security boundary. See
  "What Phase 9 should build" below.

## 2. Why account lifecycle actions are separate, narrow functions

Same reasoning Phase 7 gave for keeping "apply upgrade" and
"reactivate" apart, extended to the new ones:

- `activateGymManually` / `suspendGymManually` / `disableGymManually`
  each only ever move a subscription to exactly one destination
  status, so a Developer can't accidentally land a gym somewhere
  unintended by fat-fingering a generic form. `setSubscriptionStatusManually`
  is the intentionally generic fallback for anything the narrow
  actions don't cover — kept last, and used least, on purpose.
- `deleteGymForDeveloper` is deliberately **soft** and gated with an
  `if(gym.deletedAt)` guard against double-deleting — deletion here
  means "this owner can no longer log in," never "this data is gone."
  Every UI confirmation dialog for it says so explicitly, so a
  Developer never has to guess.
- `extendTrial` refuses to run on anything but a Trialing subscription
  rather than silently no-op'ing or doing something undefined to,
  say, an Active gym's trial-shaped fields it no longer has.

## 3. Audit log data model

`recordAuditEntry()` never throws — a logging failure must never block
the mutation it's describing, so storage errors are swallowed the same
way `storage-adapter.js` already swallows quota/corrupt-JSON errors
everywhere else in this codebase. The log is a flat array (same shape
as `invoices`/`leads`), capped at `CONFIG.AUDIT_LOG_MAX_ENTRIES` with
oldest-first trimming, so it can't grow localStorage without bound in
a long-running demo session.

`performedBy` is filled in by the UI layer
(`currentDeveloperEmail()` in `admin-gym-registry-ui.js`, reading
`getCurrentUser()`) and passed down to every service call — the
service functions themselves stay decoupled from `auth-service.js`'s
session concept wherever they don't already need it, matching how
narrowly-scoped the rest of this codebase keeps its imports.

## 4. Known placeholders (same honesty pattern as every prior phase)

- **AI usage stats** are simulated: `aiUsageToday` in
  `getDeveloperAnalytics()` counts gyms *currently AI-enabled*, not
  real conversations handled — there's no conversation-logging
  backend yet.
- **Estimated commission revenue** is 15% of the simulated MRR, an
  illustrative placeholder pending a real commission/partner model.
- **`resetPasswordPlaceholder()`** does not send an email or change
  any password — there's no email delivery or backend yet (see
  `auth-service.js`'s own header comment on why password handling is
  a placeholder at all). It logs the request to the audit log and
  tells the Developer to follow up with the owner directly.
- **Login history** is a single `lastLoginAt` timestamp per user, not
  a full session-by-session log — a real login history table is
  listed under Phase 9 below.

## 5. What Phase 9 should build next

- **Server-side enforcement** of everything gated here — every guard
  in this codebase, this phase included, is client-side only.
- **A real payment gateway**, still the biggest gap named since Phase
  6 — once it exists, `changeBillingDate`/`extendTrial`/plan changes
  here become manual-correction tools instead of the only path to
  those states, and MRR/commission numbers become real instead of
  simulated.
- **A real login history table** (not just `lastLoginAt`) and a real
  AI usage/conversation log, so those two "view X history" asks in
  this brief become genuine data instead of the placeholders described
  above.
- **A real password reset flow** (email delivery + token + backend) to
  replace `resetPasswordPlaceholder()`.
- **Provisioning additional Developer accounts** from inside the
  dashboard, rather than only the seeded demo account — unchanged from
  Phase 7's own list.
