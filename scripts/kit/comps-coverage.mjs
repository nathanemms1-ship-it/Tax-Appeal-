/**
 * comps-coverage.mjs — the go/no-go test for the Kit model (10 Oct 2026).
 *
 * QUESTION IT ANSWERS
 *   For a typical single-family home in each county, does RentCast return at least
 *   3 clean recorded sales of similar homes nearby? A county that fails cannot be
 *   sold under the kit model, because the comps ARE the evidence.
 *
 * WHAT IT DOES, PER COUNTY
 *   1. Picks random points inside the county (uniform over a disc around the
 *      Census centroid, sized from the county's land area).
 *   2. Call 1: Single Family homes within 0.25 mi of the point -> up to 5 random
 *      "subjects". Call 2: homes within 2 mi that SOLD in the last 365 days.
 *      (See rentcastNearby for why: the first version used one 2-mile call.)
 *   3. For each subject, counts comps out of call 2, using the kit rules:
 *        - a recorded sale with price and date in the last 12 months
 *        - not the subject itself
 *        - heated sqft within ±20%, year built within ±15 years
 *        - price per sqft within 0.5x–1.6x of the area's median (drops
 *          foreclosures, family transfers, land-only sales)
 *        - within 1 mile, else within 2 miles
 *   So ~5 subjects cost 2 billed calls. 25 subjects per county ≈ 10 calls.
 *
 * PASS RULE
 *   A county PASSES when at least 80% of its subjects have ≥3 comps within 2 miles.
 *
 * WHAT IT DOES NOT DO (yet)
 *   - Check RentCast's sqft against the county's own record. Phase 2, for the GA
 *     counties with live services (Forsyth, Clayton, Richmond, Lowndes...).
 *   - Run the backup provider. Its adapter is written once a trial key exists.
 *   - Texas. Texas is a non-disclosure state: sale prices are not public, and
 *     RentCast says they may be missing. Texas stays on its loaded rolls.
 *
 * RUN IT (from the repo root, on the Mac)
 *   node scripts/kit/comps-coverage.mjs --selftest
 *   node scripts/kit/comps-coverage.mjs --state GA --counties "Cobb,Hall" --probe
 *   node scripts/kit/comps-coverage.mjs --state GA --dry-run
 *   node scripts/kit/comps-coverage.mjs --state GA
 *
 *   Options:
 *     --state GA|FL            default GA
 *     --counties "Cobb,Fulton" only these counties
 *     --per-county 25          subjects per county
 *     --probe                  3 calls per county: shows what RentCast returns (run first)
 *     --probe-filter           9 calls per county: tests sale-date filter formats and 0.5-mi tiles
 *     --budget 300             hard ceiling on billed RentCast calls for this run
 *     --radius 5 --days 730    widen the comp window (exurban/rural counties)
 *     --yes                    skip the "type yes to spend" prompt
 *
 * THE KEY
 *   Read from RENTCAST_API_KEY in the environment, else from .env.local, else
 *   asked for with typing hidden. It is never printed and never written to disk.
 *
 * OUTPUT
 *   scripts/kit/out/coverage-<STATE>-<timestamp>.csv   one row per subject
 *   scripts/kit/out/coverage-<STATE>-<timestamp>.json  per-county summary
 *   and a summary table on screen.
 */
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'out');
const REPO = join(HERE, '..', '..');

