/**
 * COMPARABLE SALES for a subject property.
 *
 * ============================================================================
 * WHAT CHANGED AND WHY IT MATTERS
 * ============================================================================
 * Until now the petition contained NO comparable sales at all, and that was the
 * correct call at the time: an earlier version had Claude generate "realistic
 * comparable sales" from training data — inventing addresses and sale prices —
 * and those figures were going onto a document the homeowner signs under penalty
 * of perjury. Prohibiting comps entirely was the right emergency fix.
 *
 * This endpoint is what makes it safe to put them back. Every sale returned here
 * is a recorded transaction retrieved from a data provider, carries its own
 * source attribution, and can be checked by anyone against the county's records.
 * Nothing here is generated.
 *
 * THE HARD RULE THIS ENDPOINT ENFORCES: if we cannot find enough real comps, we
 * return `sufficient: false` and NO indicated value. The caller must then either
 * file without a comps section or not file. It must never fall back to an
 * estimate. A petition with three verifiable sales beats a petition with six
 * plausible ones, and the second kind is how a document-preparation service
 * becomes a fraud problem.
 *
 * ============================================================================
 * WHO CHOOSES THE COMPS
 * ============================================================================
 * The criteria are accepted from the caller and echoed back in the response,
 * because the funnel is going to let the homeowner set them (counsel memo design
 * question #5). If the owner picks the radius, the size band and the date window,
 * and the requested value is the arithmetic median of what those criteria return,
 * then the value on the petition is the owner's opinion derived from public
 * records — not an opinion of value we issued for compensation. That distinction
 * is the whole question in Fla. Stat. § 475.611/612.
 *
 * Criteria are clamped to defensible ranges below. An owner may choose among
 * reasonable comp sets; they may not choose a 10-mile radius and a 0-2000 sqft
 * band, because that is no longer a comp set.
 */

import { Redis } from '@upstash/redis';
import { enforceRateLimit } from '../../lib/rateLimit';
import { checkSpend } from '../../lib/spendGuard';
import { LIMITS, cap } from '../../lib/inputLimits';
import { lookupProperty, findComps, RentcastError, DEFAULT_COMP_CRITERIA } from '../../lib/providers/rentcast';
import { findParcel, ROLL_YEAR } from '../../lib/dor/parcels';
import { findComps as findDorComps } from '../../lib/dor/comps';

let redis = null;
try {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) redis = new Redis({ url, token });
} catch (e) {
  console.log('[comps] Redis init failed:', e.message);
}

async function cacheGet(k) {
  if (!redis) return null;
  try { return await redis.get(k); } catch { return null; }
}
async function cacheSet(k, v, ttl) {
  if (!redis) return;
  try { await redis.set(k, v, { ex: ttl }); } catch {}
}

// 7 days. Recorded sales do not change, but the SET of sales near an address grows
// as new ones close, and a comp set that silently ages is a comp set that gets
// weaker without anyone noticing. A week is short enough that the evidence on a
// petition is never materially stale and long enough to absorb the funnel's
// re-visits and back-buttons.
/**
 * CACHE VERSION — bump this whenever the logic that BUILDS a cached response
 * changes shape or source.
 *
 * Learned the hard way: the Florida county-data path was added to this route and
 * then appeared not to work at all. It worked fine. The cache was returning a
 * RentCast response built hours earlier, because a cache key made only of the
 * address does not encode WHICH CODE produced the value stored under it.
 *
 * A stale cache after a logic change is invisible in exactly the wrong way — the
 * endpoint returns a valid, well-formed, confidently wrong answer, and every
 * check you run to debug it hits the same cached entry.
 */
const CACHE_VERSION = 'v2-county';

const TTL = 7 * 24 * 60 * 60;
const NEGATIVE_TTL = 12 * 60 * 60;

/**
 * Clamp caller-supplied criteria to ranges a special magistrate would accept.
 * Anything outside these is silently pulled back to the boundary rather than
 * rejected — the funnel should never hard-fail on a slider position.
 */
