#!/usr/bin/env node
/**
 * Convert a Florida DOR roll file into a Postgres-COPY-ready CSV.
 *
 *   node scripts/dor/load.mjs --kind nal --in "Hillsborough 29 Preliminary NAL 2026.csv" --out parcels.csv
 *   node scripts/dor/load.mjs --kind sdf --in "Hillsborough 29 Preliminary SDF 2026.csv" --out sales.csv
 *
 * Then, in psql (or the Supabase SQL editor's import):
 *
 *   \copy parcels (co_no,parcel_id,...) from 'parcels.csv' with (format csv, header true)
 *
 * The exact \copy line is printed at the end of a run, with the column list in
 * the order this script emits, so it cannot be mistyped.
 *
 * ============================================================================
 * WHY THIS EMITS A FILE INSTEAD OF INSERTING
 * ============================================================================
 * A single county NAL runs to hundreds of thousands of rows. Driving that
 * through an ORM or the Supabase REST client takes tens of minutes and fails
 * halfway on a network blip, leaving a partial load with no clean resume.
 * Postgres COPY does the same work in seconds inside one transaction, and it is
 * the same tool a DBA would reach for. It also means this script needs NO
 * database credentials and NO new dependency — it is a pure text transform,
 * which makes it trivially safe to run and easy to test.
 *
 * ============================================================================
 * WHY IT STREAMS
 * ============================================================================
 * Reading a 300 MB file with readFileSync and then .split('\n') materialises the
 * whole thing plus an array of every line — comfortably over a gigabyte of heap
 * for the larger counties, and it will die on Miami-Dade. Line-at-a-time keeps
 * memory flat regardless of county size.
 */

import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename } from 'node:path';
import { normalizeNalRow, normalizeSdfRow, splitCsvLine } from '../../lib/dor/parseRoll.js';

const PARCEL_COLS = [
  'co_no', 'parcel_id', 'asmnt_yr', 'dor_uc',
  'jv', 'av_sd', 'av_nsd', 'tv_sd', 'tv_nsd',
  'jv_hmstd', 'av_hmstd', 'jv_non_hmstd_resd', 'av_non_hmstd_resd', 'lnd_val',
  'tot_lvg_area', 'act_yr_blt', 'eff_yr_blt', 'no_buldng', 'no_res_unts', 'lnd_sqfoot',
  'nbrhd_cd', 'mkt_ar', 'census_bk',
  'phy_addr1', 'phy_addr2', 'phy_city', 'phy_zipcd', 'own_name',
  'exmpt_01', 'exmpt_02', 'ass_dif_trns',
  'sale_prc1', 'sale_yr1', 'sale_mo1', 'qual_cd1', 'vi_cd1',
];

const SALE_COLS = [
  'co_no', 'parcel_id', 'asmnt_yr', 'sale_id_cd', 'qual_cd', 'is_qualified',
  'vi_cd', 'sale_date', 'sale_prc', 'dor_uc', 'nbrhd_cd', 'mkt_ar', 'census_bk',
  'multi_par_sal',
];

/** CSV-quote a value for COPY. Null becomes an empty unquoted field, which
 *  Postgres reads as NULL; everything else is quoted so embedded commas,
 *  quotes and newlines in owner names and legal descriptions survive. */
function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const s = String(v);
  if (s === '') return '';
  return `"${s.replace(/"/g, '""')}"`;
}

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const kind = String(arg('kind', 'nal')).toLowerCase();
const inPath = arg('in');
const outPath = arg('out', kind === 'sdf' ? 'sales.csv' : 'parcels.csv');

// DOR use codes 001-008 are the residential classes we serve. Everything else —
// commercial, industrial, agricultural, institutional, government — is 17.5% of
// rows we would store, index and back up forever without ever querying.
//
// On by default. Pass --all to keep every parcel; the only reason to do that is
// if the product ever handles commercial appeals.
const residentialOnly = !process.argv.includes('--all');

if (!inPath || !['nal', 'sdf'].includes(kind)) {
  console.error('usage: node scripts/dor/load.mjs --kind nal|sdf --in <file.csv> [--out <out.csv>]');
  process.exit(2);
}

