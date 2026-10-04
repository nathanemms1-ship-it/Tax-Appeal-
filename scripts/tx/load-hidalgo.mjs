#!/usr/bin/env node
/**
 * Convert Hidalgo CAD's GIS appraisal table (data.csv inside the monthly
 * HCADShapefiles.zip) into a Postgres-COPY-ready CSV with the same columns as
 * scripts/tx/load.mjs.
 *
 *   node scripts/tx/load-hidalgo.mjs --zip tx-data/Hidalgo/hidalgo_gis.zip \
 *                                    --out tx-data/Hidalgo/hidalgo_parcels.csv [--year 2026]
 *
 * ============================================================================
 * WHAT HIDALGO PUBLISHES, AND WHAT IT DOES NOT
 * ============================================================================
 * hidalgoad.org/data-downloads offers no PACS appraisal export - the Dropbox
 * "2026 TYP Certified Export" is minerals only. The GIS zip (Google Drive id
 * 1jdNqzlfEVDkSbWp2eva7S1U93rlDhZdo, refreshed monthly) carries data.csv: one
 * row per account with values, the cap, main area, year built, exemptions,
 * situs and legal description. It is the CURRENT roll at its export date, not a
 * certified snapshot, and it has NO year column - --year names the roll year.
 *
 * It has NO neighbourhood code and NO subdivision code. neighborhood_code is
 * therefore left NULL - never filled with anything we derived, because that
 * column means "the district's own valuation stratum" everywhere downstream,
 * including on public county pages. abs_subdv_cd is filled with the
 * subdivision NAME parsed from the district's legal description ("AFTON PLACE
 * LOT 15" -> "AFTON PLACE"), which lib/tx/comps.js uses as its second rung.
 * Measured 3 Oct 2026: 95.3% of A1 homes land in a parsed subdivision of >= 10
 * homes. Unplatted acreage ("PORCION 41 1.49AC IRR") parses to singletons and
 * falls to the county-wide rung, as it should.
 *
 * ============================================================================
 * VALUES - capValue IS THE CAP LOSS, verified
 * ============================================================================
 *   appraisedValue - capValue = assessedValue  on 238,319 of 238,325 class-A rows
 *   marketValue    -> market_value
 *   assessedValue  -> appraised_value (Tax Code, after the cap)
 *   capValue       -> ONE figure for both caps. Assigned to homestead_cap_loss
 *                     when the account carries a homestead exemption (HS, DVHS,
 *                     OV65, DP and their S variants), otherwise to nhs_cap_loss
 *                     (§ 23.231 applies only to non-homesteads).
 * Refused if more than 1% of rows miss the invariant by more than $5.
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
const zip = arg('zip');
const outPath = arg('out', 'tx-data/Hidalgo/hidalgo_parcels.csv');
const taxYear = Number(arg('year', '2026'));
const residentialOnly = !has('all');
const CAD_ID = 108;
if (!zip) { console.error('usage: node scripts/tx/load-hidalgo.mjs --zip <HCADShapefiles.zip> [--out <file>] [--year 2026] [--all]'); process.exit(2); }

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
const HOMESTEAD = /^(HS|DVHS|DVHSS|OV65|OV65S|DP|DPS)$/;

// Everything from the first lot / block / tract / fractional-call token onward
// is the parcel's position INSIDE the subdivision; what precedes it is the name.
const STOP = /\s+(?:[NSEW]{1,2}\s?\d+(?:\.\d+)?'?|[NSEW]{1,2}\s?\d+\/\d+|[NSEW]{1,2}PT|PT|PART|LOTS?|LTS?|BLK|BLOCK|BK|UNIT|UT|PH|PHASE|SEC|SECTION|TR|TRACT|AC|ACRES?|ABST|#)\b.*$/;
export function subdivisionFromLegal(legal) {
  const d = (legal || '').toUpperCase().replace(/\s+/g, ' ').trim();
  const s = d.replace(STOP, '').replace(/^[\s,-]+|[\s,-]+$/g, '');
  return s || null;
}

/**
 * One record per line - verified: 395,765 records on 395,766 lines, none spans a
 * line. But 14 rows carry UNESCAPED quotes inside a quoted field
 * ("BENTSEN GROVES ADDN C" LOT 260 ...). A strict RFC 4180 reader treats the
 * first stray quote as closing the field and the next as opening one that never
 * ends. So a quote opens a field only at the field's start, and closes it only
 * when the next character is a comma or the end of the line; any other quote is
 * literal text. A doubled quote is still one literal quote.
 */
