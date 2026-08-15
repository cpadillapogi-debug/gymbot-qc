# GymBot QC — Phase 12 Notes: Final Production Audit & Hardening

## A naming note first
Your brief called this the "final" audit. `docs/PHASE11_NOTES.md`
already documents the most recent round (production hardening,
security, launch prep) — this round is filed as **Phase 12**, same
numbering convention Phase 9, 10, and 11 each used. Nothing from Phase
11 was undone or renamed.

## How this round worked
Phase 11 already left the app in a genuinely solid state — a
`StorageAdapter` that never throws, HTML-escaping everywhere untrusted
text reaches the DOM, a Gemini integration with real timeout/backoff/
abort handling, and honest, specific security/bug/performance docs.
Rather than re-describing that work as new, this round's job was to
**independently verify it and find whatever it missed** — reading the
actual source, not re-stating prior claims. That's what follows.

This was a large codebase (65 files, ~9,000 lines) audited under a
real effort budget, so this is not a claim that every line was
re-derived from scratch. It's a claim that every fix below was traced
to an actual code path, reproduced in my head against the real logic
(not assumed), and verified to still parse correctly (`node --check`
against all 65 files, twice, after the last edit).

---

## Issues found and fixed

### 1. Crash risk: corrupted/malformed records inside a collection
**Where:** `auth-service.js`, `tenant-service.js`, `leads-service.js`,
`invoice-service.js`, `gcash-payment-service.js`,
`notification-service.js`, `audit-log-service.js`,
`dev-console-service.js`.

**The bug:** every collection (`users`, `gyms`, `leads`, `invoices`,
`gcashPayments`, `notifications`, log entries) is read with
`storage.getJSON(key, [], { requireArray: true })`. That guarantees
the *array itself* is an array — it says nothing about what's inside
it. A single `null` entry, or an object missing an expected field
(`email`, `id`, `gymId`...), would crash the first `.find()`/`.filter()`
callback that touched it — e.g. `auth-service.js`'s
`findUserByEmail()` did `u.email.toLowerCase()` with no null/type
check. This is realistic, not theoretical: a gym owner (or curious
visitor) opening devtools and hand-editing `localStorage`, or a
partially-successful backup restore (see #3 below, before it was
fixed), can both produce exactly this shape.

**The fix:** a new `sanitizeRecords(arr, requiredKeys)` helper in
`utils.js` filters out anything that isn't a well-formed object with
the given required, non-empty keys. Applied at each collection's raw
read function — the single choke point every other function in that
file already goes through — rather than patching every call site
individually. **Nothing is deleted from storage**; this only filters
the in-memory copy handed back to callers, so a corrupted record can
still be recovered/inspected later (e.g. via a future repair tool)
rather than being silently wiped.

