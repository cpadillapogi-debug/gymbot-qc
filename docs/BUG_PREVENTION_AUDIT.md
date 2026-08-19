# GymBot QC — Bug Prevention Audit (Phase 11)

Scope: the full application. `index.html` carries a shorter version of
the public-chat-demo-specific rows under its own "Bug prevention audit"
section — this is the complete one.

| Scenario | Handling |
|---|---|
| No API key set | AI Receptionist shows a clear setup message instead of failing silently. |
| Invalid or expired Gemini key | API error caught and shown as a friendly chat message, not a crash. |
| Gemini API down / network offline | 15s timeout with capped retries; falls back to a rule-based reply built from the gym's Business Settings — a customer never sees a raw error. `navigator.onLine` is checked before wasting a request. |
| Empty / whitespace-only chat message | Blocked before sending; send button stays disabled. |
| Very long input | Capped via `maxlength` **and** clamped again in code (`clampText()`) — not relying on the HTML attribute alone. |
| Rapid repeated clicks (chat send, form submits, GCash proof upload) | Buttons disable the instant an action starts and only re-enable after it resolves or errors. |
| Duplicate GCash payment submission | `getPendingPaymentForGym()` blocks a second pending submission while one is already awaiting review. |
| Corrupted `localStorage` | Every read goes through `StorageAdapter`'s try/catch (`js/storage.js`); a broken record is reset to a safe default instead of crashing the page. |
| Malformed backup file on import | Shape-validated before anything is written; a bad file is rejected with a specific reason, not silently partially applied. |
| CSV export with commas/quotes/emoji | Every field is quote-wrapped and internal quotes escaped (`csvEscape()`) before export. |
| Required form fields left blank (login, register, onboarding, Business Settings, booking) | Submit stays disabled and/or an inline, specific error explains what's missing — never a generic "error occurred." |
| Image upload of the wrong type or too large | Rejected client-side with a specific reason before it ever reaches storage. |
| Developer deletes a gym a customer is mid-session in | Soft-delete only (`deletedAt`, data retained); a deleted gym's owner is blocked at next login with a clear message, not silently locked out mid-session. |
| A Gym Owner navigates to a Developer-only URL directly | `requireRole()` redirects to their own dashboard rather than rendering restricted content. |
| An unauthenticated visitor opens `owner-dashboard.html?devview=<id>` directly | The `devview` param is only honored when the *real* session (server-truth equivalent: `getSession()`) already has the Developer role — an unauthenticated or Gym Owner visitor is redirected through the normal login flow, ignoring the param entirely. |
| Subscription lapses while the owner is using the AI Receptionist | Access is re-checked (`getSubscriptionAccess()`), not just checked once at login — the AI Receptionist page reflects "disabled" immediately once a subscription is no longer active. |
| Empty states (no leads yet, no invoices yet, no gyms yet) | Each list view has a specific empty-state message and next action, not a blank table. |

## Phase 12 additions
The scenarios below were found and fixed in this round — see
`docs/PHASE12_NOTES.md` for the full writeup of what was audited and why.

| Scenario | Mitigation |
|---|---|
| A corrupted/malformed record inside `users`, `gyms`, `leads`, `invoices`, `gcashPayments`, `notifications`, or the log collections (e.g. a hand-edited `localStorage` value, or one bad row surviving a partial backup restore) | `sanitizeRecords()` (`js/utils.js`) filters non-object/malformed entries out at each collection's read boundary, so one bad record can no longer crash every page that reads that collection. Nothing is deleted from storage — only the in-memory copy is filtered. |
| Backup restore fails partway through (e.g. storage quota hit on the 3rd of 8 keys) | `importBackup()` now snapshots every key first and checks each write's actual return value; on any failure it rolls every key back to its pre-restore value and reports failure, instead of silently reporting a half-restored backup as a full success. |
| An unexpected error mid-flow in the chat send, either "Test connection" button, or the landing-page demo | All four now run inside try/catch/finally, so an unexpected error can no longer leave a button permanently disabled — it re-enables and shows a plain-language message instead of requiring a page reload. |
| A payment-proof or GCash QR image fails to read (corrupt file, browser hiccup) | Both upload flows now have a `reader.onerror` handler — previously a failed read failed silently with no user feedback. |
| Rapid double-Enter/double-click on the login or register form | Both submit handlers now no-op while already in flight, instead of relying only on the disabled button state. |
| Two browser tabs open to the same gym's dashboard both crossing a subscription-transition boundary at the same moment could each generate a billing-period invoice for it | `handleTransitionSideEffects()` in `subscription-service.js` now checks whether an invoice already exists for that exact billing period before creating one. |

## What this audit does not cover
Load/stress testing and anything requiring real backend infrastructure
(see `docs/SECURITY_AUDIT.md`'s "Known limitation" and
`docs/ROADMAP_V2.md`). Concurrent-multi-tab-write races are narrowed
(see the duplicate-invoice fix above) but not fully eliminated — there
is still no locking mechanism, so two tabs writing to *different*
records at the exact same instant could still overwrite one another
last-write-wins; this needs a real backend to fix properly and is
tracked on `docs/ROADMAP_V2.md`.
