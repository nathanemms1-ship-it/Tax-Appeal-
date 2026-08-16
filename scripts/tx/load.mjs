#!/usr/bin/env node
/**
 * Convert a PACS appraisal export into a Postgres-COPY-ready CSV.
 *
 *   node scripts/tx/load.mjs --zip tx-data/Nueces/Certified-Public-Export-2026.zip \
 *                            --cad 178 --county Nueces --out nueces.csv
 *   ... --limit 50000     # sample, for checking before committing to a full run
 *   ... --all             # keep non-residential too (see the compliance note)
 *
 * Then, in psql:
 *   \copy tx_parcels (<cols printed at the end>) from 'nueces.csv' with (format csv, header true)
 *
 * ============================================================================
 * WHY IT EMITS A FILE INSTEAD OF INSERTING — same reasoning as the Florida loader
 * ============================================================================
 * A county roll is hundreds of thousands of rows. Driving that through the
 * Supabase REST client takes tens of minutes and dies halfway on a network blip,
 * leaving a partial load with no clean resume. COPY does it in seconds inside one
 * transaction. It also means this script needs NO database credentials, which
 * makes it safe to run and easy to test.
 *
 * ============================================================================
 * WHY IT STREAMS THROUGH `unzip -p`
 * ============================================================================
 * The Nueces export is 161 MB zipped and 7.08 GB unpacked; APPRAISAL_INFO alone
 * is 2.0 GB. Extracting it to disk to read it once is a waste of 7 GB, and
 * reading it with readFileSync would need more heap than the machine has.
 * `unzip -p` streams a single member to stdout and costs nothing extra.
 */

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename } from 'node:path';
import {
  APPRAISAL_INFO, IMPROVEMENT_DETAIL, LAND_DETAIL, HEADER, isLivingArea,
  parseProperty, checkInvariant, accumulateLand, text, num,
} from '../../lib/tx/pacs.js';
import { countyCode, CODE_TO_COUNTY } from '../../lib/tx/counties.js';

const VALIDATED_EXPORT_VERSIONS = new Set(['8.0.0.34', '8.0.0.33']);

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

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
const has = (n) => process.argv.includes(`--${n}`);

const zip = arg('zip');
const county = arg('county', '');
// --cad wins if given; otherwise resolve the county name against the
// Comptroller's numbering. Never guess: an unresolvable name is a hard stop,
// because cad_id sits in the primary key and a wrong one silently files a whole
// district's parcels under a different county.
const cadId = arg('cad') || (county ? countyCode(county) : null);
const outPath = arg('out', 'tx_parcels.csv');
const limit = Number(arg('limit', '0')) || 0;
const residentialOnly = !has('all');

if (!zip || !cadId) {
  console.error('usage: node scripts/tx/load.mjs --zip <export.zip> --county <name> [--cad <code>] [--out <file>] [--limit N] [--all]');
  if (county && !cadId) console.error(`\n✗ "${county}" is not a Texas county name I can resolve. Pass --cad explicitly.`);
  process.exit(2);
}

/** Stream one member of the zip, line by line, without extracting it. */
function memberLines(zipPath, pattern) {
  const p = spawn('unzip', ['-p', zipPath, pattern], { stdio: ['ignore', 'pipe', 'ignore'] });
  return { rl: createInterface({ input: p.stdout, crlfDelay: Infinity }), proc: p };
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const s = String(v);
  return s === '' ? '' : `"${s.replace(/"/g, '""')}"`;
}

// ── 0. header: refuse a layout we have not validated ────────────────────────
{
  const { rl } = memberLines(zip, '*APPRAISAL_HEADER.TXT');
  let header = null;
  for await (const l of rl) { header = l; break; }
  if (!header) {
    console.error('✗ no APPRAISAL_HEADER.TXT in this zip — is it a PACS export?');
    process.exit(1);
  }
  const version = text(header, HEADER.export_version);
  const year = num(header, HEADER.appraisal_year);
  console.log(`${basename(zip)}`);
  console.log(`  ${CODE_TO_COUNTY[Number(cadId)] || county || '?'} County — cad_id ${cadId}`);
  console.log(`  export layout ${version}, appraisal year ${year}`);
  if (!VALIDATED_EXPORT_VERSIONS.has(version)) {
    // Offsets are version-specific. A near-miss version silently shifts every
    // field and produces numbers that look real, which is the worst failure
    // available here — so refuse rather than guess.
    console.error(`\n✗ export layout ${version} has not been validated against lib/tx/pacs.js.`);
    console.error(`  Validated: ${[...VALIDATED_EXPORT_VERSIONS].join(', ')}`);
    console.error(`  Get that district's layout document and diff the offsets before loading.`);
    process.exit(1);
  }
}

