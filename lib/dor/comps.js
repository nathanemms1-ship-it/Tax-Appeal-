/**
 * COMPARABLE SALES from the county's own sales file.
 *
 * ============================================================================
 * WHY THIS REPLACES THE RENTCAST COMP PATH FOR FLORIDA
 * ============================================================================
 * The SDF is the Sale Data File every Florida county property appraiser submits
 * to the Department of Revenue alongside the assessment roll. It is the same
 * record set the appraiser used to value the subject property. A special
 * magistrate cannot dispute where these sales came from, which is not true of a
 * commercial aggregator — and the aggregator was wrong anyway: on the parcel this
 * was built against, RentCast reported 2,399 sq ft where the county says 2,699,
 * a 12.5% error that silently corrupts every price-per-square-foot calculation.
 *
 * ============================================================================
 * TWO METHODOLOGICAL FIXES OVER THE RENTCAST VERSION
 * ============================================================================
 *
 * 1. NEIGHBOURHOOD, NOT RADIUS.
 *    Comps are drawn from NBRHD_CD — the appraiser's own neighbourhood code —
 *    rather than a circle on a map. That is the stratum THEY used to value the
 *    property, so arguing within it is arguing on their terms. A one-mile radius
 *    crosses highways, school boundaries and flood zones; a neighbourhood code
 *    does not. (The roll carries no coordinates, so radius was never available
 *    here — but this is better, not a workaround.)
 *
 * 2. SIZE-BANDED, NOT WHOLE-SET, PRICE PER SQUARE FOOT.
 *    Smaller homes sell for more per square foot. The RentCast run demonstrated
 *    it precisely:
 *
 *        2,421 sq ft -> $198/sqft
 *        2,053 sq ft -> $236/sqft
 *        2,053 sq ft -> $268/sqft
 *
 *    Taking the median of that against a 2,699 sq ft subject produced $566,000,
 *    while the one genuinely size-matched comp implied $475,000 — a 19% error
 *    manufactured entirely by a size confounder, in the direction that HURTS the
 *    homeowner.
 *
 *    So we take the TIGHTEST size band that still yields enough comps: +/-10%
 *    first, then 15%, then 20%. Reporting which band was used lets the petition
 *    state its own basis, and a magistrate can see the comps really are
 *    comparable rather than merely nearby.
 *
 * ============================================================================
 * WHAT IS EXCLUDED, AND WHY EACH EXCLUSION MATTERS
 * ============================================================================
 *   - QUAL_CD not in (01,02): the Department's own qualification codes for
 *     arms-length sales suitable for ratio study. Everything else is a
 *     foreclosure, a family transfer, a corrective deed, a $100 quit-claim.
 *     Roughly half of all recorded sales. Citing one is how a petition loses.
 *   - MULTI_PAR_SAL in (C,D): the price covers several parcels, so the
 *     per-parcel figure is meaningless.
 *   - VI_CD = 'V': sold vacant. The subject has a house on it.
 *   - The subject parcel itself.
 *
 * ============================================================================
 * ASSESSMENT DATE
 * ============================================================================
 * Florida values as of JANUARY 1. Sales are therefore drawn from the window
 * BRACKETING that date rather than "the most recent 12 months" — a sale in
 * November of the prior year is better evidence than one in September of the
 * current year, because it is closer to the date the value attaches to.
 */

import { getSupabaseAdmin } from '../../pages/api/supabase';

/** Size bands tried in order. The first with enough comps wins. */
export const SIZE_BANDS = [0.10, 0.15, 0.20];

