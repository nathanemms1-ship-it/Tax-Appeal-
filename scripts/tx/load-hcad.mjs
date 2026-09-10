#!/usr/bin/env node
/**
 * Convert the Harris Central Appraisal District export into a COPY-ready CSV.
 *
 *   node scripts/tx/load-hcad.mjs
 *   ... --limit 50000     # sample first
 *   ... --all             # keep non-residential too
 *
 * ============================================================================
 * WHY A THIRD LOADER
 * ============================================================================
 * HCAD is neither PACS fixed-width (load.mjs) nor Dallas's comma-delimited MARS
 * set (load-dcad.mjs). It is TAB-delimited ASCII with header rows, split across
 * two archives that join on `acct`. There is no parsing to share.
 *
 * What IS shared is the output: the same COLS in the same order, so push.mjs
 * loads this file exactly like the other two and nothing downstream can tell.
 *
 * ============================================================================
 * THE TWO QUESTIONS ANSWERED BEFORE THIS WAS WRITTEN
 * ============================================================================
 * Both settled by reading the roll on 10 Sept 2026 rather than a data
 * dictionary — the lesson HMSTD_CAP_VAL taught in Dallas.
 *
 * 1. IS CAP LOSS market MINUS appraised?  YES.
 *
 *    Across all 1,628,282 rows tot_appr_val is NEVER above tot_mkt_val. Zero
 *    inversions. The Dallas trap does not exist here.
 *
 *      tot_mkt_val  -> market_value     (uncapped — what a protest moves)
 *      tot_appr_val -> appraised_value  (capped — the § 41.43(b)(3) number)
 *      cap loss      = tot_mkt_val - tot_appr_val
 *
 * 2. CAN `Cap_acct` SAY WHICH ROWS ARE CAPPED?  NO. IT IS NOT READ HERE.
 *
 *    It disagrees with the value fields in both directions:
 *      - 21,668 rows carry a real gap while flagged N — 2,424 of them class A1.
 *        In every one land_val+bld_val+x_features_val+ag_val reconstructs market
 *        exactly and appraised sits below it. Real limitations the flag missed.
 *      - 5,467 rows are flagged Y with no gap at all.
 *
 *    The value fields are self-consistent and the flag is not, so the values
 *    win. has_homestead is derived from the gap, exactly as load-dcad.mjs does.
 *
 *    Its third value, `Pending` (16,634 rows), is the one thing it says that the
 *    values do not: no value has been set yet. Those rows have tot_mkt_val 0 and
 *    are written anyway — a customer looking one up must hear "no value on the
 *    roll yet" (CAUTION_CODES.NO_VALUE) and not "we have no record of your
 *    property", which is the sentence Florida spent four weeks learning not to
 *    say.
 *
 * ============================================================================
 * HARRIS PUBLISHES QUALITY, NOT CONDITION
 * ============================================================================
 * building_res.qa_cd is a six-level QUALITY grade:
 *
 *   X Superior 13,580 · A Excellent 79,855 · B Good 326,961 ·
 *   C Average 788,686 · D Low 104,520 · E Very Low 5,214
 *
 * That is the same kind of field as Dallas's BLDG_CLASS_DESC, not its
 * CDU_RATING_DESC. It goes to quality_class. condition_code stays NULL and
 * Harris is deliberately ABSENT from BELOW_AVERAGE_CONDITION in
 * lib/tx/costToCure.js: a quality grade is how well the house was built, not a
 * finding that it is in poor repair, and it must not fire the double-count
 * disclosure at 109,734 owners the district never inspected.
 *
 * building_res.accrued_depr_pct is a real per-building depreciation figure and
 * is the closest thing Harris has to condition. Not used yet — recorded here so
 * the next person does not have to rediscover it.
 *
 * ============================================================================
 * ONE MALFORMED ROW, COUNTED RATHER THAN REPAIRED
 * ============================================================================
 * Account 1423450120001 carries a TAB inside its owner name, giving 72 fields
 * instead of 71 and shifting every value after column 3. It is class Z5 so it
 * never reaches a residential customer — but the shift is SILENT, and a roll
 * that grows a second such row next quarter would load garbage into a real
 * account. Rows whose field count is wrong are rejected and COUNTED, and this
 * refuses to report success if the count stops being tiny.
 */

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename } from 'node:path';
import { countyCode } from '../../lib/tx/counties.js';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : fallback;
};
const has = (n) => process.argv.includes(`--${n}`);