// ── County centroids: Census 2024 Gazetteer (INTPTLAT/INTPTLONG, ALAND_SQMI) ──
// GA = owner-occupied top 25 (lib/appealAddresses.js TARGET_COUNTIES.GA).
// FL = the 13 counties in Florida_Market_Sizing_13_Counties_2026-08-01.
const COUNTIES = {
  GA: [
    { county: 'Fulton', lat: 33.79003, lon: -84.46818, sqmi: 527 },
    { county: 'Gwinnett', lat: 33.95876, lon: -84.02573, sqmi: 431 },
    { county: 'Cobb', lat: 33.93993, lon: -84.57411, sqmi: 340 },
    { county: 'DeKalb', lat: 33.77066, lon: -84.22634, sqmi: 268 },
    { county: 'Cherokee', lat: 34.24402, lon: -84.47596, sqmi: 422 },
    { county: 'Forsyth', lat: 34.22548, lon: -84.12726, sqmi: 224 },
    { county: 'Chatham', lat: 31.97416, lon: -81.09256, sqmi: 426 },
    { county: 'Henry', lat: 33.45293, lon: -84.15412, sqmi: 322 },
    { county: 'Clayton', lat: 33.54147, lon: -84.35873, sqmi: 142 },
    { county: 'Hall', lat: 34.31675, lon: -83.81957, sqmi: 393 },
    { county: 'Paulding', lat: 33.92076, lon: -84.86695, sqmi: 312 },
    { county: 'Coweta', lat: 33.35303, lon: -84.76312, sqmi: 441 },
    { county: 'Columbia', lat: 33.54783, lon: -82.25109, sqmi: 290 },
    { county: 'Houston', lat: 32.45845, lon: -83.6627, sqmi: 376 },
    { county: 'Muscogee', lat: 32.50974, lon: -84.87479, sqmi: 216 },
    { county: 'Richmond', lat: 33.36003, lon: -82.07445, sqmi: 324 },
    { county: 'Fayette', lat: 33.41402, lon: -84.49406, sqmi: 194 },
    { county: 'Douglas', lat: 33.70031, lon: -84.76738, sqmi: 200 },
    { county: 'Carroll', lat: 33.58249, lon: -85.07993, sqmi: 499 },
    { county: 'Bibb', lat: 32.80663, lon: -83.69774, sqmi: 250 },
    { county: 'Newton', lat: 33.55524, lon: -83.85025, sqmi: 272 },
    { county: 'Bartow', lat: 34.24117, lon: -84.83975, sqmi: 460 },
    { county: 'Walton', lat: 33.78119, lon: -83.73388, sqmi: 326 },
    { county: 'Lowndes', lat: 30.83355, lon: -83.26746, sqmi: 497 },
    { county: 'Whitfield', lat: 34.80621, lon: -84.97199, sqmi: 290 },
  ],
  FL: [
    { county: 'Miami-Dade', lat: 25.61049, lon: -80.4971, sqmi: 1898 },
    { county: 'Broward', lat: 26.15195, lon: -80.48759, sqmi: 1210 },
    { county: 'Palm Beach', lat: 26.64575, lon: -80.44837, sqmi: 1966 },
    { county: 'Hillsborough', lat: 27.9065, lon: -82.34936, sqmi: 1020 },
    { county: 'Orange', lat: 28.51418, lon: -81.32315, sqmi: 903 },
    { county: 'Duval', lat: 30.3335, lon: -81.64757, sqmi: 763 },
    { county: 'Pinellas', lat: 27.90392, lon: -82.73957, sqmi: 274 },
    { county: 'Lee', lat: 26.57817, lon: -81.82033, sqmi: 785 },
    { county: 'Polk', lat: 27.95145, lon: -81.69139, sqmi: 1798 },
    { county: 'Brevard', lat: 28.29878, lon: -80.70109, sqmi: 1016 },
    { county: 'Pasco', lat: 28.30258, lon: -82.45935, sqmi: 747 },
    { county: 'Volusia', lat: 29.05764, lon: -81.16169, sqmi: 1102 },
    { county: 'Seminole', lat: 28.69105, lon: -81.2327, sqmi: 309 },
  ],
};

// ── Kit comp rules. Keep in step with the production comp selector. ─────────
export const RULES = {
  searchRadiusMi: 2,      // one call fetches everything within this
  nearRadiusMi: 1,        // first preference
  subjectRadiusMi: 0.25,  // subjects are drawn from homes this close to the point
  subjectsPerCall: 5,
  monthsBack: 12,
  sqftTol: 0.20,
  yearTol: 15,
  ppsfLow: 0.5,           // x area median $/sqft
  ppsfHigh: 1.6,
  minComps: 3,
  passShare: 0.80,
};

