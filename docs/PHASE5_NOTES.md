# GymBot QC — Phase 5 Notes: Lead CRM & Lead Routing

## What shipped

- A real **Lead Model** (`leads-service.js`) — every lead now carries
  `gymId`, `email`, `status`, `notes`, `statusHistory`, `createdAt`,
  `updatedAt`, and `lastActivityAt`, on top of the Phase 1–4 fields
  (name, phone, goal, preferredTime, source). Leads are tenant-scoped
  by `gymId` end to end — this fixes the "every gym sees the same
  browser-local lead list" limitation carried since Phase 1.
- The **6-stage pipeline** (New → Contacted → Scheduled → Trial
  Completed → Converted → Lost), changeable inline from the table row
  or from the lead detail view.
- A rebuilt **Leads page**: stat cards (total, new today, trial
  bookings, converted, conversion rate, est. revenue), search by
  name/phone, filter by status, sort (newest/oldest/status), a
  responsive table that collapses into stacked cards on mobile, and a
  **lead detail modal** (full contact info, conversation summary, goal,
  visit time, editable notes, status + status history, last activity,
  delete).
- **Automatic lead capture**: the chat widget's booking flow now calls
  `captureLead()`, which creates a New lead or — if the phone number
  already exists for that gym — updates the existing one instead of
  duplicating it.
- **Export system**: CSV and JSON, each exportable as All leads,
  Filtered/searched leads, or a Date range — from a panel on the Leads
  page. All lead fields are included.
- **Lead Routing** panel in Business Settings: Local CRM, CSV Export,
  and JSON Export are real and working; Google Sheets, n8n Webhook,
  Zapier, and Make.com are visible, honest placeholders with a working
  green/gray/red status indicator (see "Lead routing" below).

## Files touched vs. added

**Added:** `js/services/leads-metrics-service.js`,
`js/services/lead-routing-service.js`, `js/ui/owner-lead-routing-ui.js`,
`docs/PHASE5_NOTES.md`.

**Rewritten:** `js/services/leads-service.js`, `js/ui/owner-leads-page-ui.js`,
`js/services/csv-service.js` (CSV-only → CSV + JSON + date filtering).

**Touched:** `js/config.js` (lead statuses/sources, routing provider
defs, `DEMO_GYM_ID`, new limits), `js/utils.js` (`normalizePhoneForMatch`),
`js/services/dashboard-service.js` (`capturedAt` → `createdAt`),
`js/ui/owner-dashboard-page-ui.js`, `js/ui/owner-shell-ui.js`,
`js/ui/booking-ui.js`, `js/ui/dashboard-ui.js`, `js/demo.js`
(all updated to pass `gymId` through to the now tenant-scoped leads
API), `owner-dashboard.html` (new Leads markup, lead detail modal, Lead
Routing panel), `css/owner-dashboard.css`, `css/base.css` (three new
color tokens for status badges: `--blue`, `--purple`, `--teal`).

Nothing from Phases 1–4 was rewritten wholesale — auth, tenant model,
Business Settings, the AI Receptionist call path, and the chat widget
itself are unchanged except for the `gymId` plumbing above.

---

## 1. CRM architecture explanation

**Storage.** Leads live in one flat array under the existing
`StorageAdapter` (`storage.getJSON("leads", [])`), the same pattern
`users` and `gyms` already use — not a per-gym namespaced blob like
`businessSettings`. Every record carries its own `gymId`, and every
exported function in `leads-service.js` takes a `gymId` and filters by
it internally. There is no "get everything" function exposed to UI
code — `getLeads(gymId)` is the only read path, which is what makes
"Gym Owners cannot view other gyms' leads" true by construction rather
than by convention.

**Layering**, same separation the rest of the app already uses:
- `leads-service.js` — storage + CRUD + validation + dedup. No DOM.
- `leads-metrics-service.js` — pure stat-card math over a lead array.
  No DOM, no storage — same shape as `dashboard-service.js`.
- `csv-service.js` — CSV/JSON serialization + file download + date
  filtering. No storage.
- `lead-routing-service.js` — per-gym routing provider state. No DOM.
- `owner-leads-page-ui.js` / `owner-lead-routing-ui.js` — rendering +
  event wiring only; they call the services above and never touch
  `localStorage` directly.

**Lead shape:**
```js
{
  id, gymId, name, phone, email, goal, preferredTime, source,
  status,                 // one of LEAD_STATUSES
  notes,
  statusHistory: [{ status, at }],   // append-only, oldest first
  conversationSummary,    // optional, filled if the AI receptionist provides one
  createdAt, updatedAt, lastActivityAt
}
```

**Status changes are logged, not overwritten.** `updateLeadStatus()`
appends to `statusHistory` rather than replacing a single "current
status" field with no trail — this is what powers the "Status history"
list in the lead detail view and is the anchor point for any future
follow-up/reminder logic (Phase 6+) that needs to know how long a lead
has sat in a stage.

**Metrics are computed on read, not stored.** `getLeadCrmMetrics()`
derives every stat-card number from the live lead list each time the
Leads page renders. Nothing is cached or denormalized, so there's no
risk of a stat card drifting out of sync with the underlying leads —
correct at the cost of recomputing on every render, which is free at
this data scale (client-side demo, not a real backend).

## 2. Duplicate detection strategy

`findLeadByPhone(gymId, phone)` is the single source of truth for "is
this the same person," and every capture path goes through it via
`captureLead()`.

