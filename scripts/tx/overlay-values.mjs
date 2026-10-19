#!/usr/bin/env node
/**
 * Put a district's IN-SEASON values onto last year's property records. 19 Oct 2026.
 *
 *   node scripts/tx/overlay-values.mjs --format dcad-notice \
 *        --base tx-data/Dallas/dallas_parcels.csv \
 *        --values tx-data/Dallas/MAIL1_APPRAISAL_NOTICE_DATA_2027.zip \
 *        --year 2027 --out tx-data/Dallas2027/dallas2027_parcels.csv
 *
 *   node scripts/tx/overlay-values.mjs --format tad-r \
 *        --base tx-data/Tarrant/tarrant_parcels.csv \
 *        --values "tx-data/Tarrant/PropertyData(Delimited)_R.ZIP" \
 *        --year 2027 --out tx-data/Tarrant2027/tarrant2027_parcels.csv
 *
 * ============================================================================
 * WHY
 * ============================================================================
 * A protest kit compares the customer's value with this year's values of
 * similar homes in the same neighborhood (§ 41.43(b)(3)). Dallas and Tarrant
 * both publish this year's values in season, but in files that carry NO
 * neighborhood code:
 *   Dallas   MAIL1_APPRAISAL_NOTICE_DATA_<year>.zip, published with the April
 *            notices (2026: member dated 30 March). Tab-delimited, no header.
 *   Tarrant  PropertyData(Delimited)_R.ZIP, refreshed continuously, pipe-
 *            delimited with a header; carries the notice date.
 * Neighborhoods, size, age and class barely change year to year, and we
 * already hold them from the certified roll. So this joins by account number:
 * last year's characteristics, this year's values. Output is the ordinary
 * tx_parcels CSV for the new tax year, loaded with push.mjs like any other.
 *
 * ============================================================================
 * THE COLUMNS, AND HOW THEY WERE ESTABLISHED
 * ============================================================================
 * DCAD publishes no layout for the notice file. Its columns were identified on
 * 19 Oct 2026 by matching the 2026 notice file against the 2026 certified roll
 * for 60,000 accounts (the notice values are pre-protest, so most but not all
 * agree):
 *   [0] year  [1] 17-digit account
 *   [3] market value           equal to certified TOT_VAL on 82.6%
 *   [4] land value             equal to certified land on 99.8%
 *   [68] appraised (capped)    equal to certified HMSTD_CAP_VAL on 86.5%
 * DCAD CHANGES THE FILE'S SHAPE BETWEEN YEARS. The 2025 file was a comma CSV
 * WITH a header; the 2026 file was tab-delimited with none. The columns were
 * the same 94 in the same order, and the 2025 header names them:
 * APPRAISAL_YR, ACCOUNT_NUM, TOT_VAL, LAND_VAL, CAP_VALUE (the capped value).
 * So the reader sniffs the delimiter from the first line, and when a header is
 * there it takes those five by NAME, whatever position they move to. With no
 * header it falls back to the positions above. A changed layout would show up
 * as a collapse in the written %, which --strict refuses.
 *
 * Tarrant's file has a header: Total_Value (market), Land_Value,
 * Improvement_Value, Appraisal_Year. Its Appraised_Value is NOT the capped
 * value: on 60,621 capped homesteads it equals market (19 Oct 2026). So the
 * capped value is ESTIMATED from the statute:
 *   homestead (§ 23.23)       min(market, last year's appraised x 1.10)
 *   non-homestead (§ 23.231)  no cap in 2027: the section expires
 *                             31 Dec 2026 unless the Legislature extends it;
 *                             pass --nhs-cap=0.20 if it does
 * The estimate ignores new improvements (which the cap does not cover) and
 * changes of homestead status. Measured on Dallas, which does publish the
 * capped value: estimating 2026 from 2025 this way matched DCAD's own capped
 * value within 1% on 90.1% of 186,602 homesteads; 7.7% came out low (new
 * improvements), 2.2% high (19 Oct 2026). Rows carrying it are marked source_format
 * "...+CAPEST" so a reader can tell.
 *
 * Accounts with values but no characteristics (new construction, splits) are
 * dropped and counted: we cannot compare a home we cannot describe.
 */
import { createReadStream, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { dirname } from 'node:path';

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); if (i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1]; const eq = process.argv.find((a) => a.startsWith(`--${k}=`)); return eq ? eq.split('=')[1] : d; };
const has = (k) => process.argv.includes(`--${k}`);

