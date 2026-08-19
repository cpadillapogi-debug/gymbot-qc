# GymBot QC — README / Launch Guide

An AI receptionist + lead CRM for independent Philippine gyms. Static
site — plain HTML/CSS/JS (ES modules), no build step, no server. Data
lives in the browser's `localStorage`.

This guide covers running, deploying, and demoing the app. For what
each phase of development actually built, see `docs/PHASE*_NOTES.md`.
For deeper detail than this guide, see `docs/SECURITY_AUDIT.md`,
`docs/BUG_PREVENTION_AUDIT.md`, `docs/PERFORMANCE_SUMMARY.md`,
`docs/DEPLOYMENT_CHECKLIST.md`, and `docs/ROADMAP_V2.md`.

## Quick start
Because this is plain ES modules, you need to serve it over HTTP (not
open `index.html` via `file://` — module imports will fail). Any static
server works, e.g. from this folder:

```
python3 -m http.server 8080
```

Then open `http://localhost:8080/index.html` (public landing page) or
`http://localhost:8080/onboarding.html` (guided gym setup).

## How to deploy
See `docs/DEPLOYMENT_CHECKLIST.md` for full steps on GitHub Pages,
Netlify, and Vercel — all three work with zero configuration since
there's no build step.

## How to create the first Developer account
You don't need to — one is seeded automatically the first time any
page calls `ensureSeedDeveloper()` (already wired into every entry
point). Log in at `login.html` with:

- **Email:** `dev@gymbotqc.com`
- **Password:** `GymBotDev123!`

**Change this password (or replace the account) before a real launch**
— it's a well-known default meant only for local development and
demos. There's currently no in-app "change my own password" flow for
the Developer account itself; edit `SEED_DEVELOPER_EMAIL` /
`SEED_DEVELOPER_PASSWORD` in `js/services/auth-service.js` before first
deploying somewhere real.

## How to create Gym Owner accounts
Two ways:
1. **Self-serve** — a gym owner visits `onboarding.html` (recommended;
   walks them through business info, pricing, and hours) or
   `register.html` (bare account creation only).
2. **Developer-assisted** — from the Dev Console's Gym Registry you can
   view any gym's detail and trigger a password-reset placeholder,
   but account creation itself is still self-serve only; there's no
   "create a gym owner on their behalf" button yet (see Roadmap).

## How to use Demo Mode
Two distinct tools live in the Dev Console, and they're not
interchangeable:

- **Sales Demo tab** — seeds one realistic, presentable gym (business
  info, a full lead pipeline, an active paid subscription, invoice
  history). Use this when showing GymBot QC to an actual prospective
  gym owner. Click **Seed demo gym**, then **Preview as Gym Owner** to
  open their dashboard in a new tab — your own Developer session stays
  logged in in the original tab the whole time; close the preview tab
  (or click its "Back to Developer Console" link) to return. Click
  **Clear demo gym** when you're done.
- **Database Utilities tab** — generates bulk, throwaway test records
  ("Demo Lead 1", "Demo Gym 2", ...) for stress-testing tables and
  pagination during development. Not meant to be shown to a customer.

The same **Preview as Gym Owner** button is also available from any row
in the Gym Registry, so you can preview a real gym's dashboard the same
way — this isn't limited to the seeded demo gym.

## How to configure Gemini
1. Log in as a Developer.
2. Open the Dev Console → **AI Configuration** tab.
3. Paste a Gemini API key (get one from Google AI Studio).
4. The Master System Prompt tab lets you edit the base instructions
   every gym's AI Receptionist starts from; each gym's own Business
   Settings (address, pricing, hours, FAQs) are layered on top per-gym,
   not edited here.

**Before a public launch**, read `docs/SECURITY_AUDIT.md`'s "Known
limitation" section — the key currently lives in the browser and should
move behind a small backend first.

## How to configure GCash
GCash payment collection is a manual proof-of-payment flow, not a live
API integration (see `docs/ROADMAP_V2.md` item 3 for what a real
integration would need):
1. Log in as a Developer → **GCash Billing** in the sidebar (a
   top-level page, separate from the Dev Console).
2. Review pending payment proofs gym owners have uploaded and
   approve or reject each one; approval activates or extends that
   gym's subscription.
3. Owners submit proof of payment from their own Subscription page
   inside the Gym Owner dashboard.

## How to export backups
Dev Console → **Backup & Restore** tab → **Export backup** downloads a
single JSON file with every gym's data. **Import backup** restores from
one — it validates the file's shape before writing anything, so a
corrupted or wrong-format file is rejected with a specific reason
rather than partially applied.

## How to migrate later to Supabase
See `docs/ROADMAP_V2.md` item 1 for the full plan. In short:
`js/storage.js`'s `StorageAdapter` is the only thing every service
reads/writes through — no service ever touches `localStorage` directly
— so migrating storage is a matter of replacing `StorageAdapter`'s
internals with Supabase calls, not rewriting every feature.

## Project structure
```
index.html              Public landing page (hero, live chat demo, pricing, FAQ, contact, audits)
pricing.html             Dedicated pricing page + feature comparison
onboarding.html          7-step guided gym setup wizard
login.html / register.html   Auth pages
dashboard.html           Developer Console (AI config, gym registry, backups, sales demo, etc.)
owner-dashboard.html      Gym Owner dashboard (settings, leads, AI status, billing, help)
css/                      Shared design tokens + per-page styles
js/config.js              All shared constants (routes, storage keys, plans, roles) — single source of truth
js/services/              Business logic, storage access, validation — no DOM code
js/ui/                    DOM rendering + event wiring — calls into services, never touches storage directly
docs/                     Phase notes, audits, this guide's supporting documents
```

## Support / where to find help inside the app
Once logged in as a Gym Owner, the **Help & Support** page (dashboard
sidebar) has setup guidance, FAQ, and troubleshooting specific to your
account. `index.html`'s own FAQ section covers the common pre-signup
questions.
