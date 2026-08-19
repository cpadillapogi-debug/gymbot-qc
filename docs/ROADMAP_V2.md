# GymBot QC — Roadmap for Version 2.0

Everything below requires infrastructure this static, localStorage-only
app deliberately doesn't have yet (see `docs/SECURITY_AUDIT.md`'s "Known
limitation"). None of it is started — this is a prioritized list, not a
partially-built feature set.

## 1. Migrate storage to Supabase (highest priority — unblocks everything else below)
`js/storage.js`'s `StorageAdapter` is already the single choke point
every service reads/writes through — no service calls `localStorage`
directly. That was a deliberate Phase-1 decision specifically so this
migration is a matter of swapping `StorageAdapter`'s internals for
Supabase calls (Postgres + Row Level Security for real per-gym
isolation, replacing the client-side-only role checks described in the
Security Audit) rather than rewriting every feature. Auth would move to
Supabase Auth, replacing `auth-service.js`'s hand-rolled session/hash
logic.

## 2. Move the Gemini call behind a server
Once there's a Supabase project (or any backend), route the AI
Receptionist's Gemini calls through a server function instead of
calling `generativelanguage.googleapis.com` directly from the browser.
This is the fix for the API-key-exposure limitation flagged throughout
this phase's audits, and should happen before any public, unauthenticated
link is shared.

## 3. Real GCash API integration
Replace the current manual flow (owner uploads a payment screenshot,
Developer reviews and approves it) with GCash's actual payment API for
instant, automatic confirmation. The manual flow's UI (proof upload,
pending/approved/rejected states) was built to already look and behave
like the automated version will — swapping the underlying trigger from
"Developer clicks Approve" to "webhook fires" shouldn't require a UI
redesign.

## 4. Facebook Messenger integration
Today's chat is a same-page demo widget. Real usage needs the AI
Receptionist wired to a gym's actual Facebook Page via the Messenger
Platform API, so it answers messages where customers actually send
them. Depends on #2 (a server to hold the Messenger/Gemini credentials).

## 5. Notifications
`notification-service.js` already models owner- and developer-audience
notifications; it's missing real-time delivery across tabs/devices.
Depends on #1 — Supabase Realtime (or an equivalent) is the natural fit
once storage isn't purely local.

## 6. Mobile app
A wrapped or native mobile app for gym owners, once the above are in
place — a native app talking to a local-only data store isn't worth
building before there's a real backend for it to sync with.

## Sequencing note
1 and 2 unblock 3–6; there's little value tackling 3–6 first. This
mirrors what `docs/PHASE10_NOTES.md`'s own "what's next" list already
said about recurring billing automation, carried forward here rather
than restated as if it were new.
