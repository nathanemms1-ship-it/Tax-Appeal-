/**
 * ============================================================================
 * PACS APPRAISAL EXPORT — record parsing
 * ============================================================================
 * Harris Govern PACS (formerly True Automation) is the CAMA system behind
 * roughly two-thirds of Texas appraisal districts. Its export is a set of
 * fixed-width text files with a versioned, published layout, so ONE parser
 * covers Travis, Tarrant, Bexar, Denton, Nueces, Bell, Hays, Cameron, Jefferson,
 * Brazoria, Galveston, Kaufman, Wichita, Taylor, Grayson, Angelina, Guadalupe,
 * Johnson, Victoria and a long tail of smaller districts.
 *
 * Offsets below were extracted from "Appraisal Export Layout - 8.0.34.xlsx" and
 * then VERIFIED AGAINST REAL BYTES from the Nueces 2026 certified export — not
 * taken on trust from the spreadsheet. That distinction mattered: Nueces
 * publishes the 8.0.33 layout on its own website while shipping 8.0.34 data, and
 * building against the published document would have been one version wrong
 * across 9,714 columns.
 *
 * ============================================================================
 * THE NAMING TRAP — READ THIS BEFORE TOUCHING ANY VALUE FIELD
 * ============================================================================
 * PACS and the Texas Tax Code use the word "appraised" for OPPOSITE things.
 *
 *   Tax Code § 1.04 :  market value -> appraised value (AFTER cap) -> assessed
 *   PACS export     :  appraised_val (BEFORE cap)      -> assessed_val (AFTER)
 *
 * So the district's `appraised_val` is our MARKET figure, and its `assessed_val`
 * is the Tax Code's APPRAISED value — the number § 41.43(b)(3) compares. Mapping
 * these by name would invert the qualification gate silently and sell protests to
 * exactly the homeowners who cannot benefit.
 *
 * Translation happens HERE, once. Everything downstream speaks Tax Code.
 *
 * ============================================================================
 * THE ARITHMETIC INVARIANT
 * ============================================================================
 *   assessed_val = appraised_val - ten_percent_cap - nhs_cap_loss
 *
 * Verified true for 19,198 of 19,198 category-A records in the Nueces 2026 roll.
 * 555 rows initially looked wrong and every one was explained by nhs_cap_loss.
 *
 * This is not trivia — it is a free self-check on the offsets. If a district's
 * file parses but the invariant fails, the offsets are wrong for that file and
 * the loader must refuse rather than write plausible nonsense into the table.
 */

/** Field positions are 1-indexed and inclusive, exactly as the layout states. */
const F = (start, end) => ({ start: start - 1, end });

export const APPRAISAL_INFO = {
  recordLength: 9714,
  prop_id:            F(1, 12),
  prop_type_cd:       F(13, 17),      // R = real, P = business personal, MN = mineral
  prop_val_yr:        F(18, 22),
  sup_num:            F(23, 34),
  geo_id:             F(547, 596),
  situs_street_prefx: F(1040, 1049),
  situs_street:       F(1050, 1099),
  situs_street_sufx:  F(1100, 1109),
  situs_city:         F(1110, 1139),
  situs_zip:          F(1140, 1149),
  legal_acreage:      F(1660, 1675),
  abs_subdv_cd:       F(1676, 1685),
  hood_cd:            F(1686, 1695),  // THE comp-selection key. See selectComps.
  land_hstd_val:      F(1796, 1810),
  land_non_hstd_val:  F(1811, 1825),
  imprv_hstd_val:     F(1826, 1840),
  imprv_non_hstd_val: F(1841, 1855),
  appraised_val:      F(1916, 1930),  // PACS name. This is our MARKET value.
  ten_percent_cap:    F(1931, 1945),  // § 23.23 homestead cap adjustment
  assessed_val:       F(1946, 1960),  // PACS name. This is Tax Code APPRAISED.
  arb_protest_flag:   F(1981, 1981),
  imprv_state_cd:     F(2732, 2741),
  land_state_cd:      F(2742, 2751),
  market_value:       F(4214, 4227),
  situs_num:          F(4460, 4474),
  nhs_cap_loss:       F(9068, 9082),  // § 23.231 circuit breaker. Expires 31 Dec 2026.
};

export const IMPROVEMENT_DETAIL = {
  recordLength: 622,
  prop_id:       F(1, 12),
  prop_val_yr:   F(13, 16),
  imprv_det_type_cd: F(41, 50),
  imprv_det_class_cd: F(76, 85),
  yr_built:      F(86, 89),
  imprv_det_area: F(94, 108),
};

