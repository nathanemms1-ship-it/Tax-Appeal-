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

function countyFromCensus(data) {
  const match = data?.result?.addressMatches?.[0];
  const raw = match?.geographies?.Counties?.[0]?.BASENAME
    || match?.geographies?.['Counties']?.[0]?.NAME
    || null;
  if (!raw) return null;
  // BASENAME is already bare ("Miami-Dade", "St. Johns"); strip defensively.
  return String(raw).replace(/\s+County$/i, '').trim() || null;
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
async function resolveCounty({ street, city, state, zip }) {
  const base = {
    benchmark: 'Public_AR_Current',
    vintage: 'Current_Current',
    layers: 'Counties',
    format: 'json',
  };
  const structured = `${CENSUS_URL}?${new URLSearchParams({
    street: String(street), city: String(city || ''), state: String(state),
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
      const county = countyFromCensus(await fetchJson(a.url, a.ms));
      // Matched the actual street address - safe to use without asking.
      if (county) return { found: true, county, source: a.via, confidence: 'address' };
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

  const cacheKey = `county:${String(street).toLowerCase().trim()}|${String(zip || city).toLowerCase().trim()}`;

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
    if (redis) await redis.set(cacheKey, { found: true, county: result.county, source: result.source, confidence: result.confidence }, { ex: 60 * 60 * 24 * 180 });
  } catch (e) { /* non-fatal */ }

  return res.status(200).json(result);
}
