/**
 * Lightweight, authoritative county resolution for an address.
 *
 * WHY THIS EXISTS:
 * The Florida VAB filing fee, the check payee, and the mailing address are all
 * keyed on COUNTY. Previously the fee step ran before /api/lookup had resolved
 * the county, so pages/apply.js fell back to `property.city` — meaning
 * getFlVabFee("Miami") missed the table and returned the $50 default with payee
 * "Board of County Commissioners". The customer was then shown "$50", "MIAMI
 * COUNTY", and a $139 total, and typed their legal name to attest to all of it,
 * while Stripe charged Miami-Dade's real $15 and the check went to the Clerk of
 * the VAB. Every field in the signed attestation was wrong.
 *
 * This endpoint resolves the county from the U.S. Census Geocoder — free,
 * authoritative, no API key, and the same source of truth the filing path uses.
 * It is deliberately cheap: no BatchData call, no LLM, no paid dependency, so it
 * can safely run early in the funnel before the user has paid.
 *
 * There is intentionally NO LLM fallback. A guessed county produces a wrong fee,
 * a wrong payee, and a petition mailed to the wrong government office. If the
 * Census geocoder cannot place the address we return notFound and the UI asks
 * the customer to pick their county.
 */

import { Redis } from '@upstash/redis';
import { enforceRateLimit } from '../../lib/rateLimit';

let redis = null;
try {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (redisUrl && redisToken) redis = new Redis({ url: redisUrl, token: redisToken });
} catch (e) { console.log('Redis init failed:', e.message); }

const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/address';


const CENSUS_ONELINE_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';

// Vercel default is 10s; three attempts at 7s each needs headroom.
export const config = { maxDuration: 30 };

/**
 * ============================================================================
 * THE STATE WAS IN THIS RESPONSE ALL ALONG. 7 Sept 2026.
 * ============================================================================
 * The Census county geography carries STATE (a 2-digit FIPS code) beside
 * BASENAME, and this function threw it away. Confirmed against the live
 * geocoder — Counties[0] holds GEOID, STATE, COUNTY, BASENAME, NAME and more.
 *
 * That matters twice over:
 *
 *   TEXAS. lib/tx/parcels.js findParcel REQUIRES a cadId and nothing supplies
 *   one, which is the whole reason /check is not wired for Texas. Census gives
 *   the county name; lib/tx/coverage.js coveredCadFromName turns it into a CAD.
 *   No county picker, no ZIP-to-CAD table to invent.
 *
 *   THE 114. pages/api/check.js answers out-of-state on the ZIP, and the ZIP is
 *   optional — so between 21 Aug and 7 Sept, 114 of ~468 checks fell through to
 *   the Florida roll, retrieved nothing, and were told their property does not
 *   exist. An authoritative state removes the guess entirely.
 *
 * Returns an object now rather than a bare string. Callers that only want the
 * county read `.county`.
 */
const FIPS_TO_STATE = Object.freeze({
  // Only the states we serve. FIPS codes are assigned alphabetically, so the
  // rest are derivable — but a state name asserted from memory and printed to a
  // homeowner is exactly the class of guess this file's header refuses. Anything
  // else returns stateFips and no name, and the caller says "not a state we
  // cover" without naming it wrongly.
  '01': 'AL', '05': 'AR', '12': 'FL', '13': 'GA', '48': 'TX',
});

function placeFromCensus(data) {
  const match = data?.result?.addressMatches?.[0];
  const geo = match?.geographies?.Counties?.[0] || null;
  const raw = geo?.BASENAME || geo?.NAME || null;
  const stateFips = geo?.STATE ? String(geo.STATE).padStart(2, '0') : null;
  if (!raw) return { county: null, state: null, stateFips: null };
  return {
    // BASENAME is already bare ("Miami-Dade", "St. Johns"); strip defensively.
    county: String(raw).replace(/\s+County$/i, '').trim() || null,
    state: stateFips ? (FIPS_TO_STATE[stateFips] || null) : null,
    stateFips,
  };
}

