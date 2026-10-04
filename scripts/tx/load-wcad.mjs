#!/usr/bin/env node
/**
 * Convert Williamson CAD's open-data tables (data.wcad.org, Socrata) into a
 * Postgres-COPY-ready CSV with the same columns as scripts/tx/load.mjs.
 *
 *   node scripts/tx/load-wcad.mjs --dir tx-data/Williamson --out tx-data/Williamson/williamson_parcels.csv
 *
 * Reads three CSV exports, each fetched from
 *   https://data.wcad.org/api/views/<id>/rows.csv?accessType=DOWNLOAD
 *   property_certified_2026.csv   ai3c-c9pf  "Property - Certified"  (Tax Year column)
 *   property_characteristics.csv  cvyp-ab5t  "Property Characteristics"
 *   exemptions_2026.csv           nbn7-h4pp  "Exemptions"            (AdHocTaxYear column)
 *
 * ============================================================================
 * WHICH TABLES, AND THE ONE THAT LIES ABOUT ITS YEAR
 * ============================================================================
 * Values come from "Property - Certified" ONLY. Its Tax Year is 2026 on every
 * row and TotalPropMktValue agrees with Property Characteristics' Market Value
 * on 207,894 of 207,904 A1 homes. The "Asmt - Certified" and "Final Values -
 * Certified" tables return the 2025 value for the same account (property 62582:
 * $417,118 there against $394,923 here, and Final Values labels its row 2025
 * while Asmt labels the same figure 2026). Do not join them.
 *
 *   TotalPropMktValue  -> market_value
 *   TotalAssessedValue -> appraised_value (Tax Code: after the caps; never above market on any A1 row)
 *   market - assessed  -> the cap loss, ONE figure. Booked as homestead_cap_loss
 *                         when the account holds an active Homestead exemption,
 *                         else nhs_cap_loss when it holds Circuit Breaker
 *                         Limitation, else homestead (the § 23.23 default).
 *
 * Property Characteristics supplies the Comptroller state class (StateCode, the
 * residential boundary - see lib/tx/pacs.js) and year built. A property with no
 * characteristics row has no state class and is not loaded. Some properties
 * carry several rows (several buildings): the first row's class, the OLDEST year.
 * Living area is the property table's TotalSqFtLivingArea, the district's total.
 */

import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};
const has = (n) => process.argv.includes(`--${n}`);
const dir = arg('dir', 'tx-data/Williamson');
const outPath = arg('out', join(dir, 'williamson_parcels.csv'));
const taxYear = Number(arg('year', '2026'));
const residentialOnly = !has('all');
const CAD_ID = 246;

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

/** Stream an RFC 4180 CSV as objects keyed by header. Records may span lines. */
async function* rows(file) {
  const rl = createInterface({ input: createReadStream(join(dir, file), { encoding: 'utf8' }), crlfDelay: Infinity });
  let h = null, buf = '';
  for await (const line of rl) {
    buf = buf ? buf + '\n' + line : line;
    if (quotesOpen(buf)) continue;
    const c = splitCsv(buf); buf = '';
    if (!h) { h = c.map((x) => x.replace(/^﻿/, '').trim()); continue; }
    yield Object.fromEntries(h.map((k, i) => [k, c[i]]));
  }
}

// ── 1. exemptions ───────────────────────────────────────────────────────────
const homestead = new Set(), circuit = new Set();
let exYearOther = 0;
for await (const e of rows('exemptions_2026.csv')) {
  if (num(e.AdHocTaxYear) !== taxYear) { exYearOther++; continue; }
  if (e.ExemptionStatusCode !== 'A') continue;
  const t = (e.ExemptionTypeDescription || '').trim();
  if (t === 'Homestead') homestead.add(e.PropertyID);
  else if (t === 'Circuit Breaker Limitation') circuit.add(e.PropertyID);
}
console.log(`  exemptions        ${homestead.size.toLocaleString()} homestead, ${circuit.size.toLocaleString()} circuit breaker${exYearOther ? ` (${exYearOther} rows from another year ignored)` : ''}`);

