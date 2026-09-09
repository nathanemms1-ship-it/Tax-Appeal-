#!/usr/bin/env node
/**
 * Convert a Dallas CAD certified CSV export into a Postgres-COPY-ready CSV.
 *
 *   node scripts/tx/load-dcad.mjs --zip tx-data/Dallas/DCAD2026_CERTIFIED_07232026.zip \
 *                                 --out tx-data/Dallas/dallas_parcels.csv
 *   ... --limit 50000     # sample first
 *   ... --all             # keep non-residential too
 *
 * ============================================================================
 * WHY THIS IS A SEPARATE LOADER AND NOT A FLAG ON load.mjs
 * ============================================================================
 * Dallas does not run PACS. Its CAMA is an in-house system called MARS and the
 * export is a comma-delimited RELATIONAL SET — four tables joined on
 * ACCOUNT_NUM — where load.mjs reads one fixed-width record per property. There
 * is no shared parsing to reuse: different format, different join, different
 * field names, different residential codes. A shared loader with a `format`
 * branch would be two loaders wearing one name.
 *
 * What IS shared is the output: the same COLS in the same order, so push.mjs
 * loads this file exactly like a PACS one and nothing downstream knows.
 *
 * ============================================================================
 * THE TRAP THAT WOULD HAVE COST EVERY DALLAS CUSTOMER
 * ============================================================================
 * `HMSTD_CAP_VAL` is the CAPPED VALUE. It is not the cap loss, whatever the
 * name suggests and whatever DCAD's data dictionary says about a `CAPPED_HS_AMT`
 * column that does not exist in this CSV.
 *
 * Proven on the roll before a line of this was written: 806,563 accounts,
 * HMSTD_CAP_VAL <= TOT_VAL in every single one, ZERO rows where it exceeds
 * TOT_VAL, and it is non-zero on 100% of rows. A cap LOSS is zero for an
 * uncapped property; 73.7% of Dallas is uncapped and carries a non-zero value
 * here, equal to TOT_VAL.
 *
 *   TOT_VAL       -> market_value      (uncapped)
 *   HMSTD_CAP_VAL -> appraised_value   (capped — the § 41.43(b)(3) number)
 *   cap loss       = TOT_VAL - HMSTD_CAP_VAL
 *
 * Read the other way round, every one of the 594,121 uncapped Dallas properties
 * records a cap loss equal to its entire market value, qualify() returns
 * capped_beyond_reach, and we tell all of Dallas their protest cannot help them.
 * It would have looked like a market finding rather than a bug.
 *
 * This is the same shape as the PACS trap in lib/tx/pacs.js: appraised_val is
 * uncapped and assessed_val is capped, and the names say the opposite.
 *
 * ============================================================================
 * DALLAS PUBLISHES CONDITION, AND NOTHING ELSE WE HOLD DOES
 * ============================================================================
 * RES_DETAIL.CDU_RATING_DESC — Condition / Desirability / Utility:
 *
 *   GOOD 229,550 · AVERAGE 148,250 · VERY GOOD 140,640 · EXCELLENT 43,953
 *   UNASSIGNED 32,029 · FAIR 22,903 · MANUALLY ENTER DEPRECIATION 6,910
 *   POOR 3,027 · VERY POOR 844 · UNDESIRABLE 437
 *
 * 27,211 parcels (4.3%) sit below average. It is written to condition_code,
 * which has existed in the schema since the beginning and been null in every
 * district until now. See BELOW_AVERAGE_CONDITION in lib/tx/costToCure.js —
 * this is what makes the double-count disclosure fire for the first time.
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

const zip = arg('zip');
const county = arg('county', 'Dallas');
const cadId = Number(arg('cad') || countyCode(county));
const outPath = arg('out', 'tx-data/Dallas/dallas_parcels.csv');
const limit = Number(arg('limit', '0')) || 0;
const residentialOnly = !has('all');

if (!zip || !Number.isFinite(cadId)) {
  console.error('usage: node scripts/tx/load-dcad.mjs --zip <export.zip> [--county Dallas] [--out <file>] [--limit N] [--all]');
  process.exit(1);
}

/** Same columns, same order as scripts/tx/load.mjs, plus condition_code. */
const COLS = [
  'cad_id', 'account_number', 'tax_year',
  'market_value', 'appraised_value', 'homestead_cap_loss', 'nhs_cap_loss',
  'land_value', 'improvement_value',
  'living_area', 'year_built', 'quality_class', 'condition_code',
  'land_size_acres', 'land_size_sqft',
  'neighborhood_code', 'abs_subdv_cd', 'state_class_code',
  'situs_street', 'situs_city', 'situs_zip',
  'has_homestead', 'arb_protest_flag',
  'source_format',
];

