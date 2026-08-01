/**
 * RENTCAST PROVIDER — property records and comparable sales.
 *
 * ============================================================================
 * WHY THIS EXISTS / WHAT IT REPLACES
 * ============================================================================
 * This replaces the two BatchData calls in pages/api/lookup.js, and it exists to
 * end a specific failure mode in that file rather than merely to change vendors.
 *
 * The BatchData integration never knew the shape of the response it was parsing.
 * It read an assessed value by trying eight field names in sequence
 * (`totalAssessedValue ?? assessedValue ?? appraisedValue ?? taxableValue ??
 * assessedTotalValue ?? landValue ?? ...`), and that chain ends at `landValue` —
 * the value of the DIRT. If BatchData returned a record with land but no
 * improvement value, the funnel would silently put a land-only figure on a
 * petition the homeowner signs under penalty of perjury, and nothing anywhere
 * would flag it.
 *
 * RentCast publishes a documented, stable schema, so this module maps exactly
 * ONE source field to each output field. If a field is absent we return null and
 * the funnel asks the customer to type it. We never fall back to a
 * differently-meaning number.
 *
 * ============================================================================
 * THE FLORIDA JUST-VALUE / ASSESSED-VALUE PROBLEM — READ BEFORE TRUSTING `assessedValue`
 * ============================================================================
 * The DR-486 asks for two DIFFERENT numbers, and Florida law makes them differ:
 *
 *   - JUST VALUE (market value, Fla. Const. art. VII § 4) — what the Property
 *     Appraiser says the property is worth. THIS is what a VAB petition disputes.
 *   - ASSESSED VALUE — just value after the Save Our Homes 3% cap (§ 193.155).
 *     On a long-held homesteaded property this can be far below just value.
 *
 * RentCast is a national aggregator and normalises every state into ONE
 * `taxAssessments[year].value`. It does not tell us which of the two we received.
 * Putting a capped assessed value into the "just value" box on a sworn petition
 * would misstate the thing being appealed.
 *
 * So: for Florida, `assessedValue` from this module is a PRE-FILL HINT ONLY. The
 * authoritative source is the FL DOR NAL file, which carries just value and
 * assessed value as separate documented columns (see
 * claude/Comps_Data_Source_Evaluation_2026-08-01.md). Until the NAL ingestion
 * lands, the funnel must show the customer the number and have them confirm it
 * against their TRIM notice. `valueFieldIsAmbiguous` below marks this explicitly
 * so callers cannot forget.
 *
 * ============================================================================
 * BILLING
 * ============================================================================
 * RentCast bills per successful API CALL, not per record returned — their docs:
 * "It doesn't matter how much data you retrieve via each API request - it will
 * only count as one request for billing purposes."
 *
 * That single fact drives the comps design below. Pulling 500 records in one call
 * costs exactly the same as pulling 5, so we pull wide and filter in our own code
 * rather than asking the vendor to narrow the set. See findComps().
 *
 * Foundation plan: $74/mo for 1,000 calls, $0.06 overage.
 */

const BASE_URL = 'https://api.rentcast.io/v1';

// Vercel's default fetch has no timeout. A hung vendor connection would otherwise
// hold the lambda open until the platform kills it, and the customer watches a
// spinner the whole time.
const TIMEOUT_MS = 8000;

/**
 * Typed failure, so callers can tell "this address genuinely has no record" from
 * "the vendor is down".
 *
 * This distinction is the entire point. The old lookup.js collapsed both into a
 * generic catch and then fell through to a Claude web-search that was asked to
 * find an assessed value on Redfin — i.e. a language model was the last line of
 * defence for a number that goes onto a sworn document. A vendor outage must
 * degrade to "please enter your value", never to a guess.
 */
export class RentcastError extends Error {
  constructor(kind, message, status = null) {
    super(message);
    this.name = 'RentcastError';
    this.kind = kind; // 'not_found' | 'auth' | 'rate_limited' | 'unavailable' | 'no_key'
    this.status = status;
  }
}

function apiKey() {
  const k = process.env.RENTCAST_API_KEY;
  if (!k) throw new RentcastError('no_key', 'RENTCAST_API_KEY is not set');
  return k;
}

async function get(path, params) {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }

  let res;
  try {
    res = await fetch(url, {
      headers: { 'X-Api-Key': apiKey(), Accept: 'application/json' },
      signal: AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined,
    });
  } catch (e) {
    throw new RentcastError('unavailable', `RentCast unreachable: ${e.message}`);
  }

  // 404 is RentCast's "no record for this address". It is a normal, cacheable
  // answer about the world, not an error condition on our side.
  if (res.status === 404) throw new RentcastError('not_found', 'No record for this address', 404);
  if (res.status === 401 || res.status === 403) {
    throw new RentcastError('auth', 'RentCast rejected the API key', res.status);
  }
  if (res.status === 429) throw new RentcastError('rate_limited', 'RentCast rate limit hit', 429);
  if (!res.ok) {
    throw new RentcastError('unavailable', `RentCast returned ${res.status}`, res.status);
  }

  try {
    return await res.json();
  } catch (e) {
    throw new RentcastError('unavailable', 'RentCast returned malformed JSON');
  }
}