// ── 2. characteristics ──────────────────────────────────────────────────────
const chars = new Map();
for await (const c of rows('property_characteristics.csv')) {
  const id = clean(c.PropertyID); if (!id) continue;
  const yb = num(c.YearBuild);
  const cur = chars.get(id);
  if (!cur) chars.set(id, { cls: (clean(c.StateCode) || '').toUpperCase(), yb: yb > 0 ? yb : null });
  else if (yb > 0 && (!cur.yb || yb < cur.yb)) cur.yb = yb;
}
console.log(`  characteristics   ${chars.size.toLocaleString()} properties`);

// ── 3. certified property values ────────────────────────────────────────────
const out = createWriteStream(outPath);
out.write(COLS.join(',') + '\n');
const excluded = new Map(); const bump = (w) => excluded.set(w, (excluded.get(w) || 0) + 1);
let read = 0, written = 0, capped = 0, nhsCapped = 0, noArea = 0, overMarket = 0;
const seen = new Set();
for await (const p of rows('property_certified_2026.csv')) {
  read++;
  if (num(p['Tax Year']) !== taxYear) { bump('other_year'); continue; }
  const id = clean(p.PropertyID);
  if (!id || seen.has(id)) { bump('duplicate_or_blank_id'); continue; }
  seen.add(id);
  const ch = chars.get(id);
  const cls = ch?.cls || '';
  if (residentialOnly && cls[0] !== 'A') { bump(ch ? 'not_residential' : 'no_state_class'); continue; }
  const market = num(p.TotalPropMktValue), assessed = num(p.TotalAssessedValue);
  if (market === null || assessed === null) { bump('no_value'); continue; }
  if (assessed > market + 1) { overMarket++; bump('assessed_above_market'); continue; }
  const cap = Math.max(0, Math.round(market - assessed));
  const hs = homestead.has(id);
  const toNhs = cap > 0 && !hs && circuit.has(id);
  if (cap > 0) { if (toNhs) nhsCapped++; else capped++; }
  const area = num(p.TotalSqFtLivingArea);
  if (!(area > 0)) noArea++;
  const acres = num(p.Acres);
  const row = {
    cad_id: CAD_ID, account_number: id, tax_year: taxYear,
    market_value: market, appraised_value: assessed,
    homestead_cap_loss: toNhs ? 0 : cap, nhs_cap_loss: toNhs ? cap : 0,
    land_value: num(p.TotalLandMktValue), improvement_value: num(p.TotalImpMktValue),
    living_area: area > 0 ? area : null, year_built: ch?.yb ?? null, quality_class: null,
    land_size_acres: null, // 10,000x-scaled and unread in PACS districts; sqft carries lot size
    land_size_sqft: acres > 0 ? Math.round(acres * 43560) : null,
    neighborhood_code: clean(p.NeighborhoodCode), abs_subdv_cd: clean(p.LegalLocationCode),
    state_class_code: cls || null,
    situs_street: [p.StreetNumber, p.StreetDirectional, p.StreetName, p.StreetSuffix].map(clean).filter(Boolean).join(' ') || null,
    situs_city: clean(p.City), situs_zip: (clean(p.Zip) || '').slice(0, 5) || null,
    has_homestead: hs, arb_protest_flag: null, source_format: 'WCAD_SOCRATA',
  };
  out.write(COLS.map((k) => csvCell(row[k])).join(',') + '\n');
  written++;
}
await new Promise((r) => out.end(r));
const pct = (n, d) => (d ? (n * 100 / d).toFixed(1) : '0.0');
console.log(`\nWilliamson (cad_id ${CAD_ID}, ${taxYear} certified) -> ${outPath}`);
console.log(`  read      ${read.toLocaleString()}\n  written   ${written.toLocaleString()}`);
for (const [w, n] of [...excluded].sort((a, b) => b[1] - a[1])) console.log(`  excluded  ${n.toLocaleString().padStart(9)}  ${w}`);
console.log(`\n  homestead capped  § 23.23   ${capped.toLocaleString().padStart(8)}  ${pct(capped, written)}%`);
console.log(`  non-hmstd capped  § 23.231  ${nhsCapped.toLocaleString().padStart(8)}  ${pct(nhsCapped, written)}%`);
console.log(`  no living area on file      ${noArea.toLocaleString().padStart(8)}  ${pct(noArea, written)}%`);
if (written && overMarket / written > 0.01) { console.error('✗ assessed exceeds market on more than 1% - the value columns are not what this loader assumes.'); process.exit(1); }
if (!written) { console.error('✗ nothing written.'); process.exit(1); }
