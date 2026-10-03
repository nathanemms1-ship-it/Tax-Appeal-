#!/usr/bin/env node
/**
 * Convert a tab-delimited "external*.tab" appraisal export into a
 * Postgres-COPY-ready CSV with the same columns as scripts/tx/load.mjs.
 *
 *   node scripts/tx/load-tab.mjs --zip tx-data/Bell/2026-Bell-County-Certified-Export-1.zip \
 *                                --county Bell --out tx-data/Bell/bell_parcels.csv
 *   node scripts/tx/load-tab.mjs --zip tx-data/Johnson/johnson_2026_certified.zip \
 *                                --county Johnson --out tx-data/Johnson/johnson_parcels.csv
 *   ... --limit 50000   sample first        ... --all   keep non-residential too
 *   ... --year 2026     the roll year (the export carries no year column)
 *
 * ============================================================================
 * WHO SHIPS THIS
 * ============================================================================
 * Bell (14) and Johnson (126), added 3 Oct 2026. Twelve tab files - externalnal,
 * externalbld, externalland, externalexemptions, externalacreage, ... - with a
 * header row. Bell publishes an "Appraisal Export Layout 8.0.33.xlsx" for a PACS
 * format it does not ship; this is what it ships. The two districts' externalnal
 * headers are NOT identical (Johnson adds ACCOUNT / GEO ACCOUNT NUM / PTD columns
 * and writes "CB CAP EXEMPT VAL," with a stray comma), so every field is read BY
 * HEADER NAME, never by position.
 *
 * externalnal carries one row per account with everything comps need: the
 * district's own heated area, year built, NBHD CD, subdivision, state class and
 * all four value stages. Living area therefore needs no segment-pattern logic -
 * BLDG HEAT AREA is the district's own statement of it.
 *
 * ============================================================================
 * THE VALUE FIELDS - SAME TRAP AS PACS, VERIFIED ON BOTH ROLLS
 * ============================================================================
 *   MKT VAL            -> market_value
 *   APPRAISED VAL      -> the district's PRE-cap figure (equals MKT VAL except
 *                         on productivity land); used only for the invariant
 *   HMS CAP EXEMPT VAL -> homestead_cap_loss   (§ 23.23)
 *   CB CAP EXEMPT VAL  -> nhs_cap_loss         (§ 23.231 circuit breaker)
 *   ASSESSED VALUE     -> appraised_value      (Tax Code: AFTER the caps)
 *
 *   APPRAISED - HMS CAP - CB CAP = ASSESSED
 * held on 60,592 of 60,592 Johnson class-A rows and 112,834 of 113,675 Bell
 * rows; every Bell miss was within $5 (rounding). The loader re-checks it and
 * refuses the file if more than 1% of rows miss by more than $5.
 *
 * ============================================================================
 * DUPLICATE ROWS
 * ============================================================================
 * Both rolls repeat some accounts (Johnson 569, Bell 13 among class A), almost
 * always as identical rows. The first row is kept; a repeat whose market value
 * differs is counted and printed so it is never silently resolved.
 */

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename } from 'node:path';
import { countyCode } from '../../lib/tx/counties.js';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};
const has = (n) => process.argv.includes(`--${n}`);

const zip = arg('zip');
const county = arg('county', '');
const cadId = Number(arg('cad') || (county ? countyCode(county) : NaN));
const outPath = arg('out', 'tx_parcels.csv');
const limit = Number(arg('limit', '0')) || 0;
const taxYear = Number(arg('year', '2026'));
const residentialOnly = !has('all');

if (!zip || !Number.isFinite(cadId)) {
  console.error('usage: node scripts/tx/load-tab.mjs --zip <export.zip> --county <name> [--cad <code>] [--out <file>] [--year 2026] [--limit N] [--all]');
  process.exit(2);
}
if (!basename(zip).includes(String(taxYear))) {
  console.error(`✗ ${basename(zip)} does not name ${taxYear}. This export carries no year column, so the file name is the only check - pass --year explicitly if it is right.`);
  if (!arg('year')) process.exit(1);
}

/** Same columns, same order as scripts/tx/load.mjs. */
const COLS = [
  'cad_id', 'account_number', 'tax_year',
  'market_value', 'appraised_value', 'homestead_cap_loss', 'nhs_cap_loss',
  'land_value', 'improvement_value',
  'living_area', 'year_built', 'quality_class',
  'land_size_acres', 'land_size_sqft',
  'neighborhood_code', 'abs_subdv_cd', 'state_class_code',
  'situs_street', 'situs_city', 'situs_zip',
  'has_homestead', 'arb_protest_flag',
  'source_format',
];