/**
 * CDU ratings that mean the district has ALREADY discounted for condition.
 *
 * Only these four. "UNASSIGNED" and "MANUALLY ENTER DEPRECIATION" are not
 * condition findings — the first is an absent rating and the second says the
 * appraiser overrode the depreciation table, which tells us nothing about the
 * house. Treating either as below-average would fire a double-count disclosure
 * at 38,939 owners the district never rated poorly.
 */
const BELOW_AVERAGE = new Set(['FAIR', 'POOR', 'VERY POOR', 'UNDESIRABLE']);

function memberLines(zipPath, member) {
  const p = spawn('unzip', ['-p', zipPath, member], { stdio: ['ignore', 'pipe', 'ignore'] });
  return { rl: createInterface({ input: p.stdout, crlfDelay: Infinity }), proc: p };
}

/**
 * A CSV line splitter, rather than a dependency.
 *
 * DCAD quotes every field and doubles internal quotes. Street names in this roll
 * genuinely contain commas, so splitting on ',' loses the address — which is the
 * one field a customer is matched on.
 */
function splitCsv(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function readTable(member, want, onRow) {
  const { rl } = memberLines(zip, member);
  let idx = null;
  let n = 0;
  for await (const line of rl) {
    if (!line) continue;
    const cells = splitCsv(line);
    if (idx === null) {
      idx = {};
      cells.forEach((h, i) => { idx[h.trim().replace(/^"|"$/g, '')] = i; });
      for (const w of want) {
        if (!(w in idx)) throw new Error(`${member}: expected column ${w}, header has ${cells.length} columns`);
      }
      continue;
    }
    const row = {};
    for (const w of want) row[w] = (cells[idx[w]] || '').trim();
    onRow(row);
    n++;
  }
  return n;
}

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const s = String(v);
  return s === '' ? '' : `"${s.replace(/"/g, '""')}"`;
};

console.log(`${basename(zip)}`);
console.log(`  ${county} County — cad_id ${cadId}`);

// ── 1. residential detail: living area, year built, class, CONDITION ─────────
const res = new Map();
let cduCounts = new Map();
let resRows = 0;
let resDupes = 0;
{
  resRows = await readTable('*RES_DETAIL.CSV', [
    'ACCOUNT_NUM', 'BLDG_CLASS_DESC', 'YR_BUILT', 'CDU_RATING_DESC',
    'TOT_MAIN_SF', 'TOT_LIVING_AREA_SF',
  ], (r) => {
    const acct = r.ACCOUNT_NUM;
    if (!acct) return;
    const cdu = (r.CDU_RATING_DESC || '').toUpperCase();
    cduCounts.set(cdu, (cduCounts.get(cdu) || 0) + 1);

    const area = num(r.TOT_LIVING_AREA_SF) || num(r.TOT_MAIN_SF);
    const prior = res.get(acct);
    if (prior) {
      /**
       * 86 accounts carry more than one RES_DETAIL row — more than one dwelling
       * on the parcel. Living area SUMS (both are living space on the property
       * being valued); year built takes the OLDEST, because a 1950 house with a
       * 2019 guest house is a 1950 property to a comparison. Condition takes the
       * worse of the two for the same reason.
       */
      resDupes++;
      prior.living_area = (prior.living_area || 0) + (area || 0);
      if (num(r.YR_BUILT) && (!prior.year_built || num(r.YR_BUILT) < prior.year_built)) {
        prior.year_built = num(r.YR_BUILT);
      }
      if (BELOW_AVERAGE.has(cdu)) prior.condition_code = cdu;
      return;
    }
    res.set(acct, {
      living_area: area,
      year_built: num(r.YR_BUILT),
      quality_class: r.BLDG_CLASS_DESC || null,
      // Stored as the district wrote it, uppercased. Not translated to a scale:
      // conditionDiscountRisk decides meaning, this only records the fact.
      condition_code: cdu && cdu !== 'UNASSIGNED' ? cdu : null,
    });
  });
  console.log(`  pass 1/3  residential detail — ${res.size.toLocaleString()} accounts`
    + (resDupes ? `, ${resDupes.toLocaleString()} with a second dwelling merged` : ''));
}