/** Kept for callers that only ever wanted the name. */
function countyFromCensus(data) {
  return placeFromCensus(data).county;
}

async function fetchJson(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) throw new Error(`geocoder returned ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Last-resort fallback: resolve the county from the ZIP CENTROID.
 *
 * Census's address matcher is strict and genuinely cannot match some real
 * addresses - "15200 SW 136th St, Miami 33196" and "9500 Bay Pines Blvd,
 * St Petersburg 33708" both fail all three attempts above. That was a third of a
 * 12-address production sample, which is far too many customers to push onto a
 * manual picker.
 *
 * Two free, keyless government-adjacent APIs chained:
 *   api.zippopotam.us/us/{zip}         ZIP  -> latitude/longitude
 *   geo.fcc.gov/api/census/block/find  lat/lon -> county (FCC, from Census blocks)
 *
 * IMPORTANT - this is deliberately marked lower confidence. It resolves the
 * CENTROID of the ZIP, not the property. Most Florida ZIPs sit inside one county,
 * but some straddle a line, and county drives the filing fee, the cheque payee and
 * which government office receives the petition. So the caller must have the
 * customer CONFIRM a zip-centroid result rather than accept it silently. Never
 * promote this to `confidence: 'address'`.
 */
async function countyFromZipCentroid(zip, expectState) {
  if (!zip) return null;
  const clean = String(zip).trim().slice(0, 5);
  if (!/^\d{5}$/.test(clean)) return null;

  const z = await fetchJson(`https://api.zippopotam.us/us/${clean}`, 5000);
  const place = z && z.places && z.places[0];
  if (!place) return null;

  const lat = place.latitude, lon = place.longitude;
  if (!lat || !lon) return null;

  const f = await fetchJson(
    `https://geo.fcc.gov/api/census/block/find?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&format=json`,
    5000
  );
  const name = f && f.County && f.County.name;
  const st = f && f.State && f.State.code;
  if (!name) return null;
  // Guard against a ZIP that geocodes outside the state the customer gave us.
  if (expectState && st && String(st).toUpperCase() !== String(expectState).toUpperCase()) return null;
  return String(name).replace(/\s+County$/i, '').trim() || null;
}

/**
 * Resolve a county, tolerating a flaky upstream.
 *
 * The Census geocoder is free, authoritative and the same source the filing path
 * uses - but it is a government service that is regularly slow. The previous
 * version made ONE structured call with an 8s timeout and no retry, and returned
 * `{found:false, county:null}` on abort. Nathan tried four Florida addresses in a
 * row and every one dead-ended: not because the addresses were unusual, but
 * because Census was degraded for a few minutes and a single timeout was treated
 * as "this county is unknowable".
 *
 * Three attempts against two different Census endpoints. Still NO guessing and
 * still no LLM: a wrong county means a wrong fee, a wrong payee, and a petition
 * mailed to the wrong government office. If all three fail the caller shows the
 * customer a county picker rather than proceeding on a guess.
 */
/**
 * EXPORTED, AND `state` IS NOW OPTIONAL. 7 Sept 2026.
 *
 * pages/api/check.js needs to route an address whose state it does NOT know —
 * that is the entire problem. It answers out-of-state on the ZIP, the ZIP is
 * optional, and 114 of ~468 checks between 21 Aug and 7 Sept fell through to
 * the Florida roll and were told their property does not exist.
 *
 * Exported rather than reimplemented. This function carries three geocoder
 * attempts, a ZIP-centroid fallback and the reasons for each; a second copy in
 * check.js would be two versions of the same logic that must agree, which is
 * the drift this codebase keeps paying for.
 *
 * The oneline URL already filtered a falsy state out of its address string, so
 * this mostly makes an existing tolerance explicit — and stops the structured
 * URL sending the literal "undefined".
 */
