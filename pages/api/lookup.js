/**
 * PROPERTY LOOKUP for the funnel.
 *
 * ============================================================================
 * WHAT THIS ROUTE MUST NEVER DO
 * ============================================================================
 * Every number this route returns ends up on a DR-486 that the homeowner signs
 * under penalty of perjury. So the governing rule is: a value here is either
 * RETRIEVED from a property-records provider, or TYPED by the customer. There is
 * no third source. It is never inferred, estimated, or generated.
 *
 * The previous version broke that rule in two places, and both are removed:
 *
 * 1. THE `landValue` FALLBACK. The BatchData response shape was never known, so
 *    the assessed value was read by trying eight field names in sequence:
 *
 *        assess?.totalAssessedValue ?? assess?.assessedValue ??
 *        assess?.appraisedValue ?? assess?.taxableValue ??
 *        assess?.assessedTotalValue ?? assess?.landValue ?? ...
 *
 *    That chain ends at the value of the DIRT. A record carrying a land value but
 *    no improvement value would put a bare-lot figure on a sworn petition, and
 *    nothing anywhere would flag it. RentCast publishes a documented schema, so
 *    lib/providers/rentcast.js maps exactly one source field to each output field
 *    and returns null when it is absent.
 *
 * 2. THE WEB-SEARCH VALUE FALLBACK. When BatchData came up empty, this route
 *    asked Claude Sonnet to search Redfin/Realtor/Trulia for the county assessed
 *    value and parse it out of a "Tax History" panel. That is a language model
 *    supplying the central number on a legal filing, from a third-party site's
 *    rendering of it. Removed entirely. When the provider has no record, the
 *    funnel asks the customer for their TRIM notice figure — which is the correct
 *    answer, and is what the manual-entry path already exists for.
 *
 *    The web search is RETAINED for the appraisal district's mailing address,
 *    because that is a published administrative fact, not a value, and a wrong
 *    one fails loudly (returned mail) rather than silently.
 *
 * ============================================================================
 * FLORIDA: JUST VALUE vs ASSESSED VALUE
 * ============================================================================
 * `assessedValue` below is returned with `valueNeedsConfirmation: true`. RentCast
 * is a national aggregator and normalises every state into one assessment figure;
 * it does not distinguish Florida's just value (market — the thing a VAB petition
 * actually disputes) from assessed value after the Save Our Homes 3% cap
 * (§ 193.155). On a long-held homesteaded property those differ substantially.
 *
 * The UI MUST show this number for confirmation against the owner's TRIM notice
 * rather than passing it silently to the petition. The permanent fix is the FL DOR
 * NAL file, which carries both as separate documented columns — see
 * claude/Comps_Data_Source_Evaluation_2026-08-01.md.
 */

import { Redis } from '@upstash/redis';
import { getCountyPortal } from './county_portals';
import { enforceRateLimit } from '../../lib/rateLimit';
import { LIMITS, cap, PROMPT_ROUTE_CONFIG } from '../../lib/inputLimits';
import { checkSpend } from '../../lib/spendGuard';
import { lookupProperty, RentcastError } from '../../lib/providers/rentcast';
import { lookupAndQualify } from '../../lib/dor/parcels';

// Still interpolates the address into the district prompt, so it keeps the 64 KB
// body ceiling rather than Next's 1 MB default. See lib/inputLimits.js.
export const config = PROMPT_ROUTE_CONFIG;

let redis = null;
try {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (redisUrl && redisToken) {
    redis = new Redis({ url: redisUrl, token: redisToken });
    console.log('Redis initialized successfully');
  } else {
    console.log('Redis credentials not found — caching disabled');
  }
} catch (e) {
  console.log('Redis init failed:', e.message);
  redis = null;
}

