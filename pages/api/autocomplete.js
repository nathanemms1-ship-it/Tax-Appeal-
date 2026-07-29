/**
 * Address autocomplete — a proxy in front of Google Places + Geocoding.
 *
 * ============================================================================
 * COST SHAPE (why this file changed)
 * ============================================================================
 * This route fires on KEYSTROKES, and each call did SIX billed Google requests:
 * one Places Autocomplete, then one Geocoding request per prediction, five deep.
 *
 * The only control was 40 requests / 60 seconds per IP, with no hourly or daily
 * cap. That is 57,600 requests/day/IP x 6 = ~345,600 billed Google calls per day
 * from ONE address. Google's autocomplete and geocoding SKUs are per-request, so
 * that is the whole bill with no customer at the end of it.
 *
 * Three changes, in order of how much they save:
 *   1. CACHE. Address prefixes repeat constantly — both across keystrokes of one
 *      user ("123 Ma", "123 Mai", "123 Main") and across users in the same county.
 *      A cache hit costs zero Google calls. This is the largest saving and it also
 *      makes the funnel faster.
 *   2. FAN-OUT 5 -> 3. Two fewer geocoding calls per miss, a 33% cut on the
 *      dominant cost, and the dropdown never showed more than a few usefully.
 *   3. An HOURLY and DAILY cap on top of the per-minute one, so a single IP has a
 *      bounded worst case instead of an unbounded one.
 *
 * Per-IP caps bound ONE attacker. They do not bound ten thousand. The global
 * ceiling in lib/spendGuard.js is what covers that case.
 */

import { Redis } from '@upstash/redis';
import { enforceRateLimit } from '../../lib/rateLimit';
import { LIMITS, cap } from '../../lib/inputLimits';
import { checkSpend } from '../../lib/spendGuard';

let redis = null;
try {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (redisUrl && redisToken) redis = new Redis({ url: redisUrl, token: redisToken });
} catch (e) {
  console.log('Redis init failed:', e.message);
}

// Suggestions for a given prefix are stable for far longer than this. 6 hours keeps
// the cache useful across a whole day's traffic without ever serving a stale
// address long enough to matter.
const SUGGEST_TTL = 6 * 60 * 60;
// place_id -> address components never changes. Cache it for a week.
const PLACE_TTL = 7 * 24 * 60 * 60;

// Was 5. Each one is a separate billed Geocoding request.
const MAX_DETAILS = 3;

function normalizeQuery(q) {
  return String(q).trim().toLowerCase().replace(/\s+/g, ' ');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Google Places and Geocoding are both billed per call.
  if (await enforceRateLimit(req, res, 'autocomplete', 40, 60)) return;
  // A keystroke-driven endpoint needs a longer horizon than 60 seconds. Typing a
  // full address is ~10-20 calls, so 600/hour is roughly 30 addresses an hour from
  // one IP — generous for a human, and 96x tighter than the old effective ceiling.
  if (await enforceRateLimit(req, res, 'autocomplete', 600, 3600)) return;
  if (await enforceRateLimit(req, res, 'autocomplete', 3000, 86400)) return;

  const query = cap(req.body?.query, LIMITS.address);
  if (!query || query.length < 3) return res.status(200).json({ suggestions: [] });

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    console.error('GOOGLE_PLACES_API_KEY is not set');
    return res.status(200).json({ suggestions: [] });
  }

  const cacheKey = `ac:${normalizeQuery(query)}`;

  if (redis) {
    try {
      const hit = await redis.get(cacheKey);
      if (hit) {
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json({ suggestions: hit });
      }
    } catch (e) {
      // A cache miss on error is correct; never fail the request over the cache.
    }
  }

  // Only a MISS costs money, so the ceiling is checked here rather than at the top.
  const spend = await checkSpend('google', 1);
  if (!spend.ok) {
    console.error('[autocomplete] daily Google ceiling reached, serving no suggestions.');
    // 200 with an empty list, not 429: the customer can still type their address by
    // hand and complete the purchase. Breaking the funnel to save API spend would
    // cost more than the API spend.
    return res.status(200).json({ suggestions: [], degraded: true });
  }

  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
      `?input=${encodeURIComponent(query)}&types=address&components=country:us&key=${key}`;

    const r = await fetch(url);
    const data = await r.json();

    if (data.status !== 'OK') {
      // Do not log the full response body — it is large and adds nothing.
      console.log('Google Places status:', data.status, data.error_message || '');
      return res.status(200).json({ suggestions: [], error: data.status });
    }

    const predictions = (data.predictions || []).slice(0, MAX_DETAILS);

    const suggestions = await Promise.all(
      predictions.map(async (pred) => {
        const placeKey = `place:${pred.place_id}`;
        if (redis) {
          try {
            const cached = await redis.get(placeKey);
            if (cached) return cached;
          } catch (e) { /* fall through to the billed call */ }
        }

        try {
          await checkSpend('google', 1);
          const detailUrl =
            `https://maps.googleapis.com/maps/api/geocode/json` +
            `?place_id=${encodeURIComponent(pred.place_id)}&key=${key}`;
          const dr = await fetch(detailUrl);
          const dd = await dr.json();
          const components = dd?.results?.[0]?.address_components || [];
          const get = (type) => components.find((c) => c.types.includes(type))?.short_name || '';
          const getLong = (type) => components.find((c) => c.types.includes(type))?.long_name || '';
          const street = `${get('street_number')} ${getLong('route')}`.trim();
          const out = {
            street,
            city:
              getLong('locality') ||
              getLong('sublocality') ||
              getLong('administrative_area_level_3') ||
              '',
            state: get('administrative_area_level_1'),
            zip: get('postal_code'),
            // county, so /api/resolve-county has a chance of not needing a call at
            // all. Google already returned it; we were throwing it away.
            county: getLong('administrative_area_level_2').replace(/\s+County$/i, ''),
            full: dd?.results?.[0]?.formatted_address || pred.description,
          };

          if (redis && street) {
            try { await redis.set(placeKey, out, { ex: PLACE_TTL }); } catch (e) {}
          }
          return out;
        } catch {
          return { street: pred.description, city: '', state: '', zip: '', county: '', full: pred.description };
        }
      })
    );

    const valid = suggestions.filter((s) => s.street);

    if (redis && valid.length) {
      try { await redis.set(cacheKey, valid, { ex: SUGGEST_TTL }); } catch (e) {}
    }

    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json({ suggestions: valid });
  } catch (e) {
    console.log('AUTOCOMPLETE EXCEPTION:', e.message);
    return res.status(200).json({ suggestions: [] });
  }
}