// An over-65 or disabled-veteran homestead exemption is only granted on a
// homestead, so any of these marks the account as one.
const HOMESTEAD_EXEMPTIONS = new Set(['HS', 'HSLOC', 'DVHS', 'O65', 'O65LOC', 'DVO65']);

function memberLines(member) {
  const p = spawn('unzip', ['-p', zip, member], { stdio: ['ignore', 'pipe', 'ignore'] });
  return { rl: createInterface({ input: p.stdout, crlfDelay: Infinity }), proc: p };
}

const clean = (v) => {
  const s = (v ?? '').trim();
  return s === '' || s.toUpperCase() === 'NULL' ? null : s;
};
const numOf = (v) => {
  const s = clean(v);
  if (s === null) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};
const header = (line) => line.split('\t').map((h) => h.trim().replace(/,$/, '').toUpperCase());

function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const s = String(v);
  return s === '' ? '' : `"${s.replace(/"/g, '""')}"`;
}

console.log(`${basename(zip)}\n  ${county} County — cad_id ${cadId}, roll year ${taxYear}`);

// ── 1. homestead exemptions, keyed like externalnal's first column ──────────
const homestead = new Set();
{
  const { rl } = memberLines('externalexemptions.tab');
  let h = null;
  for await (const line of rl) {
    if (!h) { h = header(line); continue; }
    const c = line.split('\t');
    if (HOMESTEAD_EXEMPTIONS.has((c[2] || '').trim().toUpperCase())) homestead.add(c[0].trim());
  }
  console.log(`  pass 1/3  exemptions        ${homestead.size.toLocaleString()} homestead accounts`);
}

// ── 2. acreage, keyed by strap (second column in every file) ────────────────
const acreage = new Map();
{
  const { rl } = memberLines('externalacreage.tab');
  let h = null;
  for await (const line of rl) {
    if (!h) { h = header(line); continue; }
    const c = line.split('\t');
    const a = numOf(c[2]);
    if (a) acreage.set(c[1].trim(), a);
  }
  console.log(`  pass 2/3  acreage           ${acreage.size.toLocaleString()} parcels`);
}

// ── 3. externalnal, one row per account ─────────────────────────────────────
const REQUIRED = ['PARCEL USE CD', 'MKT VAL', 'APPRAISED VAL', 'HMS CAP EXEMPT VAL', 'CB CAP EXEMPT VAL',
  'ASSESSED VALUE', 'LAND MKT VALUE', 'TOTAL BUILDING VALUE', 'BLDG HEAT AREA', 'YEAR_BUILT', 'NBHD CD',
  'SUBDIVISION', 'SITUS STREET NUM', 'SITUS STREET NAME', 'SITUS STREET SFX', 'SITUS CITY', 'LAND SQFT'];