// ── 1. improvement detail -> living area, year built, class ─────────────────
// Living area is the SUM of main-area segments only. A porch, a garage and a
// storage shed all carry area and none of them is living space.
console.log('  pass 1/3  improvement detail (living area, year built, class)');
const imprv = new Map();
const unmatchedCodes = new Map();
{
  const { rl } = memberLines(zip, '*_APPRAISAL_IMPROVEMENT_DETAIL.TXT');
  for await (const line of rl) {
    if (line.length < IMPROVEMENT_DETAIL.recordLength - 1) continue;
    const id = text(line, IMPROVEMENT_DETAIL.prop_id);
    const type = (text(line, IMPROVEMENT_DETAIL.imprv_det_type_cd) || '').toUpperCase();
    const desc = text(line, IMPROVEMENT_DETAIL.imprv_det_type_desc) || '';
    const area = num(line, IMPROVEMENT_DETAIL.imprv_det_area) ?? 0;
    if (!isLivingArea(type, desc)) {
      // Report by DESCRIPTION, because the description is what a human can judge.
      // A bare code tells you nothing about whether it should have counted.
      if (area > 400) {
        const k = `${type} "${desc}"`;
        unmatchedCodes.set(k, (unmatchedCodes.get(k) || 0) + 1);
      }
      continue;
    }
    const cur = imprv.get(id) || { living_area: 0, year_built: null, quality_class: null, main: 0 };
    cur.living_area += area;
    // Year and class come from the LARGEST main-area segment: a two-storey house
    // has two, and the ground floor is the one that describes the dwelling.
    if (area > cur.main) {
      cur.main = area;
      cur.year_built = num(line, IMPROVEMENT_DETAIL.yr_built);
      cur.quality_class = text(line, IMPROVEMENT_DETAIL.imprv_det_class_cd);
    }
    imprv.set(id, cur);
  }
}
console.log(`            ${imprv.size.toLocaleString()} properties with living area`);

// ── 1b. land detail -> lot size ─────────────────────────────────────────────
// legal_acreage on the property record is 0.0000 for platted lots, so real lot
// size has to come from here or suburban parcels all look like zero-acre land.
console.log('  pass 2/3  land detail (lot size)');
const land = new Map();
{
  const { rl } = memberLines(zip, '*_APPRAISAL_LAND_DETAIL.TXT');
  for await (const line of rl) {
    if (line.length < LAND_DETAIL.recordLength - 1) continue;
    accumulateLand(land, line);
  }
}
console.log(`            ${land.size.toLocaleString()} properties with land segments`);

// ── 2. the property file ────────────────────────────────────────────────────
console.log('  pass 3/3  property records');
const out = createWriteStream(outPath, { encoding: 'utf8' });
out.write(COLS.join(',') + '\n');

let read = 0, written = 0, skipped = 0, ragged = 0;
let invariantChecked = 0, invariantFailed = 0;
const firstFailures = [];
const excluded = new Map();
let capped = 0, hsCapped = 0, nhsCapped = 0, noLivingArea = 0;

{
  const { rl, proc } = memberLines(zip, '*_APPRAISAL_INFO.TXT');
  for await (const line of rl) {
    if (!line) continue;
    read++;
    if (line.length !== APPRAISAL_INFO.recordLength) ragged++;

    const p = parseProperty(line, { residentialOnly });
    if (!p) { skipped++; continue; }
    if (p.__excluded) {
      excluded.set(p.__excluded, (excluded.get(p.__excluded) || 0) + 1);
      continue;
    }

    // The invariant is the offset self-check. Sample rather than test every row:
    // it is arithmetic on already-parsed numbers, but 200k of them is pointless.
    if (invariantChecked < 5000) {
      invariantChecked++;
      const bad = checkInvariant(p);
      if (bad) { invariantFailed++; if (firstFailures.length < 3) firstFailures.push(`${p.account_number}: ${bad}`); }
    }

    const extra = imprv.get(p.account_number) || {};
    const lot = land.get(p.account_number) || {};
    if (!extra.living_area) noLivingArea++;
    if (p.homestead_cap_loss > 0) hsCapped++;
    if (p.nhs_cap_loss > 0) nhsCapped++;
    if (p.homestead_cap_loss > 0 || p.nhs_cap_loss > 0) capped++;

    const row = {
      cad_id: cadId,
      ...p,
      living_area: extra.living_area || null,
      year_built: extra.year_built || null,
      quality_class: extra.quality_class || null,
      // Prefer the land file; fall back to legal_acreage where there are no segments.
      land_size_acres: lot.land_size_acres || p.land_size_acres || null,
      land_size_sqft: lot.land_size_sqft || null,
      source_format: 'PACS',
    };
    out.write(COLS.map((c) => csvCell(row[c])).join(',') + '\n');
    written++;

    if (written % 25000 === 0) process.stderr.write(`            ${written.toLocaleString()} rows...\n`);
    if (limit && written >= limit) { proc.kill(); break; }
  }
}
await new Promise((r) => out.end(r));