/**
 * HOW MUCH OF THE VALUE IS THE DIRT.
 *
 * Expressed as land value divided by just value, and compared as an ABSOLUTE
 * difference in that share — 0.10 means "within ten percentage points".
 *
 * WHY THIS EXISTS. 1600 SW 15 AVE, Fort Lauderdale: 2,042 square feet of house
 * on a 198,718 square foot waterfront lot. Just value $6,969,300, of which
 * $4,967,950 — 71% — is land. Its neighbourhood's median land share is 20%. The
 * comps engine, which valued on living area alone, compared it to ordinary
 * houses on ordinary lots and indicated $366 per square foot against the
 * county's $3,413. That is an "89% case" made entirely of a bad assumption, and
 * only the subject-sale guardrail stopped it — a waterfront parcel that had not
 * recently sold would have gone through with an ask nobody could defend, over an
 * owner's signature.
 *
 * An absolute difference rather than a ratio, because the measure is already a
 * ratio and because it handles zero correctly: a condo has no land value, so
 * subject 0.00 against comp 0.00 differs by nothing and matches, while subject
 * 0.00 against a house at 0.20 does not. 39% of Broward residential parcels have
 * no land value at all, and they must be compared with each other.
 */
export const LAND_BANDS = [0.10, 0.18];

/**
 * Age bands, tried the same way.
 *
 * Added after a live run pulled a 1973 house as a comp for a 2018 subject —
 * inside the size band, same neighbourhood, genuinely arms-length, and still
 * indefensible. Construction era drives price independently of size: wiring,
 * roof, windows, insulation, layout. A magistrate strikes that comp on sight,
 * and one struck comp casts doubt on the whole set.
 *
 * Note this cut REDUCED the case for the property it was found on — dropping the
 * older, cheaper house raised the indicated value. That is the correct direction
 * of bias: the method should not quietly favour our customer.
 */
export const AGE_BANDS = [15, 25, 40];

/** Fewer than this and we decline to state a value at all. */
export const MIN_COMPS = 3;
export const MAX_COMPS = 6;

/** How far either side of the January 1 assessment date to look. */
export const MONTHS_BEFORE = 18;
export const MONTHS_AFTER = 3;

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/**
 * Pull candidate sales in the subject's neighbourhood.
 *
 * Falls back through neighbourhood -> market area -> ZIP. Each fallback is
 * weaker evidence, so the level used is reported and the petition should say so
 * rather than presenting all three as equivalent.
 */
async function fetchCandidates(db, subject, rollYear) {
  const since = `${rollYear - 1 - Math.floor(MONTHS_BEFORE / 12)}-01-01`;
  const until = `${rollYear}-${String(MONTHS_AFTER + 1).padStart(2, '0')}-01`;

  const base = (q) => q
    .eq('co_no', subject.co_no)
    .eq('is_qualified', true)
    .neq('parcel_id', subject.parcel_id)
    .gte('sale_date', since)
    .lte('sale_date', until)
    .eq('vi_cd', 'I')
    .is('multi_par_sal', null)
    .limit(400);

  const levels = [
    subject.nbrhd_cd ? { level: 'neighborhood', col: 'nbrhd_cd', val: subject.nbrhd_cd } : null,
    subject.mkt_ar ? { level: 'market_area', col: 'mkt_ar', val: subject.mkt_ar } : null,
  ].filter(Boolean);

  for (const lv of levels) {
    const { data, error } = await base(
      db.from('sales').select('parcel_id, sale_date, sale_prc, qual_cd, nbrhd_cd, mkt_ar').eq(lv.col, lv.val)
    );
    if (error) { console.error('[comps] sales query failed:', error.message); continue; }
    if (data && data.length >= MIN_COMPS) return { rows: data, level: lv.level };
  }
  return { rows: [], level: null };
}

/**
 * Build a defensible comp set for a subject parcel.
 *
 * Returns `sufficient: false` and NO indicated value when the evidence does not
 * support one. That is not a degraded result to paper over — three verifiable
 * sales beat six plausible ones, and a petition citing a thin set invites the
 * Board to dismiss the whole thing.
 */