// ── 2. land: lot size ────────────────────────────────────────────────────────
const land = new Map();
{
  await readTable('*LAND.CSV', ['ACCOUNT_NUM', 'AREA_SIZE', 'AREA_UOM_DESC'], (r) => {
    const acct = r.ACCOUNT_NUM;
    const size = num(r.AREA_SIZE);
    if (!acct || !size) return;
    const uom = (r.AREA_UOM_DESC || '').toUpperCase();
    const sqft = uom.startsWith('ACRE') ? size * 43560 : size;
    const prior = land.get(acct) || { sqft: 0 };
    prior.sqft += sqft;          // multiple land sections sum
    land.set(acct, prior);
  });
  console.log(`  pass 2/3  land — ${land.size.toLocaleString()} accounts with segments`);
}

// ── 3. account info: address, neighborhood ───────────────────────────────────
const info = new Map();
{
  await readTable('*ACCOUNT_INFO.CSV', [
    'ACCOUNT_NUM', 'STREET_NUM', 'STREET_HALF_NUM', 'FULL_STREET_NAME',
    'BLDG_ID', 'UNIT_ID', 'PROPERTY_CITY', 'PROPERTY_ZIPCODE', 'NBHD_CD',
  ], (r) => {
    if (!r.ACCOUNT_NUM) return;
    const street = [r.STREET_NUM, r.STREET_HALF_NUM, r.FULL_STREET_NAME]
      .map((x) => (x || '').trim()).filter(Boolean).join(' ');
    info.set(r.ACCOUNT_NUM, {
      situs_street: street || null,
      situs_city: r.PROPERTY_CITY || null,
      situs_zip: (r.PROPERTY_ZIPCODE || '').slice(0, 10) || null,
      neighborhood_code: r.NBHD_CD || null,
    });
  });
  console.log(`  pass 3/3  account info — ${info.size.toLocaleString()} accounts`);
}

// ── 4. values, and the write ─────────────────────────────────────────────────
const out = createWriteStream(outPath);
out.write(COLS.join(',') + '\n');

let read = 0; let written = 0; let capped = 0; let noLivingArea = 0; let belowAvg = 0;
let capBad = 0;
const excluded = new Map();
const taxYear = new Map();

