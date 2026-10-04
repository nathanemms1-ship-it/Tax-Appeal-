#!/usr/bin/env node
/**
 * Convert Fort Bend CAD's 2026 Orion certified export into a Postgres-COPY-ready
 * CSV with the same columns as scripts/tx/load.mjs.
 *
 *   node scripts/tx/load-fbcad.mjs --dir tx-data/FortBend --out tx-data/FortBend/fortbend_parcels.csv
 *
 * ============================================================================
 * SOURCES  (https://www.fbcad.org/certified-and-supplements-reports/ - NOT the
 * /data-files/ page, whose newest export is 2024; that is why the catalogue
 * called this district stale)
 * ============================================================================
 *   fb_orion_2026_certified.zip  2026_07_07_1746-Orion-2026-Certified-Export-Redacted.zip
 *       PropertyExport  - situs, legal, PropertyNumber, StateCodeImp/Land, SupplementNumber CERT
 *       EntityExport    - values per taxing unit. There is no CAD row; G01 (the county)
 *                         is on every property and is used.
 *       ExemptionExport - HS rows mark a homestead
 *   fb_residential_segs.zip      WebsiteResidentialSegs.zip - one row per improvement
 *       segment: fSegType, fArea, fActYear. The district's own segment codes, no
 *       descriptions, so living area is an EXPLICIT code list (below), measured.
 *
 * ============================================================================
 * NO NEIGHBOURHOOD CODE - same treatment as Hidalgo
 * ============================================================================
 * Nothing in the published set carries one (the export is "Redacted").
 * neighborhood_code stays NULL. abs_subdv_cd is the subdivision + section
 * prefix of PropertyNumber ("5910-04-022-0700-907" -> "5910-04"): 4,515 groups,
 * 99.0% of A1 homes in a group of >= 10. Comps use it as their second rung.
 *
 * ============================================================================
 * VALUES (G01 row)
 * ============================================================================
 *   MarketValue -> market_value; AssessedValue -> appraised_value (after caps)
 *   HSCapAdj -> homestead_cap_loss (§ 23.23); CBLCapAdj -> nhs_cap_loss (§ 23.231)
 *   MarketValue - HSCapAdj - CBLCapAdj - AgLoss = AssessedValue; a residential
 *   row that breaks it is excluded and counted; > 1% refuses the file.
 */

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};
const has = (n) => process.argv.includes(`--${n}`);
const dir = arg('dir', 'tx-data/FortBend');
const outPath = arg('out', join(dir, 'fortbend_parcels.csv'));
const taxYear = Number(arg('year', '2026'));
const residentialOnly = !has('all');
const CAD_ID = 79;
const ORION = join(dir, 'fb_orion_2026_certified.zip');
const SEGS = join(dir, 'fb_residential_segs.zip');
const PFX = '*2026_07_07_1746_';

/**
 * Living-area segment codes, by the district's own value per square foot
 * (vTSGRSeg_SegmentValue / fArea, segments > 200 sqft, 2026):
 *   MA 125.64 (reference)  MAA 127.01  MA2 115.09  MA3 132.73  MA1.5 88.04
 *   GAP 108.20 "garage apartment" - living quarters by name, 86% of MA
 * Not living: OP 36.82 open porch, AG 46.26 attached garage, EP 58.61 enclosed
 * porch (47%), DG detached garage, PA patio, WD deck, RP pool, ST storage.
 */