/**
 * THE SUBJECT'S OWN RECENT SALE.
 *
 * Not a comparable — a comparable is a different property. This is the strongest
 * single fact about the subject, and it cuts both ways:
 *
 *   ABOVE our indicated value: the case is dead. The Property Appraiser opens
 *   with "it sold for $1,965,500 eleven months ago" and every comp we cite is
 *   answered by one line. A real Miramar parcel, 3924 SW 189 AVE, has a just
 *   value of $1,709,990 and six near-identical neighbourhood sales indicating
 *   $1,201,000 — a 29.8% cut — and sold arms-length in 2025 for $1,965,500. The
 *   engine would have built that petition without ever looking.
 *
 *   BELOW just value: it is the best evidence in the filing and should lead,
 *   with the comps in support. An arms-length sale of the subject itself is
 *   better proof of its value than any set of neighbours.
 *
 * Unqualified sales (QUAL_CD outside 01/02 — foreclosures, quitclaims, family
 * transfers) are deliberately ignored. They are not evidence of market value,
 * and the appraiser will say so.
 */
async function fetchSubjectSale(db, subject, rollYear) {
  // THE SAME WINDOW AS THE COMPS, NOT A WIDER ONE.
  //
  // The first version looked back three years, which is wrong for a fact used to
  // REFUSE a case. A 2023 sale is weak evidence of a 2026 value — markets move,
  // and the appraiser would have to defend it as current just as we would. If a
  // sale is too old to serve as a comparable, it is too old to kill a petition.
  //
  // Measured on Broward: the county sets just value at a median 90.4% of the
  // actual sale price, so "sold above just value" describes 86% of recently sold
  // parcels and means nothing on its own. What this guards against is narrower —
  // a sale price above the value our own comps argue for, which is the one fact
  // that answers every comp we could cite.
  const since = `${rollYear - 1 - Math.floor(MONTHS_BEFORE / 12)}-01-01`;
  const until = `${rollYear}-${String(MONTHS_AFTER + 1).padStart(2, '0')}-01`;
  const { data, error } = await db
    .from('sales')
    .select('sale_date, sale_prc, qual_cd')
    .eq('co_no', subject.co_no)
    .eq('parcel_id', subject.parcel_id)
    .eq('is_qualified', true)
    .gte('sale_date', since)
    .lte('sale_date', until)
    .order('sale_date', { ascending: false })
    .limit(1);

  if (error) {
    // Never let this fail the whole comp set. A missing guardrail is worse than
    // no guardrail only if it is silent, so it is reported instead.
    console.error('[comps] subject sale lookup failed:', error.message);
    return { checked: false };
  }
  const row = (data || [])[0];
  if (!row || !row.sale_prc) return { checked: true, found: false };
  return {
    checked: true,
    found: true,
    salePrice: row.sale_prc,
    saleDate: row.sale_date,
    qualCode: row.qual_cd,
  };
}