export async function resolveCounty({ street, city, state, zip }) {
  const base = {
    benchmark: 'Public_AR_Current',
    vintage: 'Current_Current',
    layers: 'Counties',
    format: 'json',
  };
  const structured = `${CENSUS_URL}?${new URLSearchParams({
    street: String(street), city: String(city || ''), state: String(state || ''),
    zip: String(zip || ''), ...base,
  })}`;
  const oneline = `${CENSUS_ONELINE_URL}?${new URLSearchParams({
    address: [street, city, state, zip].filter(Boolean).join(', '), ...base,
  })}`;

  const attempts = [
    { url: structured, ms: 7000, via: 'census-structured' },
    { url: structured, ms: 7000, via: 'census-structured-retry' },
    // Different parser upstream; succeeds on some addresses the structured
    // endpoint cannot match, e.g. unit numbers or non-standard street types.
    { url: oneline, ms: 7000, via: 'census-oneline' },
  ];

  const errors = [];
  for (const a of attempts) {
    try {
      const place = placeFromCensus(await fetchJson(a.url, a.ms));
      const { county } = place;
      // Matched the actual street address - safe to use without asking.
      // state/stateFips ride along. A ZIP-centroid fallback further down cannot
      // supply them, and says so by leaving them null rather than guessing.
      if (county) {
        return { found: true, county, state: place.state, stateFips: place.stateFips,
          source: a.via, confidence: 'address' };
      }
      errors.push(`${a.via}: no match`);
    } catch (e) {
      errors.push(`${a.via}: ${e.message}`);
    }
  }

  try {
    const county = await countyFromZipCentroid(zip, state);
    if (county) {
      // ZIP centroid, NOT the property. The caller must have the customer confirm.
      return { found: true, county, source: 'zip-centroid', confidence: 'zip' };
    }
    errors.push('zip-centroid: no match');
  } catch (e) {
    errors.push(`zip-centroid: ${e.message}`);
  }

  return { found: false, county: null, tried: errors };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (await enforceRateLimit(req, res, 'county', 20, 60)) return;

  const { street, city, state, zip } = req.body || {};
  if (!street || !state) return res.status(400).json({ error: 'street and state are required' });

  /**
   * VERSIONED, BECAUSE THE CACHED SHAPE CHANGED. `county:` -> `county:v2:`.
   *
   * Entries live 180 days. Adding state/stateFips without bumping this would
   * have meant a warm key answering `{ county }` with no state while a cold one
   * answered with it — for six months, on exactly the addresses checked most
   * often, and invisibly. lib/providers keys carry a version for the same
   * reason (`lookup:v5-fl-county-only:`).
   */
  const cacheKey = `county:v2:${String(street).toLowerCase().trim()}|${String(zip || city).toLowerCase().trim()}`;

  try {
    if (redis) {
      const cached = await redis.get(cacheKey);
      // Only successes are cached, so a cached entry is always usable. Failures
      // are deliberately never cached - a Census outage must not pin an address
      // to "unknown" for 180 days.
      if (cached && cached.found) return res.status(200).json({ ...cached, cached: true });
    }
  } catch (e) { /* cache miss is not fatal */ }

  const result = await resolveCounty({ street, city, state, zip });

  if (!result.found) {
    console.error('resolve-county failed:', JSON.stringify(result.tried));
    return res.status(200).json({ found: false, county: null, tried: result.tried });
  }

  try {
    // The cached shape must carry the new fields too, or a cache hit silently
    // answers without a state while a miss answers with one — the kind of split
    // that only shows up months later on a warm key.
    if (redis) await redis.set(cacheKey, { found: true, county: result.county, state: result.state ?? null, stateFips: result.stateFips ?? null, source: result.source, confidence: result.confidence }, { ex: 60 * 60 * 24 * 180 });
  } catch (e) { /* non-fatal */ }

  return res.status(200).json(result);
}
