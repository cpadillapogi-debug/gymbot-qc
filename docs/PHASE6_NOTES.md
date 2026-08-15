# GymBot QC — Phase 6 Notes: Subscription System & Billing Foundation

## What shipped

- **Three hard-coded subscription plans** — Starter (₱1,500/mo), Pro
  (₱2,500/mo), Elite (₱4,000/mo) — defined once in `config.js` and never
  editable by a Gym Owner. No UI path in this phase writes to
  `SUBSCRIPTION_PLANS`; that stays a Developer-only concern.
- **A real subscription state machine** (`subscription-service.js`)
  covering all eight required states — Trialing, Active, Pending
  Payment, Grace Period, Suspended, Disabled, Canceled, Expired — driven
  entirely by dates, since there is no payment gateway yet.
- **A rebuilt Subscription page** (`owner-subscription-page-ui.js`),
  replacing the Phase 3 static placeholder: current plan, status,
  price, billing interval, next billing date, trial days remaining,
  amount due, payment status, a plan-comparison grid with a "Request
  upgrade" action per plan, and full invoice history.
- **A billing cycle simulation**: `currentPeriodStart`,
  `currentPeriodEnd`, `nextBillingDate`, `trialEndDate`, and
  `canceledAt` are all stored per gym and advanced automatically.
- **A simple invoice model** (`invoice-service.js`): Invoice ID, Gym ID,
  Plan, Amount, Status, Created date, Due date, Paid date (placeholder,
  always `null` — no real payment capture yet). Invoices are generated
  automatically as a side effect of the state machine, not by any UI
  action.
