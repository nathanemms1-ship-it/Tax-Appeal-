/**
 * sqft-check.mjs — does RentCast's square footage (and assessed value) match
 * the county's own record? (10 Oct 2026)
 *
 * WHY IT MATTERS
 *   The kit's value argument is: median $/sqft of comparable sales x the home's
 *   sqft. If the home's sqft is wrong, the value is wrong by the same percentage.
 *   lib/providers/rentcast.js already records one Hillsborough house where
 *   RentCast said 2,399 sqft and the county said 2,699 (11% low).
 *
 * WHAT IT DOES
 *   scripts/kit/sqft-sample-GA.json holds 120 random residential parcels (15 per
 *   county) pulled from 8 GA counties' public data services: the county's own
 *   heated sqft, 100% value, address and parcel centre. For each one, ONE
 *   RentCast call (homes within ~250 ft of the parcel centre), matched on house
 *   number and street, then compared.
 *
 * OUTPUT
 *   Per county: how many matched, median sqft difference, share within 5% and
 *   10%, and how RentCast's assessed value compares with the county's 100% value.
 *   A ratio near 0.40 means RentCast is carrying the 40% assessed figure, not
 *   market value; well under 1.0 can also mean last year's value.
 *   CSV + JSON in scripts/kit/out/.
 *
 * RUN IT (repo root, on the Mac)
 *   node scripts/kit/sqft-check.mjs --dry-run
 *   node scripts/kit/sqft-check.mjs
 *   node scripts/kit/sqft-check.mjs --counties "Forsyth,Clayton" --per-county 5
 */
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const OUT_DIR = join(HERE, 'out');
const SAMPLE = join(HERE, 'sqft-sample-GA.json');