const out = createWriteStream(outPath);
out.write(COLS.join(',') + '\n');
const seen = new Map();
const excluded = new Map();
const bump = (why) => excluded.set(why, (excluded.get(why) || 0) + 1);
let read = 0, written = 0, dupSame = 0, short = 0, invariantMiss = 0, capped = 0, nhsCapped = 0, noArea = 0;
const dupDiffer = [];
let ix = null;
const { rl, proc } = memberLines('externalnal.tab');
for await (const line of rl) {
  if (!ix) {
    const h = header(line);
    const missing = REQUIRED.filter((k) => !h.includes(k));
    if (missing.length) {
      console.error(`✗ externalnal.tab has no ${missing.join(', ')}. Not the format this loader reads.`);
      process.exit(1);
    }
    ix = Object.fromEntries(h.map((k, i) => [k, i]));
    continue;
  }
  const c = line.split('\t');
  if (c.length <= ix['ASSESSED VALUE']) { short++; continue; }
  read++;
  const g = (k) => c[ix[k]];
  const stateCd = (clean(g('PARCEL USE CD')) || '').toUpperCase();
  if (residentialOnly && stateCd[0] !== 'A') { bump('not_residential'); continue; }

  const account = clean(c[0]);
  if (!account) { bump('no_account'); continue; }
  const market = numOf(g('MKT VAL'));
  if (seen.has(account)) {
    if (seen.get(account) === market) dupSame++;
    else dupDiffer.push(`${account}: kept ${seen.get(account)}, dropped ${market}`);
    continue;
  }
  seen.set(account, market);

  const preCap = numOf(g('APPRAISED VAL')) ?? 0;
  const hsCap = numOf(g('HMS CAP EXEMPT VAL')) ?? 0;
  const cbCap = numOf(g('CB CAP EXEMPT VAL')) ?? 0;
  const assessed = numOf(g('ASSESSED VALUE'));
  if (assessed === null || market === null) { bump('no_value'); continue; }
  if (Math.abs(preCap - hsCap - cbCap - assessed) > 5) invariantMiss++;
  if (hsCap > 0) capped++;
  if (cbCap > 0) nhsCapped++;

  const area = numOf(g('BLDG HEAT AREA'));
  const yb = numOf(g('YEAR_BUILT'));
  const sqft = numOf(g('LAND SQFT'));
  const acres = acreage.get((c[1] || '').trim());
  if (!(area > 0)) noArea++;

  const row = {
    cad_id: cadId,
    account_number: account,
    tax_year: taxYear,
    market_value: market,
    appraised_value: assessed,
    homestead_cap_loss: hsCap,
    nhs_cap_loss: cbCap,
    land_value: numOf(g('LAND MKT VALUE')),
    improvement_value: numOf(g('TOTAL BUILDING VALUE')),
    living_area: area > 0 ? area : null,
    year_built: yb > 0 ? yb : null,
    quality_class: null,
    // Left null on purpose: the PACS loader stores acres at 10,000x scale and
    // nothing reads the column, so a true-acres value here would be the one
    // inconsistent district. land_size_sqft carries the lot size.
    land_size_acres: null,
    land_size_sqft: sqft > 0 ? Math.round(sqft) : (acres ? Math.round(acres * 43560) : null),
    neighborhood_code: clean(g('NBHD CD')),
    abs_subdv_cd: clean(g('SUBDIVISION')),
    state_class_code: stateCd || null,
    situs_street: [g('SITUS STREET NUM'), g('SITUS STREET NAME'), g('SITUS STREET SFX')]
      .map(clean).filter((v) => v && v !== '0').join(' ') || null,
    situs_city: clean(g('SITUS CITY')),
    situs_zip: null, // externalnal carries no situs ZIP
    has_homestead: homestead.has(account) || hsCap > 0,
    arb_protest_flag: null,
    source_format: 'TAB_DELIM',
  };
  out.write(COLS.map((k) => csvCell(row[k])).join(',') + '\n');
  written++;
  if (limit && written >= limit) { proc.kill(); break; }
}
await new Promise((r) => out.end(r));

const pct = (n, d) => (d ? (n * 100 / d).toFixed(1) : '0.0');
console.log(`  pass 3/3  externalnal`);
console.log(`\n${basename(zip)} -> ${outPath}`);
console.log(`  read      ${read.toLocaleString()}`);
console.log(`  written   ${written.toLocaleString()}`);
for (const [why, n] of [...excluded].sort((a, b) => b[1] - a[1])) console.log(`  excluded  ${n.toLocaleString().padStart(9)}  ${why}`);
if (short) console.log(`  skipped   ${short.toLocaleString().padStart(9)}  rows too short to carry values`);
console.log(`  repeats   ${dupSame.toLocaleString().padStart(9)}  identical repeated accounts dropped`);
if (dupDiffer.length) {
  console.log(`  repeats   ${dupDiffer.length.toLocaleString().padStart(9)}  repeated accounts whose market value DIFFERS - first row kept:`);
  for (const d of dupDiffer.slice(0, 10)) console.log(`              ${d}`);
}
console.log(`\n  QUALIFICATION PICTURE`);
console.log(`    homestead capped  § 23.23   ${capped.toLocaleString().padStart(8)}  ${pct(capped, written)}%`);
console.log(`    non-hmstd capped  § 23.231  ${nhsCapped.toLocaleString().padStart(8)}  ${pct(nhsCapped, written)}%`);
console.log(`    no living area on file      ${noArea.toLocaleString().padStart(8)}  ${pct(noArea, written)}%`);
console.log(`\n  invariant   APPRAISED - HMS CAP - CB CAP = ASSESSED missed by >$5 on ${invariantMiss.toLocaleString()} rows (${pct(invariantMiss, written)}%)`);
if (written && invariantMiss / written > 0.01) {
  console.error(`\n✗ more than 1% of rows break the cap arithmetic. The value columns are not what this loader assumes - refusing.`);
  process.exit(1);
}
if (!written) { console.error('\n✗ nothing written.'); process.exit(1); }