// ── 3. report, and refuse to look successful when it is not ─────────────────
const pct = (n, d) => (d ? (n * 100 / d).toFixed(1) : '0.0');
console.log(`\n${basename(zip)} -> ${outPath}`);
console.log(`  read      ${read.toLocaleString()}`);
console.log(`  written   ${written.toLocaleString()}`);
for (const [why, n] of [...excluded].sort((a, b) => b[1] - a[1])) {
  console.log(`  excluded  ${n.toLocaleString().padStart(9)}  ${why}`);
}
if (skipped) console.log(`  skipped   ${skipped.toLocaleString()} unparseable`);
if (ragged)  console.log(`  ragged    ${ragged.toLocaleString()} wrong record length`);

console.log(`\n  QUALIFICATION PICTURE (this is the money question)`);
console.log(`    homestead capped  § 23.23   ${hsCapped.toLocaleString().padStart(8)}  ${pct(hsCapped, written)}%`);
console.log(`    non-hmstd capped  § 23.231  ${nhsCapped.toLocaleString().padStart(8)}  ${pct(nhsCapped, written)}%`);
console.log(`    CAPPED EITHER WAY           ${capped.toLocaleString().padStart(8)}  ${pct(capped, written)}%  <- a won protest may move the bill $0`);
console.log(`    no living area on file      ${noLivingArea.toLocaleString().padStart(8)}  ${pct(noLivingArea, written)}%  <- cannot be size-adjusted as a comp`);

if (unmatchedCodes.size) {
  const top = [...unmatchedCodes].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(`\n  improvement types with area >400 sqft NOT counted as living area:`);
  for (const [k, n] of top) console.log(`    ${String(n).padStart(7)}  ${k}`);
  console.log(`    If any of those is a dwelling for this district, lib/tx/pacs.js needs the pattern.`);
}

if (invariantFailed) {
  console.error(`\n✗ THE ARITHMETIC INVARIANT FAILED on ${invariantFailed} of ${invariantChecked} sampled rows.`);
  console.error(`  assessed = appraised - homestead_cap - nhs_cap must hold. It did for 19,198/19,198`);
  console.error(`  Nueces records, so a failure here means the OFFSETS ARE WRONG for this district's file.`);
  firstFailures.forEach((f) => console.error(`    ${f}`));
  console.error(`  Refusing to present this as a successful load.`);
  process.exit(1);
}
const pctNoArea = written ? noLivingArea * 100 / written : 0;
if (pctNoArea > 60) {
  console.error(`\n✗ ${pctNoArea.toFixed(1)}% of parcels have NO living area.`);
  console.error(`  That is not a data gap, it is an unrecognised improvement type. Wichita`);
  console.error(`  produced exactly this (100%) because it calls the dwelling LV "LIVING AREA"`);
  console.error(`  while Nueces calls it MA "MAIN AREA". Check the unmatched list above and`);
  console.error(`  extend LIVING_INCLUDE in lib/tx/pacs.js. Parcels without size cannot be comped.`);
  process.exit(1);
}

console.log(`\n  invariant   held on ${invariantChecked.toLocaleString()} sampled rows`);

const pctSkipped = read ? skipped * 100 / read : 0;
if (pctSkipped > 5) {
  console.error(`\n✗ ${pctSkipped.toFixed(1)}% of rows were unparseable — too high to be bad data. Check the layout version.`);
  process.exit(1);
}

console.log(`\nLoad it with:\n  \\copy tx_parcels (${COLS.join(',')}) from '${outPath}' with (format csv, header true)\n`);