export const FORMATS = Object.freeze({
  'dcad-notice': { cad: 57, delimiter: 'sniff', header: 'optional', names: { 0: 'APPRAISAL_YR', 1: 'ACCOUNT_NUM', 3: 'TOT_VAL', 4: 'LAND_VAL', 68: 'CAP_VALUE' }, account: (c) => c[1], year: (c) => c[0], market: (c) => c[3], land: (c) => c[4], appraised: (c) => c[68], improvement: null, minCols: 69 },
  'tad-r': { cad: 220, delimiter: '|', header: true, account: (r) => String(r.Account_Num || '').trim().padStart(12, '0'), year: (r) => r.Appraisal_Year, market: (r) => r.Total_Value, land: (r) => r.Land_Value, appraised: null, improvement: (r) => r.Improvement_Value },
});

const int = (v) => { const n = Number(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? Math.round(n) : null; };

// ── CSV (the base file is our own output: quoted fields, no embedded newlines) ──
export function parseCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out;
}
const csvCell = (v) => (v === null || v === undefined || v === '' ? '' : `"${String(v).replace(/"/g, '""')}"`);

/**
 * One output row from a base row and this year's values. Pure, for verify.
 * @param {object} base   a base CSV row as an object (our columns)
 * @param {object} v      { market, land, improvement?, appraised? }
 * @param {object} opts   { year, hsCap = 0.10, nhsCap = 0, estimated: boolean }
 */
export function overlayRow(base, v, { year, hsCap = 0.10, nhsCap = 0 } = {}) {
  const market = int(v.market); const land = int(v.land);
  if (!(market > 0)) return null;
  const improvement = v.improvement != null ? int(v.improvement) : (land != null ? Math.max(0, market - land) : null);
  const homestead = String(base.has_homestead) === 'true';
  let appraised = v.appraised != null ? int(v.appraised) : null;
  let estimated = false;
  if (appraised === null || !(appraised > 0)) {
    const prior = int(base.appraised_value);
    const rate = homestead ? hsCap : nhsCap;
    appraised = rate > 0 && prior > 0 ? Math.min(market, Math.round(prior * (1 + rate))) : market;
    estimated = true;
  }
  appraised = Math.min(appraised, market);
  const loss = market - appraised;
  return {
    ...base,
    tax_year: String(year), market_value: String(market), appraised_value: String(appraised),
    land_value: land != null ? String(land) : base.land_value, improvement_value: improvement != null ? String(improvement) : base.improvement_value,
    homestead_cap_loss: String(homestead ? loss : 0), nhs_cap_loss: String(homestead ? 0 : loss),
    arb_protest_flag: '',
    source_format: `${base.source_format || ''}+INSEASON${estimated ? '+CAPEST' : ''}`,
  };
}

/**
 * Rows of a values file. For a format with header: 'optional' (Dallas), the
 * first line decides: a tab means tab-delimited, else comma; a first cell equal
 * to the name of column 0 means a header, and the named columns are moved to
 * the positions the accessors read. Exported for verify.
 */
export function makeLineReader(fmt) {
  let delim = fmt.delimiter === 'sniff' ? null : fmt.delimiter;
  let header = null; let remap = null; let first = true;
  return (line) => {
    line = line.replace(/^\uFEFF/, '').replace(/\r$/, '');
    if (!line.trim()) return null;
    if (!delim) delim = line.includes('\t') ? '\t' : ',';
    const cells = line.split(delim).map((c) => c.trim());
    if (fmt.header === true) {
      if (!header) { header = cells; return null; }
      return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
    }
    if (first) {
      first = false;
      if (fmt.header === 'optional' && fmt.names && cells[0].toUpperCase() === fmt.names[0]) {
        const at = Object.fromEntries(cells.map((h, i) => [h.toUpperCase(), i]));
        const missing = Object.values(fmt.names).filter((n) => !(n in at));
        if (missing.length) throw new Error(`values file header lacks ${missing.join(', ')}: the layout has changed, check it before loading`);
        remap = Object.entries(fmt.names).map(([pos, n]) => [Number(pos), at[n]]);
        return null;
      }
    }
    if (!remap) return cells;
    const out = Array(Math.max(fmt.minCols || 0, cells.length)).fill('');
    for (const [pos, src] of remap) out[pos] = cells[src];
    return out;
  };
}