/**
 * Most recent entry from a RentCast year-keyed object (taxAssessments,
 * propertyTaxes). Both are keyed "2024", "2025", ... — object key order is not
 * guaranteed to be chronological, so sort rather than taking the last key.
 */
function latestByYear(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const years = Object.keys(obj)
    .map(Number)
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => b - a);
  if (!years.length) return null;
  return { year: years[0], ...obj[String(years[0])] };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Normalise one RentCast property record into the shape the funnel already uses.
 *
 * FIELD MAPPING IS 1:1 AND DELIBERATE. Each output field below comes from exactly
 * one documented RentCast field. Do not add `??` fallback chains here — that is
 * precisely the bug this module was written to remove.
 */
export function normalizeProperty(p) {
  if (!p) return null;

  const assessment = latestByYear(p.taxAssessments);
  const taxes = latestByYear(p.propertyTaxes);

  return {
    // Identity
    formattedAddress: p.formattedAddress || null,
    // The DR-486 needs the folio/parcel number; most FL VAB clerks index petitions
    // by it and will reject one without it.
    parcelId: p.assessorID ? String(p.assessorID).trim() : null,
    county: p.county ? String(p.county).replace(/\s+County$/i, '').trim() : null,
    latitude: Number.isFinite(p.latitude) ? p.latitude : null,
    longitude: Number.isFinite(p.longitude) ? p.longitude : null,
    subdivision: p.subdivision || null,
    legalDescription: p.legalDescription || null,

    // Characteristics — these drive comp matching
    propertyType: p.propertyType || null,
    sqft: num(p.squareFootage),
    lotSize: num(p.lotSize),
    beds: num(p.bedrooms),
    baths: Number.isFinite(Number(p.bathrooms)) ? Number(p.bathrooms) : null,
    yearBuilt: p.yearBuilt ? String(p.yearBuilt) : null,

    // Value. See the Florida warning in the module header before using this.
    assessedValue: num(assessment?.value),
    assessedLand: num(assessment?.land),
    assessedImprovements: num(assessment?.improvements),
    assessmentYear: assessment?.year ?? null,
    annualTax: num(taxes?.total),
    taxYear: taxes?.year ?? null,

    // Last recorded sale of THIS property. Relevant on its own: a recent
    // arms-length purchase below the assessment is the strongest single piece of
    // evidence a petitioner can have.
    lastSalePrice: num(p.lastSalePrice),
    lastSaleDate: p.lastSaleDate || null,

    // RentCast does not distinguish Florida just value from Save Our Homes capped
    // assessed value. Callers MUST surface this for confirmation rather than
    // printing the number onto a petition unchallenged.
    valueFieldIsAmbiguous: true,

    source: {
      provider: 'rentcast',
      retrievedAt: new Date().toISOString(),
      assessmentYear: assessment?.year ?? null,
    },
  };
}

/**
 * Look up a single property by address.
 *
 * One billed call. Throws RentcastError('not_found') when RentCast has no record —
 * callers should treat that as "ask the customer to enter their details", NOT as
 * an error to retry or to paper over with an estimate.
 */
export async function lookupProperty({ street, city, state, zip }) {
  const address = `${street}, ${city}, ${state} ${zip}`;
  const data = await get('/properties', { address });

  // /properties returns an array even for a single-address query.
  const list = Array.isArray(data) ? data : data ? [data] : [];
  if (!list.length) throw new RentcastError('not_found', 'No record for this address', 404);

  return normalizeProperty(list[0]);
}

// ============================================================================
// COMPARABLE SALES
// ============================================================================