Required keys per collection: users → `id, email, role`; gyms →
`id, ownerId`; leads/invoices/gcashPayments → `id, gymId`;
notifications → `id`; audit/system logs → none (just "is a real
object" — log rows don't gate access the way the others do).

`findUserByEmail()` and `toSafeUser()` also got direct hardening
(type-safe email comparison, null guard) as defense-in-depth beyond
the source-level fix.

### 2. `csvEscape()` didn't guard against CSV formula injection
**Where:** `utils.js`.

**The bug:** lead names originate from a public, unauthenticated chat
widget — untrusted input by definition — and flow straight into CSV
export. `csvEscape()` quote-wrapped values but didn't neutralize a
leading `=`, `+`, `-`, or `@`. Excel, Google Sheets, and LibreOffice
all treat a cell starting with one of those as a live formula the
moment the file is opened — a lead named
`=HYPERLINK("http://evil.example","Click here")` would become a
clickable, executing link in the gym owner's spreadsheet. This is a
well-known class of vulnerability (CSV/formula injection, CWE-1236),
not a hypothetical.

**The fix:** any exported cell starting with `=`, `+`, `-`, `@`, tab,
or carriage return now gets a leading apostrophe, which every major
spreadsheet app treats as "render this as text."

### 3. `importBackup()` wasn't atomic, and could report success on a partial failure
**Where:** `dev-console-service.js`.

**The bug:** the restore loop wrote each key with `storage.set()` and
pushed it onto `restoredKeys` unconditionally — but `StorageAdapter.set()`
is designed to *never throw*, it just returns `false` on failure (e.g.
`localStorage` quota exceeded). The old code never checked that return
value, so a write that silently failed halfway through an 8-key backup
would still be reported to the Developer as "Restored successfully,"
leaving the app in a mixed state — some collections from the new
backup, some untouched from before. This is the exact "impossible
state" class the brief's State Integrity Audit section calls out,
just applied to the restore process itself.

**The fix:** `importBackup()` now snapshots every key's current value
before writing anything, checks each write's actual return value, and
— on any failure — rolls every already-written key back to its
snapshotted value before returning a specific failure reason. A failed
restore now always leaves storage exactly as it was before the
attempt; it never partially applies.

### 4. Async UI actions could get permanently stuck on an unexpected error
**Where:** `chat-ui.js` (`sendUserMessage`), `setup-ui.js` (Test
connection), `admin-dev-console-ui.js` (AI test connection),
`demo.js` (`runDemo`).

**The bug:** each of these disables a button, runs an async sequence,
then re-enables the button — but with no `try/finally`. `callGemini()`
itself is documented to never throw, but the code *around* it
(conversation-memory parsing, DOM node creation, `appState` updates,
localStorage writes inside the demo loop) had no such guarantee. Any
one unexpected exception anywhere in that sequence would leave the
button disabled and the corresponding "in progress" flag stuck `true`
— permanently, with no recovery short of a full page reload. This
directly contradicts the brief's "easy to recover after failures" goal.

**The fix:** all four now wrap their async body in try/catch/finally.
The `finally` block unconditionally re-enables the button and resets
the in-flight flag; the `catch` block shows a plain-language message
instead of leaving the user staring at a stuck UI with no explanation.

### 5. File-upload failures failed silently
**Where:** `owner-gcash-billing-ui.js` (payment proof upload),
`admin-billing-page-ui.js` (GCash QR upload).

**The bug:** both used `FileReader` with an `onload` handler but no
`onerror` handler. If reading the selected image failed (a corrupted
file, a browser/OS hiccup), nothing happened — no error, no state
change, no feedback. The user would click "Submit" and either nothing
would happen or a stale/empty value would go through.

**The fix:** both now have an `onerror` handler that resets the
upload state and shows a toast telling the user to try a different
file.

### 6. Login/register forms had no explicit re-entrancy guard
**Where:** `auth-ui.js`.

**The bug:** both submit handlers relied entirely on the submit
button's `disabled` state to prevent a double-submit. That's usually
enough, but a fast double-Enter in a text field can, in some browsers,
re-invoke a form's submit handling even while its default button is
disabled. There was no defensive check inside the handler itself.

**The fix:** both handlers now start with
`if(submitBtn.disabled) return;` — an explicit, cheap guard that
doesn't depend on browser-specific disabled-button submit behavior.

### 7. A deleted gym could keep inflating platform-wide stats and estimated MRR
**Where:** `admin-registry-service.js` (`getPlatformOverview`).

**The bug:** deleting a gym is a soft-delete — it sets `deletedAt` on
the gym record but deliberately leaves the subscription record
untouched, so a Developer can restore it later. `getPlatformOverview()`
(the Master Admin Overview page's stat cards) aggregated `totalGyms`,
`statusCounts`, `estimatedMrr`, and `needsAttentionCount` over *every*
gym in the registry without excluding deleted ones. A gym that was
Active when it got deleted would keep counting toward "Estimated MRR"
and "Active gyms" forever — the exact "deleted record still affecting
live state" pattern the brief's State Integrity Audit calls out by
name, just showing up in the business metrics rather than a list view.

**The fix:** `getPlatformOverview()` now filters out `isDeleted` rows
before computing every aggregate. The full registry (including
deleted gyms) is still what powers the Gym Registry table and the
"recent activity" preview — those are meant to show deleted gyms, with
a badge, so a Developer can find and restore them. Only the top-line
stat cards were wrong, and only those were changed.

### 8. Duplicate-invoice risk across two browser tabs
**Where:** `subscription-service.js` (`handleTransitionSideEffects`).

**The bug:** `getSubscription(gymId)` reads the current subscription,
applies any transitions that are now due (trial expired → Pending
Payment, etc.), generates an invoice as a side effect of that specific
transition, and persists the result — all synchronously, so there's no
race *within* one tab. But if a gym owner has two tabs open to their
own dashboard and both happen to call `getSubscription()` right around
the same transition boundary, each could independently read the same
pre-transition state and each generate its own invoice for the same
billing period.

**The fix:** before creating an invoice for a Pending-Payment
transition, `handleTransitionSideEffects()` now checks whether an
invoice already exists for that exact `billingPeriodStart` (which is
deterministic — derived from the subscription's own dates, not
"now" — so a duplicate would always share the same value) and skips
creating a second one if so. This closes the specific duplicate-invoice
consequence; it is not a general multi-tab locking mechanism — see
"Remaining risks" below.

---

## Data Integrity Report (the brief's named "impossible states")

Verified against the actual code, not assumed:

| Impossible state | Status |
|---|---|
| Suspended gym marked as active | **Structurally impossible** — `status` is a single enum field on the subscription record; a gym can't hold two statuses at once. |
| Invoice paid but subscription expired | **Not directly linked, but consistent in practice** — `markInvoicePaid()` is only ever called from `approvePayment()`, which calls `approveGymPayment()` in the same operation to move the subscription to Active. There's no code path that marks an invoice paid without also activating the subscription. |
| Lead without gymId | **Enforced at write time** — `captureLead()` throws if `gymId` is missing, and (new this round) `getAllLeadsRaw()` also filters any malformed lead out at read time as a second layer. |
| User without role | **Enforced at read time (new this round)** — `getAllUsers()` now filters out any record missing `role` (or `id`/`email`). |
| Owner accessing another gym | Covered in `docs/SECURITY_AUDIT.md` — every owner-facing call is scoped by `session.gymId` from the verified session, not from anything client-suppliable. Re-verified this round, no change needed. |
| Deleted gym still appearing in registry | **By design, not a bug** — deletion is a reversible soft-delete; the Gym Registry table intentionally still lists deleted gyms (labeled, with a restore action) so a Developer can recover one. What *was* a real bug: deleted gyms were still counted in the platform's live stats/estimated MRR — **fixed this round, see issue #7 above.** |
| Duplicate invoices | **Narrowed this round** — see issue #8. Same-tab duplicate creation was already structurally impossible; the cross-tab race is now guarded by a period-based idempotency check. |
| Duplicate subscriptions | **Structurally impossible** — subscriptions are stored as one object keyed by `gymId` in a map, not a list; there's no data shape that could hold two records for the same gym. |
| Duplicate payment records | Each submission creates one record, but `getPendingPaymentForGym()` blocks a second *pending* submission while one is already awaiting review (pre-existing, re-verified). `approvePayment()`/`rejectPayment()` both check `payment.status !== SUBMITTED` before acting, so double-clicking Approve on the same payment is a no-op the second time, not a double-charge. |

---

## Production Reliability Report

**Crash resistance:** the systemic gap this round found and closed was
collections that assumed every stored record was well-formed. That's
now closed at the source for every user-data collection in the app.
Combined with Phase 11's existing `StorageAdapter` (never throws on
corrupt JSON) and this round's async try/finally fixes, there is no
longer a known code path where corrupted data or a failed operation
can crash a page or lock up the UI without a recovery path short of
reload.

**Data integrity:** every "impossible state" the brief named by
example was checked against the actual code above; one real gap was
found and fixed (#7), one was narrowed (#8), the rest were already
correctly handled by the existing data model.

**Recoverability:** backup restore is now atomic (#3). Every
destructive Developer action already required confirmation before
this round (verified, unchanged). A corrupted collection now
degrades gracefully (records dropped in memory, not the whole page
crashing) rather than requiring a manual `localStorage.clear()`.

**What this round did not re-audit in depth:** performance
(`docs/PERFORMANCE_SUMMARY.md` was spot-checked, not rewritten —
nothing this round's changes touch is performance-sensitive: the new
`sanitizeRecords()` call is a single `Array.filter()` added to
functions that were already iterating the same array, so it's the
same O(n) shape, not a new pass), and accessibility/mobile (Phase 11
covered this; this round found nothing new to add and didn't
re-verify it line by line, so treat that section of Phase 11's work as
unchanged rather than re-confirmed).

---

## Launch Readiness Score: 85 / 100

**Reasoning, not just a number:**
- Core flows (booking, AI chat, billing approval, tenant isolation,
  RBAC) are correct and now crash-resistant against corrupted data —
  this is the majority of the score.
- Points held back for the one architectural limitation that no amount
  of client-side hardening fixes: **there is no backend.** The Gemini
  API key lives in the browser (already flagged in
  `docs/SECURITY_AUDIT.md` as the single highest-priority pre-launch
  item), there's no server-side rate limiting, and no true multi-tab
  write locking (narrowed this round for the one consequence that
  mattered most — duplicate invoices — but not eliminated as a class).
- These aren't bugs to "fix" in this codebase; they're the ceiling of
  a client-only architecture. A gym owner using this privately (one
  browser, one login) will not hit any of them. A public, unauthenticated
  link handling real payment and real API cost should not launch before
  the backend item on `docs/ROADMAP_V2.md` is addressed.

A score of 100 would misrepresent an architecture that is, by its own
prior documentation, honestly not yet ready for a fully public
unauthenticated launch. 85 reflects "very solid for what it is, one
known architectural gap before scaling past a handful of trusted
pilot gyms."

---

## Remaining risks before onboarding real gym owners
1. **Gemini API key exposure** (unchanged from Phase 11, still the top
   item) — visible in browser devtools on any publicly-shared link.
   Fine for a private pilot with trusted owners; not fine once the link
   is public and API cost is real. Fix: put the Gemini call behind a
   minimal backend function.
2. **No server-side rate limiting** — a malicious or buggy client could
   hammer the Gemini API through a gym's own chat widget. Client-side
   throttling exists (Phase 11); nothing stops a request made outside
   the browser UI.
3. **Multi-tab write races, general case** — this round closed the one
   consequence with real business impact (duplicate invoices). Two
   tabs writing to two *different* records at the same instant can
   still last-write-wins overwrite each other; there's no locking
   primitive available without a backend.
4. **Free-text pricing/hours fields** (`membershipFee`, `walkInFee`,
   discounts, operating hours in `gym-settings-service.js`) are
   intentionally unvalidated free text, not numbers — a gym owner can
   type "₱1,500/month or ₱150/session," which the AI receptionist
   reads as-is. This is a deliberate design choice (these are
   informational fields for the AI to reference, not used in any
   billing math inside the app itself — the app's own SaaS billing
   uses the hardcoded `SUBSCRIPTION_PLANS` config, which is separate
   and already validated), not an oversight — flagging it here so it's
   a documented decision rather than a silent gap.
5. **Password reset, 2FA** — both explicitly out of scope, already
   labeled as such in `docs/SECURITY_AUDIT.md`.

None of these require touching this round's fixes to address later —
they're additive, tracked on `docs/ROADMAP_V2.md` where relevant.

---

## Files touched this round
`js/utils.js`, `js/services/auth-service.js`,
`js/services/tenant-service.js`, `js/services/leads-service.js`,
`js/services/invoice-service.js`, `js/services/gcash-payment-service.js`,
`js/services/notification-service.js`, `js/services/audit-log-service.js`,
`js/services/dev-console-service.js`, `js/services/subscription-service.js`,
`js/services/admin-registry-service.js`, `js/ui/chat-ui.js`,
`js/ui/setup-ui.js`, `js/ui/admin-dev-console-ui.js`, `js/demo.js`,
`js/ui/owner-gcash-billing-ui.js`, `js/ui/admin-billing-page-ui.js`,
`js/ui/auth-ui.js`, `docs/BUG_PREVENTION_AUDIT.md`,
`docs/SECURITY_AUDIT.md`. No functionality was removed; every change
above is additive hardening or a bug fix to existing behavior. All 65
JS files pass `node --check` after every edit.