- **Cross-page billing banners + an account-lock overlay**
  (`owner-billing-banner-ui.js`), because a "your account is
  suspended" warning that only shows up on the one page an owner isn't
  currently looking at is useless. Reacts to every state exactly as
  specified:
  - Trialing → info banner with days remaining, full access.
  - Active → full access, no banner.
  - Pending Payment → warning banner ("waiting for payment
    verification"), full access.
  - Grace Period → stronger warning banner, full access.
  - Suspended → danger banner, AI Receptionist shows disabled, and
    `.owner-shell.billing-readonly` disables every input/select/
    textarea/button outside the Subscription and Help pages.
  - Disabled → a full-screen lock overlay replaces the dashboard
    entirely (Log out is the only available action).
  - Canceled → warning banner, access continues until the paid period
    ends, then auto-transitions to Expired.
  - Expired → danger banner, data stays viewable, AI Receptionist
    shows disabled.

## Files touched vs. added

**Added:** `js/services/subscription-service.js`,
`js/services/invoice-service.js`, `js/ui/owner-billing-banner-ui.js`,
`docs/PHASE6_NOTES.md`.

**Rewritten:** `js/ui/owner-subscription-page-ui.js` (Phase 3 static
placeholder → real, data-driven page).

**Touched:** `js/config.js` (plans, status/invoice enums + labels,
billing timing constants, two new storage keys), `js/utils.js`
(`addDays()`), `js/ui/owner-shell-ui.js` (wires the banner refresh into
shell load + every page navigation, passes `gymId` into the
Subscription page), `js/ui/owner-ai-page-ui.js` (shows a "disabled"
state when the subscription says so), `owner-dashboard.html` (banner
host + lock-overlay containers), `css/owner-dashboard.css` (banner,
status badge, plan card, invoice table, read-only mode, and lock
overlay styles).

Nothing from Phases 1–5 was rewritten wholesale — auth, tenant model,
Lead CRM, lead routing, and the AI Receptionist status/preview logic
are unchanged except for the subscription-access check added to the AI
Receptionist page.

---

## 1. Subscription architecture explanation

**Storage.** One record per gym, keyed by `gymId`, under
`StorageAdapter` — the same map-shaped pattern `businessSettings`
already uses (not a flat array like `leads`/`invoices`, since a
subscription is 1:1 with a gym rather than many-per-gym). Every field
that matters for billing lives on this one record:

```js
{
  gymId, planId, status,
  statusSince,            // when the CURRENT status began — drives every timer below
  trialEndDate, currentPeriodStart, currentPeriodEnd, nextBillingDate,
  canceledAt,
  requestedPlanId, upgradeRequestedAt,   // owner's upgrade REQUEST — never an actual change
  createdAt
}
```

**Layering**, same separation the rest of the app uses:
- `subscription-service.js` — plans, the state machine, billing-cycle
  math, derived display values (trial days left, amount due, payment
  status label, access flags). No DOM.
- `invoice-service.js` — invoice CRUD + tenant-scoped reads. No DOM, no
  awareness of subscription state — it only knows how to create/store/
  fetch invoices when told to.
- `owner-subscription-page-ui.js` — renders the plan/status/billing
  panel, the upgrade grid, and the invoice table; wires the "Request
  upgrade" buttons. Calls the services above, never touches storage.
- `owner-billing-banner-ui.js` — the cross-page reaction layer (banner
  text, read-only mode, lock overlay). Kept separate from
  `owner-shell-ui.js` for the same reason `owner-lead-routing-ui.js` is
  separate from `owner-settings-page-ui.js`: one concern per file.

**`getSubscription(gymId)` is the only read path**, mirroring
`getLeads(gymId)` and `getBusinessSettings(gymId)` from earlier
phases — there is no "get everything" export, so per-gym isolation is
true by construction. It lazily creates a Trialing record on first
call (anchored to the gym's own `createdAt`, not "now," so re-reading
it later is deterministic) and advances it through any transitions
that are already due before returning it — see the state machine
section below.

**Permission boundary is structural, not just documented.** No
function in `subscription-service.js` accepts a price, a status, or a
date from a caller and writes it verbatim. The only owner-facing write
is `requestPlanUpgrade()`, which sets `requestedPlanId` +
`upgradeRequestedAt` and nothing else — it cannot change `planId`,
`status`, or any billing date. A Gym Owner reading this code (or
inspecting `localStorage`) can verify for themselves that "request an
upgrade" really is just a request.

## 2. Billing cycle explanation

There is no payment gateway yet, so the billing cycle is a **simulated,
date-only state machine** — the same honesty pattern Phase 5's lead
routing placeholders use (a Test Connection that always returns a real
failure, never a faked success). Every timing constant lives in
`CONFIG` and is called out as tunable/illustrative:

| Constant | Default | Meaning |
|---|---|---|
| `SUBSCRIPTION_TRIAL_DAYS` | 14 | Trialing → Pending Payment |
| `SUBSCRIPTION_BILLING_INTERVAL_DAYS` | 30 | Length of one billing period |
| `SUBSCRIPTION_GRACE_TRIGGER_DAYS` | 3 | Pending Payment → Grace Period |
| `SUBSCRIPTION_GRACE_PERIOD_DAYS` | 7 | Grace Period → Suspended |
| `SUBSCRIPTION_SUSPENSION_TRIGGER_DAYS` | 14 | Suspended → Disabled |

`getSubscription()` calls `applyNextTransition()` in a loop (capped at
10 iterations) rather than just once, so a browser left idle past
several thresholds — or a system clock jump — still lands on the
*correct* current state in a single call, not just the first transition
it happens to hit.

- **Trialing → Pending Payment**: at `trialEndDate`, opens the first
  billing period (`currentPeriodStart`/`currentPeriodEnd` =
  `trialEndDate` + `SUBSCRIPTION_BILLING_INTERVAL_DAYS`) and generates
  the first invoice.
- **Pending Payment → Grace Period → Suspended → Disabled**: each step
  fires after its respective trigger constant, counted from
  `statusSince` (when the *current* status began, not when the trial
  started) — so these are re-triggerable and each state's own clock is
  independent.
- **Canceled → Expired**: access continues until `currentPeriodEnd`
  (the period already paid for), then expires automatically. Nothing
  in this phase exposes a "cancel" action to owners — Canceled exists
  as an architecturally complete state for a future Developer tool or
  self-serve cancel flow, but is not reachable from the UI yet.
- **Active** is intentionally the one state this phase can't
  auto-produce: it only exists once a real payment succeeds, which
  needs Phase 7's payment integration. The state, its access rules,
  and its banner logic are all fully implemented and tested (see
  below) — there's just no path to it yet without a gateway.

This was verified directly against the service layer (bypassing the
UI) by fast-forwarding a test gym's `trialEndDate`/`statusSince` into
the past and confirming `getSubscription()` correctly walked
Trialing → Pending Payment → Grace Period → Suspended → Disabled,
generating and then marking overdue exactly one invoice along the way.

## 3. Invoice structure explanation

```js
{ id, gymId, planId, planName, amount, status, createdAt, dueDate, paidDate }
```

- **`planName`/`amount` are snapshotted at creation time**, not looked
  up live from `SUBSCRIPTION_PLANS` — so a future Developer price
  change never silently rewrites what an old invoice says a gym was
  actually billed.
- **Generation is a side effect of the state machine, not a UI
  action.** `handleTransitionSideEffects()` in `subscription-service.js`
  is the only place `generateInvoice()` is called (Trialing → Pending
  Payment) and the only place `markLatestPendingInvoiceOverdue()` is
  called (Pending Payment → Grace Period). This keeps "when does a
  bill get created or go overdue" defined in exactly one place, right
  next to the state transitions it mirrors — a UI bug can't
  accidentally spawn duplicate invoices.
- **`paidDate` is a real placeholder field, always `null` for now** —
  there's no payment capture yet, so it's honestly empty rather than
  faked with a date. Phase 7's payment integration is what would ever
  set it.
- Storage is a flat array under `StorageAdapter`, exactly like `leads`
  — every invoice carries its own `gymId`, and `getInvoicesForGym()` is
  the only read path, same tenant-isolation reasoning as
  `getLeads(gymId)`.

## 4. What Phase 7 should build next

- **A real payment gateway** (GCash/Maya/card, matching the payment
  methods already referenced in `DEFAULT_GYM_INFO`). This is the
  actual blocker for ever reaching the Active state for real, for
  marking an invoice Paid, and for the "Manage billing" button on the
  Subscription page, which is currently disabled with an honest
  tooltip rather than faking a working flow.
- **A Developer-side billing admin view** — a place to see every gym's
  subscription/invoice status across the platform, manually apply an
  owner's requested upgrade (`requestedPlanId`), and — per this
  phase's explicit permission rule — be the only role that can
  reactivate a Suspended or Disabled account. `getAllGymsForDeveloper()`
  already exists in `tenant-service.js`; Phase 7 would pair it with a
  `getAllSubscriptions()`-style Developer-only export from
  `subscription-service.js` (deliberately not added in Phase 6, same
  reasoning as `owner-shell-ui.js`'s permission-boundary comment about
  never importing Developer-only reads into owner-facing code).
- **Real enforcement of `aiEnabled: false`** on the actual customer-
  facing chat widget, not just the owner dashboard's status display.
  Today, `owner-ai-page-ui.js` correctly *shows* "AI Receptionist
  disabled" when a subscription is Suspended/Disabled/Expired, but the
  live widget (`dashboard.html` / `booking-ui.js` / `gemini-service.js`)
  doesn't check subscription status before replying — because, like
  the Phase 5 routing placeholders, there's no backend yet to gate a
  request server-side. This needs the same real backend called out in
  every previous phase's notes.
- **Recurring billing for Active subscriptions.** Once Phase 7 can
  actually reach Active, it needs its own transition: at
  `nextBillingDate`, charge the saved payment method, generate the next
  invoice, and fall back to Pending Payment on failure — mirroring the
  Trialing → Pending Payment transition this phase already built.
- **A self-serve cancel action** for owners, writing `canceledAt` and
  flipping status to Canceled (the state machine already knows how to
  carry a Canceled subscription through to Expired — see above — it
  just has no UI trigger yet).