const median = (xs) => {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
function miles(lat1, lon1, lat2, lon2) {
  const R = 3958.8, r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** "1975 WALKING HORSE TRL" -> { no: '1975', street: 'WALKING' } (first word that isn't a direction). */
export function addrKey(s) {
  const parts = String(s || '').toUpperCase().replace(/[.,#]/g, ' ').split(/\s+/).filter(Boolean);
  const no = parts[0] && /^\d+[A-Z]?$/.test(parts[0]) ? parts[0].replace(/[A-Z]$/, '') : null;
  const dirs = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'NORTH', 'SOUTH', 'EAST', 'WEST']);
  const street = parts.slice(1).find((w) => !dirs.has(w)) || null;
  return { no, street };
}
export function sameAddress(a, b) {
  const x = addrKey(a), y = addrKey(b);
  return !!(x.no && y.no && x.no === y.no && x.street && y.street && x.street === y.street);
}

function selftest() {
  let pass = 0; const fail = [];
  const t = (n, c) => (c ? pass++ : fail.push(n));
  t('same house matches across formats', sameAddress('1975 WALKING HORSE TRL', '1975 Walking Horse Trl, Cumming, GA 30040'));
  t('directional prefix is ignored', sameAddress('309 W GORDON ST', '309 Gordon St, Valdosta, GA 31601'));
  t('different number does not match', !sameAddress('309 W GORDON ST', '311 W Gordon St'));
  t('different street does not match', !sameAddress('37 TOMAHAWK DR', '37 Cherokee Dr'));
  t('no number never matches', !sameAddress('TOMAHAWK DR', 'TOMAHAWK DR'));
  console.log(`selftest: ${pass} passed, ${fail.length} failed`);
  for (const f of fail) console.log('  FAIL:', f);
  process.exit(fail.length ? 1 : 0);
}

function keyFromEnvFile() {
  for (const f of ['.env.local', '.env']) {
    const p = join(REPO, f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/^\s*RENTCAST_API_KEY\s*=\s*"?([^"\n\r]+)"?\s*$/m);
    if (m) return m[1].trim();
  }
  return null;
}
async function promptSecret(q) {
  if (!process.stdin.isTTY) return null;
  process.stdout.write(q + '\n> ');
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = () => {};
  try { return ((await new Promise((res) => rl.question('', res))) || '').trim(); }
  finally { rl.close(); process.stdout.write('\n'); }
}
async function askYes(q) {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return ((await new Promise((res) => rl.question(q, res))) || '').trim().toLowerCase() === 'yes'; }
  finally { rl.close(); }
}
function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

let CALLS = 0;
async function nearby(key, lat, lon) {
  const url = new URL('https://api.rentcast.io/v1/properties');
  url.searchParams.set('latitude', lat.toFixed(6));
  url.searchParams.set('longitude', lon.toFixed(6));
  url.searchParams.set('radius', '0.05');
  url.searchParams.set('limit', '50');
  CALLS++;
  const res = await fetch(url, { headers: { 'X-Api-Key': key, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  if (res.status === 404) return [];
  if (res.status === 401 || res.status === 403) throw new Error('RentCast rejected the API key (401/403). Stopping.');
  if (res.status === 429) throw new Error('RentCast rate limit (429). Stopping.');
  if (!res.ok) throw new Error(`RentCast returned ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
function latestAssessment(p) {
  const t = p?.taxAssessments;
  if (!t || typeof t !== 'object') return { year: null, value: null };
  const y = Object.keys(t).map(Number).filter(Number.isFinite).sort((a, b) => b - a)[0];
  return y ? { year: y, value: num(t[String(y)]?.value) } : { year: null, value: null };
}

async function main() {
  if (arg('selftest', false)) return selftest();
  const sample = JSON.parse(readFileSync(SAMPLE, 'utf8')).homes;
  const only = arg('counties', null);
  const per = Number(arg('per-county', 15));
  const want = only ? String(only).split(',').map((s) => s.trim().toLowerCase()) : null;
  const byCounty = new Map();
  for (const h of sample) {
    if (want && !want.includes(h.county.toLowerCase())) continue;
    const list = byCounty.get(h.county) || [];
    if (list.length < per) list.push(h);
    byCounty.set(h.county, list);
  }
  const homes = [...byCounty.values()].flat();
  console.log(`\nSqft accuracy check — ${byCounty.size} GA counties, ${homes.length} homes, 1 RentCast call each.`);
  console.log(`About ${homes.length} calls (~$${(homes.length * 0.06).toFixed(2)} if over your monthly allowance).\n`);
  if (arg('dry-run', false)) { console.log('Dry run: nothing called.'); return; }

  let key = process.env.RENTCAST_API_KEY || keyFromEnvFile();
  if (!key) key = await promptSecret('RentCast API key (typing hidden): ');
  if (!key) { console.error('No RentCast key.'); process.exit(1); }
  if (!arg('yes', false) && !(await askYes('Type yes to run: '))) { console.log('Stopped.'); return; }

  const rows = [];
  for (const h of homes) {
    let recs = [];
    try { recs = await nearby(key, h.lat, h.lon); }
    catch (e) { console.error(`\n${e.message}`); if (/key|rate/.test(e.message)) break; }
    const match = recs.filter((p) => sameAddress(h.address, p.formattedAddress || p.addressLine1))
      .sort((a, b) => miles(h.lat, h.lon, a.latitude, a.longitude) - miles(h.lat, h.lon, b.latitude, b.longitude))[0];
    const rcSqft = match ? num(match.squareFootage) : null;
    const ass = match ? latestAssessment(match) : { year: null, value: null };
    rows.push({
      county: h.county, parcelId: h.parcelId, address: h.address,
      matched: !!match, rentcastAddress: match?.formattedAddress || '',
      countySqft: h.countySqft, rentcastSqft: rcSqft,
      sqftDiffPct: rcSqft ? Math.round(((rcSqft - h.countySqft) / h.countySqft) * 1000) / 10 : null,
      countyValue: h.countyValue, rentcastAssessed: ass.value, rentcastAssessYear: ass.year,
      valueRatio: ass.value && h.countyValue ? Math.round((ass.value / h.countyValue) * 1000) / 1000 : null,
    });
    process.stdout.write(`\r${h.county.padEnd(10)} ${rows.filter((r) => r.county === h.county).length} checked`);
  }
  process.stdout.write('\n');

  const summary = [...byCounty.keys()].map((c) => {
    const rs = rows.filter((r) => r.county === c);
    const m = rs.filter((r) => r.matched && r.rentcastSqft);
    const absd = m.map((r) => Math.abs(r.sqftDiffPct));
    const years = {}; for (const r of rs) if (r.rentcastAssessYear) years[r.rentcastAssessYear] = (years[r.rentcastAssessYear] || 0) + 1;
    return {
      county: c, homes: rs.length, matchedWithSqft: m.length,
      medianAbsSqftDiffPct: absd.length ? Math.round(median(absd) * 10) / 10 : null,
      within5pct: m.length ? Math.round((absd.filter((d) => d <= 5).length / m.length) * 100) : null,
      within10pct: m.length ? Math.round((absd.filter((d) => d <= 10).length / m.length) * 100) : null,
      medianRentcastSqftVsCounty: median(m.map((r) => r.rentcastSqft / r.countySqft)),
      medianValueRatio: median(rs.map((r) => r.valueRatio)),
      assessYears: Object.entries(years).map(([y, n]) => `${y}:${n}`).join(' '),
    };
  });

  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const csv = join(OUT_DIR, `sqft-check-GA-${stamp}.csv`), js = join(OUT_DIR, `sqft-check-GA-${stamp}.json`);
  const cols = Object.keys(rows[0] || { county: '' });
  const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  writeFileSync(csv, [cols.join(','), ...rows.map((r) => cols.map((k) => esc(r[k])).join(','))].join('\n'));
  writeFileSync(js, JSON.stringify({ ranAt: new Date().toISOString(), calls: CALLS, summary }, null, 2));

  console.log('\nCounty     Matched  sqft diff (median)  within 5%  within 10%  RentCast/county sqft  value ratio  assessment years');
  for (const s of summary) {
    console.log(s.county.padEnd(11) + `${s.matchedWithSqft}/${s.homes}`.padEnd(9) +
      (s.medianAbsSqftDiffPct == null ? '-' : `${s.medianAbsSqftDiffPct}%`).padEnd(20) +
      (s.within5pct == null ? '-' : `${s.within5pct}%`).padEnd(11) + (s.within10pct == null ? '-' : `${s.within10pct}%`).padEnd(12) +
      (s.medianRentcastSqftVsCounty == null ? '-' : s.medianRentcastSqftVsCounty.toFixed(2)).padEnd(22) +
      (s.medianValueRatio == null ? '-' : s.medianValueRatio.toFixed(2)).padEnd(13) + s.assessYears);
  }
  console.log(`\nRentCast calls used: ${CALLS}\nSaved:\n  ${csv}\n  ${js}`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
