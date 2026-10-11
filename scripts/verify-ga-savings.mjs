/**
 * OFFLINE VERIFICATION for lib/ga/savings.js — the Georgia "does the BILL drop?"
 * check behind the promise "we tell you before you pay whether an appeal will
 * lower your bill, after caps and exemptions".
 *
 * An over-stated saving is a false promise to a paying customer, so most checks
 * here guard against counting a levy that a cap freezes. Where a line says
 * INJECTION, reintroducing that bug makes the named assertion fail.
 */
import { register } from 'node:module';
register('./resolve-extensionless.mjs', import.meta.url);

const { gaSavings, countyLevyRow, ASSESSMENT_RATIO, THIN_MARGIN_MULTIPLE } = await import('../lib/ga/savings.js');
const { MILLAGE, MILLAGE_TAX_YEAR } = await import('../lib/ga/millage2025.js');
const { HB581_STATUS, IND_SCHOOL_STATUS } = await import('../lib/ga/hb581.js');

let pass = 0; const failures = [];
const t = (name, cond) => (cond ? pass++ : failures.push(name));
const lev = (r, name) => r.levies.find((l) => l.levy === name);
const PRICE = 79;

// ── 1. THE MILLAGE TABLE ────────────────────────────────────────────────────
t('millage covers all 159 Georgia counties', Object.keys(MILLAGE).length === 159);
t('millage is the 2025 DOR digest', MILLAGE_TAX_YEAR === 2025);
t('every county has a county levy row and a school row',
  Object.keys(MILLAGE).every((c) => countyLevyRow(c) && MILLAGE[c].some((r) => r[0] === 'SCHOOL')));
// The two OCR misreads found by the second read (11 Oct). INJECTION: put 1.971 back -> FAILS.
t('every county school levy is a plausible rate (5–25 mills; catches OCR misreads like Colquitt 1.971)',
  Object.values(MILLAGE).every((rows) => { const s = rows.find((r) => r[0] === 'SCHOOL'); return s[1] >= 5 && s[1] <= 25; }));
t('spot values match the DOR page images (Cobb 8.46/18.7, DeKalb 22.78, Colquitt 7.777, Richmond inc 6.277)',
  countyLevyRow('COBB').mo === 8.46 && MILLAGE.COBB.find((r) => r[0] === 'SCHOOL')[1] === 18.7 &&
  MILLAGE.DEKALB.find((r) => r[0] === 'SCHOOL')[1] === 22.78 &&
  MILLAGE.COLQUITT.find((r) => r[0] === 'SCHOOL')[1] === 7.777 &&
  MILLAGE.RICHMOND.find((r) => r[0] === 'COUNTY INCORPORATED')[1] === 6.277);
t('every HB 581 county and independent school system exists in the millage table',
  Object.keys(HB581_STATUS).every((c) => MILLAGE[c]) &&
  Object.keys(IND_SCHOOL_STATUS).every((d) => Object.values(MILLAGE).some((rows) => rows.some((r) => r[0] === d))));
t('the HB 581 map covers the top 25 counties', Object.keys(HB581_STATUS).length === 25);

// ── 2. COUNTY LEVY CHOICE ───────────────────────────────────────────────────
// We do not know whether the home is inside a city, so the lower county rate is used.
// INJECTION: prefer the 'COUNTY INCORPORATED' row -> FAILS (Barrow 5.812, Colquitt 11.767 ...).
t('the county levy is never above either the city or non-city county rate (Barrow 4.232, not 5.812)',
  countyLevyRow('BARROW').mo === 4.232 &&
  Object.keys(MILLAGE).every((c) => {
    const k = countyLevyRow(c), tot = k.mo + k.bond;
    return MILLAGE[c].filter((x) => x[0] === 'COUNTY INCORPORATED' || x[0] === 'COUNTY UNINCORPORATED').every((x) => tot <= (x[1] || 0) + (x[2] || 0));
  }));
