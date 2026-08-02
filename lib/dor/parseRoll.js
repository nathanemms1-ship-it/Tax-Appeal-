/**
 * PARSER for the Florida DOR assessment roll files (NAL and SDF).
 *
 * ============================================================================
 * WHY ONE PARSER COVERS ALL 67 COUNTIES
 * ============================================================================
 * Every Florida county property appraiser submits their roll to the Department
 * of Revenue in a mandated format — 160 named columns for the NAL, 23 for the
 * SDF, comma-delimited with a header row. The counties differ in their PARCEL_ID
 * formatting and in which optional columns they populate, but not in the schema.
 * So this is written once and run 67 times.
 *
 * Source of truth for the layout is the annual "User's Guide — Department
 * Property Tax Data Files" published with each roll.
 *
 * ============================================================================
 * THE COLUMNS THAT MATTER, AND WHY
 * ============================================================================
 * Of the 160 NAL columns we keep about 25. The ones doing real work:
 *
 *   JV                just value — THE number a VAB petition disputes
 *   AV_SD  / AV_NSD   assessed value, school and non-school levies
 *   TV_SD  / TV_NSD   taxable value, school and non-school levies
 *
 * Keeping school and non-school separate is not tidiness. The Save Our Homes cap
 * applies to both; the 10% non-homestead cap applies ONLY to non-school. Collapse
 * them and you lose the ability to tell a non-homesteaded owner they can win —
 * which is most of the serviceable market. See lib/dor/qualify.js.
 *
 *   NBRHD_CD          the appraiser's own neighborhood grouping
 *   MKT_AR            the appraiser's own market area
 *
 * These two matter more than they look. The NAL carries NO latitude/longitude,
 * so radius search is not available — but that turns out to be an upgrade rather
 * than a loss. NBRHD_CD is the grouping the Property Appraiser themselves used to
 * value the property. Comping within it is both more defensible before a special
 * magistrate and more accurate than a naive one-mile circle that crosses a
 * highway, a school boundary and a flood zone.
 *
 *   QUAL_CD           sale qualification code
 *
 * Codes 01 and 02 are qualified arms-length sales the Department itself uses for
 * ratio studies. Everything else is disqualified — foreclosures, family
 * transfers, corrective deeds. Filtering to 01/02 is exactly what an appraiser
 * would do, and it is the difference between evidence and noise.
 */

/**
 * Minimal RFC-4180 CSV line splitter.
 *
 * A regex split on commas is wrong here: OWN_NAME and S_LEGAL routinely contain
 * commas inside quotes ("SMITH, JOHN A"), and a naive split silently shifts
 * every subsequent column by one. That failure is invisible — you get plausible
 * numbers in the wrong fields — which on a sworn document is the worst kind.
 */