- **Normalization, not exact match.** Phone numbers are compared via
  `normalizePhoneForMatch()`, which strips everything but digits and
  then collapses the PH country/trunk prefix so `"0917 123 4567"`,
  `"+63 917 123 4567"`, and `"63-917-123-4567"` all resolve to the same
  key. Real customers type their number differently every time they
  chat — matching on raw string equality would miss most repeat
  contacts.
- **Scoped to the gym.** The lookup only ever searches leads with the
  same `gymId` — the same phone number at two different gyms
  correctly creates two separate leads.
- **Merge, don't overwrite blindly.** When a match is found, only
  non-empty incoming fields overwrite the existing lead's fields
  (`f.name || existing.name`, etc.) — a follow-up chat that only
  mentions a new preferred time doesn't blank out a goal captured
  earlier. `updatedAt` and `lastActivityAt` always advance; `status` is
  deliberately **never** reset back to "New" on re-capture — an owner
  who already contacted a lead shouldn't see it silently jump back to
  the top of a "New" filter because the customer chatted again.
- **Why phone, not name+phone or email.** Name is free-text and
  inconsistently spelled/capitalized between chats; email is optional
  and often absent from a quick chat-widget booking. Phone number is
  the one field the booking form always collects and validates
  (`validateBookingInput` requires ≥7 digits), making it the only
  reliable natural key available without a real backend/account system.

**Known gap, worth flagging:** this only catches duplicates *within
one gym's leads*. It also can't catch someone who genuinely re-enters
under a different number (e.g. a new SIM). Real dedup fidelity beyond
this needs either a login/account system for customers or a backend
that can fuzzy-match on name+time-window — both are backend-shaped
problems appropriate for a later phase.

## 3. Lead routing explanation

The routing model in `lead-routing-service.js` is per-gym, keyed by
provider id, with three possible statuses: `connected` (green),
`not_connected` (gray), `error` (red). It's deliberately built so the
status shown is never a lie:

- **Local CRM** — `kind: "core"`. Always `connected`, no toggle. Every
  captured lead always lands here; this *is* the Leads page. There's
  nothing to "connect" — it's the floor everything else builds on.
- **CSV Export / JSON Export** — `kind: "working"`. Always
  `connected`, because the feature genuinely works: click Export on
  the Leads page and a real file downloads with every lead field. The
  routing entry exists so an owner scanning Settings sees these listed
  as real, working destinations, not as unimplemented stubs.
- **Google Sheets / n8n Webhook / Zapier / Make.com** — `kind:
  "placeholder"`. Default `not_connected` (gray). Each has a **Test
  Connection** button that calls `testPlaceholderConnection()` —
  which always returns a real failure (`ok:false`) with an explicit
  message ("isn't wired up to a backend yet... needs a real
  server-side integration"), and flips the status to `error` (red).
  There is no fake success path. This matches the codebase's existing
  honesty pattern (`OWNER_DEMO_METRICS`'s "demo" tags, the Gemini-key
  browser-exposure warning in `index.html`) — a Gym Owner should never
  see a green checkmark for something that isn't actually connected to
  anything. n8n additionally has a webhook URL field
  (`setWebhookUrl()`) so the owner's intended endpoint is saved and
  ready for whenever real delivery is built — filling it in doesn't
  change the status, since saving a URL isn't the same as verifying
  delivery.
- **Reset** clears an `error` back to `not_connected`, so the owner
  isn't stuck looking at a permanent red state after a test.

**Why this shape instead of a single on/off toggle per provider:**
Owner Settings' existing permission boundary (see
`owner-shell-ui.js`'s header comment) says a Gym Owner never touches
"developer integration" internals — API keys, backend wiring, request
logs. Routing status is exactly the right altitude for an owner: they
can see what's connected and attempt to connect it, but the actual
plumbing (OAuth flow for Sheets, webhook delivery/retry for
n8n/Zapier/Make) is Developer/backend work that doesn't belong in
client-side code at all — there's no secure place to hold a Zapier or
Sheets credential in a browser.

## 4. What Phase 6 should build next

- **A real backend.** This is the recurring theme across every phase's
  notes (`index.html`'s Gemini-key warning, `auth-service.js`'s
  password-hashing warning) and it's the actual blocker for the
  placeholder routing integrations, for a public per-gym chat widget
  (see next point), and for multi-device sync (`localStorage` is
  single-browser only — a lead captured on a customer's phone doesn't
  reach the owner's laptop).
- **A real per-gym public chat widget.** Today's `index.html` is a
  standalone marketing/demo page with no tenant concept — its captured
  leads are deliberately isolated under `DEMO_GYM_ID` so they never
  leak into a real gym's CRM (see `booking-ui.js`). Phase 6 should give
  each gym a real, shareable widget URL (e.g. `/w/:gymId`) that reuses
  the same chat/booking components but captures leads under the real
  `gymId`, closing the loop the Objective originally asked for
  ("Connect the CRM to the AI receptionist") end to end for production
  use, not just the demo.
- **Wire the routing placeholders for real**, once there's a backend:
  OAuth + Sheets API for Google Sheets; outbound webhook delivery with
  retry/backoff for n8n, Zapier, and Make.com (the UI/state layer for
  all four already exists in `lead-routing-service.js` — only the
  actual network delivery is missing).
- **Follow-up / reminder tooling** built on top of `statusHistory` —
  e.g. flag leads that have sat in "Contacted" or "Scheduled" too long,
  a per-gym "leads needing follow-up today" view. The data (`at`
  timestamps per status transition) is already there; only the
  surfacing logic is missing.
- **Manual lead entry** — a "+ Add lead" action on the Leads page for
  walk-ins or referrals an owner wants to log directly, using the same
  `captureLead()`/dedup path the AI receptionist uses.