export const LAND_DETAIL = {
  recordLength: 199,
  prop_id:          F(1, 12),
  prop_val_yr:      F(13, 16),
  state_cd:         F(64, 68),
  land_seg_homesite: F(69, 69),
  size_acres:       F(70, 83),
  size_square_feet: F(84, 97),
};

export const HEADER = {
  run_datetime:   F(1, 16),
  description:    F(17, 56),
  appraisal_year: F(57, 60),
  pacs_version:   F(165, 174),
  export_version: F(175, 184),
};

/**
 * Improvement-detail type codes that ARE living area.
 *
 * From the Nueces roll, the most common codes are MA (MAIN AREA, 9,360),
 * CPO (COVERED PORCH), STG (STORAGE), CPAT (COVERED PATIO), AG (ATTACHED
 * GARAGE), CP (CARPORT), MA2 (MAIN AREA SECOND FLOOR).
 *
 * Only the MAIN AREA codes count. A porch, a garage and a storage shed are
 * improvements with area, and none of them is living space — summing them all
 * would inflate a 1,800 sq ft house to 2,600 and then compare it against
 * neighbours measured the same wrong way. The error partly cancels, which is
 * worse than if it did not: it produces a comp set that looks reasonable and is
 * quietly measuring the wrong thing.
 *
 * Districts name these codes themselves, so this list is a starting set and the
 * loader reports any unmatched code that carries significant area.
 */
export const LIVING_AREA_CODES = new Set([
  'MA', 'MA2', 'MA3', 'MAIN', 'LA', 'LIV',
  // MH = MOBILE HOME, LQ = LIVING QUARTERS. Both are dwellings and both were
  // missed by the first version of this list, which cost 4,543 Nueces properties
  // their square footage — every one of them a category A2 "REAL, RESIDENTIAL,
  // MOBILE HOME" parcel, i.e. a single-family residence by the Comptroller's own
  // classification and squarely inside the customers we serve.
  //
  // They were found by the loader's own report of large-area codes it did not
  // recognise, which is the entire reason that report exists. A comp engine that
  // silently drops the square footage of a whole housing type does not look
  // broken; it just quietly cannot size-adjust mobile homes.
  //
  // Comping a mobile home against a site-built house would be wrong, but that is
  // handled where it belongs — the comp selector filters on state_class_code, so
  // A2 compares to A2.
  'MH', 'LQ',
]);

/** Comptroller State Property Classification: category A is single-family. */
export function stateCategory(code) {
  const c = (code || '').trim().toUpperCase();
  return c ? c[0] : null;
}

const slice = (line, f) => line.slice(f.start, f.end);
export const text = (line, f) => slice(line, f).trim() || null;