await readTable('*ACCOUNT_APPRL_YEAR.CSV', [
  'ACCOUNT_NUM', 'APPRAISAL_YR', 'IMPR_VAL', 'LAND_VAL', 'TOT_VAL',
  'HMSTD_CAP_VAL', 'SPTD_CODE',
], (r) => {
  if (limit && written >= limit) return;
  read++;

  const stateCd = (r.SPTD_CODE || '').trim().toUpperCase();
  if (residentialOnly && stateCd[0] !== 'A') {
    excluded.set('not_residential', (excluded.get('not_residential') || 0) + 1);
    return;
  }

  const market = num(r.TOT_VAL);
  const appraised = num(r.HMSTD_CAP_VAL);
  if (!market) {
    excluded.set('no_value_on_roll', (excluded.get('no_value_on_roll') || 0) + 1);
    return;
  }

  /**
   * THE INVARIANT THAT PROVES THE CAP FIELDS ARE THE RIGHT WAY ROUND.
   *
   * A capped value can never exceed market value. If this ever trips, the two
   * columns have been swapped and every downstream number is wrong — so it is
   * counted and reported rather than silently clamped.
   */
  if (appraised !== null && market !== null && appraised > market + 1) capBad++;

  const capLoss = (market !== null && appraised !== null && market > appraised)
    ? Math.round(market - appraised) : 0;
  if (capLoss > 0) capped++;

  const d = res.get(r.ACCOUNT_NUM) || {};
  const l = land.get(r.ACCOUNT_NUM) || {};
  const a = info.get(r.ACCOUNT_NUM) || {};
  if (!d.living_area) noLivingArea++;
  if (d.condition_code && BELOW_AVERAGE.has(d.condition_code)) belowAvg++;

  const yr = Number(r.APPRAISAL_YR) || null;
  if (yr) taxYear.set(yr, (taxYear.get(yr) || 0) + 1);

  const row = {
    cad_id: cadId,
    account_number: r.ACCOUNT_NUM,
    tax_year: yr,
    market_value: market,
    appraised_value: appraised ?? market,
    homestead_cap_loss: capLoss,
    // Dallas publishes no separate § 23.231 circuit-breaker figure. Zero, not
    // null: null would read as "unknown" and qualify() treats it as absent.
    nhs_cap_loss: 0,
    land_value: num(r.LAND_VAL),
    improvement_value: num(r.IMPR_VAL),
    living_area: d.living_area || null,
    year_built: d.year_built || null,
    quality_class: d.quality_class || null,
    condition_code: d.condition_code || null,
    land_size_acres: l.sqft ? Math.round((l.sqft / 43560) * 1000) / 1000 : null,
    land_size_sqft: l.sqft ? Math.round(l.sqft) : null,
    neighborhood_code: a.neighborhood_code || null,
    // DCAD publishes no abstract/subdivision code in this export. The comps
    // ladder degrades to neighborhood_code, which Dallas does publish.
    abs_subdv_cd: null,
    state_class_code: stateCd || null,
    situs_street: a.situs_street || null,
    situs_city: a.situs_city || null,
    situs_zip: a.situs_zip || null,
    has_homestead: capLoss > 0 ? true : null,
    arb_protest_flag: null,
    source_format: 'DCAD',
  };
  out.write(COLS.map((c) => csvCell(row[c])).join(',') + '\n');
  written++;
  if (written % 50000 === 0) process.stderr.write(`            ${written.toLocaleString()} rows...\n`);
});

await new Promise((r) => out.end(r));

// ── 5. report, and refuse to look successful when it is not ─────────────────
const pct = (n, d) => (d ? (n * 100 / d).toFixed(1) : '0.0');
console.log(`\n${basename(zip)} -> ${outPath}`);
console.log(`  read      ${read.toLocaleString()}`);
console.log(`  written   ${written.toLocaleString()}`);
for (const [why, n] of [...excluded].sort((a, b) => b[1] - a[1])) {
  console.log(`  excluded  ${n.toLocaleString().padStart(9)}  ${why}`);
}

console.log('\n  QUALIFICATION PICTURE (this is the money question)');
console.log(`    homestead capped              ${capped.toLocaleString().padStart(9)}  ${pct(capped, written)}%`
  + '  <- a won protest may move the bill $0');
console.log(`    no living area on file        ${noLivingArea.toLocaleString().padStart(9)}  ${pct(noLivingArea, written)}%`
  + '  <- cannot be size-adjusted as a comp');
console.log(`    district rates BELOW AVERAGE  ${belowAvg.toLocaleString().padStart(9)}  ${pct(belowAvg, written)}%`
  + '  <- double-count disclosure fires');

console.log('\n  CDU ratings seen in RES_DETAIL:');
for (const [k, n] of [...cduCounts].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`    ${n.toLocaleString().padStart(9)}  ${k || '(blank)'}${BELOW_AVERAGE.has(k) ? '   <- below average' : ''}`);
}

const years = [...taxYear].sort((a, b) => b[1] - a[1]);
console.log(`\n  appraisal year: ${years.map(([y, n]) => `${y} (${n.toLocaleString()})`).join(', ')}`);

let bad = false;
if (capBad) {
  console.log(`\n✗ ${capBad.toLocaleString()} rows have HMSTD_CAP_VAL ABOVE TOT_VAL.`);
  console.log('  A capped value cannot exceed market value. The two columns are');
  console.log('  swapped, or the export changed shape. Do not load this file.');
  bad = true;
}
if (written && noLivingArea / written > 0.5) {
  console.log(`\n✗ ${pct(noLivingArea, written)}% of parcels have NO living area.`);
  console.log('  RES_DETAIL did not join. Check ACCOUNT_NUM formatting on both sides.');
  bad = true;
}
if (!bad) {
  console.log('\nLoad it with:');
  console.log(`  node scripts/tx/push.mjs --county ${county}`);
}
process.exit(bad ? 1 : 0);
