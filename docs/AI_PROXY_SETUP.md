# AI Proxy Setup (Phase A — fixes the exposed Gemini API key)

This closes the security finding from the architecture audit: your Gemini
API key currently lives in browser localStorage and gets sent in the
request URL, visible to anyone with devtools open. It also likely means
the AI Receptionist doesn't actually respond for real customers on their
own devices, since the key never leaves the one browser you configured it
in. This fixes both.

**Time required:** ~15 minutes. **Cost:** Cloudflare Workers free tier
covers 100,000 requests/day — enough for a long time before you'd pay
anything.

---

## 1. Create a Cloudflare account (skip if you have one)
Go to https://dash.cloudflare.com/sign-up — free, no card required for the
Workers free tier.

## 2. Create the Worker
1. In the Cloudflare dashboard, go to **Workers & Pages** → **Create** →
   **Create Worker**.
2. Give it a name, e.g. `gymbot-gemini-proxy`. Click **Deploy** (it deploys
   a placeholder first — that's fine).
3. Click **Edit code**. Delete everything in the editor and paste in the
   full contents of `server/gemini-proxy-worker.js` from this delivery.
4. Before deploying, edit the `ALLOWED_ORIGINS` array near the top —
   it already includes `https://cpadillapogi-debug.github.io`. Add any
   custom domain a gym embeds the widget on later.
5. Click **Deploy**.

## 3. Add your Gemini key as a secret (NOT in the code)
1. On the Worker's page, go to **Settings** → **Variables and Secrets**.
2. Add a new secret: name `GEMINI_API_KEY`, value = your actual Gemini API
   key (the same one currently pasted into the dashboard's Setup panel).
3. Save. This value is encrypted at rest and never appears in the Worker's
   source code or in any browser.

## 4. Copy the Worker's URL
After deploying, Cloudflare shows a URL like:
```
https://gymbot-gemini-proxy.<your-subdomain>.workers.dev
```
Copy it exactly.

## 5. Point the app at the proxy
In `js/config.js`, find:
```js
AI_PROXY_URL: "",
```
Set it to the URL from step 4:
```js
AI_PROXY_URL: "https://gymbot-gemini-proxy.<your-subdomain>.workers.dev",
```
Upload the updated `config.js` to your repo (replaces the existing file).

**That's the entire frontend change.** `gemini-service.js` already checks
`CONFIG.AI_PROXY_URL` and automatically routes every AI call through the
proxy instead of calling Google directly — no other file changes.

## 6. Test it
1. Open your live dashboard, go to the AI setup/test panel, run "Test
   connection." It should succeed.
2. Open browser devtools → Network tab → send a chat message on the demo
   widget. Confirm the request goes to your `workers.dev` URL, and that no
   Gemini key appears anywhere in the request (URL, headers, or body).
3. Open the widget link on a **different device** (e.g. your phone, not
   the browser you configured anything in) and send a message — this is
   the real test that customers on their own devices now get a response.

## Rollback
If anything goes wrong, set `AI_PROXY_URL` back to `""` and re-upload
`config.js` — the app instantly reverts to the old direct-call behavior
with zero other changes needed.

## What this does NOT fix yet
Per-gym rate limiting and usage billing still don't exist — the proxy
currently protects the key, not your Gemini quota from abuse. That needs
the real backend migration (Phase B in the architecture audit) to do
properly, since it requires per-gym identity the proxy can verify server-side.
