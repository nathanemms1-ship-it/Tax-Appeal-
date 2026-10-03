#!/usr/bin/env node
/**
 * Convert Collin CAD's public appraisal CSV into a Postgres-COPY-ready CSV with
 * the same columns as scripts/tx/load.mjs.
 *
 *   node scripts/tx/load-collin.mjs --csv tx-data/Collin/AppraisalData-Public-2026.csv \
 *                                   --out tx-data/Collin/collin_parcels.csv
 *   ... --limit 50000   sample first        ... --all   keep non-residential too
 *
 * ============================================================================
 * SOURCE
 * ============================================================================
 * https://link.collincad.org/public/folder/1j1vp-rhx06rqkh3vz2ipw/AppraisalData
 * AppraisalData-Public-<year>.csv. Collin is catalogued as ACCESS_MDB because of
 * LiteDatabaseCurrent.zip, but the same folder publishes this flat CSV, one row
 * per property, with every field comps need - so no .mdb reader is required.
 *
 * There is NO certified snapshot in the folder. The year file is the roll as of
 * its dataDate (28 Sept 2026 for the first load): certification plus supplements.
 * Rows still marked propStatus "Preliminary" (added after certification) are
 * EXCLUDED, so what loads is the certified population at its supplemented values.
 *
 * ============================================================================
 * VALUE FIELDS - verified 364,243 of 364,318 class-A rows
 * ============================================================================
 *   currValMarket                       -> market_value
 *   currValAppraised                    -> PRE-cap (invariant only)
 *   currValHSCapLoss / currValNHSCapLoss -> homestead_cap_loss / nhs_cap_loss
 *   currValAssessed                     -> appraised_value  (Tax Code, AFTER caps)
 *   currValAppraised - HS - NHS = currValAssessed; refused if >1% miss by >$5.
 *
 * ============================================================================
 * UNDIVIDED INTERESTS - the Tarrant trap again
 * ============================================================================
 * udiPropFlag 'T' rows are SHARES of one property: same situs, udiGroupID in
 * common, udiInterestPct 50/50 (sometimes 3-6 ways), each carrying its share of
 * the value. 8,304 class-A rows in 4,092 groups. Loaded as shares, every one
 * would look like a half-price house next door to its neighbours. They are
 * merged back into ONE property: values summed, the first non-null physical
 * field kept, the account number of the group's lowest propID used.
 */

import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename } from 'node:path';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};
const has = (n) => process.argv.includes(`--${n}`);
const src = arg('csv');
const outPath = arg('out', 'tx-data/Collin/collin_parcels.csv');
const limit = Number(arg('limit', '0')) || 0;
const residentialOnly = !has('all');
const CAD_ID = 43;
if (!src) {
  console.error('usage: node scripts/tx/load-collin.mjs --csv <AppraisalData-Public-YYYY.csv> [--out <file>] [--limit N] [--all]');
  process.exit(2);
}

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