// ── small helpers ──────────────────────────────────────────────────────────
const median = (xs) => {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
function miles(lat1, lon1, lat2, lon2) {
  const R = 3958.8, r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
/** Uniform random point in a disc of radius rMi around (lat, lon). */
function randomPoint(lat, lon, rMi, rand = Math.random) {
  const d = rMi * Math.sqrt(rand());
  const t = 2 * Math.PI * rand();
  const dLat = (d * Math.cos(t)) / 69.09;
  const dLon = (d * Math.sin(t)) / (69.09 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lon: lon + dLon };
}
function shuffle(a, rand = Math.random) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

/**
 * Map one RentCast record to what this test needs. Field names follow
 * lib/providers/rentcast.js normalizeProperty (1:1, no fallback chains).
 */
export function slim(p) {
  if (!p) return null;
  const lat = Number(p.latitude), lon = Number(p.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let assess = null;
  if (p.taxAssessments && typeof p.taxAssessments === 'object') {
    const y = Object.keys(p.taxAssessments).map(Number).filter(Number.isFinite).sort((a, b) => b - a)[0];
    if (y) assess = { year: y, value: num(p.taxAssessments[String(y)]?.value) };
  }
  return {
    address: p.formattedAddress || null,
    lat, lon,
    sqft: num(p.squareFootage),
    yearBuilt: num(p.yearBuilt),
    salePrice: num(p.lastSalePrice),
    saleDate: p.lastSaleDate ? new Date(p.lastSaleDate) : null,
    assessYear: assess?.year ?? null,
    assessValue: assess?.value ?? null,
  };
}

/**
 * Evaluate one subject against the records from the same call. Pure function,
 * exercised by --selftest. Returns the counts the summary needs.
 */
export function evaluateSubject(subject, records, now = new Date(), rules = RULES) {
  const cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - rules.monthsBack);
  const recent = records.filter((r) => r.salePrice && r.saleDate && !isNaN(r.saleDate) && r.saleDate >= cutoff && r.sqft);
  const areaPpsf = median(recent.map((r) => r.salePrice / r.sqft));
  const comps = recent.filter((r) => {
    if (r === subject || (subject.address && r.address === subject.address)) return false;
    if (Math.abs(r.sqft - subject.sqft) / subject.sqft > rules.sqftTol) return false;
    if (subject.yearBuilt && r.yearBuilt && Math.abs(r.yearBuilt - subject.yearBuilt) > rules.yearTol) return false;
    if (areaPpsf) {
      const ratio = (r.salePrice / r.sqft) / areaPpsf;
      if (ratio < rules.ppsfLow || ratio > rules.ppsfHigh) return false;
    }
    return true;
  }).map((r) => ({ ...r, dist: miles(subject.lat, subject.lon, r.lat, r.lon) }))
    .filter((r) => r.dist <= rules.searchRadiusMi);
  const near = comps.filter((c) => c.dist <= rules.nearRadiusMi);
  const used = near.length >= rules.minComps ? near : comps;
  return {
    comps1mi: near.length,
    comps2mi: comps.length,
    ok: comps.length >= rules.minComps,
    medianDist: median(used.map((c) => c.dist)),
    indicatedPpsf: median(used.map((c) => c.salePrice / c.sqft)),
    areaRecentSales: recent.length,
  };
}

// ── self-test: no network, no key ──────────────────────────────────────────
function selftest() {
  let pass = 0; const fail = [];
  const t = (name, cond) => (cond ? pass++ : fail.push(name));
  const now = new Date('2026-10-10T00:00:00Z');
  const recentDate = new Date('2026-06-01T00:00:00Z');
  const oldDate = new Date('2024-01-01T00:00:00Z');
  const base = { lat: 33.9, lon: -84.5, sqft: 2000, yearBuilt: 2000 };
  const subject = { ...base, address: 'S' };
  const comp = (o) => ({ ...base, address: Math.random().toString(36), salePrice: 400000, saleDate: recentDate, ...o });
  // three good comps within 1 mile
  const good = [comp({ lat: 33.905 }), comp({ lat: 33.895 }), comp({ lon: -84.505 })];
  let r = evaluateSubject(subject, [subject, ...good], now);
  t('three similar recent sales nearby count as a pass', r.ok && r.comps1mi === 3);
  r = evaluateSubject(subject, [subject, ...good.map((g) => ({ ...g, saleDate: oldDate }))], now);
  t('sales older than 12 months do not count', !r.ok && r.comps2mi === 0);
  r = evaluateSubject(subject, [subject, ...good, comp({ sqft: 3000 })], now);
  t('a home 50% larger is not a comp', r.comps2mi === 3);
  r = evaluateSubject(subject, [subject, ...good, comp({ yearBuilt: 1960 })], now);
  t('a home 40 years older is not a comp', r.comps2mi === 3);
  r = evaluateSubject(subject, [subject, ...good, comp({ salePrice: 50000 })], now);
  t('a $50k sale on a $200/sqft street is dropped as distressed', r.comps2mi === 3);
  r = evaluateSubject(subject, [subject, ...good, comp({ lat: 34.2 })], now);
  t('a sale 20 miles away is not a comp', r.comps2mi === 3);
  r = evaluateSubject({ ...subject, salePrice: 400000, saleDate: recentDate }, [{ ...subject, salePrice: 400000, saleDate: recentDate }, ...good], now);
  t('the subject never comps against itself', r.comps2mi === 3);
  const p = randomPoint(33.9, -84.5, 10, () => 0.999999);
  t('random points stay inside the disc', miles(33.9, -84.5, p.lat, p.lon) <= 10.02);
  const s = slim({ latitude: 33.9, longitude: -84.5, squareFootage: 1800, yearBuilt: 1999, lastSalePrice: 350000,
    lastSaleDate: '2026-05-01T00:00:00.000Z', taxAssessments: { 2024: { value: 1 }, 2025: { value: 300000 } } });
  t('slim takes the latest assessment year', s.assessYear === 2025 && s.assessValue === 300000);
  t('slim drops records without coordinates', slim({ squareFootage: 1 }) === null);
  console.log(`selftest: ${pass} passed, ${fail.length} failed`);
  for (const f of fail) console.log('  FAIL:', f);
  process.exit(fail.length ? 1 : 0);
}

// ── key handling ───────────────────────────────────────────────────────────
function keyFromEnvFile() {
  for (const f of ['.env.local', '.env']) {
    const p = join(REPO, f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/^\s*RENTCAST_API_KEY\s*=\s*"?([^"\n\r]+)"?\s*$/m);
    if (m) return m[1].trim();
  }
  return null;
}
async function promptSecret(question) {
  if (!process.stdin.isTTY) return null;
  // The prompt goes on its own line: readline redraws (and blanks) the line it
  // reads on, which erased the prompt text on the first Mac run (10 Oct).
  process.stdout.write(question + '\n> ');
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = () => {}; // same approach as scripts/tx/push.mjs
  try { return ((await new Promise((res) => rl.question('', res))) || '').trim(); }
  finally { rl.close(); process.stdout.write('\n'); }
}
async function askYes(question) {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return ((await new Promise((res) => rl.question(question, res))) || '').trim().toLowerCase() === 'yes'; }
  finally { rl.close(); }
}