export async function findComps(subject, { rollYear = 2026 } = {}) {
  const db = getSupabaseAdmin();
  if (!db) return { comps: [], sufficient: false, reason: 'no_database' };

  const [{ rows, level }, subjectSale] = await Promise.all([
    fetchCandidates(db, subject, rollYear),
    fetchSubjectSale(db, subject, rollYear),
  ]);
  if (!rows.length) return { comps: [], sufficient: false, reason: 'no_qualified_sales', level };

  // Characteristics live on the parcel, not the sale, so join them back.
  //
  // CHUNKED, because PostgREST sends .in() as a GET query string. A busy
  // neighbourhood produces hundreds of candidate parcels — 281 of them in the
  // Broward test, about 3,650 characters — which overruns the URL limit. The
  // request fails, the catch below reports `join_failed`, and the whole comp set
  // silently becomes "no comparable sales". The symptom looks like a thin
  // neighbourhood; the cause is a URL that was too long.
  const ids = [...new Set(rows.map((r) => r.parcel_id))].slice(0, 400);
  const CHUNK = 80;
  const parcelChunks = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await db
      .from('parcels')
      .select('parcel_id, phy_addr1, phy_city, phy_zipcd, tot_lvg_area, act_yr_blt, dor_uc, no_res_unts, jv, lnd_val')
      .eq('co_no', subject.co_no)
      .eq('asmnt_yr', rollYear)
      .in('parcel_id', ids.slice(i, i + CHUNK));
    if (error) {
      console.error('[comps] parcel join failed:', error.message);
      return { comps: [], sufficient: false, reason: 'join_failed' };
    }
    if (data) parcelChunks.push(...data);
  }

  const byId = new Map(parcelChunks.map((p) => [p.parcel_id, p]));

  const enriched = rows.map((r) => {
    const p = byId.get(r.parcel_id);
    if (!p || !p.tot_lvg_area || p.tot_lvg_area <= 0) return null;
    // Same use class only. A condo is not evidence for a single-family house.
    if (subject.dor_uc && p.dor_uc !== subject.dor_uc) return null;
    return {
      parcelId: r.parcel_id,
      address: [p.phy_addr1, p.phy_city].filter(Boolean).join(', '),
      saleDate: r.sale_date,
      salePrice: r.sale_prc,
      sqft: p.tot_lvg_area,
      yearBuilt: p.act_yr_blt,
      pricePerSqft: Math.round(r.sale_prc / p.tot_lvg_area),
      qualCode: r.qual_cd,
      // Share of the comp's just value that is land. Null when the county gives
      // us nothing to compute it from, which is treated as unknown rather than
      // as zero — see the filter below.
      landShare: p.jv > 0 ? (Number(p.lnd_val || 0) / Number(p.jv)) : null,
    };
  }).filter(Boolean);

  if (!subject.tot_lvg_area) {
    return { comps: enriched.slice(0, MAX_COMPS), sufficient: false, reason: 'subject_has_no_living_area', level };
  }

  // Tightest size AND age bands that together yield enough comps. Size is
  // widened before age, because a 10% size difference is a routine adjustment
  // while a 40-year age gap is not comparable at any size.
  const subjYear = Number(subject.act_yr_blt) || null;

  // The subject's own land share, on the same measure as the comps.
  const subjLandShare = Number(subject.jv) > 0
    ? Number(subject.lnd_val || 0) / Number(subject.jv)
    : null;

  let band = null, ageBand = null, landBand = null, inBand = [];
  outer: for (const lb of LAND_BANDS) {
    for (const ab of AGE_BANDS) {
      for (const b of SIZE_BANDS) {
        const set = enriched.filter((c) => {
          const sizeOk = Math.abs(c.sqft - subject.tot_lvg_area) / subject.tot_lvg_area <= b;
          if (!sizeOk) return false;
          if (subjYear && c.yearBuilt && Math.abs(Number(c.yearBuilt) - subjYear) > ab) return false;
          // Unknown land share is not disqualifying — same treatment as an
          // unknown year. What is disqualifying is a KNOWN and different one.
          if (subjLandShare == null || c.landShare == null) return true;
          return Math.abs(c.landShare - subjLandShare) <= lb;
        });
        if (set.length >= MIN_COMPS) { band = b; ageBand = ab; landBand = lb; inBand = set; break outer; }
      }
    }
  }

  // LAND IS WIDENED LAST AND NEVER ABANDONED.
  //
  // Size and age widen first because a 15% size difference is a routine
  // adjustment. Land share is the confounder that invalidates the whole method
  // rather than loosening it: comparing a waterfront lot to inland houses of the
  // same size does not produce a weaker answer, it produces a wrong one. So if
  // no combination clears MIN_COMPS, we decline instead of dropping the
  // constraint — a property whose value is mostly dirt cannot be valued from its
  // living area, and saying so is the only honest output.
  //
  // The customer is not turned away: the condition route is untouched, and the
  // petition argues cost to cure and the absence of a physical inspection.
  if (!band && subjLandShare != null) {
    const anyLand = enriched.some((c) => c.landShare != null && Math.abs(c.landShare - subjLandShare) <= LAND_BANDS[LAND_BANDS.length - 1]);
    if (!anyLand) {
      return {
        comps: [], sufficient: false, level,
        reason: 'land_value_not_comparable',
        subjectLandShare: Math.round(subjLandShare * 100) / 100,
        candidateCount: enriched.length,
        subjectSale,
      };
    }
  }
  if (!band) {
    return {
      comps: enriched
        .sort((a, b) => Math.abs(a.sqft - subject.tot_lvg_area) - Math.abs(b.sqft - subject.tot_lvg_area))
        .slice(0, MAX_COMPS),
      sufficient: false, reason: 'too_few_comparable_in_size', level,
    };
  }

  // Rank by size similarity first, then recency. Size is the confounder that
  // actually distorts the number; recency is a tiebreaker.
  const comps = inBand
    .map((c) => ({
      ...c,
      sizeDelta: Math.round((Math.abs(c.sqft - subject.tot_lvg_area) / subject.tot_lvg_area) * 1000) / 10,
    }))
    .sort((a, b) => (a.sizeDelta - b.sizeDelta) || (b.saleDate < a.saleDate ? -1 : 1))
    .slice(0, MAX_COMPS);

  const medianPpsf = median(comps.map((c) => c.pricePerSqft));
  const indicatedValue = medianPpsf ? Math.round((medianPpsf * subject.tot_lvg_area) / 1000) * 1000 : null;

  // ── THE COMPS MUST SUPPORT A REDUCTION ────────────────────────────────────
  //
  // A comp set can be flawless — qualified, size-matched, same neighbourhood —
  // and still show the property is worth MORE than the county says. That is a
  // real and common answer: most properties are not over-assessed.
  //
  // Returning it as `sufficient: true` would hand the Value Adjustment Board a
  // sworn argument that our own customer is UNDER-assessed. The set is still
  // returned, because seeing it is what makes the conclusion trustworthy — but
  // it is marked so nothing downstream can mistake it for a case.
  let supportsReduction = indicatedValue != null && subject.jv != null
    ? indicatedValue < subject.jv
    : null;

  // THE SUBJECT'S OWN SALE OVERRIDES THE COMPS.
  //
  // If this property sold arms-length at or above what our comps indicate, the
  // comps are not evidence of anything the Board will accept — the sale is a
  // direct observation of this house's market value and beats an inference from
  // its neighbours. Filing anyway means citing six sales that one line refutes.
  if (subjectSale.found && indicatedValue != null && subjectSale.salePrice >= indicatedValue) {
    return {
      comps, level, sizeBandPct: Math.round(band * 100), ageBandYears: ageBand,
      medianPricePerSqft: medianPpsf, indicatedValue,
      candidateCount: enriched.length,
      sufficient: false,
      supportsReduction: false,
      subjectSale,
      reason: 'subject_sold_above_indicated_value',
    };
  }

  if (supportsReduction === false) {
    return {
      comps, level, sizeBandPct: Math.round(band * 100), ageBandYears: ageBand,
      medianPricePerSqft: medianPpsf, indicatedValue,
      candidateCount: enriched.length,
      sufficient: false,
      supportsReduction: false,
      reason: 'comps_do_not_support_reduction',
      message: `Comparable sales in this neighborhood indicate about $${indicatedValue.toLocaleString()}, which is above the county's $${Number(subject.jv).toLocaleString()}. These sales do not support a reduction.`,
    };
  }

  return {
    comps,
    sufficient: true,
    supportsReduction,
    landBandShare: landBand,
    // Present when the subject itself sold arms-length recently. Below just
    // value this is the strongest item in the filing and the petition should
    // lead with it; the comps become support rather than the argument.
    subjectSale,
    level,
    sizeBandPct: Math.round(band * 100),
    ageBandYears: ageBand,
    medianPricePerSqft: medianPpsf,
    indicatedValue,
    candidateCount: enriched.length,
    // Printed at the foot of the comps table. A cited sale without a stated
    // source is the failure this whole pipeline exists to prevent.
    attribution: `Qualified arms-length sales from the ${rollYear} Florida Department of Revenue sale data file, county ${subject.co_no}, ${level === 'neighborhood' ? 'same appraiser neighborhood' : 'same appraiser market area'} as the subject.`,
  };
}

export default { findComps, SIZE_BANDS, MIN_COMPS, MAX_COMPS };