const LIVING = new Set(['MA', 'MAA', 'MA2', 'MA3', 'MA1.5', 'GAP']);

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
const clean = (v) => { const s = (v ?? '').trim(); return s === '' ? null : s; };
const num = (v) => { const s = clean(v); if (s === null) return null; const n = Number(s.replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
const csvCell = (v) => (v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'true' : 'false') : `"${String(v).replace(/"/g, '""')}"`);

async function* rows(zip, member) {
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

// ── 1. homestead exemptions ─────────────────────────────────────────────────
const homestead = new Set();
for await (const e of rows(ORION, `${PFX}ExemptionExport.txt`)) if ((e.ExemptionCode || '').trim() === 'HS') homestead.add(e.OwnerQuickRefID);
console.log(`  exemptions        ${homestead.size.toLocaleString()} homesteads`);

// ── 2. values from the county (G01) entity row ──────────────────────────────
const values = new Map();
for await (const v of rows(ORION, `${PFX}EntityExport.txt`)) {
  if (v.EntityCode !== 'G01') continue;
  values.set(v.OwnerQuickRefID, {
    market: num(v.MarketValue), assessed: num(v.AssessedValue),
    hs: num(v.HSCapAdj) ?? 0, cbl: num(v.CBLCapAdj) ?? 0, ag: num(v.AgLoss) ?? 0,
    land: (num(v.LandHSValue) ?? 0) + (num(v.LandNHSValue) ?? 0) + (num(v.AgMktValue) ?? 0),
    imp: (num(v.ImpHSValue) ?? 0) + (num(v.ImpNHSValue) ?? 0),
  });
}
console.log(`  county values     ${values.size.toLocaleString()} properties`);

// ── 3. residential segments: living area and year built ─────────────────────
const segs = new Map();
for await (const s of rows(SEGS, 'WebsiteResidentialSegs.txt')) {
  if (num(s.vwPropertyGeneral_AdHocTaxYear) !== taxYear) continue;
  const t = (s.fSegType || '').trim().toUpperCase();
  if (!LIVING.has(t)) continue;
  const id = s.QuickRefID; const a = num(s.fArea) ?? 0; const y = num(s.fActYear);
  const cur = segs.get(id) || { area: 0, yb: null };
  cur.area += a;
  if (t.startsWith('MA') && y > 1800 && (!cur.yb || y < cur.yb)) cur.yb = y;
  segs.set(id, cur);
}
console.log(`  living segments   ${segs.size.toLocaleString()} properties`);

// ── 4. properties ───────────────────────────────────────────────────────────
const out = createWriteStream(outPath);
out.write(COLS.join(',') + '\n');
const excluded = new Map(); const bump = (w) => excluded.set(w, (excluded.get(w) || 0) + 1);
let read = 0, written = 0, capped = 0, nhsCapped = 0, noArea = 0, broken = 0;
const seen = new Set();
for await (const p of rows(ORION, `${PFX}PropertyExport.txt`)) {
  read++;
  if (num(p.TaxYear) !== taxYear) { bump('other_year'); continue; }
  const id = clean(p.PropertyQuickRefID);
  if (!id || seen.has(id)) { bump('duplicate_or_blank_id'); continue; }
  seen.add(id);
  const cls = (clean(p.StateCodeImp) || clean(p.StateCodeLand) || '').toUpperCase();
  if (residentialOnly && cls[0] !== 'A') { bump('not_residential'); continue; }
  const v = values.get(id);
  if (!v || v.market === null || v.assessed === null) { bump('no_county_value'); continue; }
  if (Math.abs(v.market - v.hs - v.cbl - v.ag - v.assessed) > 5) { broken++; bump('cap_arithmetic_broken'); continue; }
  if (v.hs > 0) capped++;
  if (v.cbl > 0) nhsCapped++;
  const sg = segs.get(id);
  if (!(sg?.area > 0)) noArea++;
  const pn = clean(p.PropertyNumber) || '';
  const acres = num(p.Acres);
  const row = {
    cad_id: CAD_ID, account_number: id, tax_year: taxYear,
    market_value: v.market, appraised_value: v.assessed,
    homestead_cap_loss: v.hs, nhs_cap_loss: v.cbl,
    land_value: v.land, improvement_value: v.imp,
    living_area: sg?.area > 0 ? sg.area : null, year_built: sg?.yb ?? null, quality_class: null,
    land_size_acres: null, // 10,000x-scaled and unread in PACS districts; sqft carries lot size
    land_size_sqft: acres > 0 ? Math.round(acres * 43560) : null,
    neighborhood_code: null,
    abs_subdv_cd: /^\d{4}-\d{2}-/.test(pn) ? pn.slice(0, 7) : null,
    state_class_code: cls || null,
    situs_street: clean(p.SitusStreetAddress), situs_city: clean(p.SitusCity),
    situs_zip: (clean(p.SitusZip) || '').slice(0, 5) || null,
    has_homestead: homestead.has(id) || v.hs > 0,
    arb_protest_flag: p.ARBProtestFlag === '1' ? true : p.ARBProtestFlag === '0' ? false : null,
    source_format: 'FBCAD_ORION',
  };
  out.write(COLS.map((k) => csvCell(row[k])).join(',') + '\n');
  written++;
}
await new Promise((r) => out.end(r));
const pct = (n, d) => (d ? (n * 100 / d).toFixed(1) : '0.0');
console.log(`\nFort Bend (cad_id ${CAD_ID}, ${taxYear} certified) -> ${outPath}`);
console.log(`  read      ${read.toLocaleString()}\n  written   ${written.toLocaleString()}`);
for (const [w, n] of [...excluded].sort((a, b) => b[1] - a[1])) console.log(`  excluded  ${n.toLocaleString().padStart(9)}  ${w}`);
console.log(`\n  homestead capped  § 23.23   ${capped.toLocaleString().padStart(8)}  ${pct(capped, written)}%`);
console.log(`  non-hmstd capped  § 23.231  ${nhsCapped.toLocaleString().padStart(8)}  ${pct(nhsCapped, written)}%`);
console.log(`  no living area on file      ${noArea.toLocaleString().padStart(8)}  ${pct(noArea, written)}%`);
if (written && broken / (written + broken) > 0.01) { console.error('✗ more than 1% of residential rows break the cap arithmetic - refusing.'); process.exit(1); }
if (!written) { console.error('✗ nothing written.'); process.exit(1); }
