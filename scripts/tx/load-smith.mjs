#!/usr/bin/env node
/**
 * Convert Smith CAD's 2026 certified real-property CSV into a Postgres-COPY-ready
 * CSV with the same columns as scripts/tx/load.mjs.
 *
 *   node scripts/tx/load-smith.mjs --zip tx-data/Smith/smith_2026_real_certified.zip \
 *                                  --out tx-data/Smith/smith_parcels.csv
 *
 * SOURCE: https://www.smithcad.org/downloads.html ->
 *   data/2026/2026_Real_Property_Certifled_AppraisalRoll_cd.zip  (sic, "Certifled")
 *     ..._Extract1.csv  one row per account: values, NEIGHBORHOOD, SUBDIVISION,
 *                       HEATED AREA, YEAR_BUILT, USE CODE
 *     ..._Extract2.csv  exemptions per account and taxing unit
 * The catalogue had Smith as "public information request"; it publishes.
 *
 * USE CODE is the district's own code, not the Comptroller's (A00 residence,
 * A60 mobile home, C00 vacant...). Its first letter follows the Comptroller
 * category, so the residential boundary (category A) is unchanged; the code is
 * stored as state_class_code as-is, and comps match it exactly.
 *
 * VALUES - the same vocabulary as Bell/Johnson (scripts/tx/load-tab.mjs):
 *   MKT VAL -> market_value; ASSESSED VALUE -> appraised_value (after caps)
 *   HMS CAP EXEMPT VAL -> homestead_cap_loss; CB CAP EXEMPT VAL -> nhs_cap_loss
 *   APPRAISED VAL - HMS - CB = ASSESSED held on 75,965 of 75,979 class-A rows.
 *   Rows that break it are excluded; > 1% refuses the file.
 */

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename } from 'node:path';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};
const has = (n) => process.argv.includes(`--${n}`);
const zip = arg('zip', 'tx-data/Smith/smith_2026_real_certified.zip');
const outPath = arg('out', 'tx-data/Smith/smith_parcels.csv');
const taxYear = Number(arg('year', '2026'));
const residentialOnly = !has('all');
const CAD_ID = 212;
const HOMESTEAD = /^(HS|HSLOC|O65|O65LOC|DVHS|DVO65|DP|DPLOC)$/;

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