export function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }  // escaped quote
        else inQuotes = false;
      } else cur += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(cur); cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const str = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const int = (v) => {
  const s = str(v);
  if (s === null) return null;
  // Roll files occasionally carry values with stray spaces or a leading plus.
  const x = Number(s.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(x) ? Math.round(x) : null;
};

/**
 * Normalise a NAL row (already parsed into a header-keyed object).
 *
 * Column names are used rather than positions. The files carry a header row, and
 * the Department has added columns between roll years — positional parsing would
 * break silently on the first year they do it again.
 */
export function normalizeNalRow(r) {
  const parcelId = str(r.PARCEL_ID);
  if (!parcelId) return null;

  const addr1 = str(r.PHY_ADDR1);
  const addr2 = str(r.PHY_ADDR2);

  return {
    co_no: int(r.CO_NO),
    parcel_id: parcelId,
    asmnt_yr: int(r.ASMNT_YR),
    dor_uc: int(r.DOR_UC),

    // Values. Kept per-levy — see the header.
    jv: int(r.JV),
    av_sd: int(r.AV_SD),
    av_nsd: int(r.AV_NSD),
    tv_sd: int(r.TV_SD),
    tv_nsd: int(r.TV_NSD),
    jv_hmstd: int(r.JV_HMSTD),
    av_hmstd: int(r.AV_HMSTD),
    jv_non_hmstd_resd: int(r.JV_NON_HMSTD_RESD),
    av_non_hmstd_resd: int(r.AV_NON_HMSTD_RESD),
    lnd_val: int(r.LND_VAL),

    // Characteristics used for comp matching.
    tot_lvg_area: int(r.TOT_LVG_AREA),
    act_yr_blt: int(r.ACT_YR_BLT),
    eff_yr_blt: int(r.EFF_YR_BLT),
    no_buldng: int(r.NO_BULDNG),
    no_res_unts: int(r.NO_RES_UNTS),
    lnd_sqfoot: int(r.LND_SQFOOT),

    // The appraiser's own groupings — better comp strata than a radius.
    nbrhd_cd: str(r.NBRHD_CD),
    mkt_ar: str(r.MKT_AR),
    census_bk: str(r.CENSUS_BK),

    // Situs address, for lookup and autocomplete.
    phy_addr1: addr1,
    phy_addr2: addr2,
    phy_city: str(r.PHY_CITY),
    phy_zipcd: str(r.PHY_ZIPCD),

    own_name: str(r.OWN_NAME),

    // EXMPT_01 is the base $25k homestead; EXMPT_02 the additional $25k that does
    // not apply to school levies. Their presence is how we know a parcel is
    // homesteaded without guessing from the value gap.
    exmpt_01: int(r.EXMPT_01),
    exmpt_02: int(r.EXMPT_02),
    // Portability — an assessment differential moved from a prior homestead.
    // Relevant because it explains a large cap benefit on a recently bought home.
    ass_dif_trns: int(r.ASS_DIF_TRNS),

    // Most recent sale as carried on the parcel record. The SDF has the fuller
    // history; this is here so a parcel row alone can answer "when did they buy".
    sale_prc1: int(r.SALE_PRC1),
    sale_yr1: int(r.SALE_YR1),
    sale_mo1: int(r.SALE_MO1),
    qual_cd1: int(r.QUAL_CD1),
    vi_cd1: str(r.VI_CD1),
  };
}

/** Sale qualification codes the Department itself accepts for ratio studies. */
export const QUALIFIED_SALE_CODES = new Set([1, 2]);

export function normalizeSdfRow(r) {
  const parcelId = str(r.PARCEL_ID);
  if (!parcelId) return null;

  const yr = int(r.SALE_YR);
  const mo = int(r.SALE_MO);
  const price = int(r.SALE_PRC);
  // A row with no year or no price is a real record we cannot use as a comp —
  // typically a transfer recorded with no consideration, or one still awaiting
  // qualification. It is an EXCLUSION, not a parse failure, and counting it as
  // the latter made Pinellas (11.6%) and Polk (12.9%) look like layout
  // mismatches when they were entirely normal.
  if (!yr || !price) return { __excluded: 'no_sale_figures' };

  const qual = int(r.QUAL_CD);

  return {
    co_no: int(r.CO_NO),
    parcel_id: parcelId,
    asmnt_yr: int(r.ASMNT_YR),
    sale_id_cd: str(r.SALE_ID_CD),
    qual_cd: qual,
    // Precomputed so comp queries can filter on a boolean rather than repeating
    // the code list in SQL, where it would inevitably drift.
    is_qualified: QUALIFIED_SALE_CODES.has(qual),
    vi_cd: str(r.VI_CD),
    // Day is unknown in the roll — only year and month are reported. Using the
    // 1st is a deliberate, documented convention, not a parsing accident.
    sale_date: `${yr}-${String(mo || 1).padStart(2, '0')}-01`,
    sale_yr: yr,
    sale_mo: mo,
    sale_prc: price,
    dor_uc: int(r.DOR_UC),
    nbrhd_cd: str(r.NBRHD_CD),
    mkt_ar: str(r.MKT_AR),
    census_bk: str(r.CENSUS_BK),
    // "C" or "D" marks a sale covering several parcels. The price is for the
    // whole group, so the per-parcel figure is meaningless as a comp.
    multi_par_sal: str(r.MULTI_PAR_SAL),
  };
}

/**
 * Parse a whole file's text into normalized rows.
 *
 * `kind` is 'nal' or 'sdf'. Returns {rows, skipped, headers}. Rows that fail
 * normalization are counted rather than thrown on — a single malformed line in a
 * 500,000-row county file must not abort the load, but a large skip count is a
 * signal worth surfacing, so it is returned rather than swallowed.
 */
export function parseRoll(text, kind) {
  const normalize = kind === 'sdf' ? normalizeSdfRow : normalizeNalRow;
  const lines = text.split(/\r?\n/);
  const headers = splitCsvLine(lines[0] || '').map((h) => h.trim().toUpperCase());

  const rows = [];
  let skipped = 0;
  let excluded = 0;

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cells = splitCsvLine(lines[i]);
    const obj = {};
    for (let c = 0; c < headers.length; c++) obj[headers[c]] = cells[c];
    const row = normalize(obj);
    if (!row) { skipped++; continue; }
    // Deliberate exclusions are reported separately from parse failures — see
    // normalizeSdfRow. Conflating them makes a healthy county look broken.
    if (row.__excluded) { excluded++; continue; }
    rows.push(row);
  }

  return { rows, skipped, excluded, headers };
}

export default { parseRoll, normalizeNalRow, normalizeSdfRow, splitCsvLine, QUALIFIED_SALE_CODES };