const acctZip = arg('acct-zip', 'tx-data/Harris/Real_acct_owner.zip');
const bldZip = arg('bld-zip', 'tx-data/Harris/Real_building_land.zip');
const county = arg('county', 'Harris');
const cadId = Number(arg('cad') || countyCode(county));
const outPath = arg('out', 'tx-data/Harris/harris_parcels.csv');
const limit = Number(arg('limit', '0')) || 0;
const residentialOnly = !has('all');

if (!Number.isFinite(cadId)) {
  console.error('usage: node scripts/tx/load-hcad.mjs [--acct-zip f] [--bld-zip f] [--out f] [--limit N] [--all]');
  process.exit(1);
}

/** Same columns and order as load.mjs / load-dcad.mjs, plus effective_year_built. */
const COLS = [
  'cad_id', 'account_number', 'tax_year',
  'market_value', 'appraised_value', 'homestead_cap_loss', 'nhs_cap_loss',
  'land_value', 'improvement_value',
  'living_area', 'year_built', 'effective_year_built', 'quality_class', 'condition_code',
  'land_size_acres', 'land_size_sqft',
  'neighborhood_code', 'abs_subdv_cd', 'state_class_code',
  'situs_street', 'situs_city', 'situs_zip',
  'has_homestead', 'arb_protest_flag',
  'source_format',
];

/** real_acct.txt — 71 columns. 0-based indices, verified against the header. */
const A = {
  acct: 0, yr: 1,
  site_addr_1: 17, site_addr_2: 18, site_addr_3: 19,
  state_class: 20, neighborhood_code: 24,
  yr_impr: 33, land_ar: 39, acreage: 40,
  land_val: 43, bld_val: 44,
  tot_appr_val: 48, tot_mkt_val: 49,
  protested: 61,
};
const A_FIELDS = 71;

/** building_res.txt — 31 columns. */
const B = { acct: 0, qa_cd: 10, date_erected: 12, eff: 13, heat_ar: 21 };
const B_FIELDS = 31;

/**
 * qa_cd, best to worst. Where an account carries more than one building we keep
 * the WORSE grade, for the same reason the year built takes the oldest: a
 * comparison is to the property, and the property is only as good as the part
 * of it a buyer would flinch at.
 */
const QUALITY_BEST_TO_WORST = ['X', 'A', 'B', 'C', 'D', 'E'];
function worseQuality(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  const ia = QUALITY_BEST_TO_WORST.indexOf(a);
  const ib = QUALITY_BEST_TO_WORST.indexOf(b);
  if (ia < 0) return b;
  if (ib < 0) return a;
  return ia >= ib ? a : b;
}

function memberLines(zipPath, member) {
  const p = spawn('unzip', ['-p', zipPath, member], { stdio: ['ignore', 'pipe', 'ignore'] });
  return createInterface({ input: p.stdout, crlfDelay: Infinity });
}