function splitCsv(text) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out;
}
const quotesOpen = (s) => ((s.match(/"/g) || []).length % 2) === 1;
const clean = (v) => { const s = (v ?? '').trim(); return s === '' || s.toUpperCase() === 'NULL' ? null : s; };
const num = (v) => { const s = clean(v); if (s === null) return null; const n = Number(s.replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
const csvCell = (v) => (v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'true' : 'false') : `"${String(v).replace(/"/g, '""')}"`);

async function* rows(member) {
  const p = spawn('unzip', ['-p', zip, member], { stdio: ['ignore', 'pipe', 'ignore'] });
  const rl = createInterface({ input: p.stdout, crlfDelay: Infinity });
  let h = null, buf = '';
  for await (const line of rl) {
    buf = buf ? buf + '\n' + line : line;
    if (quotesOpen(buf)) continue;
    const c = splitCsv(buf); buf = '';
    if (!h) { h = c.map((x) => x.replace(/^﻿/, '').trim()); continue; }
    yield Object.fromEntries(h.map((k, i) => [k, c[i]]));
  }
}

const homestead = new Set();
for await (const e of rows('*Extract2.csv')) if (HOMESTEAD.test((e['EXEMPT CD'] || '').trim().toUpperCase())) homestead.add(e.ACCOUNT);
console.log(`  exemptions        ${homestead.size.toLocaleString()} homestead accounts`);

const out = createWriteStream(outPath);
out.write(COLS.join(',') + '\n');
const excluded = new Map(); const bump = (w) => excluded.set(w, (excluded.get(w) || 0) + 1);
let read = 0, written = 0, capped = 0, nhsCapped = 0, noArea = 0, broken = 0;
const seen = new Map(); const dupDiffer = [];
for await (const g of rows('*Extract1.csv')) {
  read++;
  const cls = (clean(g['USE CODE']) || '').toUpperCase();
  if (residentialOnly && cls[0] !== 'A') { bump('not_residential'); continue; }
  const id = clean(g['ACCOUNT NUM']);
  if (!id) { bump('no_account'); continue; }
  const market = num(g['MKT VAL']);
  if (seen.has(id)) { if (seen.get(id) !== market) dupDiffer.push(id); bump('repeated_account'); continue; }
  seen.set(id, market);
  const pre = num(g['APPRAISED VAL']) ?? 0, hs = num(g['HMS CAP EXEMPT VAL']) ?? 0, cb = num(g['CB CAP EXEMPT VAL']) ?? 0;
  const assessed = num(g['ASSESSED VALUE']);
  if (market === null || assessed === null) { bump('no_value'); continue; }
  if (Math.abs(pre - hs - cb - assessed) > 5) { broken++; bump('cap_arithmetic_broken'); continue; }
  if (hs > 0) capped++;
  if (cb > 0) nhsCapped++;
  const area = num(g['HEATED AREA']), yb = num(g.YEAR_BUILT), acres = num(g.ACREAGE);
  if (!(area > 0)) noArea++;
  const subdv = clean(g.SUBDIVISION);
  const row = {
    cad_id: CAD_ID, account_number: id, tax_year: taxYear,
    market_value: market, appraised_value: assessed, homestead_cap_loss: hs, nhs_cap_loss: cb,
    land_value: num(g['LAND MKT VALUE']), improvement_value: num(g['TOTAL BUILDING VALUE']),
    living_area: area > 0 ? area : null, year_built: yb > 1800 ? yb : null, quality_class: null,
    land_size_acres: null, land_size_sqft: acres > 0 ? Math.round(acres * 43560) : null,
    neighborhood_code: clean(g.NEIGHBORHOOD),
    abs_subdv_cd: subdv ? subdv.split(' - ')[0].trim() : null, // "S162800 - PINE TRAIL SHORES" -> "S162800"
    state_class_code: cls || null,
    situs_street: [g.STREET_NUMBER, g.STREET_DIRECTION, g.STREET_NAME, g.STREET_SUFFIX].map(clean).filter(Boolean).join(' ') || clean(g.SITUS_ADDRESSS),
    situs_city: null, situs_zip: null, // the extract carries the OWNER's mailing city/zip only
    has_homestead: homestead.has(id) || hs > 0, arb_protest_flag: null, source_format: 'SMITH_CSV',
  };
  out.write(COLS.map((k) => csvCell(row[k])).join(',') + '\n');
  written++;
}
await new Promise((r) => out.end(r));
const pct = (n, d) => (d ? (n * 100 / d).toFixed(1) : '0.0');
console.log(`\n${basename(zip)} -> ${outPath}   (Smith, cad_id ${CAD_ID}, ${taxYear} certified)`);
console.log(`  read      ${read.toLocaleString()}\n  written   ${written.toLocaleString()}`);
for (const [w, n] of [...excluded].sort((a, b) => b[1] - a[1])) console.log(`  excluded  ${n.toLocaleString().padStart(9)}  ${w}`);
if (dupDiffer.length) console.log(`  repeated accounts with DIFFERENT market values (first kept): ${dupDiffer.slice(0, 10).join(', ')}`);
console.log(`\n  homestead capped  § 23.23   ${capped.toLocaleString().padStart(8)}  ${pct(capped, written)}%`);
console.log(`  non-hmstd capped  § 23.231  ${nhsCapped.toLocaleString().padStart(8)}  ${pct(nhsCapped, written)}%`);
console.log(`  no living area on file      ${noArea.toLocaleString().padStart(8)}  ${pct(noArea, written)}%`);
if (written && broken / (written + broken) > 0.01) { console.error('✗ more than 1% break the cap arithmetic - refusing.'); process.exit(1); }
if (!written) { console.error('✗ nothing written.'); process.exit(1); }
