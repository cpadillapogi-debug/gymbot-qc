# GymBot QC — Phase 3 Notes: Gym Owner Dashboard & Business Settings

## What shipped

- **owner-dashboard.html** — a new, Gym-Owner-only page: sidebar nav, topbar,
  welcome section, 8 summary cards, recent activity, and 6 sections (Dashboard,
  Leads, AI Receptionist, Business Settings, Subscription, Help & Support),
  switched client-side via a hash router (no page reloads).
- **dashboard.html** is now **Developer-only** (it already had a
  Developer/Gym-Owner branch in Phase 2 — this phase finishes the split the
  Phase 2 code comments already called for).
- Dark/light theme toggle, persisted per-browser.
- A real, tenant-scoped **Business Settings** form (gym-settings-service.js)
  with structured fields + a dynamic FAQ list.
- The Leads page reuses Phase 1/2's leads-service.js and csv-service.js as-is
  — no rebuild, just relocated onto its own nav item.

## Files touched vs. added

**Touched:** `js/config.js`, `js/auth-guard.js`, `js/main-dashboard.js`,
`js/ui/account-shell-ui.js`, `js/ui/auth-ui.js`, `css/base.css` (light-mode
tokens only — additive).

**Added:** `owner-dashboard.html`, `css/owner-dashboard.css`,
`js/main-owner-dashboard.js`, `js/services/gym-settings-service.js`,
`js/services/owner-dashboard-metrics-service.js`,
`js/ui/owner-shell-ui.js`, `js/ui/theme-toggle-ui.js`,
`js/ui/owner-dashboard-page-ui.js`, `js/ui/owner-leads-page-ui.js`,
`js/ui/owner-ai-page-ui.js`, `js/ui/owner-settings-page-ui.js`,
`js/ui/owner-subscription-page-ui.js`, `js/ui/owner-help-page-ui.js`.

Nothing in Phase 1/2 (chat widget, index.html, Setup panel, auth, tenant
model) was rewritten — only extended.

## Known limitation carried over

`leads-service.js` still isn't scoped by `gymId` (it wasn't in Phase 1/2
either — single-tenant by design at the time). Every gym currently reads the
same browser-local lead list. Real per-gym lead scoping is Phase 5 (Lead CRM)
work, alongside giving leads a `gymId` at capture time.

## Next: Phase 4

AI Receptionist page goes from status placeholder to real owner-facing
controls: tone/personality options, business-hours-aware replies,
human-handoff rules, and a conversation log — all still reading from
Business Settings, still never exposing the Gemini key or raw system prompt
to the Gym Owner.
