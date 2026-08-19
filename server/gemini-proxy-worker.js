/* ============================================================
   GYMBOT QC — GEMINI PROXY (Cloudflare Worker)
   Deploy this SEPARATELY from your GitHub Pages site (Cloudflare
   Workers has its own free tier — see docs/AI_PROXY_SETUP.md for
   step-by-step deployment). This file does NOT go in your GitHub
   Pages repo.

   WHAT THIS FIXES:
     1. Your Gemini API key currently sits in browser
        localStorage and gets appended to the request URL — visible
        to anyone with devtools open on your site. Once this Worker
        holds the real key as a Cloudflare secret (never in this
        file's source, never in the browser), that exposure is gone.
     2. Right now the key only exists in whichever ONE browser you
        used to paste it into the Setup panel — localStorage never
        syncs across devices. A real customer opening a gym's
        embedded widget on THEIR OWN phone/browser has no key at
        all, so the AI likely never actually responds for them
        today. Routing every gym's widget through this one shared
        Worker fixes that too — every browser hits the same proxy.

   WHAT THIS DOES NOT FIX (still needs a real backend, Phase B in
   the architecture audit): per-gym rate limiting, per-gym usage
   billing, and origin allowlisting below is coarse (per-domain,
   not per-gym) — good enough to stop random scraping of your
   proxy, not a substitute for real multi-tenant authorization.
   ============================================================ */

// EDIT THIS: the domain(s) allowed to call this proxy. Wildcard
// subdomains of your own GitHub Pages domain, plus any custom
// domains gyms embed the widget on. Keep this list tight — anyone
// NOT on it gets a CORS rejection before your Gemini quota is touched.
const ALLOWED_ORIGINS = [
  "https://cpadillapogi-debug.github.io"
  // add gym custom domains here as gyms come on, e.g.:
  // "https://mygym.com"
];

function corsHeaders(origin){
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

export default {
  async fetch(request, env){
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);

    if(request.method === "OPTIONS"){
      return new Response(null, { status: 204, headers });
    }
    if(request.method !== "POST"){
      return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers });
    }
    if(!ALLOWED_ORIGINS.includes(origin)){
      return new Response(JSON.stringify({ error: "origin_not_allowed" }), { status: 403, headers });
    }
    if(!env.GEMINI_API_KEY){
      // Deployed without the secret set — fail loudly rather than silently.
      return new Response(JSON.stringify({ error: "proxy_not_configured" }), { status: 500, headers });
    }

    let body;
    try{
      body = await request.json();
    }catch(err){
      return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400, headers });
    }

    const { model, temperature, maxOutputTokens, systemPrompt, contents } = body || {};
    if(!model || !Array.isArray(contents)){
      return new Response(JSON.stringify({ error: "missing_fields" }), { status: 400, headers });
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${env.GEMINI_API_KEY}`;

    let geminiResponse;
    try{
      geminiResponse = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt || "" }] },
          contents,
          generationConfig: {
            temperature: typeof temperature === "number" ? temperature : 0.7,
            maxOutputTokens: typeof maxOutputTokens === "number" ? maxOutputTokens : 300
          }
        })
      });
    }catch(err){
      return new Response(JSON.stringify({ error: "upstream_network_error" }), { status: 502, headers });
    }

    if(geminiResponse.status === 401 || geminiResponse.status === 403){
      return new Response(JSON.stringify({ error: "invalid_key" }), { status: 403, headers });
    }
    if(geminiResponse.status === 429){
      return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers });
    }
    if(!geminiResponse.ok){
      return new Response(JSON.stringify({ error: "upstream_error" }), { status: 502, headers });
    }

    const data = await geminiResponse.json();
    const candidate = data && data.candidates && data.candidates[0];
    const parts = candidate && candidate.content && candidate.content.parts;
    const text = parts && parts[0] && typeof parts[0].text === "string" ? parts[0].text.trim() : "";

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: Object.assign({ "Content-Type": "application/json" }, headers)
    });
  }
};
