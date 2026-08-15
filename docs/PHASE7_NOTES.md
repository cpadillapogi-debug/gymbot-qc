# GymBot QC — Phase 7 Notes: Master Admin System & Global Gym Registry

## What shipped

- **A real Master Admin dashboard** (`dashboard.html` / `admin-shell-ui.js`),
  replacing the Phase 3 single-table placeholder. Same sidebar/topbar/
  hash-router shell pattern as the Gym Owner dashboard, with two pages:
  **Overview** and **Gym Registry**. Still Developer-role-only —
  `requireRole(ROLES.DEVELOPER)` in `main-dashboard.js` is unchanged.
- **Overview page**: platform-wide metric cards (gyms registered, Gym
  Owner accounts, an estimated MRR, gyms needing attention), a
  subscription-status breakdown across every gym, and a shortcut list
  of the five most recently registered gyms.
- **Global Gym Registry** (`admin-gym-registry-ui.js`): a searchable,
  filterable, sortable table of **every gym tenant on the platform** —
  gym name, gym ID, owner email, plan, subscription status, lead
  count, join date. Search matches gym name / owner email / gym ID;
  filter by subscription status; sort by newest, oldest, name, or lead
  count. Clicking a row opens a detail modal with the full picture for
  that one gym: owner, plan, subscription status/payment state, trial
  days remaining or amount due, lead count, and full invoice history.
- **Two Developer-only subscription overrides**, exposed as buttons in
  the Gym Registry detail modal, only when applicable:
  - **Apply upgrade** — turns a Gym Owner's `requestPlanUpgrade()`
    *request* (Phase 6) into an actual `planId` change. Shown only
    when `requestedPlanId` is set.
  - **Reactivate account** — moves a Suspended or Disabled
    subscription straight to Active with a fresh billing period
    starting today. Shown only when the subscription is Suspended or
    Disabled. This is the exact "Developer is the only role that can
    reactivate" gap called out as future work in `docs/PHASE6_NOTES.md`.
- Both actions show a toast (success or the reason it was refused) and
  re-render the modal + table in place — no page reload.
- **"Developer" is now branded "Master Admin" in every user-facing
  string** (role badge, page titles, the demo login hint on the login
  page). `ROLES.DEVELOPER` and every existing function name
  (`getAllGymsForDeveloper`, `getSeedDeveloperHint`, etc.) are
  unchanged on purpose — this is a display-layer rename only, so
  nothing that already depends on the `ROLES.DEVELOPER` string breaks.

## Files touched vs. added

**Added:** `js/services/admin-registry-service.js`,
`js/ui/admin-shell-ui.js`, `js/ui/admin-overview-page-ui.js`,
`js/ui/admin-gym-registry-ui.js`, `css/admin-dashboard.css`,
`docs/PHASE7_NOTES.md`.

**Removed:** `js/ui/account-shell-ui.js` (the Phase 3 single-table
placeholder it replaces).

**Rewritten:** `dashboard.html` (placeholder topbar-only shell → full
sidebar dashboard, reusing `owner-dashboard.css`'s shell/panel/table/
modal/badge classes wholesale since none of that chrome is actually
Gym-Owner-specific), `js/main-dashboard.js` (now boots
`renderAdminShell` instead of `renderAccountShell`).

**Touched:** `js/services/auth-service.js` (added
`getAllUsersForDeveloper()` / `getUserByIdForDeveloper()`, same
boundary style as `tenant-service.js`'s `getAllGymsForDeveloper()`),
`js/services/subscription-service.js` (added
`applyRequestedPlanUpgrade()` / `reactivateSubscription()`),
`js/ui/auth-ui.js` (demo login hint text only).

Nothing from Phases 1–6 was rewritten wholesale. Every existing
Developer-only read (`getAllGymsForDeveloper`) and the entire owner
dashboard are untouched — the permission boundary comments throughout
the codebase (`owner-shell-ui.js`'s "never import
`getAllGymsForDeveloper`" warning, etc.) still hold.

---

## 1. Permission boundary

Same pattern the codebase already uses for `getAllGymsForDeveloper()`:
**gating is the route guard's job, not the data layer's.** None of
the new Developer-only reads or writes (`getAllUsersForDeveloper()`,
`getUserByIdForDeveloper()`, `applyRequestedPlanUpgrade()`,
`reactivateSubscription()`, and everything in
`admin-registry-service.js`) check the caller's role themselves — they
trust that they are only ever reached through `dashboard.html` →
`main-dashboard.js`'s `requireRole(ROLES.DEVELOPER)` guard. This is
still a **client-side UX guard, not a real security boundary** (see
`auth-guard.js`'s own header comment) — there's no backend yet to
enforce it server-side. `admin-registry-service.js` carries the same
warning `tenant-service.js` does: never import it from
`owner-shell-ui.js` or anything it imports.

## 2. Gym Registry data model

`getGymRegistry()` doesn't introduce a new storage key — it's a pure
join across four collections that already exist:

```
gyms (tenant-service.js)
  → owner user (auth-service.js, via ownerId)
  → subscription (subscription-service.js, via getSubscription(gymId) —
    this is the SAME lazy-create-and-advance call the Gym Owner's own
    Subscription page uses, so the registry always reflects the
    current, already-transitioned state, never a stale snapshot)
  → lead count (leads-service.js, via getLeads(gymId).length)
```

`getGymDetail(gymId)` adds the gym's invoice history
(`getInvoicesForGym`) and its Business Settings display name (falls
back to the tenant record's `name` if a gym hasn't filled in Business
Settings yet).

## 3. Why "Apply upgrade" and "Reactivate" are separate actions

Kept as two distinct, narrow functions instead of one generic "edit
this gym's subscription" form, for the same reason Phase 6's
`requestPlanUpgrade()` only ever writes `requestedPlanId`:

- `applyRequestedPlanUpgrade()` can only ever move `planId` to
  whatever the owner already requested — it can't set an arbitrary
  plan, so a Master Admin can't accidentally (or maliciously, from a
  compromised admin session) put a gym on a plan nobody asked for.
- `reactivateSubscription()` can only fire from Suspended or Disabled,
  and always lands on Active with a brand-new billing period — it
  can't be used to force any other status transition.

Both are explicit stand-ins for the real payment gateway Phase 6 and
this file both call out as still missing — see "What Phase 8 should
build" below.

## 4. What Phase 8 should build next

- **The real payment gateway** — same blocker `docs/PHASE6_NOTES.md`
  already named. Once it exists, `reactivateSubscription()` here
  becomes the manual fallback for a payment that failed to auto-
  process, rather than the only path to Active.
- **Server-side enforcement of the Developer role.** Every guard in
  this codebase, this phase included, is client-side only — a real
  backend needs to reject `applyRequestedPlanUpgrade` /
  `reactivateSubscription` calls from anything but an authenticated
  Developer session.
- **An audit trail.** Right now neither override records *who*
  applied an upgrade or reactivated an account, or *when* — just the
  resulting state. A real admin tool needs a log, not just a mutation.
- **Platform-wide invoice/revenue reporting** beyond the single-gym
  invoice table already in the registry detail modal — e.g. total
  revenue collected (once `paidDate` is real), overdue invoices across
  every gym in one list, that kind of thing.
- **Provisioning additional Developer accounts** from inside the
  Master Admin UI itself, rather than only via the seeded demo account
  in `auth-service.js`.