function splitCsv(text) {
  const out = []; let cur = ''; let q = false; let atStart = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"' && (text[i + 2] === ',' || i + 2 === text.length)) { cur += '"'; i++; q = false; }
      else if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"' && (text[i + 1] === ',' || i + 1 === text.length)) q = false;
      else cur += ch;
    } else if (ch === '"' && atStart) { q = true; atStart = false; }
    else if (ch === ',') { out.push(cur); cur = ''; atStart = true; continue; }
    else { cur += ch; atStart = false; }
  }
  out.push(cur); return out;
}
const clean = (v) => { const s = (v ?? '').trim(); return s === '' || s.toUpperCase() === 'NULL' ? null : s; };
const num = (v) => { const s = clean(v); if (s === null) return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
const csvCell = (v) => (v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'true' : 'false') : `"${String(v).replace(/"/g, '""')}"`);

/** "412 LOS CENIZOS RD, SULLIVAN CITY TX" -> street, city. The roll carries no ZIP. */
function situsParts(s) {
  const t = (s || '').trim();
  const i = t.lastIndexOf(',');
  if (i < 0) return { street: clean(t), city: null };
  const city = t.slice(i + 1).trim().replace(/\s*TX$/i, '').trim();
  return { street: clean(t.slice(0, i)), city: clean(city) };
}

const p = spawn('unzip', ['-p', zip, '*data.csv'], { stdio: ['ignore', 'pipe', 'ignore'] });
const rl = createInterface({ input: p.stdout, crlfDelay: Infinity });
const out = createWriteStream(outPath);
out.write(COLS.join(',') + '\n');