async function cacheGet(key) {
  if (!redis) return null;
  try { return await redis.get(key); } catch (e) { return null; }
}
async function cacheSet(key, value, ttl) {
  if (!redis) return;
  try { await redis.set(key, value, { ex: ttl }); } catch (e) {}
}

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
const CACHE_VERSION = 'v4-millage';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // RentCast is billed per call, and this route can still fall through to an
  // Anthropic call for the district. A daily cap is kept because bogus
  // incrementing addresses ("1 Main St", "2 Main St", ...) miss every cache BY
  // CONSTRUCTION, so the caches below are no defence against a deliberate
  // attacker — only against ordinary repeat traffic.
  if (await enforceRateLimit(req, res, 'lookup', 12, 60)) return;
  if (await enforceRateLimit(req, res, 'lookup', 60, 3600)) return;
  if (await enforceRateLimit(req, res, 'lookup', 250, 86400)) return;

  const b = req.body || {};
  const street = cap(b.street, LIMITS.address);
  const city = cap(b.city, 120);
  const state = cap(b.state, 40);
  const zip = cap(b.zip, 20);
  const { manualAssessedValue, manualSqft, manualYearBuilt, manualBeds, manualBaths } = b;
  if (!street || !city || !state || !zip) {
    return res.status(400).json({ error: 'Missing address fields' });
  }

  const fullAddress = `${street}, ${city}, ${state} ${zip}`;
  const stateUpper = state.trim().toUpperCase();
  const TTL_SECONDS = 180 * 24 * 60 * 60; // 180 days

  const addrSlug = `${street.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${zip.trim()}`;
  const countyKey = `county:${stateUpper}:${addrSlug}`;

  // Whole-result cache, checked before ANY vendor call. This handler makes several
  // external calls and some are gated on data being MISSING, so per-leg caching
  // left the expensive path uncached. The funnel only ever consumes this assembled
  // payload, so this is the thing to cache.
  const resultKey = `lookup:${CACHE_VERSION}:${stateUpper}:${addrSlug}`;

  // A request carrying manual overrides must NEVER be served from cache, and must
  // never write to it. Those values are what the customer typed on the "we
  // couldn't find your assessed value — enter it yourself" path, so returning a
  // cached payload here would silently discard their input and hand the funnel a
  // null (or worse, a different property's number) for the value that drives the
  // whole petition.
  const hasManualOverrides = !!(
    manualAssessedValue || manualSqft || manualYearBuilt || manualBeds || manualBaths
  );

  if (!hasManualOverrides) {
    const cached = await cacheGet(resultKey);
    if (cached) {
      console.log(`LOOKUP FROM CACHE (${resultKey})`);
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }
  }

  try {
    const numOrNull = (v) => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(String(v).replace(/[^0-9.]/g, ''));
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    // Manual entries win outright. If the customer typed a value they are looking
    // at their TRIM notice, which is a better source than any aggregator.
    let assessedValue = numOrNull(manualAssessedValue);
    let sqft = numOrNull(manualSqft);
    let yearBuilt = manualYearBuilt || null;
    let beds = numOrNull(manualBeds);
    let baths = numOrNull(manualBaths);

    let parcelId = null;
    let annualTax = null;
    let marketValue = null;
    let county = null;
    let valueNeedsConfirmation = false;
    let lookupStatus = 'ok';

    // Florida only. Null for every other state until their adapters exist.
    let cappedAssessedValue = null;
    let taxableValue = null;
    let savings = null;
    // Florida only. Feeds the finish-level multiplier in lib/costToCure.js —
    // without it cost to cure still works, it just stops scaling with how the
    // house is built. Degrades, never breaks.
    let landValue = null;
    let valueSource = null;

    // ── STEP 1: County via Census geocoder ────────────────────────────────────
    //
    // Census is authoritative and free. There is deliberately NO LLM fallback for
    // county, matching the policy already documented in resolve-county.js: the
    // county determines the VAB filing fee, the check payee and which office
    // receives the petition, so a guessed county means a wrong fee, a wrong payee
    // and a petition mailed to the wrong government office. The previous version
    // of this file had a Claude county fallback, which contradicted that policy —
    // it is removed. RentCast's own county field is used as a secondary source
    // below, because that is retrieved rather than inferred.
    const cachedCounty = await cacheGet(countyKey);
    if (cachedCounty) {
      county = cachedCounty;
      console.log(`COUNTY FROM CACHE (${countyKey}):`, county);
    }

    if (!county) {
      try {
        const censusRes = await fetch(
          `https://geocoding.geo.census.gov/geocoder/geographies/address?street=${encodeURIComponent(street)}&city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&zip=${encodeURIComponent(zip)}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`
        );
        if (censusRes.ok) {
          const censusData = await censusRes.json();
          const countyGeo = censusData?.result?.addressMatches?.[0]?.geographies?.Counties?.[0];
          if (countyGeo?.NAME) {
            county = countyGeo.NAME.replace(/ County$/i, '').trim();
            console.log('COUNTY FROM CENSUS:', county);
            await cacheSet(countyKey, county, TTL_SECONDS);
          }
        }
      } catch (e) {
        console.log('Census lookup failed:', e.message);
      }
    }

    // ── STEP 2: Florida — our own copy of the county assessment roll ─────────
    //
    // THIS REPLACES RENTCAST FOR FLORIDA, AND THE REASON IS NOT COST.
    //
    // Tested against a real Hillsborough parcel, RentCast returned the Save Our
    // Homes CAPPED ASSESSED value, one roll year stale, with no way to tell which
    // figure you had been given:
    //
    //              County roll     RentCast
    //   Just       $608,998        —
    //   Assessed   $459,927        $447,835   (2025, not 2026)
    //   Taxable    $408,516        —
    //
    // A DR-486 disputes JUST value. RentCast was 26% below it, and also reported
    // 2,399 sq ft against the county's 2,699. Three fields, three wrong answers.
    // That is not a vendor defect — a national aggregator flattens every state
    // into one assessment number, and Florida needs three.
    //
    // WHAT `assessedValue` MEANS BELOW, BECAUSE IT CHANGED:
    // For Florida it now carries JUST (market) value, because that is the figure
    // a VAB petition contests and the one Fla. Stat. § 193.011 governs. The
    // capped assessed value is returned separately as `cappedAssessedValue`.
    // Downstream code that treats `assessedValue` as "the value we are disputing"
    // stays correct; anything that needs the capped figure must read the new
    // field.
    //
    // Costs nothing, needs no vendor, and is the Property Appraiser's own
    // submission to the Department of Revenue — so a special magistrate cannot
    // dispute where it came from.
    if (stateUpper === 'FL') {
      try {
        const dor = await lookupAndQualify({ street, zip, city });
        if (dor.found) {
          const p = dor.parcel;
          if (assessedValue === null) assessedValue = p.justValue;
          if (sqft === null) sqft = p.livingArea;
          if (yearBuilt === null) yearBuilt = p.yearBuilt ? String(p.yearBuilt) : null;
          parcelId = p.parcelId;
          cappedAssessedValue = p.assessedValue?.nonSchool ?? null;
          landValue = p.landValue ?? null;
          taxableValue = p.taxableValue?.nonSchool ?? null;
          savings = dor.savings;
          valueSource = p.source;
          // County from the roll is retrieved, not inferred — but Census stays
          // primary because it is the authority for the filing jurisdiction.
          if (!county && p.coNo) county = null;
          lookupStatus = 'ok';
          console.log('DOR PARCEL:', p.parcelId, 'jv', p.justValue, 'av', cappedAssessedValue);
        } else {
          // Not an error. New construction and recently split parcels legitimately
          // are not on the current roll. All 67 counties are loaded as of 2026-08-02.
          // Fall through to RentCast rather than refusing the customer.
          console.log('DOR PARCEL MISS:', dor.reason);
        }
      } catch (e) {
        console.error('[lookup] DOR parcel lookup failed:', e?.message);
      }
    }

    // ── STEP 2: Property record via RentCast ──────────────────────────────────
    //
    // 30 days, not 180: assessed values and parcel data DO change on the county's
    // annual roll, and a stale assessed value would put a wrong number on a sworn
    // petition. A month absorbs the funnel's repeat traffic and still picks up a
    // new roll promptly.
    const ROLL_TTL = 30 * 24 * 60 * 60;
    // "The provider has no record for this address" is a stable fact worth
    // caching, but for 24h rather than 30 days, so a newly-built or newly-recorded
    // property is picked up within a day. It is also what a transient vendor
    // outage looks like, which is the other reason not to pin it for a month.
    const NEGATIVE_TTL = 24 * 60 * 60;
    const rcKey = `rc:${CACHE_VERSION}:${stateUpper}:${addrSlug}`;

    // Only when our own data did not answer: a Florida address off-roll, or any
    // other state. Every RentCast call is now an exception, not the norm.
    const needVendor = assessedValue === null || sqft === null || parcelId === null;

    let record = needVendor ? await cacheGet(rcKey) : null;
    if (record) console.log(`RENTCAST FROM CACHE (${rcKey})`);

    if (!record && needVendor) {
      // Only a cache MISS costs money, so the ceiling is checked here.
      const spend = await checkSpend('rentcast', 1);
      if (!spend.ok) {
        console.error('[lookup] daily RentCast ceiling reached; falling back to manual entry.');
        lookupStatus = 'ceiling';
      } else {
        try {
          record = await lookupProperty({ street, city, state: stateUpper, zip });
          await cacheSet(rcKey, record, ROLL_TTL);
          console.log('RENTCAST OK, parcel:', record.parcelId || 'none');
        } catch (e) {
          if (e instanceof RentcastError && e.kind === 'not_found') {
            // Cache the empty answer so a scan of non-existent addresses cannot
            // re-buy it, and so a repeat visit is fast rather than a full re-run.
            await cacheSet(rcKey, { __empty: true }, NEGATIVE_TTL);
            lookupStatus = 'no_record';
            console.log(`RENTCAST EMPTY, cached negative (${rcKey})`);
          } else {
            // Vendor down, bad key, rate limited. Degrade to manual entry — never
            // to an estimate. Do NOT cache: this says nothing about the address.
            lookupStatus = 'unavailable';
            console.error('[lookup] RentCast unavailable:', e?.kind, e?.message);
          }
        }
      }
    }

    if (record?.__empty) {
      record = null;
      lookupStatus = 'no_record';
    }

    if (record) {
      // 1:1 assignment. No `??` chains across differently-meaning fields — that is
      // the bug this rewrite exists to remove. A missing field stays null and the
      // funnel asks the customer.
      if (assessedValue === null) assessedValue = record.assessedValue;
      if (sqft === null) sqft = record.sqft;
      if (yearBuilt === null) yearBuilt = record.yearBuilt;
      if (beds === null) beds = record.beds;
      if (baths === null) baths = record.baths;
      parcelId = record.parcelId;
      annualTax = record.annualTax;

      // Only flag for confirmation if the value actually came from the provider.
      // If the customer typed it, they were reading their TRIM notice and there is
      // nothing to confirm.
      // Only vendor data needs confirming. County roll figures match the TRIM
      // notice by construction, because they are the same submission.
      valueNeedsConfirmation = !manualAssessedValue && record.assessedValue !== null;

      // Census remains primary; this is a retrieved secondary, not a guess.
      if (!county && record.county) county = record.county;
    }

    // marketValue is deliberately left null. The old code populated it from
    // BatchData's AVM (`valuation.estimatedValue`) — a vendor's automated estimate,
    // presented alongside county figures as though it were one. On a petition that
    // disputes the county's opinion of market value, citing an AVM invites the
    // Board to weigh a black box against the Property Appraiser. Real market
    // evidence comes from /api/comps, where every figure is a recorded sale with
    // an address a magistrate can check.
    marketValue = null;

    const countyName = county ? `${county} County` : `${city} County`;
    const districtKey = `district:${stateUpper}:${(county || city).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    let appraisalDistrict = await cacheGet(districtKey);
    if (appraisalDistrict) console.log(`DISTRICT FROM CACHE (${districtKey}):`, appraisalDistrict?.districtName);

    // ── STEP 3: District mailing address (web search) ─────────────────────────
    //
    // Scope narrowed to the district ONLY. The old prompt also asked Claude to
    // find the assessed value, sqft, beds, baths and year built by searching
    // Redfin — see the header. Those are gone.
    //
    // A mailing address is a published administrative fact and fails loudly if
    // wrong (the letter comes back). A misread assessed value fails silently, on a
    // sworn document. That asymmetry is why one of these is acceptable here and
    // the other is not.
    if (!appraisalDistrict) {
      try {
        const portalInfo = getCountyPortal(stateUpper, county);
        const districtName = portalInfo?.name || `${countyName} Appraisal District`;

        if (!(await checkSpend('anthropic', 1)).ok) throw new Error('anthropic daily ceiling');
        const searchRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 600,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            messages: [{
              role: 'user',
              content: `Find the official mailing address of the ${districtName} in ${countyName}, ${stateUpper} where property owners file value appeals or protests. Include phone, website, and the filing deadline.

Return ONLY this JSON, with null for anything you cannot verify from an official source:
{"districtName": null, "mailingAddress": null, "city": null, "state": "${stateUpper}", "zip": null, "phone": null, "website": null, "filingDeadlineNote": null, "filingMethod": null}`,
            }],
          }),
        });

        const searchJson = await searchRes.json();
        if (searchJson.content) {
          const text = searchJson.content.filter((x) => x.type === 'text').map((x) => x.text).join('');
          const match = text.match(/\{[\s\S]*\}/);
          if (match) {
            const data = JSON.parse(match[0]);
            if (data?.districtName || data?.mailingAddress) {
              appraisalDistrict = data;
              await cacheSet(districtKey, appraisalDistrict, TTL_SECONDS);
              console.log(`CACHED district for ${districtKey} (180 days)`);
            }
          }
        }
      } catch (e) {
        console.log('District web search failed:', e.message);
      }
    }

    // ── STEP 4: District fallback without search ──────────────────────────────
    if (!appraisalDistrict) {
      try {
        if (!(await checkSpend('anthropic', 1)).ok) throw new Error('anthropic daily ceiling');
        const fallbackRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 400,
            messages: [{
              role: 'user',
              content: `What is the official mailing address of the ${countyName} Appraisal District in ${stateUpper} where property owners file property tax appeals? Return ONLY JSON:
{"districtName": "Official name", "mailingAddress": "Street address", "city": "City", "state": "${stateUpper}", "zip": "ZIP", "phone": "Phone or null", "website": "URL or null", "filingDeadlineNote": "Filing deadline", "filingMethod": "mail | online | in-person | mail or online"}`,
            }],
          }),
        });
        const fallbackJson = await fallbackRes.json();
        const fallbackText = (fallbackJson.content || []).map((x) => x.text || '').join('');
        const match = fallbackText.match(/\{[\s\S]*\}/);
        if (match) {
          appraisalDistrict = JSON.parse(match[0]);
          await cacheSet(districtKey, appraisalDistrict, TTL_SECONDS);
        }
      } catch (e) {
        console.log('District fallback failed:', e.message);
      }
    }

    const taxYear = new Date().getFullYear().toString();
    console.log('FINAL:', { assessedValue, sqft, yearBuilt, beds, baths, annualTax, parcelId, county: countyName, lookupStatus });

    const payload = {
      extractedData: {
        // For Florida this is JUST (market) value — the figure the petition
        // disputes. See STEP 2.
        assessedValue, marketValue, sqft, yearBuilt, beds, baths,
        annualTax, county, taxYear, parcelId,
        // Florida only, from the county roll. Null elsewhere.
        cappedAssessedValue, taxableValue, landValue,
      },
      // The savings gate. `savings.eligible === false` means an appeal cannot
      // lower this owner's bill and the funnel MUST NOT sell them a filing —
      // see lib/dor/qualify.js for why that is not a judgement call.
      savings,
      valueSource,
      appraisalDistrict,
      resolvedCounty: countyName,
      // The UI uses these two. `valueNeedsConfirmation` must drive a visible
      // "check this against your TRIM notice" step — see the Florida note in the
      // header. `lookupStatus` distinguishes "no record exists" from "we could not
      // reach the provider", which are different messages to show a customer.
      valueNeedsConfirmation,
      lookupStatus,
    };

    const foundSomething = assessedValue || sqft || parcelId;
    if (hasManualOverrides) {
      // Never write a customer's own typed values into a cache keyed only on
      // address — the next visitor to that address would be served this
      // customer's numbers.
      console.log('LOOKUP had manual overrides, not cached');
    } else if (lookupStatus === 'unavailable' || lookupStatus === 'ceiling') {
      // Do not cache an outage. Pinning a transient failure for 24h would push
      // real customers to manual entry long after the provider came back.
      console.log(`LOOKUP ${lookupStatus}, not cached`);
    } else {
      await cacheSet(resultKey, payload, foundSomething ? ROLL_TTL : NEGATIVE_TTL);
      if (!foundSomething) console.log(`LOOKUP found nothing, cached negative 24h (${resultKey})`);
    }

    return res.status(200).json(payload);

  } catch (err) {
    console.error('Lookup error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
