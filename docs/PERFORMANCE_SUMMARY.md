# GymBot QC — Performance Optimization Summary (Phase 11)

## What's already true of this app's architecture
- **No build step, no framework runtime, no bundle to ship.** Every
  page loads plain HTML/CSS + native ES modules directly — there is no
  hydration cost, no virtual DOM diffing, nothing to "optimize away"
  that a bundler would normally add.
- **No blocking network calls on page load.** The only network request
  the app ever makes is the Gemini chat call, and only when a visitor
  actually sends a message — nothing fetches on load.
- **Images**: the app itself ships no raster images (icons are inline
  SVG/emoji); GCash proof/QR uploads are stored as data URLs at
  whatever size the owner uploads — see "Next" below.

## Rendering & DOM
- List views (Gym Registry, Leads, Invoices, Audit Log) re-render their
  container's `innerHTML` wholesale on data change rather than
  diffing — appropriate at this app's realistic data volumes (a single
  gym's leads/invoices, or a developer's full gym list, both comfortably
  under a few hundred rows) and dramatically simpler to keep correct
  than a hand-rolled diffing layer would be. This should be revisited
  if `docs/ROADMAP_V2.md`'s multi-hundred-gym future materializes.
- Event listeners are attached once per render pass and not
  re-registered on every keystroke; form inputs use native
  debouncing-free direct binding since validation here is cheap
  (string length checks, regex), not the kind of expensive computation
  that needs debouncing.

## Storage
- `StorageAdapter` reads/writes JSON directly — there is no in-memory
  cache layer, which is a deliberate simplicity trade-off: `localStorage`
  reads are synchronous and fast enough at this data volume (single-digit
  milliseconds) that a cache would add complexity without a measurable
  win. Worth revisiting only if profiling on a real low-end Android
  device shows otherwise.

## Mobile responsiveness
- All layouts (landing page, dashboards, the new onboarding wizard,
  pricing page) use the shared `css/base.css`/`css/layout.css` token
  system and were checked at a 375px viewport. The owner dashboard's
  sidebar collapses to a mobile drawer (`wireMobileSidebar()` in
  `owner-shell-ui.js`).

## Loading / empty / error states
Covered in full in `docs/BUG_PREVENTION_AUDIT.md` — every list and form
has an explicit loading, empty, and error state; none silently show a
blank screen.

## What "performance" doesn't mean here
This is a static, client-only app with no server to instrument — there
is no real-user-monitoring, no server response time, no database query
plan to optimize. "Performance" in this document means what a person
opening the app on a mid-range Android phone over 4G would actually
notice: time-to-interactive (near-instant — nothing blocks first paint),
input responsiveness (native, no framework overhead), and network usage
(minimal — one call per chat message, nothing else).

## Next (see also docs/ROADMAP_V2.md)
- GCash proof/QR uploads currently store the full-resolution image as a
  data URL in `localStorage`; a real backend migration should move
  these to actual file storage with a thumbnail generated for list
  views, both for `localStorage`'s ~5-10MB practical ceiling and for
  faster list rendering once a gym has many invoices.
- Once there's a server (see Security Audit), add real instrumentation
  (response times, error rates) rather than continuing to reason about
  performance from first principles.
