# GymBot QC — Security Audit (Phase 11)

Scope: the full application (`index.html` public demo, `login.html` /
`register.html` / `onboarding.html`, `dashboard.html` Developer Console,
`owner-dashboard.html` Gym Owner dashboard). `index.html` itself also
carries a shorter, visitor-facing version of the demo-chat-specific
parts of this audit under its "Security & reliability" section — this
document is the complete one, including the multi-tenant app that
section doesn't cover.

## Summary
No build step, no bundler, no external JS dependencies beyond the
official Google Gemini API endpoint. Everything is readable via "View
Source." There is no `eval()`, `new Function()`, obfuscated code, hidden
iframe, hidden download, clipboard manipulation, or fingerprinting
anywhere in the codebase.

## Data storage
| What | Where | Notes |
|---|---|---|
| Users, sessions, gyms, leads, invoices, subscriptions, settings, audit log | `localStorage` (per browser/device) | All reads/writes go through `StorageAdapter` (`js/storage.js`), which never throws — corrupted JSON is caught and replaced with a safe default instead of crashing the page. |
| "Remember me" vs. tab-only sessions | `localStorage` or `sessionStorage` respectively | See `auth-service.js`'s `issueSession()`. |
| Gemini API key | `localStorage`, developer-set | See "Known limitation" below — this is the item that matters most before a public launch. |

**There is no server.** Nothing GymBot QC controls receives this data.
The only outbound network call the app makes is the Gemini API request
itself (`generativelanguage.googleapis.com`), sent directly from the
visitor's browser.

## Input validation & output sanitization
- Every place user- or AI-generated text reaches the DOM goes through
  `escapeHtml()` (`js/utils.js`) — no raw `innerHTML` of untrusted
  strings anywhere in the codebase.
- Chat messages, lead form fields, and Business Settings fields are all
  trimmed and length-clamped in code (`clampText()`), in addition to
  HTML `maxlength` attributes (defense in depth — `maxlength` alone is
  bypassable via devtools or a scripted POST).
- Email format, password length/match, and required-field checks run in
  `auth-service.js` / `gym-settings-service.js` before anything is
  saved — never only in the UI layer.
- File uploads (GCash payment proof screenshots, QR codes) are checked
  for both MIME type and byte size before being accepted — see
  `payment-service.js`.

## Session & permission model
- Two roles — `developer` and `gym_owner` — each with its own
  page-level guard (`auth-guard.js`'s `requireRole()`), which redirects
  rather than silently rendering restricted content.
- A Gym Owner's data reads/writes are scoped to their own `gymId`
  throughout every service — there is no code path where one gym's
  session can read another gym's records, **except** the Phase 11
  "Preview as Gym Owner" feature, which is real Developer tooling: it
  only activates when the *actual, currently-authenticated* session
  (checked via `getSession()`, never trusted from the URL) has the
  Developer role, and is visibly banner'd as a preview the whole time.
  See `main-owner-dashboard.js`.
- **This is a client-side permission model.** Like any client-side-only
  app, a sufficiently technical visitor can edit `localStorage`
  directly and grant themselves a session object. This is an inherent
  limitation of having no backend at all (see Known limitation below),
  not a bug in the role-checking logic itself — the checks are correct
  for what they're checking *against* (client-stored data), just not a
  substitute for server-side authorization.

## Session timeout & CSRF
- Session objects carry an `expiresAt`; `getSession()` treats an
  expired session as absent and clears it (`js/services/auth-service.js`).
  This is a real, working timeout for this app's architecture — not a
  placeholder.
- **CSRF is a placeholder-only concern here** and is called out as such
  in code comments wherever a state-changing action exists — CSRF
  attacks target a *server's* trust in a browser's cookies; a
  localStorage-only app with no server session has no CSRF attack
  surface to defend today. The comments exist so a future server
  migration doesn't skip adding real CSRF tokens once there is a
  server to protect.

## Known limitation: the Gemini API key
The Gemini API key is set by whoever runs the Developer Console and
lives in that browser's `localStorage`. On the current architecture
(no server), **any API key used from a publicly-shared link is visible
to anyone who opens devtools.** This is fine for a private demo shown
one-on-one to a prospective gym owner. It is **not** fine for a public,
unauthenticated link once real usage (and real API billing) is at
stake — before that point, move the Gemini call behind a minimal
backend (a single Cloudflare Worker or Vercel/Netlify function is
enough) so the key never reaches the browser. This is the single
highest-priority item on `docs/ROADMAP_V2.md`.

## What's explicitly NOT implemented, on purpose
- Real payment processing (GCash flow is manual proof-of-payment +
  Developer approval, clearly labeled as such in the UI).
- Server-side rate limiting (there's no server).
- Password reset via email (placeholder button that logs the request —
  no email is actually sent; see `resetPasswordPlaceholder()`).
- Two-factor authentication.

None of these are silently missing — each is either visibly labeled a
placeholder in the UI or listed here and in the Launch Guide.

## Phase 12 additions
- **CSV formula/DDE injection**: lead names reach the CSV export
  straight from an untrusted public chat widget. `csvEscape()`
  (`js/utils.js`) previously only quote-wrapped values — a lead named
  e.g. `=HYPERLINK("http://evil.example","click")` would have been
  written to the file as a live formula, which Excel/Sheets/LibreOffice
  execute the moment the exported file is opened. Fixed: any cell
  starting with `=`, `+`, `-`, `@`, tab, or carriage return now gets a
  leading apostrophe, forcing it to render as plain text.
- **Backup restore integrity**: `importBackup()` could previously report
  success even when an individual key failed to write (a full
  `localStorage` quota, for instance) — `StorageAdapter.set()` fails
  quietly by returning `false` rather than throwing, and the old code
  didn't check that return value. It's not an injection or access-control
  issue, but a failed restore silently reporting success is a data-
  integrity/trust issue worth recording here. Now atomic: snapshots
  before writing, checks every write's result, and rolls back fully on
  any failure. See `docs/PHASE12_NOTES.md`.

Everything else in this document was re-verified this round and still
holds — no other findings.