/** Fixed-width numerics are space- or zero-padded; empty means null, not 0. */
export function num(line, f) {
  const raw = slice(line, f).trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function flag(line, f) {
  const v = slice(line, f).trim().toUpperCase();
  if (v === 'T' || v === 'Y') return true;
  if (v === 'F' || v === 'N') return false;
  return null;
}

/**
 * Parse one APPRAISAL_INFO record into Tax Code vocabulary.
 * Returns null for records this product does not serve.
 */
export function parseProperty(line, { residentialOnly = true } = {}) {
  if (line.length < APPRAISAL_INFO.recordLength - 1) return null;

  const propType = text(line, APPRAISAL_INFO.prop_type_cd);
  if (propType !== 'R') return { __excluded: 'not_real_property' };

  // State code lives on the improvement, or on the land for vacant parcels.
  const stateCd = text(line, APPRAISAL_INFO.imprv_state_cd)
               || text(line, APPRAISAL_INFO.land_state_cd);

  // RESIDENTIAL-ONLY IS A COMPLIANCE BOUNDARY, NOT A PREFERENCE.
  // Occ. Code § 1152.002(a)(8) exempts us from TDLR registration only while
  // services are limited to "farms, ranches, or single-family residences". One
  // commercial account voids the exemption for the entire business, so the
  // filter belongs in the pipeline and not only in the funnel.
  //
  // Category A is the Comptroller's own "SINGLE FAMILY RESIDENCE" class — the
  // Nueces code file labels A1 through A6 that way in its own words, which is a
  // far better line to draw than a hand-picked list of subcodes.
  if (residentialOnly && stateCategory(stateCd) !== 'A') {
    return { __excluded: 'not_residential' };
  }

  const marketFromPacsAppraised = num(line, APPRAISAL_INFO.appraised_val);
  const cappedAppraised         = num(line, APPRAISAL_INFO.assessed_val);
  const homesteadCap            = num(line, APPRAISAL_INFO.ten_percent_cap) ?? 0;
  const nhsCap                  = num(line, APPRAISAL_INFO.nhs_cap_loss) ?? 0;

  const situs = [
    text(line, APPRAISAL_INFO.situs_num),
    text(line, APPRAISAL_INFO.situs_street_prefx),
    text(line, APPRAISAL_INFO.situs_street),
    text(line, APPRAISAL_INFO.situs_street_sufx),
  ].filter(Boolean).join(' ') || null;

  return {
    account_number: text(line, APPRAISAL_INFO.prop_id),
    tax_year:       num(line, APPRAISAL_INFO.prop_val_yr),
    geo_id:         text(line, APPRAISAL_INFO.geo_id),

    // Tax Code vocabulary from here down. See the header note.
    market_value:      num(line, APPRAISAL_INFO.market_value) ?? marketFromPacsAppraised,
    appraised_value:   cappedAppraised,
    homestead_cap_loss: homesteadCap,
    nhs_cap_loss:      nhsCap,

    land_value: (num(line, APPRAISAL_INFO.land_hstd_val) ?? 0)
              + (num(line, APPRAISAL_INFO.land_non_hstd_val) ?? 0),
    improvement_value: (num(line, APPRAISAL_INFO.imprv_hstd_val) ?? 0)
                     + (num(line, APPRAISAL_INFO.imprv_non_hstd_val) ?? 0),

    // A homestead exemption is what makes § 23.23 apply. The roll signals it by
    // splitting value into homestead and non-homestead buckets, so a non-zero
    // homestead bucket is the reliable indicator in this file.
    has_homestead: ((num(line, APPRAISAL_INFO.land_hstd_val) ?? 0)
                  + (num(line, APPRAISAL_INFO.imprv_hstd_val) ?? 0)) > 0,

    neighborhood_code: text(line, APPRAISAL_INFO.hood_cd),
    abs_subdv_cd:      text(line, APPRAISAL_INFO.abs_subdv_cd),
    state_class_code:  stateCd,
    land_size_acres:   num(line, APPRAISAL_INFO.legal_acreage),

    situs_street: situs,
    situs_city:   text(line, APPRAISAL_INFO.situs_city),
    situs_zip:    (text(line, APPRAISAL_INFO.situs_zip) || '').slice(0, 5) || null,

    arb_protest_flag: flag(line, APPRAISAL_INFO.arb_protest_flag),

    // Carried only so the loader can assert the invariant. Not stored.
    __pacs_appraised: marketFromPacsAppraised,
  };
}

/**
 * The invariant. Returns null when it holds, or a description when it does not.
 * A file that parses but fails this has wrong offsets, and wrong offsets that
 * produce plausible numbers are the most dangerous outcome available here.
 */
export function checkInvariant(p) {
  if (p.__pacs_appraised == null || p.appraised_value == null) return null;
  const expected = p.__pacs_appraised - p.homestead_cap_loss - p.nhs_cap_loss;
  if (expected !== p.appraised_value) {
    return `appraised(${p.__pacs_appraised}) - hs_cap(${p.homestead_cap_loss})`
         + ` - nhs_cap(${p.nhs_cap_loss}) = ${expected}, but assessed = ${p.appraised_value}`;
  }
  return null;
}

/**
 * How much a protest must move market value before the tax bill changes at all.
 * Zero means every dollar of reduction reaches the bill; a large number means
 * the customer should be refused.
 */
export function requiredReduction(p) {
  return (p.homestead_cap_loss ?? 0) + (p.nhs_cap_loss ?? 0);
}

/**
 * Lot size, from APPRAISAL_LAND_DETAIL rather than the property record.
 *
 * APPRAISAL_INFO.legal_acreage reads 0.0000 for every platted subdivision lot —
 * those parcels are described by lot and block, not by acreage — so using it
 * alone gives a land size of zero for most suburban housing, which is precisely
 * the housing we serve. The land detail file carries real square footage per
 * segment; a parcel can have several, so they sum.
 */
export function accumulateLand(acc, line) {
  const id = text(line, LAND_DETAIL.prop_id);
  if (!id) return acc;
  const cur = acc.get(id) || { land_size_sqft: 0, land_size_acres: 0 };
  cur.land_size_sqft += num(line, LAND_DETAIL.size_square_feet) ?? 0;
  cur.land_size_acres += num(line, LAND_DETAIL.size_acres) ?? 0;
  acc.set(id, cur);
  return acc;
}
