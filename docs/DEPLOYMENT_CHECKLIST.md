# GymBot QC — Deployment Checklist (Phase 11)

This app is a static site: plain HTML/CSS/JS with no build step and no
server dependency, so any static host works. `index.html` carries a
short visitor-facing version of this under "Deployment checklist" — this
is the complete one, covering the full multi-page app.

## Before you deploy anywhere
- [ ] Replace demo/placeholder content: the seed Developer account
      hint, any gym info left over from testing, the `support@` /
      Messenger placeholders on the landing page's Contact section.
- [ ] Read `docs/SECURITY_AUDIT.md`'s "Known limitation" section. If
      this link is going out publicly (not just shown one-on-one in a
      sales call), move the Gemini API key behind a minimal backend
      first.
- [ ] Run through `onboarding.html` yourself, start to finish, as if
      you were a new gym owner.
- [ ] Seed the Sales Demo gym (Dev Console → Sales Demo tab) so you
      have something to show immediately after deploying.
- [ ] Confirm all internal links are relative (`href="pricing.html"`,
      not an absolute URL) — verified as of this phase; re-check if you
      add new pages.

## Hosting — pick one

### GitHub Pages
1. Push this folder to a GitHub repo.
2. Repo Settings → Pages → Deploy from branch → `main` / `/ (root)`.
3. Wait for the Pages build to finish; your URL is
   `https://<username>.github.io/<repo>/`.
4. GitHub Pages serves everything over HTTPS automatically — required
   for the Gemini `fetch()` call to work from a public URL (mixed
   content / CORS both need HTTPS).

### Netlify
1. Drag-and-drop this folder onto Netlify's dashboard, or connect the
   GitHub repo for auto-deploys on push.
2. No build command needed — Publish directory is the project root.
3. Netlify assigns a free HTTPS subdomain immediately.

### Vercel
1. Import the GitHub repo, or run `vercel` from this folder with the
   Vercel CLI.
2. Framework preset: "Other" (no build step). Output directory: `.`
   (root).
3. Vercel assigns a free HTTPS subdomain immediately.

## After deploying
- [ ] Open the live URL on an actual Android phone (not just desktop
      Chrome dev tools' mobile emulation) — check the on-screen
      keyboard doesn't cover the chat input or wizard fields.
- [ ] Walk through the full flow live: `pricing.html` →
      `onboarding.html` → `owner-dashboard.html`.
- [ ] From the Dev Console, confirm Backup & Restore works against the
      live deployment (export, then import the same file back).
- [ ] Send the link to one real gym owner and watch them use it once,
      live, before pitching the paid plan — same advice `index.html`'s
      own checklist already gives, worth repeating here.

## Not required for any of the three hosts above
- A database.
- A server process.
- Environment variables (the Gemini key is entered by the Developer
  inside the app itself, not read from a `.env` file — see Known
  Limitation in the Security Audit for why that's not the final state).
