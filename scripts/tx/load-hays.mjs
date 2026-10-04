#!/usr/bin/env node
/**
 * Convert Hays CAD's 2026 Orion certified export plus its 2026 property-data
 * export into a Postgres-COPY-ready CSV with the same columns as scripts/tx/load.mjs.
 *
 *   node scripts/tx/load-hays.mjs --dir tx-data/Hays --out tx-data/Hays/hays_parcels.csv
 *
 * ============================================================================
 * SOURCES  (https://hayscad.com/data-downloads/ - Cloudflare refuses every
 * non-browser request, so both are browser downloads)
 * ============================================================================
 *   hays_orion_2026_certified.zip   2026_07_18_2127-Orion-2026-Certified-Export.zip
 *       PropertyExport (state class, situs, CERT), EntityExport (values - Hays
 *       DOES publish a CAD entity row, unlike Fort Bend), ExemptionExport (HS).
 *   hays_pde_2026_property.zip / hays_pde_2026_segment.zip
 *       the PROPERTY and SEGMENT members of 2026-PROPERTY-DATA-EXPORT-FILES-AS-
 *       OF-8-26-2026.zip (themselves zips). PROPERTY carries NbhdCode and
 *       LegalLocationCode (subdivision); SEGMENT carries Type + Description +
 *       Area, so living area runs through the same isLivingArea() as PACS.
 *
 * VALUES ARE THE CERTIFIED ONES. The property-data export's CurrMarketValue is
 * the roll as of 26 Aug, after supplements; it is read for NOTHING but the
 * neighbourhood, subdivision and segments.
 *
 *   CAD MarketValue -> market_value; AssessedValue -> appraised_value
 *   HSCapAdj -> homestead_cap_loss; CBLCapAdj -> nhs_cap_loss
 *   Market - HSCapAdj - CBLCapAdj - AgLoss = Assessed; breaks excluded, >1% refuses.
 */

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { isLivingArea } from '../../lib/tx/pacs.js';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};
const has = (n) => process.argv.includes(`--${n}`);
// Defaults are Hays. Any Orion district that ships the same certified export
// plus a property-data export loads with flags, e.g. Orange (4 Oct 2026):
//   --dir tx-data/Orange --cad 181 --name Orange --format ORANGE_ORION
//   --orion "2026 Certified Export Vendor.zip"
//   --pde-property "Property Data Export - Property.zip"
//   --pde-segment  "Property Data Export - Segment.zip"
const dir = arg('dir', 'tx-data/Hays');
const NAME = arg('name', 'Hays');
const outPath = arg('out', join(dir, `${NAME.toLowerCase().replace(/\s+/g, '')}_parcels.csv`));
const taxYear = Number(arg('year', '2026'));
const residentialOnly = !has('all');
const CAD_ID = Number(arg('cad', '105'));
const FORMAT = arg('format', 'HAYS_ORION');
const ORION = join(dir, arg('orion', 'hays_orion_2026_certified.zip'));
const PDE_PROPERTY = join(dir, arg('pde-property', 'hays_pde_2026_property.zip'));
const PDE_SEGMENT = join(dir, arg('pde-segment', 'hays_pde_2026_segment.zip'));

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

const homestead = new Set();
for await (const e of rows(ORION, '*ExemptionExport.txt')) if ((e.ExemptionCode || '').trim() === 'HS') homestead.add(e.OwnerQuickRefID);
console.log(`  exemptions        ${homestead.size.toLocaleString()} homesteads`);

const values = new Map();
// The CAD row where the district publishes one (Hays). Where it does not
// (Orange), any taxing unit's row: value, cap and ag columns are property-level
// and agreed across every unit on all 69,890 Orange properties - checked below.
let disagree = 0;
for await (const v of rows(ORION, '*EntityExport.txt')) {
  const prior = values.get(v.OwnerQuickRefID);
  if (prior && !prior.fromCad && v.EntityCode !== 'CAD') {
    if (prior.market !== num(v.MarketValue) || prior.assessed !== num(v.AssessedValue)) disagree++;
    continue;
  }
  if (prior?.fromCad) continue;
  values.set(v.OwnerQuickRefID, {
    fromCad: v.EntityCode === 'CAD',
    market: num(v.MarketValue), assessed: num(v.AssessedValue),
    hs: num(v.HSCapAdj) ?? 0, cbl: num(v.CBLCapAdj) ?? 0,
    // Productivity (ag-use) land: Orion leaves AgLoss at 0 on these rows and
    // carries the reduction as AgMktValue - AgUseValue. Hays R100488:
    // 840,057 - 13,437 - (318,870 - 1,040) = 508,790 = AssessedValue.
    ag: (num(v.AgLoss) || 0) || Math.max(0, (num(v.AgMktValue) ?? 0) - (num(v.AgUseValue) ?? 0)),
    land: (num(v.LandHSValue) ?? 0) + (num(v.LandNHSValue) ?? 0) + (num(v.AgMktValue) ?? 0),
    imp: (num(v.ImpHSValue) ?? 0) + (num(v.ImpNHSValue) ?? 0),
  });
}
console.log(`  values            ${values.size.toLocaleString()} properties${disagree ? `, ${disagree} where taxing units disagree (first kept)` : ''}`);
if (disagree > values.size * 0.01) { console.error('✗ taxing units disagree on value for more than 1% of properties - pick an entity explicitly.'); process.exit(1); }