t('consolidated governments resolve (Muscogee urban service district)', countyLevyRow('MUSCOGEE')?.district === 'COUNTY USD 1 - URBAN');
t('Bibb and Clarke resolve to a county levy', !!countyLevyRow('BIBB') && !!countyLevyRow('CLARKE'));

// ── 3. THE ARITHMETIC ───────────────────────────────────────────────────────
t('Georgia assesses 40% of market value', ASSESSMENT_RATIO === 0.4);
let r = gaSavings({ county: 'DeKalb', homestead: true, reduction: 50000, price: PRICE });
// 50,000 x 0.40 x 22.78 / 1000 = 455.6
// INJECTION: drop ASSESSMENT_RATIO from the formula -> FAILS (1,139).
t('DeKalb homestead, $50,000 reduction: school levy only, $456 a year', r.ok && r.yearlySaving === 456 && lev(r, 'school').yearlySaving === 456);

// ── 4. HOMESTEAD CAPS ───────────────────────────────────────────────────────
// INJECTION: make moCounts ignore hb581 (always true for homesteads) -> FAILS.
t('DeKalb homestead: county is under HB 581, its operating levy counts $0', lev(r, 'county').moCounts === false && lev(r, 'county').yearlySaving === 0);
r = gaSavings({ county: 'DEKALB', homestead: false, reduction: 50000, price: PRICE });
t('the same DeKalb home WITHOUT a homestead counts both levies (HB 581 is homestead-only)',
  lev(r, 'county').moCounts && lev(r, 'school').moCounts && r.yearlySaving === Math.round(50000 * 0.4 * 11.638 / 1000) + 456);

r = gaSavings({ county: 'Gwinnett', homestead: true, reduction: 50000, price: PRICE });
// INJECTION: ignore localCap -> FAILS.
t('Gwinnett homestead: county opted out but its value-offset freeze caps it, so $0', lev(r, 'county').moCounts === false && /capped locally/.test(lev(r, 'county').reason));
t('Gwinnett homestead: the local freeze zeroes the county levy entirely, bond included', lev(r, 'county').yearlySaving === 0 && lev(r, 'county').mills === 0);
// HB 581 does not cap debt levies. INJECTION: drop bond from the formula -> FAILS.
t('Gwinnett homestead: the school BOND levy (1.45 mills) still counts', lev(r, 'school').bondMills === 1.45 && lev(r, 'school').mills === 18.7 + 1.45);
t('HB 581 does not cap bond: a county under HB 581 with a bond levy still counts the bond', (() => {
  const hn = gaSavings({ county: 'Fulton', homestead: true, reduction: 50000, price: PRICE });
  const c = lev(hn, 'county'); return !c.moCounts && c.bondMills > 0 && c.mills === c.bondMills && c.yearlySaving > 0;
})());
t('Gwinnett homestead: school (opted out, no local cap) counts', lev(r, 'school').moCounts === true);

r = gaSavings({ county: 'Fulton County', homestead: true, reduction: 100000, price: PRICE });
t('"Fulton County" is accepted as Fulton', r.ok && r.county === 'FULTON');
t('Fulton homestead: school capped by its own floating exemption, county under HB 581: only the county bond counts',
  !lev(r, 'county').moCounts && !lev(r, 'school').moCounts && lev(r, 'school').mills === 0 && r.millsCounted === Math.round((countyLevyRow('FULTON').bond) * 1000) / 1000);

r = gaSavings({ county: 'Muscogee', homestead: true, reduction: 80000, price: PRICE });
t('Muscogee homestead: the Columbus freeze caps both levies, so no bill change', r.verdict === 'no_bill_change' && r.yearlySaving === 0);

r = gaSavings({ county: 'Hall', homestead: true, reduction: 50000, price: PRICE });
t('Hall homestead: county opted out and counts; school is under HB 581 and does not', lev(r, 'county').moCounts && !lev(r, 'school').moCounts);

// ── 5. COUNTIES OUTSIDE THE VERIFIED MAP ────────────────────────────────────
r = gaSavings({ county: 'Colquitt', homestead: true, reduction: 50000, price: PRICE });
// INJECTION: treat a missing status as 'out' -> FAILS.
t('a county without a verified HB 581 status: homestead operating levies treated as capped, and said so',
  !lev(r, 'county').moCounts && !lev(r, 'school').moCounts && r.notes.some((n) => /not verified/.test(n)));