const t = (v) => (v === undefined || v === null ? '' : String(v).trim());
const num = (v) => {
  const s = t(v).replace(/[$,]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const s = String(v);
  return s === '' ? '' : `"${s.replace(/"/g, '""')}"`;
};

console.log(`${basename(acctZip)} + ${basename(bldZip)}`);
console.log(`  ${county} County — cad_id ${cadId}`);

// ── 1. residential buildings: living area, year built, quality ───────────────
const bld = new Map();
let bldRows = 0;
let bldRagged = 0;
let bldMerged = 0;
{
  const rl = memberLines(bldZip, 'building_res.txt');
  let header = true;
  for await (const line of rl) {
    if (!line) continue;
    if (header) { header = false; continue; }
    const f = line.split('\t');
    if (f.length !== B_FIELDS) { bldRagged++; continue; }
    bldRows++;
    const acct = t(f[B.acct]);
    if (!acct) continue;

    const area = num(f[B.heat_ar]);
    const yr = num(f[B.date_erected]);
    const eff = num(f[B.eff]);
    const qa = t(f[B.qa_cd]).toUpperCase() || null;

    const prior = bld.get(acct);
    if (prior) {
      // 25,602 accounts (2.0%) carry more than one building. Living area SUMS —
      // both are heated space on the property being valued. Year built and
      // effective year take the OLDEST: a 1950 house with a 2019 guest house is
      // a 1950 property to a comparison. Quality takes the worse.
      bldMerged++;
      if (area) prior.living_area = (prior.living_area || 0) + area;
      if (yr && yr > 1700 && (!prior.year_built || yr < prior.year_built)) prior.year_built = yr;
      if (eff && eff > 1700 && (!prior.effective_year_built || eff < prior.effective_year_built)) {
        prior.effective_year_built = eff;
      }
      prior.quality_class = worseQuality(prior.quality_class, qa);
      continue;
    }
    bld.set(acct, {
      living_area: area,
      year_built: yr && yr > 1700 ? yr : null,
      effective_year_built: eff && eff > 1700 ? eff : null,
      quality_class: qa,
    });
  }
  console.log(`  pass 1/2  building_res — ${bld.size.toLocaleString()} accounts`
    + (bldMerged ? `, ${bldMerged.toLocaleString()} with a second building merged` : '')
    + (bldRagged ? `, ${bldRagged.toLocaleString()} RAGGED` : ''));
}

// ── 2. accounts: values, situs, class ────────────────────────────────────────
const out = createWriteStream(outPath);
out.write(COLS.join(',') + '\n');

let read = 0;
let written = 0;
let ragged = 0;
let capBad = 0;
let noLivingArea = 0;
let noValue = 0;
let years = new Map();
const excluded = new Map();
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);

{
  const rl = memberLines(acctZip, 'real_acct.txt');
  let header = true;
  for await (const line of rl) {
    if (!line) continue;
    if (header) { header = false; continue; }

    const f = line.split('\t');
    if (f.length !== A_FIELDS) { ragged++; continue; }
    read++;

    const stateCd = t(f[A.state_class]).toUpperCase();
    if (residentialOnly && stateCd[0] !== 'A') { bump(excluded, 'not_residential'); continue; }

    const acct = t(f[A.acct]);
    if (!acct) { bump(excluded, 'no_account_number'); continue; }

    const market = num(f[A.tot_mkt_val]);
    const appraised = num(f[A.tot_appr_val]);

    // The Dallas inversion, checked on every row rather than assumed absent.
    // Proven zero on this roll; if a future export flips the two fields this
    // catches it before anyone is told their protest cannot help them.
    if (market !== null && appraised !== null && appraised > market + 1) capBad++;

    const capLoss = (market !== null && appraised !== null && market > appraised)
      ? Math.round(market - appraised) : 0;

    if (!market) noValue++;

    const b = bld.get(acct) || {};
    if (!b.living_area) noLivingArea++;

    bump(years, t(f[A.yr]));

    const row = {
      cad_id: cadId,
      account_number: acct,
      tax_year: num(f[A.yr]),
      market_value: market,
      appraised_value: appraised,
      homestead_cap_loss: capLoss,
      nhs_cap_loss: 0,
      land_value: num(f[A.land_val]),
      improvement_value: num(f[A.bld_val]),
      living_area: b.living_area || null,
      year_built: b.year_built || (num(f[A.yr_impr]) > 1700 ? num(f[A.yr_impr]) : null),
      effective_year_built: b.effective_year_built || null,
      quality_class: b.quality_class || null,
      // Harris publishes no condition rating. See the header — qa_cd is quality.
      condition_code: null,
      land_size_acres: num(f[A.acreage]),
      land_size_sqft: num(f[A.land_ar]),
      neighborhood_code: t(f[A.neighborhood_code]) || null,
      // HCAD publishes no abstract/subdivision code in real_acct.txt. Comps fall
      // back to neighborhood_code, which Harris populates densely.
      abs_subdv_cd: null,
      state_class_code: stateCd || null,
      situs_street: t(f[A.site_addr_1]) || null,
      situs_city: t(f[A.site_addr_2]) || null,
      situs_zip: t(f[A.site_addr_3]) || null,
      has_homestead: capLoss > 0 ? true : null,
      arb_protest_flag: t(f[A.protested]).toUpperCase() === 'Y',
      source_format: 'HCAD',
    };

    out.write(COLS.map((c) => csvCell(row[c])).join(',') + '\n');
    written++;
    if (limit && written >= limit) break;
  }
}