const pde = new Map();
for await (const p of rows(PDE_PROPERTY, '*.txt')) {
  pde.set(p.QuickRefID, { nbhd: clean(p.NbhdCode), subdv: clean(p.LegalLocationCode), zip: clean(p.SitusZip) });
}
console.log(`  property-data     ${pde.size.toLocaleString()} properties`);

const segs = new Map();
for await (const s of rows(PDE_SEGMENT, '*.txt')) {
  if (!isLivingArea(s.Type, s.Description)) continue;
  const cur = segs.get(s.QuickRefID) || { area: 0, yb: null };
  cur.area += num(s.Area) ?? 0;
  const y = num(s.ActYrBuilt);
  if (y > 1800 && (!cur.yb || y < cur.yb)) cur.yb = y;
  segs.set(s.QuickRefID, cur);
}
console.log(`  living segments   ${segs.size.toLocaleString()} properties`);

const out = createWriteStream(outPath);
out.write(COLS.join(',') + '\n');
const excluded = new Map(); const bump = (w) => excluded.set(w, (excluded.get(w) || 0) + 1);
let read = 0, written = 0, capped = 0, nhsCapped = 0, noArea = 0, broken = 0;
const seen = new Set();
for await (const p of rows(ORION, '*PropertyExport.txt')) {
  read++;
  if (num(p.TaxYear) !== taxYear) { bump('other_year'); continue; }
  const id = clean(p.PropertyQuickRefID);
  if (!id || seen.has(id)) { bump('duplicate_or_blank_id'); continue; }
  seen.add(id);
  const cls = (clean(p.StateCodeImp) || clean(p.StateCodeLand) || '').toUpperCase();
  if (residentialOnly && cls[0] !== 'A') { bump('not_residential'); continue; }
  const v = values.get(id);
  if (!v || v.market === null || v.assessed === null) { bump('no_cad_value'); continue; }
  if (Math.abs(v.market - v.hs - v.cbl - v.ag - v.assessed) > 5) { broken++; bump('cap_arithmetic_broken'); continue; }
  if (v.hs > 0) capped++;
  if (v.cbl > 0) nhsCapped++;
  const sg = segs.get(id); const x = pde.get(id) || {};
  if (!(sg?.area > 0)) noArea++;
  const acres = num(p.Acres);
  const row = {
    cad_id: CAD_ID, account_number: id, tax_year: taxYear,
    market_value: v.market, appraised_value: v.assessed,
    homestead_cap_loss: v.hs, nhs_cap_loss: v.cbl,
    land_value: v.land, improvement_value: v.imp,
    living_area: sg?.area > 0 ? sg.area : null, year_built: sg?.yb ?? null, quality_class: null,
    land_size_acres: null, // 10,000x-scaled and unread in PACS districts; sqft carries lot size
    land_size_sqft: acres > 0 ? Math.round(acres * 43560) : null,
    neighborhood_code: x.nbhd ?? null, abs_subdv_cd: x.subdv ?? null,
    state_class_code: cls || null,
    situs_street: clean(p.SitusStreetAddress), situs_city: clean(p.SitusCity),
    situs_zip: (clean(p.SitusZip) || x.zip || '').slice(0, 5) || null,
    has_homestead: homestead.has(id) || v.hs > 0,
    arb_protest_flag: p.ARBProtestFlag === '1' ? true : p.ARBProtestFlag === '0' ? false : null,
    source_format: FORMAT,
  };
  out.write(COLS.map((k) => csvCell(row[k])).join(',') + '\n');
  written++;
}
await new Promise((r) => out.end(r));
const pct = (n, d) => (d ? (n * 100 / d).toFixed(1) : '0.0');
console.log(`\n${NAME} (cad_id ${CAD_ID}, ${taxYear} certified) -> ${outPath}`);
console.log(`  read      ${read.toLocaleString()}\n  written   ${written.toLocaleString()}`);
for (const [w, n] of [...excluded].sort((a, b) => b[1] - a[1])) console.log(`  excluded  ${n.toLocaleString().padStart(9)}  ${w}`);
console.log(`\n  homestead capped  § 23.23   ${capped.toLocaleString().padStart(8)}  ${pct(capped, written)}%`);
console.log(`  non-hmstd capped  § 23.231  ${nhsCapped.toLocaleString().padStart(8)}  ${pct(nhsCapped, written)}%`);
console.log(`  no living area on file      ${noArea.toLocaleString().padStart(8)}  ${pct(noArea, written)}%`);
if (written && broken / (written + broken) > 0.01) { console.error('✗ more than 1% of residential rows break the cap arithmetic - refusing.'); process.exit(1); }
if (!written) { console.error('✗ nothing written.'); process.exit(1); }
