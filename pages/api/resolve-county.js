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
      if (county) return { found: true, county, source: a.via };
      errors.push(`${a.via}: no match`);
    } catch (e) {
      errors.push(`${a.via}: ${e.message}`);
    }
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
    if (redis) await redis.set(cacheKey, { found: true, county: result.county, source: result.source }, { ex: 60 * 60 * 24 * 180 });
  } catch (e) { /* non-fatal */ }

  return res.status(200).json(result);
}