await new Promise((r) => out.end(r));

// ── 3. refuse to call a bad load a good one ──────────────────────────────────
console.log(`  pass 2/2  real_acct — ${read.toLocaleString()} read, ${written.toLocaleString()} written`);
for (const [k, v] of excluded) console.log(`            excluded ${k}: ${v.toLocaleString()}`);
console.log(`            tax years: ${[...years].map(([y, n]) => `${y} (${n.toLocaleString()})`).join(', ')}`);
console.log(`            no living area: ${noLivingArea.toLocaleString()}`
  + ` (${written ? (100 * noLivingArea / written).toFixed(1) : '0'}%)`);
console.log(`            no value on roll: ${noValue.toLocaleString()}`);
console.log(`  -> ${outPath}`);

const problems = [];
if (capBad) {
  problems.push(`${capBad.toLocaleString()} rows have tot_appr_val ABOVE tot_mkt_val. `
    + `That is the Dallas HMSTD_CAP_VAL inversion appearing in Harris. Every one of `
    + `those accounts would be told its protest cannot help. Do not push this file.`);
}
// One malformed row in 1.63 M is the known owner-name tab. A jump means the
// export changed shape, and a shifted row loads real numbers into wrong fields.
if (ragged > 25) {
  problems.push(`${ragged.toLocaleString()} rows in real_acct.txt do not have ${A_FIELDS} fields. `
    + `One is expected (account 1423450120001, a tab inside the owner name). This many `
    + `means the export changed shape — re-read the header before trusting any of it.`);
}
if (bldRagged > 25) {
  problems.push(`${bldRagged.toLocaleString()} rows in building_res.txt do not have ${B_FIELDS} fields. `
    + `Zero are expected.`);
}
// Tarrant arrived 99.1% missing living area because RESMAIN was unrecognised and
// it looked like a quiet county rather than a broken parser.
if (written && noLivingArea / written > 0.5) {
  problems.push(`${(100 * noLivingArea / written).toFixed(1)}% of written rows have no living area. `
    + `Harris measured 100% coverage on class A1, so this is a join or column failure, `
    + `not a thin roll. Check that building_res.txt parsed and that acct keys match.`);
}
if (years.size > 1) {
  problems.push(`more than one tax year in the export: ${[...years.keys()].join(', ')}. `
    + `tx_parcels is keyed on (cad_id, account_number, tax_year) and mixing years silently `
    + `doubles the roll.`);
}

if (problems.length) {
  console.error('\n✗ NOT SAFE TO PUSH\n');
  for (const p of problems) console.error(`  - ${p}\n`);
  process.exit(1);
}
console.log(`\n✓ ${written.toLocaleString()} rows ready to push`
  + (ragged ? ` (${ragged} malformed row(s) rejected, as expected)` : '') + '\n');