function clampCriteria(input = {}) {
  const n = (v, lo, hi, dflt) => {
    const x = Number(v);
    if (!Number.isFinite(x)) return dflt;
    return Math.min(hi, Math.max(lo, x));
  };
  return {
    maxRadiusMiles: n(input.radiusMiles ?? input.maxRadiusMiles, 0.25, 5, DEFAULT_COMP_CRITERIA.maxRadiusMiles),
    sqftTolerance: n(input.sqftTolerance, 0.05, 0.35, DEFAULT_COMP_CRITERIA.sqftTolerance),
    yearBuiltTolerance: n(input.yearBuiltTolerance, 5, 40, DEFAULT_COMP_CRITERIA.yearBuiltTolerance),
    monthsBack: n(input.monthsBack, 6, 36, DEFAULT_COMP_CRITERIA.monthsBack),
    maxComps: n(input.maxComps, 3, 10, DEFAULT_COMP_CRITERIA.maxComps),
    minComps: DEFAULT_COMP_CRITERIA.minComps, // not caller-adjustable: this is the evidentiary floor
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Each request is at most two billed RentCast calls (subject lookup + comp
  // search). Same three-window shape as /api/lookup: bogus incrementing addresses
  // miss every cache by construction, so caching is no defence on its own.
  if (await enforceRateLimit(req, res, 'comps', 10, 60)) return;
  if (await enforceRateLimit(req, res, 'comps', 50, 3600)) return;
  if (await enforceRateLimit(req, res, 'comps', 200, 86400)) return;

  const b = req.body || {};
  const street = cap(b.street, LIMITS.address);
  const city = cap(b.city, 120);
  const state = cap(b.state, 40);
  const zip = cap(b.zip, 20);

  if (!street || !city || !state || !zip) {
    return res.status(400).json({ error: 'Missing address fields' });
  }

  const criteria = clampCriteria(b.criteria);
  const stateUpper = state.trim().toUpperCase();
  const addrSlug = `${street.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${zip.trim()}`;
  // Criteria are part of the cache key — two different comp sets for the same
  // address are two different answers, and serving one for the other would show
  // the customer results that do not match the criteria they selected.
  const critSlug = [
    criteria.maxRadiusMiles, criteria.sqftTolerance,
    criteria.yearBuiltTolerance, criteria.monthsBack, criteria.maxComps,
  ].join('_');
  const key = `comps:${CACHE_VERSION}:${stateUpper}:${addrSlug}:${critSlug}`;

  const cached = await cacheGet(key);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cached);
  }

  try {
    // ── FLORIDA: the county's own sale data file ──────────────────────────
    //
    // Free, and stronger evidence than any vendor: the SDF is the same record
    // set the Property Appraiser used to value the subject, so a magistrate
    // cannot dispute its provenance. Comps are drawn from the appraiser's own
    // neighbourhood code rather than a radius, and banded by size — see
    // lib/dor/comps.js for why the second of those matters more than it looks.
    if (stateUpper === 'FL') {
      try {
        const subject = await findParcel({ street, zip, city });
        if (subject && !subject.ambiguous) {
          const r = await findDorComps(subject, { rollYear: ROLL_YEAR });
          if (r.sufficient) {
            return res.status(200).json({
              subject: {
                address: [subject.phy_addr1, subject.phy_city, 'FL', subject.phy_zipcd].filter(Boolean).join(', '),
                parcelId: subject.parcel_id,
                county: subject.co_no,
                sqft: subject.tot_lvg_area,
                yearBuilt: subject.act_yr_blt,
                justValue: subject.jv,
                assessedValue: subject.av_nsd,
                // County roll figures need no confirmation — they ARE the TRIM
                // notice source.
                valueNeedsConfirmation: false,
              },
              comps: r.comps,
              medianPricePerSqft: r.medianPricePerSqft,
              indicatedValue: r.indicatedValue,
              assessedPricePerSqft: subject.jv && subject.tot_lvg_area
                ? Math.round(subject.jv / subject.tot_lvg_area) : null,
              sufficient: true,
              basis: {
                source: 'county',
                stratum: r.level,
                sizeBandPct: r.sizeBandPct,
                candidatesConsidered: r.candidateCount,
              },
              attribution: r.attribution,
              retrievedAt: new Date().toISOString(),
            });
          }
          // Not enough qualified, size-comparable sales. Fall through to
          // RentCast rather than publishing a thin set — but never publish the
          // thin set itself.
          console.log('[comps] DOR insufficient:', r.reason, r.level || '');
        }
      } catch (e) {
        console.error('[comps] DOR path failed:', e?.message);
      }
    }

    // Two billed calls worst case. Counted before either is made, so a tripped
    // ceiling costs nothing.
    const spend = await checkSpend('rentcast', 2);
    if (!spend.ok) {
      // 503, not a degraded result. There is no acceptable fallback for comps:
      // the alternative to real sales is invented ones, which is the exact
      // failure this endpoint exists to prevent.
      console.error('[comps] daily RentCast ceiling reached');
      return res.status(503).json({
        error: 'Comparable sales are temporarily unavailable. Please try again later.',
        code: 'ceiling',
      });
    }

    const subject = await lookupProperty({ street, city, state: stateUpper, zip });
    const result = await findComps(subject, criteria);

    const payload = {
      subject: {
        address: subject.formattedAddress,
        parcelId: subject.parcelId,
        county: subject.county,
        sqft: subject.sqft,
        beds: subject.beds,
        baths: subject.baths,
        yearBuilt: subject.yearBuilt,
        assessedValue: subject.assessedValue,
        assessmentYear: subject.assessmentYear,
        lastSalePrice: subject.lastSalePrice,
        lastSaleDate: subject.lastSaleDate,
        // Florida: RentCast does not distinguish just value from Save Our Homes
        // capped assessed value. The UI must have the owner confirm this against
        // their TRIM notice before it reaches the petition. See the header of
        // lib/providers/rentcast.js.
        valueNeedsConfirmation: subject.valueFieldIsAmbiguous,
      },
      comps: result.comps,
      criteria: result.criteria,
      medianPricePerSqft: result.medianPpsf,
      assessedPricePerSqft: result.subjectPpsf,
      indicatedValue: result.indicatedValue,
      sufficient: result.sufficient,
      counts: { searched: result.searchedCount, qualified: result.qualifiedCount },
      // Printed at the foot of the comps table on the petition. A cited sale with
      // no stated source is the thing we are fixing.
      attribution: 'Comparable sales retrieved from public property records via RentCast.',
      retrievedAt: new Date().toISOString(),
    };

    await cacheSet(key, payload, result.sufficient ? TTL : NEGATIVE_TTL);
    return res.status(200).json(payload);

  } catch (err) {
    if (err instanceof RentcastError) {
      // 'not_found' is an answer, not a failure: cache it briefly so a scan of
      // non-existent addresses cannot re-buy the same empty result.
      if (err.kind === 'not_found') {
        const payload = {
          subject: null, comps: [], sufficient: false,
          reason: 'no_record',
          message: 'We could not find public records for this address.',
        };
        await cacheSet(key, payload, NEGATIVE_TTL);
        return res.status(200).json(payload);
      }
      if (err.kind === 'no_key' || err.kind === 'auth') {
        console.error('[comps] RentCast key problem:', err.message);
        return res.status(503).json({ error: 'Comparable sales are temporarily unavailable.', code: 'config' });
      }
      console.error('[comps] RentCast:', err.kind, err.message);
      return res.status(503).json({ error: 'Comparable sales are temporarily unavailable.', code: err.kind });
    }
    console.error('[comps] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
