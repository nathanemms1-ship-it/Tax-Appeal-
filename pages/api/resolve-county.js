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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (await enforceRateLimit(req, res, 'county', 20, 60)) return;

  const { street, city, state, zip } = req.body || {};
  if (!street || !state) return res.status(400).json({ error: 'street and state are required' });

  const cacheKey = `county:${String(street).toLowerCase().trim()}|${String(zip || city).toLowerCase().trim()}`;

  try {
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) return res.status(200).json({ ...cached, cached: true });
    }
  } catch (e) { /* cache miss is not fatal */ }

  try {
    const params = new URLSearchParams({
      street: String(street),
      city: String(city || ''),
      state: String(state),
      zip: String(zip || ''),
      benchmark: 'Public_AR_Current',
      vintage: 'Current_Current',
      layers: 'Counties',
      format: 'json',
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(`${CENSUS_URL}?${params.toString()}`, { signal: controller.signal });
    clearTimeout(timer);

    if (!r.ok) throw new Error(`Census geocoder returned ${r.status}`);
    const data = await r.json();

    const match = data?.result?.addressMatches?.[0];
    const countyRaw = match?.geographies?.Counties?.[0]?.BASENAME
      || match?.geographies?.['Counties']?.[0]?.NAME
      || null;

    if (!countyRaw) {
      return res.status(200).json({ found: false, county: null });
    }

    // Census BASENAME is already bare ("Miami-Dade", "St. Johns"), but strip a
    // trailing " County" defensively in case NAME was used.
    const county = String(countyRaw).replace(/\s+County$/i, '').trim();
    const payload = { found: true, county, source: 'census' };

    try {
      if (redis) await redis.set(cacheKey, payload, { ex: 60 * 60 * 24 * 180 });
    } catch (e) { /* non-fatal */ }

    return res.status(200).json(payload);
  } catch (err) {
    console.error('resolve-county error:', err.message);
    // Deliberately do NOT guess. The caller must ask the customer.
    return res.status(200).json({ found: false, county: null, error: err.message });
  }
}