const cols = kind === 'sdf' ? SALE_COLS : PARCEL_COLS;
const normalize = kind === 'sdf' ? normalizeSdfRow : normalizeNalRow;

const out = createWriteStream(outPath, { encoding: 'utf8' });
out.write(cols.join(',') + '\n');

let headers = null;
let read = 0;
let written = 0;
let skipped = 0;
let filtered = 0;
// Counted separately from `skipped`, because a column-count mismatch means the
// LAYOUT is wrong — a different roll year, or the wrong file kind — and that is
// a stop-and-look problem rather than a bad row to shrug off.
let ragged = 0;

const rl = createInterface({
  input: createReadStream(inPath, { encoding: 'utf8' }),
  crlfDelay: Infinity,
});

for await (const line of rl) {
  if (!line) continue;

  if (headers === null) {
    headers = splitCsvLine(line).map((h) => h.trim().toUpperCase());
    // Fail loudly and immediately on the wrong file. Loading an SDF into the
    // parcels table would produce a table full of nulls that looks like a
    // successful load until someone tries to qualify a customer with it.
    const need = kind === 'sdf' ? ['PARCEL_ID', 'SALE_PRC', 'QUAL_CD'] : ['PARCEL_ID', 'JV', 'AV_SD', 'TV_SD'];
    const missing = need.filter((h) => !headers.includes(h));
    if (missing.length) {
      console.error(`✗ ${basename(inPath)} does not look like a ${kind.toUpperCase()} file.`);
      console.error(`  Missing required columns: ${missing.join(', ')}`);
      console.error(`  Found ${headers.length} columns starting: ${headers.slice(0, 8).join(', ')}`);
      process.exit(1);
    }
    continue;
  }

  read++;
  const cells = splitCsvLine(line);
  if (cells.length !== headers.length) ragged++;

  const obj = {};
  for (let c = 0; c < headers.length; c++) obj[headers[c]] = cells[c];

  const row = normalize(obj);
  if (!row) { skipped++; continue; }

  // Counted separately from `skipped` — a filtered-out commercial parcel is a
  // deliberate exclusion, not a parse failure, and lumping them together would
  // trip the 5% unusable-rows alarm below on every single county.
  if (residentialOnly && !(row.dor_uc >= 1 && row.dor_uc <= 8)) { filtered++; continue; }

  out.write(cols.map((c) => csvCell(row[c])).join(',') + '\n');
  written++;

  if (written % 100000 === 0) process.stderr.write(`  ${written.toLocaleString()} rows...\n`);
}

await new Promise((res) => out.end(res));

const pctSkipped = read ? (skipped / read) * 100 : 0;

console.log(`\n${basename(inPath)} -> ${outPath}`);
console.log(`  read     ${read.toLocaleString()}`);
console.log(`  written  ${written.toLocaleString()}`);
console.log(`  skipped  ${skipped.toLocaleString()} (${pctSkipped.toFixed(2)}%)`);
if (filtered) console.log(`  filtered ${filtered.toLocaleString()} non-residential (use --all to keep)`);
if (ragged) console.log(`  ragged   ${ragged.toLocaleString()} rows had an unexpected column count`);

// A handful of unusable rows in a county roll is normal. A large fraction means
// the layout assumption is wrong, and silently loading it would put wrong
// numbers behind a sworn petition — so say so rather than exiting 0 quietly.
if (pctSkipped > 5) {
  console.error(`\n✗ ${pctSkipped.toFixed(1)}% of rows were unusable. That is too high to be bad data.`);
  console.error('  Check the roll year against the DOR User\'s Guide layout before loading this.');
  process.exit(1);
}
if (ragged > read * 0.01) {
  console.error(`\n✗ ${ragged.toLocaleString()} rows had the wrong column count. The layout may have changed.`);
  process.exit(1);
}

console.log(`\nLoad it with:\n  \\copy ${kind === 'sdf' ? 'sales' : 'parcels'} (${cols.join(',')}) from '${outPath}' with (format csv, header true)\n`);