/** RFC 4180 record splitter: commas inside quotes, doubled quotes, and records that span lines. */
function splitCsv(text) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
const quotesOpen = (s) => ((s.match(/"/g) || []).length % 2) === 1;

const clean = (v) => { const s = (v ?? '').trim(); return s === '' ? null : s; };
const num = (v) => { const s = clean(v); if (s === null) return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const s = String(v);
  return s === '' ? '' : `"${s.replace(/"/g, '""')}"`;
}

const rl = createInterface({ input: createReadStream(src, { encoding: 'utf8' }), crlfDelay: Infinity });
let h = null; let buf = '';
let read = 0, preliminary = 0, invariantMiss = 0;
const excluded = new Map();
const bump = (w) => excluded.set(w, (excluded.get(w) || 0) + 1);
const rows = [];
const udi = new Map();
let taxYear = null;

for await (const line of rl) {
  buf = buf ? buf + '\n' + line : line;
  if (quotesOpen(buf)) continue;
  const rec = buf; buf = '';
  if (!h) { h = splitCsv(rec).map((x) => x.trim()); continue; }
  const c = splitCsv(rec);
  const g = Object.fromEntries(h.map((k, i) => [k, c[i]]));
  read++;
  if (g.propType !== 'Real') { bump('not_real_property'); continue; }
  const cat = (clean(g.propCategoryCode) || '').toUpperCase();
  if (residentialOnly && cat[0] !== 'A') { bump('not_residential'); continue; }
  if (g.propStatus !== 'Certified') { preliminary++; continue; }
  const year = num(g.propYear);
  if (taxYear === null) taxYear = year;
  if (year !== taxYear) { bump('other_year'); continue; }

  const pre = num(g.currValAppraised) ?? 0, hs = num(g.currValHSCapLoss) ?? 0, nhs = num(g.currValNHSCapLoss) ?? 0;
  const assessed = num(g.currValAssessed);
  if (assessed === null) { bump('no_value'); continue; }
  if (Math.abs(pre - hs - nhs - assessed) > 5) invariantMiss++;

  const row = {
    cad_id: CAD_ID,
    account_number: clean(g.propID),
    tax_year: year,
    market_value: num(g.currValMarket),
    appraised_value: assessed,
    homestead_cap_loss: hs,
    nhs_cap_loss: nhs,
    land_value: num(g.currValLand),
    improvement_value: num(g.currValImprv),
    living_area: num(g.imprvMainArea) > 0 ? num(g.imprvMainArea) : null,
    year_built: num(g.imprvYearBuilt) > 0 ? num(g.imprvYearBuilt) : null,
    quality_class: clean(g.imprvClassCd),
    // Null on purpose: the PACS loader stores acres at 10,000x scale and nothing
    // reads the column. land_size_sqft carries the lot size.
    land_size_acres: null,
    land_size_sqft: num(g.landSizeSqft) > 0 ? Math.round(num(g.landSizeSqft))
      : (num(g.landSizeAcres) > 0 ? Math.round(num(g.landSizeAcres) * 43560) : null),
    neighborhood_code: clean(g.nbhdCode),
    abs_subdv_cd: clean(g.legalAbsSubCode),
    state_class_code: cat || null,
    situs_street: clean(g.situsConcatShort),
    situs_city: clean(g.situsCity),
    situs_zip: (clean(g.situsZip) || '').slice(0, 5) || null,
    has_homestead: g.exemptHmstdFlag === 'T',
    arb_protest_flag: clean(g.protestCode) ? true : false,
    source_format: 'COLLIN_CSV',
  };
  if (g.udiPropFlag === 'T' && clean(g.udiGroupID)) {
    const k = clean(g.udiGroupID);
    if (!udi.has(k)) udi.set(k, []);
    udi.get(k).push(row);
  } else rows.push(row);
  if (limit && rows.length >= limit) break;
}

// Merge undivided-interest shares back into one property each.
const SUM = ['market_value', 'appraised_value', 'homestead_cap_loss', 'nhs_cap_loss', 'land_value', 'improvement_value'];
let shares = 0;
for (const group of udi.values()) {
  shares += group.length;
  group.sort((a, b) => Number(a.account_number) - Number(b.account_number));
  const m = { ...group[0] };
  for (const k of SUM) m[k] = group.reduce((s, r) => s + (r[k] ?? 0), 0);
  for (const k of Object.keys(m)) if (m[k] === null) m[k] = group.find((r) => r[k] !== null)?.[k] ?? null;
  m.has_homestead = group.some((r) => r.has_homestead);
  m.arb_protest_flag = group.some((r) => r.arb_protest_flag);
  rows.push(m);
}

const out = createWriteStream(outPath);
out.write(COLS.join(',') + '\n');
let capped = 0, nhsCapped = 0, noArea = 0;
for (const r of rows) {
  if (r.homestead_cap_loss > 0) capped++;
  if (r.nhs_cap_loss > 0) nhsCapped++;
  if (!r.living_area) noArea++;
  out.write(COLS.map((k) => csvCell(r[k])).join(',') + '\n');
}
await new Promise((r) => out.end(r));

const pct = (n, d) => (d ? (n * 100 / d).toFixed(1) : '0.0');
console.log(`${basename(src)} -> ${outPath}   (Collin, cad_id ${CAD_ID}, roll year ${taxYear})`);
console.log(`  read      ${read.toLocaleString()}`);
console.log(`  written   ${rows.length.toLocaleString()}`);
for (const [w, n] of [...excluded].sort((a, b) => b[1] - a[1])) console.log(`  excluded  ${n.toLocaleString().padStart(9)}  ${w}`);
console.log(`  excluded  ${preliminary.toLocaleString().padStart(9)}  not yet certified (propStatus Preliminary / InProgress)`);
console.log(`  merged    ${shares.toLocaleString().padStart(9)}  undivided-interest shares into ${udi.size.toLocaleString()} properties`);
console.log(`\n  homestead capped  § 23.23   ${capped.toLocaleString().padStart(8)}  ${pct(capped, rows.length)}%`);
console.log(`  non-hmstd capped  § 23.231  ${nhsCapped.toLocaleString().padStart(8)}  ${pct(nhsCapped, rows.length)}%`);
console.log(`  no living area on file      ${noArea.toLocaleString().padStart(8)}  ${pct(noArea, rows.length)}%`);
console.log(`\n  invariant   appraised - caps = assessed missed by >$5 on ${invariantMiss.toLocaleString()} rows`);
if (rows.length && invariantMiss / rows.length > 0.01) { console.error('✗ more than 1% break the cap arithmetic - refusing.'); process.exit(1); }
if (!rows.length) { console.error('✗ nothing written.'); process.exit(1); }