let h = null, read = 0, written = 0, invariantMiss = 0, capped = 0, nhsCapped = 0, noArea = 0, noSubdv = 0;
const seen = new Map(); const dupDiffer = []; let dupSame = 0;
const excluded = new Map(); const bump = (w) => excluded.set(w, (excluded.get(w) || 0) + 1);
for await (const line of rl) {
  const rec = line;
  if (!rec) continue;
  if (!h) {
    h = splitCsv(rec).map((x) => x.trim());
    const need = ['pid', 'propType', 'stateCd', 'imprvActualYearBuilt', 'imprvMainArea', 'landTotalAcres', 'exemptions',
      'landValue', 'improvementValue', 'marketValue', 'appraisedValue', 'capValue', 'assessedValue', 'legalDescription', 'situs'];
    const missing = need.filter((k) => !h.includes(k));
    if (missing.length) { console.error(`✗ data.csv has no ${missing.join(', ')}. Not the file this loader reads.`); process.exit(1); }
    continue;
  }
  const c = splitCsv(rec); const g = Object.fromEntries(h.map((k, i) => [k, c[i]]));
  read++;
  if (g.propType !== 'R') { bump('not_real_property'); continue; }
  const cls = (clean(g.stateCd) || '').toUpperCase();
  if (residentialOnly && cls[0] !== 'A') { bump('not_residential'); continue; }
  const pid = clean(g.pid);
  const key = `${num(g.marketValue)}|${num(g.assessedValue)}`;
  if (seen.has(pid)) { if (seen.get(pid) === key) dupSame++; else dupDiffer.push(`${pid}: kept ${seen.get(pid)}, dropped ${key}`); continue; }
  seen.set(pid, key);

  const pre = num(g.appraisedValue) ?? 0, cap = num(g.capValue) ?? 0, assessed = num(g.assessedValue);
  if (assessed === null) { bump('no_value'); continue; }
  // A row that breaks the cap arithmetic has an assessed value we cannot
  // explain (all 6 seen on 3 Oct 2026 were repeated pids carrying a fraction of
  // the value with no cap). Loading it would show a home as under-assessed by
  // half; leaving it out costs one comp.
  if (Math.abs(pre - cap - assessed) > 5) { invariantMiss++; bump('cap_arithmetic_broken'); continue; }
  const homestead = (g.exemptions || '').toUpperCase().split(/\s+/).some((e) => HOMESTEAD.test(e));
  const area = num(g.imprvMainArea), yb = num(g.imprvActualYearBuilt), acres = num(g.landTotalAcres);
  const subdv = subdivisionFromLegal(g.legalDescription);
  const { street, city } = situsParts(g.situs);
  if (cap > 0) { if (homestead) capped++; else nhsCapped++; }
  if (!(area > 0)) noArea++;
  if (!subdv) noSubdv++;

  const row = {
    cad_id: CAD_ID, account_number: pid, tax_year: taxYear,
    market_value: num(g.marketValue), appraised_value: assessed,
    homestead_cap_loss: homestead ? cap : 0, nhs_cap_loss: homestead ? 0 : cap,
    land_value: num(g.landValue), improvement_value: num(g.improvementValue),
    living_area: area > 0 ? area : null, year_built: yb > 0 ? yb : null, quality_class: null,
    land_size_acres: null, // see load-collin.mjs: the column is 10,000x-scaled in PACS districts and unread
    land_size_sqft: acres > 0 ? Math.round(acres * 43560) : null,
    neighborhood_code: null, abs_subdv_cd: subdv, state_class_code: cls || null,
    situs_street: street, situs_city: city, situs_zip: null,
    has_homestead: homestead, arb_protest_flag: null, source_format: 'HIDALGO_GIS',
  };
  out.write(COLS.map((k) => csvCell(row[k])).join(',') + '\n');
  written++;
}
await new Promise((r) => out.end(r));

const pct = (n, d) => (d ? (n * 100 / d).toFixed(1) : '0.0');
console.log(`${basename(zip)} -> ${outPath}   (Hidalgo, cad_id ${CAD_ID}, roll year ${taxYear} - CURRENT roll, not a certified snapshot)`);
console.log(`  read      ${read.toLocaleString()}\n  written   ${written.toLocaleString()}`);
for (const [w, n] of [...excluded].sort((a, b) => b[1] - a[1])) console.log(`  excluded  ${n.toLocaleString().padStart(9)}  ${w}`);
console.log(`  repeats   ${dupSame.toLocaleString().padStart(9)}  identical repeated accounts dropped`);
if (dupDiffer.length) { console.log(`  repeats   ${dupDiffer.length.toLocaleString().padStart(9)}  repeated accounts with DIFFERENT values - first kept:`); dupDiffer.slice(0, 10).forEach((d) => console.log(`              ${d}`)); }
console.log(`\n  homestead capped  § 23.23   ${capped.toLocaleString().padStart(8)}  ${pct(capped, written)}%`);
console.log(`  non-hmstd capped  § 23.231  ${nhsCapped.toLocaleString().padStart(8)}  ${pct(nhsCapped, written)}%`);
console.log(`  no living area on file      ${noArea.toLocaleString().padStart(8)}  ${pct(noArea, written)}%`);
console.log(`  no subdivision parsed       ${noSubdv.toLocaleString().padStart(8)}  ${pct(noSubdv, written)}%`);
console.log(`\n  invariant   appraised - cap = assessed missed by >$5 on ${invariantMiss.toLocaleString()} rows`);
if (written && invariantMiss / written > 0.01) { console.error('✗ more than 1% break the cap arithmetic - refusing.'); process.exit(1); }
if (!written) { console.error('✗ nothing written.'); process.exit(1); }
