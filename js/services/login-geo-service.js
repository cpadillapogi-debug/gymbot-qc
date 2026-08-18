/* ============================================================
   GYMBOT QC — LOGIN GEOLOCATION SERVICE (Phase 14)
   Best-effort, IP-based "approximate city/country" lookup for the
   Security Center's login activity list.

   HOW THIS WORKS, AND WHAT IT DELIBERATELY DOES NOT DO:
     - This is a client-only app (see storage.js) with no backend
       server, so there is no request log to read a visitor's IP
       from server-side. Instead, right after a login attempt, the
       browser itself asks a public IP-geolocation API "what city/
       country does my current IP look like from the outside" and
       stores that answer alongside the log entry.
     - This is approximate and IP-based, NOT GPS. It typically
       resolves to the visitor's city/ISP region, not a precise
       address, and can be wrong for VPNs, mobile carriers, and
       corporate networks. The UI must label it "Approximate" —
       never present it as an exact location.
     - No browser Geolocation API (navigator.geolocation) is used
       here on purpose — that would prompt the visitor for GPS
       permission on every login attempt (including failed ones,
       before we know who they are), which is intrusive and easy
       to decline anyway. IP lookup needs no permission prompt.
     - Network calls can fail (offline, ad-blocker, API downtime,
       rate limit) — every caller must treat a lookup as optional
       and never let it block or fail the login flow itself.
   ============================================================ */

const GEO_API_URL = "https://ipapi.co/json/";
const LOOKUP_TIMEOUT_MS = 4000;

/**
 * @returns {Promise<object|null>} `{ city, region, country, ip }` (any
 *   field may be missing depending on what the API returns) or null if
 *   the lookup failed, timed out, or is unavailable in this environment.
 *   Never rejects.
 */
export async function lookupApproximateLocation(){
  if(typeof fetch !== "function") return null;

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS) : null;

  try{
    const res = await fetch(GEO_API_URL, controller ? { signal: controller.signal } : undefined);
    if(!res.ok) return null;
    const data = await res.json();
    if(!data || data.error) return null;

    return {
      city: data.city || null,
      region: data.region || null,
      country: data.country_name || data.country || null,
      ip: data.ip || null
    };
  }catch(err){
    // Offline, blocked by an ad-blocker/privacy extension, API rate
    // limit, or timeout — all treated the same: no location this time.
    return null;
  }finally{
    if(timer) clearTimeout(timer);
  }
}

/** @param {{city?:string, region?:string, country?:string}} loc
 *  @returns {string} human-readable "City, Region, Country", skipping
 *   whichever parts are missing. Empty string if nothing is known. */
export function formatApproximateLocation(loc){
  if(!loc) return "";
  return [loc.city, loc.region, loc.country].filter(Boolean).join(", ");
}