// ── RentCast ───────────────────────────────────────────────────────────────
let CALLS = 0;
/**
 * One billed RentCast /properties call around a point.
 *
 * LESSON FROM THE FIRST RUN (10 Oct, 300 calls): RentCast does NOT return the
 * nearest homes first. A 2-mile search in a metro county hits the 500-record cap
 * and hands back an arbitrary 500 of the thousands in range, so almost none were
 * near the sample point and only ~4 of the 500 had sold in the last year. The
 * test measured the sampling, not the data. So we now ask two narrow questions:
 *   1. subjects: homes within 0.25 mi (small enough to stay under the cap)
 *   2. comps:    homes within 2 mi that SOLD in the last 365 days
 *                (saleDateRange), which is also how production must query.
 */
async function rentcastNearby(key, lat, lon, { radius, limit = 500, saleDateRange = null, timeoutMs = 60000 }) {
  const url = new URL('https://api.rentcast.io/v1/properties');
  url.searchParams.set('latitude', lat.toFixed(6));
  url.searchParams.set('longitude', lon.toFixed(6));
  url.searchParams.set('radius', String(radius));
  url.searchParams.set('propertyType', 'Single Family');
  url.searchParams.set('limit', String(limit));
  if (saleDateRange) url.searchParams.set('saleDateRange', saleDateRange);
  CALLS++;
  const res = await fetch(url, { headers: { 'X-Api-Key': key, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (res.status === 404) return [];
  if (res.status === 401 || res.status === 403) throw new Error('RentCast rejected the API key (401/403). Stopping.');
  if (res.status === 429) throw new Error('RentCast rate limit (429). Wait a minute and re-run with --counties for the rest.');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`RentCast returned ${res.status} ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map(slim).filter(Boolean);
}

// FORMAT MATTERS. Measured 10 Oct in Cobb: '365' and '*:365' answer in under a
// second (42 sales within 1 mi, oldest returned 2025-10-14, so the filter
// works); '1:365' hangs past 30 s every time. Use '365'.
let SALE_RANGE = '365';

/**
 * Recent sales around a point. The 10 Oct probe timed out (20 s) on the 2-mile
 * sale-filtered query in both Cobb and Hall, so: 60 s timeout, and on a timeout
 * fall back once to 1 mile. Returns { sales, radiusUsed }.
 */
async function recentSales(key, lat, lon) {
  try {
    return { sales: await rentcastNearby(key, lat, lon, { radius: RULES.searchRadiusMi, saleDateRange: SALE_RANGE }), radiusUsed: RULES.searchRadiusMi };
  } catch (e) {
    if (!/timeout|aborted/i.test(e.message)) throw e;
    return { sales: await rentcastNearby(key, lat, lon, { radius: RULES.nearRadiusMi, saleDateRange: SALE_RANGE }), radiusUsed: RULES.nearRadiusMi };
  }
}

/**
 * --probe-filter: why does the sale-date filter time out? (10 Oct: it did, at both
 * 2 mi and 1 mi, 60 s, in Cobb and Hall.) One point, each variant once, 30 s
 * each, then the no-filter alternative: small 0.5-mile tiles, filtered locally.
 */
async function probeFilter(key, c) {
  const pt = randomPoint(c.lat, c.lon, Math.sqrt(c.sqmi / Math.PI) * 0.4);
  console.log(`\n── ${c.county} (${pt.lat.toFixed(4)}, ${pt.lon.toFixed(4)})`);
  const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1);
  const show = (label, recs, ms) => {
    const recent = recs.filter((r) => r.salePrice && r.saleDate && r.saleDate >= cutoff);
    const oldest = recs.filter((r) => r.saleDate).map((r) => r.saleDate).sort((a, b) => a - b)[0];
    console.log(`  ${label.padEnd(36)} ${String(recs.length).padStart(3)} records${recs.length >= 500 ? ' (CAPPED)' : ''}` +
      `  sold in last 12 mo: ${recent.length}  oldest sale returned: ${oldest ? oldest.toISOString().slice(0, 10) : '-'}  ${(ms / 1000).toFixed(1)} s`);
  };
  const variants = [
    ['saleDateRange=365, 1 mi', { radius: 1, saleDateRange: '365' }],
    ['saleDateRange=1:365, 1 mi', { radius: 1, saleDateRange: '1:365' }],
    ['saleDateRange=*:365, 1 mi', { radius: 1, saleDateRange: '*:365' }],
    ['saleDateRange=365, 0.5 mi, limit 100', { radius: 0.5, saleDateRange: '365', limit: 100 }],
  ];
  for (const [label, opts] of variants) {
    const t0 = Date.now();
    try { show(label, await rentcastNearby(key, pt.lat, pt.lon, { timeoutMs: 30000, ...opts }), Date.now() - t0); }
    catch (e) { console.log(`  ${label.padEnd(36)} ${e.message.slice(0, 90)}  ${((Date.now() - t0) / 1000).toFixed(1)} s`); if (/key|rate limit/.test(e.message)) return; }
  }
  // Alternative: five 0.5-mile tiles (centre + 4 around), no sale filter, deduplicated.
  const offsets = [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]];
  const seen = new Map(); let capped = 0; const t0 = Date.now();
  for (const [dy, dx] of offsets) {
    const lat = pt.lat + dy / 69.09, lon = pt.lon + dx / (69.09 * Math.cos((pt.lat * Math.PI) / 180));
    try {
      const recs = await rentcastNearby(key, lat, lon, { radius: 0.5, timeoutMs: 30000 });
      if (recs.length >= 500) capped++;
      for (const r of recs) seen.set(r.address || `${r.lat},${r.lon}`, r);
    } catch (e) { console.log(`  tile failed: ${e.message.slice(0, 90)}`); }
  }
  show(`5 tiles of 0.5 mi, no filter (${capped} capped)`, [...seen.values()], Date.now() - t0);
}

/** --probe: 3 calls per county that show what RentCast returns, before any full run. */
async function probe(key, counties) {
  for (const c of counties) {
    const pt = randomPoint(c.lat, c.lon, Math.sqrt(c.sqmi / Math.PI) * 0.5);
    console.log(`\n── ${c.county} (${pt.lat.toFixed(4)}, ${pt.lon.toFixed(4)})`);
    const describe = (label, recs) => {
      const d = recs.map((r) => miles(pt.lat, pt.lon, r.lat, r.lon));
      const priced = recs.filter((r) => r.salePrice && r.saleDate);
      const years = {};
      for (const r of priced) { const y = r.saleDate.getUTCFullYear(); years[y] = (years[y] || 0) + 1; }
      const recentYears = Object.keys(years).sort().slice(-4).map((y) => `${y}:${years[y]}`).join(' ');
      console.log(`  ${label.padEnd(30)} ${String(recs.length).padStart(3)} records${recs.length >= 500 ? ' (CAPPED)' : ''}` +
        `  nearest ${d.length ? Math.min(...d).toFixed(2) : '-'} mi, farthest ${d.length ? Math.max(...d).toFixed(2) : '-'} mi` +
        `  with sale price ${priced.length}  [${recentYears}]`);
      return recs;
    };
    try {
      describe('homes within 0.25 mi', await rentcastNearby(key, pt.lat, pt.lon, { radius: 0.25, limit: 100 }));
      describe('homes within 2 mi (no filter)', await rentcastNearby(key, pt.lat, pt.lon, { radius: 2 }));
      const t0 = Date.now();
      const { sales, radiusUsed } = await recentSales(key, pt.lat, pt.lon);
      describe(`sold within ${radiusUsed} mi (${SALE_RANGE} days)`, sales);
      console.log(`  (sales query took ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    } catch (e) { console.log('  ' + e.message); if (/key|rate limit/.test(e.message)) return; }
  }
  console.log(`\nRentCast calls used: ${CALLS}`);
}

// ── main ───────────────────────────────────────────────────────────────────
function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

async function main() {
  if (arg('selftest', false)) return selftest();

  const state = String(arg('state', 'GA')).toUpperCase();
  if (state === 'TX') {
    console.error('Texas is a non-disclosure state; RentCast sale prices are not reliable there. Texas comps stay on the loaded rolls.');
    process.exit(1);
  }
  if (!COUNTIES[state]) { console.error(`No county list for ${state}. Have: ${Object.keys(COUNTIES).join(', ')}`); process.exit(1); }
  const only = arg('counties', null);
  const counties = only
    ? COUNTIES[state].filter((c) => String(only).split(',').map((s) => s.trim().toLowerCase()).includes(c.county.toLowerCase()))
    : COUNTIES[state];
  if (!counties.length) { console.error('None of --counties matched.'); process.exit(1); }
  const perCounty = Number(arg('per-county', 25));
  const budget = Number(arg('budget', 300));
  const isProbe = !!arg('probe', false);
  const isProbeFilter = !!arg('probe-filter', false);
  // --radius / --days widen the comp search for exurban and rural counties
  // (10 Oct run: Hall, Cherokee, Coweta, Newton... had sales, but too few inside
  // 2 mi / 12 months). Sales and comps use the same window.
  const wideRadius = Number(arg('radius', 0));
  const wideDays = Number(arg('days', 0));
  if (wideRadius > 0) RULES.searchRadiusMi = wideRadius;
  if (wideDays > 0) { SALE_RANGE = String(Math.round(wideDays)); RULES.monthsBack = Math.max(1, Math.round(wideDays / 30.4)); }
  if (wideRadius > 0 || wideDays > 0) console.log(`Comp window: within ${RULES.searchRadiusMi} mi, sold in the last ${SALE_RANGE} days (${RULES.monthsBack} months).`);
  // Two calls per sample point (subjects + recent sales); empty points cost one.
  const maxCallsPerCounty = Math.ceil(perCounty / RULES.subjectsPerCall) * 2 + 4;
  const estCalls = isProbeFilter ? counties.length * 9 : isProbe ? counties.length * 4 : Math.min(budget, counties.length * Math.ceil(perCounty / RULES.subjectsPerCall) * 2);
  const worstCalls = (isProbe || isProbeFilter) ? estCalls : Math.min(budget, counties.length * maxCallsPerCounty);

  console.log(isProbeFilter ? `\nRentCast sale-filter probe — ${state}, ${counties.length} counties, 9 calls each.` : isProbe ? `\nRentCast probe — ${state}, ${counties.length} counties, 3–4 calls each.` : `\nComps coverage test — ${state}, ${counties.length} counties, ${perCounty} subjects each.`);
  console.log(`Expected ~${estCalls} RentCast calls (ceiling ${worstCalls}, hard budget ${budget}).`);
  console.log(`At $0.06/call overage that is ~$${(estCalls * 0.06).toFixed(2)} (max $${(worstCalls * 0.06).toFixed(2)}). Calls inside your plan's monthly allowance cost nothing extra.\n`);
  if (arg('dry-run', false)) { console.log('Dry run: nothing called.'); return; }

  let key = process.env.RENTCAST_API_KEY || keyFromEnvFile();
  if (!key) key = await promptSecret('RentCast API key (typing hidden): ');
  if (!key) { console.error('No RentCast key. Set RENTCAST_API_KEY, add it to .env.local, or run in a terminal.'); process.exit(1); }
  if (!arg('yes', false) && !(await askYes('Type yes to run: '))) { console.log('Stopped.'); return; }
  if (isProbe) return probe(key, counties);
  if (isProbeFilter) { for (const c of counties) await probeFilter(key, c); console.log(`\nRentCast calls used: ${CALLS}`); return; }

  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rows = [];
  const summary = [];
  const now = new Date();

  for (const c of counties) {
    const discMi = Math.sqrt(c.sqmi / Math.PI) * 0.8;
    const subjects = [];
    let calls = 0, emptyPoints = 0, truncated = 0, recsSeen = 0, withSqft = 0, withAssess = 0, salesSeen = 0, salesPriced = 0;
    while (subjects.length < perCounty && calls < maxCallsPerCounty && CALLS < budget) {
      const pt = randomPoint(c.lat, c.lon, discMi);
      let homes, sales;
      try {
        homes = await rentcastNearby(key, pt.lat, pt.lon, { radius: RULES.subjectRadiusMi, limit: 100 });
        calls++;
        const pool = shuffle(homes.filter((r) => r.sqft));
        if (!pool.length) { emptyPoints++; continue; }
        ({ sales } = await recentSales(key, pt.lat, pt.lon));
        calls++;
        if (sales.length >= 500) truncated++;
        recsSeen += homes.length;
        withSqft += homes.filter((r) => r.sqft).length;
        withAssess += homes.filter((r) => r.assessValue).length;
        salesSeen += sales.length;
        salesPriced += sales.filter((r) => r.salePrice).length;
        for (const s of pool.slice(0, Math.min(RULES.subjectsPerCall, perCounty - subjects.length))) {
          const ev = evaluateSubject(s, sales, now);
          subjects.push(ev);
          rows.push({ state, county: c.county, address: s.address, sqft: s.sqft, yearBuilt: s.yearBuilt,
            assessYear: s.assessYear, assessValue: s.assessValue, salesInArea: sales.length, ...ev });
        }
      } catch (e) {
        calls++;
        console.error(`\n${c.county}: ${e.message}`);
        if (/key|rate limit/.test(e.message)) { finish(); return; }
      }
      process.stdout.write(`\r${c.county.padEnd(14)} ${String(subjects.length).padStart(3)}/${perCounty} subjects, ${calls} calls`);
    }
    const okShare = subjects.length ? subjects.filter((s) => s.ok).length / subjects.length : 0;
    const row = {
      county: c.county, subjects: subjects.length, calls,
      pctWith3Comps: Math.round(okShare * 100),
      pctWith3Within1mi: subjects.length ? Math.round((subjects.filter((s) => s.comps1mi >= RULES.minComps).length / subjects.length) * 100) : 0,
      medianComps2mi: median(subjects.map((s) => s.comps2mi)),
      pctRecordsWithSqft: recsSeen ? Math.round((withSqft / recsSeen) * 100) : 0,
      pctRecordsWithAssessment: recsSeen ? Math.round((withAssess / recsSeen) * 100) : 0,
      pctSalesWithPrice: salesSeen ? Math.round((salesPriced / salesSeen) * 100) : 0,
      emptyPoints, truncatedSalesCalls: truncated,
      verdict: subjects.length < Math.min(10, perCounty) ? 'TOO FEW SAMPLES' : okShare >= RULES.passShare ? 'PASS' : 'FAIL',
    };
    summary.push(row);
    process.stdout.write(`\r${c.county.padEnd(14)} ${row.verdict.padEnd(15)} ${row.pctWith3Comps}% have 3+ comps (${subjects.length} subjects, ${calls} calls)\n`);
  }
  finish();

  function finish() {
    if (!rows.length && !summary.length) return;
    const csvPath = join(OUT_DIR, `coverage-${state}-${stamp}.csv`);
    const jsonPath = join(OUT_DIR, `coverage-${state}-${stamp}.json`);
    const cols = Object.keys(rows[0] || { state: '' });
    const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    writeFileSync(csvPath, [cols.join(','), ...rows.map((r) => cols.map((k) => esc(r[k])).join(','))].join('\n'));
    writeFileSync(jsonPath, JSON.stringify({ state, ranAt: new Date().toISOString(), rules: RULES, totalCalls: CALLS, summary }, null, 2));
    console.log('\n' + 'County'.padEnd(14) + 'Verdict'.padEnd(17) + '3+ comps  3+ in 1mi  median comps  sqft%  assess%');
    for (const s of summary) {
      console.log(s.county.padEnd(14) + s.verdict.padEnd(17) + `${s.pctWith3Comps}%`.padEnd(10) + `${s.pctWith3Within1mi}%`.padEnd(11) +
        String(s.medianComps2mi ?? '-').padEnd(14) + `${s.pctRecordsWithSqft}%`.padEnd(7) + `${s.pctRecordsWithAssessment}%`);
    }
    console.log(`\nRentCast calls used: ${CALLS}`);
    console.log(`Saved:\n  ${csvPath}\n  ${jsonPath}`);
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