r = gaSavings({ county: 'Colquitt', homestead: false, reduction: 50000, price: PRICE });
t('...but a non-homestead there counts everything', lev(r, 'county').moCounts && lev(r, 'school').moCounts && r.yearlySaving > 0);
r = gaSavings({ county: 'Cobb', homestead: true, reduction: 50000, price: PRICE });
t('a county whose local exemptions are unchecked says so', r.notes.some((n) => /not been checked/.test(n)));

// ── 6. INDEPENDENT CITY SCHOOLS ─────────────────────────────────────────────
r = gaSavings({ county: 'Cobb', homestead: true, reduction: 50000, price: PRICE, indSchool: 'IND SCHOOL MARIETTA' });
t('Marietta City Schools replaces the Cobb school levy (17.97 mills, opted out)', lev(r, 'school').district === 'IND SCHOOL MARIETTA' && lev(r, 'school').moMills === 17.97 && lev(r, 'school').moCounts);
r = gaSavings({ county: 'Gwinnett', homestead: true, reduction: 50000, price: PRICE, indSchool: 'IND SCHOOL BUFORD' });
t('Buford City Schools (not on the opt-out list) is treated as capped', !lev(r, 'school').moCounts);
r = gaSavings({ county: 'Cobb', homestead: true, reduction: 50000, price: PRICE, indSchool: 'IND SCHOOL NOWHERE' });
t('an unknown independent school falls back to the county school levy, with a note', lev(r, 'school').district === 'SCHOOL' && r.notes.some((n) => /not found/.test(n)));

// ── 7. VERDICT ──────────────────────────────────────────────────────────────
t('the "marginal" band is under twice the price', THIN_MARGIN_MULTIPLE === 2);
const v = (reduction) => gaSavings({ county: 'Cobb', homestead: false, reduction, price: PRICE }).verdict;
// Cobb non-homestead counts county 8.46 + school 18.7 = 27.16 mills -> $10.864 per $1,000 of reduction.
t('saving below the price: saving_below_price', v(5000) === 'saving_below_price');      // $54
t('saving between 1x and 2x the price: marginal', v(10000) === 'marginal');             // $109
t('saving at 2x the price or more: worth_it', v(20000) === 'worth_it');                 // $217
t('three-year figure is reported separately as "up to"', (() => { const x = gaSavings({ county: 'Cobb', homestead: false, reduction: 20000, price: PRICE }); return x.threeYearSavingUpTo === 3 * x.yearlySaving; })());

// ── 8. INPUTS AND THE 2027 CLIFF ────────────────────────────────────────────
t('unknown county refused', gaSavings({ county: 'Atlantis', homestead: true, reduction: 1, price: PRICE }).reason === 'unknown_county');
t('no reduction refused', gaSavings({ county: 'Cobb', homestead: true, reduction: 0, price: PRICE }).reason === 'no_reduction');
// The homestead answer changes everything; it must never default.
t('homestead must be answered, never assumed', gaSavings({ county: 'Cobb', reduction: 1000, price: PRICE }).reason === 'need_homestead_answer');
// INJECTION: drop the provisional flag -> FAILS.
t('a 2027 homestead estimate is provisional (opt-outs must be re-adopted by 1 Mar 2027)',
  gaSavings({ county: 'Cobb', homestead: true, reduction: 50000, price: PRICE, taxYear: 2027 }).provisional === true);
t('a 2026 estimate is not provisional; nor is a non-homestead', gaSavings({ county: 'Cobb', homestead: true, reduction: 50000, price: PRICE, taxYear: 2026 }).provisional === false &&
  gaSavings({ county: 'Cobb', homestead: false, reduction: 50000, price: PRICE }).provisional === false);

console.log(`verify-ga-savings: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log('  FAIL:', f);
process.exit(failures.length ? 1 : 0);
