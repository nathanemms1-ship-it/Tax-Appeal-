/**
 * Georgia savings check — question 2 of "should you appeal?":
 * if the county lowers this home's market value, does the TAX BILL go down,
 * and by roughly how much a year?
 *
 * Question 1 (is it over-assessed?) is lib/kit/comps.js caseCheck().
 *
 * THE ARITHMETIC
 *   Georgia taxes 40% of fair market value (O.C.G.A. § 48-5-7). A levy of M mills
 *   charges M/1000 of that. So a market-value reduction R saves, per levy that
 *   follows market value:          R × 0.40 × M / 1000   per year.
 *
 * WHICH LEVIES COUNT (deliberately conservative: an over-stated saving is a
 * false promise, an under-stated one only loses a sale)
 *   - Bond millage: always, except where a local freeze caps the homestead's
 *     value (Gwinnett, Columbus, Fulton schools): there the levy counts $0.
 *     HB 581 itself does not cap debt levies.
 *   - Non-homestead: every M&O levy. HB 581 is homestead-only.
 *   - Homestead: an M&O levy counts only where the jurisdiction opted out of
 *     HB 581 AND no local freeze caps it. Capped levies count as $0. (A large
 *     enough reduction could still dip below a capped base, but that base is not
 *     public, so we never claim it.)
 *   - Only the county levy and the school levy. City, fire, special and TAD
 *     levies are left out, which understates savings for city residents.
 *   - A county without a verified HB 581 status (outside the top 25): homestead
 *     M&O counts as capped, and the result says so.
 *
 * THE VERDICT mirrors Florida (lib/dor/qualify.js): worth it when the yearly
 * saving at the requested value is at least the price; 'marginal' when under
 * twice the price. The price is passed in.
 *
 * The § 48-5-299(c) three-year freeze (a value reduced on appeal is held for
 * the next two years) is reported separately, as "up to" and not added in.
 */
import { MILLAGE, MILLAGE_TAX_YEAR } from './millage2025';
import { HB581_STATUS, IND_SCHOOL_STATUS, HB581_VERIFIED_FOR_TAX_YEAR } from './hb581';

export const ASSESSMENT_RATIO = 0.40;
export const THIN_MARGIN_MULTIPLE = 2;

const norm = (s) => String(s || '').toUpperCase().replace(/\s+COUNTY$/, '').trim();

function row(county, district) {
  const rows = MILLAGE[county];
  if (!rows) return null;
  const r = rows.find((x) => x[0] === district);
  return r ? { district: r[0], mo: r[1] || 0, bond: r[2] || 0 } : null;
}

/**
 * The county's own general levy. Many counties charge city residents a different
 * rate ("COUNTY INCORPORATED") from everyone else ("COUNTY UNINCORPORATED"), and
 * we do not know which side of a city line the home is on, so the LOWER of the
 * two is used (conservative). Consolidated governments have neither row.
 */
export function countyLevyRow(county) {
  const rows = [row(county, 'COUNTY UNINCORPORATED'), row(county, 'COUNTY INCORPORATED')].filter(Boolean);
  if (rows.length) return rows.reduce((a, b) => ((b.mo + b.bond) < (a.mo + a.bond) ? b : a));
  return row(county, 'COUNTY USD 1 - URBAN');
}

/**
 * @param {object} p
 * @param {string} p.county         e.g. 'Cobb' or 'COBB COUNTY'
 * @param {boolean} p.homestead     the home has a homestead exemption
 * @param {number}  p.reduction     market-value reduction in dollars (current value − requested value)
 * @param {number}  p.price         what the customer pays (for the verdict)
 * @param {string}  [p.indSchool]   DOR district name of an independent city school system, if the home is in one
 * @param {number}  [p.taxYear]     the tax year being appealed (for the HB 581 provisional flag)
 */
export function gaSavings({ county, homestead, reduction, price, indSchool = null, taxYear = 2027 }) {
  const c = norm(county);
  const notes = [];
  if (!MILLAGE[c]) return { ok: false, reason: 'unknown_county', county: c };
  if (!(Number(reduction) > 0)) return { ok: false, reason: 'no_reduction', county: c };
  if (typeof homestead !== 'boolean') return { ok: false, reason: 'need_homestead_answer', county: c };

  const status = HB581_STATUS[c] || null;
  if (homestead && !status) notes.push('HB 581 status not verified for this county: its operating levies are treated as capped.');
  if (status?.unverified) notes.push('Local exemptions in this county have not been checked; the estimate assumes none.');
  const provisional = homestead && taxYear > HB581_VERIFIED_FOR_TAX_YEAR;
  if (provisional) notes.push(`HB 581 opt-outs must be re-adopted by 1 March ${HB581_VERIFIED_FOR_TAX_YEAR + 1}; this estimate uses the ${HB581_VERIFIED_FOR_TAX_YEAR} status and is re-checked when your notice arrives.`);

  const levies = [];
  const add = (name, r, hb581, localCap) => {
    if (!r) return;
    const moCounts = !homestead || (hb581 === 'out' && !localCap);
    const why = !homestead ? 'not a homestead: HB 581 does not apply'
      : localCap ? `capped locally: ${localCap}`
      : hb581 === 'out' ? 'opted out of HB 581: follows market value'
      : hb581 === 'in' ? 'HB 581 cap applies to homesteads'
      : 'HB 581 status unverified: treated as capped';
    // HB 581 never caps bond levies, but a LOCAL freeze caps the assessed value
    // itself; whether it spares bond levies is not verified, so a locally capped
    // levy counts nothing (conservative).
    const bondCounts = !homestead || !localCap;
    const mills = (moCounts ? r.mo : 0) + (bondCounts ? r.bond : 0);
    levies.push({ levy: name, district: r.district, moMills: r.mo, bondMills: r.bond, moCounts, reason: why,
      mills, yearlySaving: Math.round(reduction * ASSESSMENT_RATIO * mills / 1000) });
  };

  add('county', countyLevyRow(c), status?.county ?? null, status?.localCap?.county);
  if (indSchool) {
    const r = row(c, indSchool);
    if (!r) notes.push(`Independent school district "${indSchool}" not found in ${c}; county school levy used.`);
    add('school', r || row(c, 'SCHOOL'), r ? (IND_SCHOOL_STATUS[indSchool] ?? null) : (status?.school ?? null), r ? null : status?.localCap?.school);
  } else {
    add('school', row(c, 'SCHOOL'), status?.school ?? null, status?.localCap?.school);
  }

  const yearlySaving = levies.reduce((s, l) => s + l.yearlySaving, 0);
  const millsCounted = Math.round(levies.reduce((s, l) => s + l.mills, 0) * 1000) / 1000;
  const worth = Number(price) > 0 ? yearlySaving >= price : null;
  const verdict = yearlySaving <= 0 ? 'no_bill_change'
    : worth === false ? 'saving_below_price'
    : worth && yearlySaving < price * THIN_MARGIN_MULTIPLE ? 'marginal'
    : 'worth_it';
  return {
    ok: true, county: c, homestead, reduction, millageYear: MILLAGE_TAX_YEAR, provisional,
    levies, millsCounted, yearlySaving,
    threeYearSavingUpTo: yearlySaving * 3,
    verdict, notes,
  };
}