async function* valueRows(path, fmt) {
  const isZip = /\.zip$/i.test(path);
  const src = isZip ? spawn('unzip', ['-p', path]).stdout : createReadStream(path);
  const rl = createInterface({ input: src, crlfDelay: Infinity });
  const read = makeLineReader(fmt);
  for await (const line of rl) { const r = read(line); if (r) yield r; }
}

async function main() {
  const fmt = FORMATS[arg('format')];
  const basePath = arg('base'); const valuesPath = arg('values'); const year = Number(arg('year')); const out = arg('out');
  if (!fmt || !basePath || !valuesPath || !year || !out) {
    console.error('usage: --format dcad-notice|tad-r --base <csv> --values <zip|txt> --year <yyyy> --out <csv> [--nhs-cap=0.20] [--strict]');
    process.exit(2);
  }
  const nhsCap = Number(arg('nhs-cap', '0')) || 0;

  // Base: our own tx_parcels CSV for last year.
  const lines = readFileSync(basePath, 'utf8').split('\n').filter(Boolean);
  const cols = parseCsvLine(lines[0]);
  const base = new Map();
  for (const l of lines.slice(1)) { const c = parseCsvLine(l); const o = Object.fromEntries(cols.map((k, i) => [k, c[i]])); base.set(o.account_number, o); }
  const baseCad = Number([...base.values()][0]?.cad_id);
  const baseYear = Number([...base.values()][0]?.tax_year);
  if (baseCad !== fmt.cad) { console.error(`✗ base file is cad ${baseCad}, format ${arg('format')} is cad ${fmt.cad}`); process.exit(1); }
  if (!(year > baseYear)) { console.error(`✗ --year ${year} must be after the base roll's year ${baseYear}`); process.exit(1); }

  const seen = new Set(); const stats = { rows: 0, wrongYear: 0, noBase: 0, dup: 0, bad: 0, written: 0, estimated: 0, short: 0 };
  const outRows = [];
  for await (const r of valueRows(valuesPath, fmt)) {
    stats.rows++;
    if (fmt.header !== true && r.length < fmt.minCols) { stats.short++; continue; }
    if (Number(fmt.year(r)) !== year) { stats.wrongYear++; continue; }
    const acct = fmt.account(r);
    if (seen.has(acct)) { stats.dup++; continue; }
    seen.add(acct);
    const b = base.get(acct);
    if (!b) { stats.noBase++; continue; }
    const row = overlayRow(b, { market: fmt.market(r), land: fmt.land(r), appraised: fmt.appraised ? fmt.appraised(r) : null, improvement: fmt.improvement ? fmt.improvement(r) : null }, { year, nhsCap });
    if (!row) { stats.bad++; continue; }
    if (row.source_format.endsWith('+CAPEST')) stats.estimated++;
    outRows.push(row); stats.written++;
  }

  const kept = stats.written; const baseN = base.size;
  console.log(`\n${arg('format')}  cad ${fmt.cad}  base ${baseYear} (${baseN.toLocaleString()} homes)  ->  ${year}`);
  console.log(`  value rows read          ${stats.rows.toLocaleString()}`);
  console.log(`  wrong year (skipped)     ${stats.wrongYear.toLocaleString()}${stats.wrongYear === stats.rows ? '   <- the file is not for this year yet' : ''}`);
  console.log(`  no base record (new/split, dropped) ${stats.noBase.toLocaleString()}`);
  console.log(`  duplicates / unusable    ${stats.dup.toLocaleString()} / ${(stats.bad + stats.short).toLocaleString()}`);
  console.log(`  WRITTEN                  ${kept.toLocaleString()}  = ${(100 * kept / baseN).toFixed(1)}% of last year's homes`);
  if (stats.estimated) console.log(`  capped value estimated   ${stats.estimated.toLocaleString()} (statutory cap from last year's appraised; marked +CAPEST)`);

  if (has('strict') && kept / baseN < 0.9) { console.error(`✗ --strict: only ${(100 * kept / baseN).toFixed(1)}% of homes matched. Check the format before loading.`); process.exit(1); }
  if (!kept) { console.error('✗ nothing to write'); process.exit(1); }

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, [cols.join(','), ...outRows.map((o) => cols.map((k) => (k === 'cad_id' || k === 'account_number' || k === 'tax_year' ? `"${o[k]}"` : csvCell(o[k]))).join(','))].join('\n') + '\n');
  console.log(`\n  -> ${out}\n  Load it with:  node scripts/tx/push.mjs --county ${dirname(out).split('/').pop()}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