/** Great-circle distance in miles. */
function milesBetween(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Default comp criteria. These are the bands a county appraiser and a VAB special
 * magistrate actually apply, not arbitrary numbers:
 *
 *   - ±20% living area and ±15 years age are the conventional similarity bands.
 *   - 1 mile, widening to 2, keeps comps in the same market. Same subdivision is
 *     scored higher because a magistrate weights it higher.
 *   - 24 months of sales, because Florida assesses as of January 1 and we want
 *     sales bracketing that date rather than only sales after it.
 *
 * They are all overridable, and that is intentional — see the counsel memo's
 * design question #5. If the homeowner selects the criteria and the requested
 * value falls out arithmetically, we are computing THEIR opinion of value, not
 * issuing ours.
 */
export const DEFAULT_COMP_CRITERIA = {
  radiusMiles: 1,
  maxRadiusMiles: 2,
  sqftTolerance: 0.2,
  yearBuiltTolerance: 15,
  monthsBack: 24,
  minComps: 3,
  maxComps: 6,
};

/**
 * Find comparable sales for a subject property.
 *
 * COSTS ONE BILLED CALL regardless of how many records come back, so we pull the
 * widest set the API will give us and do every filter locally. Two reasons, and
 * the second matters more than the cost:
 *
 *   1. Local filtering is free; vendor-side filtering is not more accurate.
 *   2. Every inclusion and exclusion is then OUR OWN, in code we can show a
 *      magistrate, rather than a vendor's undisclosed matching logic. A comp set
 *      we cannot explain is a comp set we cannot defend.
 *
 * Note we use the /properties endpoint, NOT /avm/value. The AVM endpoint's
 * "comparables" are on-market LISTINGS — asking prices, not recorded sales.
 * Asking prices are not evidence of value and a magistrate will say so.
 *
 * @returns {{comps: Array, criteria: Object, subjectPpsf: number|null, indicatedValue: number|null, searchedCount: number}}
 */
export async function findComps(subject, overrides = {}) {
  const criteria = { ...DEFAULT_COMP_CRITERIA, ...overrides };

  if (!Number.isFinite(subject?.latitude) || !Number.isFinite(subject?.longitude)) {
    throw new RentcastError('not_found', 'Subject property has no coordinates to search from');
  }

  const data = await get('/properties', {
    latitude: subject.latitude,
    longitude: subject.longitude,
    radius: criteria.maxRadiusMiles,
    propertyType: subject.propertyType || undefined,
    limit: 500,
  });

  const raw = (Array.isArray(data) ? data : []).map(normalizeProperty).filter(Boolean);

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - criteria.monthsBack);

  const scored = raw
    .map((c) => {
      // Must be a real recorded sale with a price and a date.
      if (!c.lastSalePrice || !c.lastSaleDate) return null;
      const saleDate = new Date(c.lastSaleDate);
      if (!(saleDate instanceof Date) || isNaN(saleDate) || saleDate < cutoff) return null;

      // Never comp a property against itself.
      if (subject.parcelId && c.parcelId && subject.parcelId === c.parcelId) return null;
      if (subject.formattedAddress && c.formattedAddress === subject.formattedAddress) return null;

      if (!c.sqft || !c.latitude || !c.longitude) return null;

      const distance = milesBetween(subject.latitude, subject.longitude, c.latitude, c.longitude);
      if (distance > criteria.maxRadiusMiles) return null;

      // Similarity bands.
      if (subject.sqft) {
        const delta = Math.abs(c.sqft - subject.sqft) / subject.sqft;
        if (delta > criteria.sqftTolerance) return null;
      }
      if (subject.yearBuilt && c.yearBuilt) {
        if (Math.abs(Number(c.yearBuilt) - Number(subject.yearBuilt)) > criteria.yearBuiltTolerance) {
          return null;
        }
      }

      const ppsf = c.lastSalePrice / c.sqft;
      const monthsOld = (Date.now() - saleDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);

      // Lower score is a better comp. Weights reflect what a magistrate weights:
      // location first, then size, then recency.
      const sameSubdivision =
        subject.subdivision && c.subdivision && subject.subdivision === c.subdivision;
      const score =
        distance * 3 +
        (sameSubdivision ? -1.5 : 0) +
        (subject.sqft ? (Math.abs(c.sqft - subject.sqft) / subject.sqft) * 5 : 0) +
        (monthsOld / 12) * 1.5;

      return {
        address: c.formattedAddress,
        parcelId: c.parcelId,
        salePrice: c.lastSalePrice,
        saleDate: c.lastSaleDate,
        sqft: c.sqft,
        beds: c.beds,
        baths: c.baths,
        yearBuilt: c.yearBuilt,
        subdivision: c.subdivision,
        pricePerSqft: Math.round(ppsf),
        distanceMiles: Math.round(distance * 100) / 100,
        sameSubdivision: !!sameSubdivision,
        monthsOld: Math.round(monthsOld),
        score,
        // Every comp carries its own provenance. A petition that cites a sale
        // without saying where the sale came from is exactly the problem this
        // whole change set exists to fix.
        source: 'RentCast (public records)',
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score);

  const comps = scored.slice(0, criteria.maxComps);

  // MEDIAN, not mean. One estate sale or one waterfront outlier drags a mean far
  // enough to make the whole petition look unserious.
  let indicatedValue = null;
  let medianPpsf = null;
  if (comps.length >= criteria.minComps && subject.sqft) {
    const ppsfs = comps.map((c) => c.pricePerSqft).sort((a, b) => a - b);
    const mid = Math.floor(ppsfs.length / 2);
    medianPpsf =
      ppsfs.length % 2 ? ppsfs[mid] : Math.round((ppsfs[mid - 1] + ppsfs[mid]) / 2);
    indicatedValue = Math.round((medianPpsf * subject.sqft) / 1000) * 1000;
  }

  return {
    comps,
    criteria,
    searchedCount: raw.length,
    qualifiedCount: scored.length,
    medianPpsf,
    subjectPpsf:
      subject.assessedValue && subject.sqft
        ? Math.round(subject.assessedValue / subject.sqft)
        : null,
    indicatedValue,
    // Below the minimum, we return what we found but refuse to compute a value.
    // Three comps is the floor a magistrate expects; two comps and a confident
    // number is worse than no number at all.
    sufficient: comps.length >= criteria.minComps,
  };
}

export default { lookupProperty, findComps, normalizeProperty, RentcastError, DEFAULT_COMP_CRITERIA };
