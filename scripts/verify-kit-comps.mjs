/**
 * OFFLINE VERIFICATION for lib/kit/comps.js (the Kit model's comparable sales).
 *
 * No network, no key. Each rule below is one the 10 Oct RentCast tests showed
 * matters (claude/GA_RentCast_Coverage_Run1_2026-10-10.md). Where a line says
 * INJECTION, reintroducing that bug makes the named assertion fail — the
 * standing rule for build guards.
 */
import { register } from 'node:module';
register('./resolve-extensionless.mjs', import.meta.url);

const {
  KIT_RULES, saleDateRangeParam, selectComps, indicatedValue, findKitComps, caseCheck, evidenceRows, toSale, median,
} = await import('../lib/kit/comps.js');

let pass = 0; const failures = [];
const t = (name, cond) => (cond ? pass++ : failures.push(name));

const NOW = new Date('2026-10-11T00:00:00Z');
const daysAgo = (d) => new Date(NOW.getTime() - d * 86400000);
const SUBJECT = { lat: 33.9, lon: -84.5, sqft: 2000, yearBuilt: 2000, address: '100 Main St, Marietta, GA 30060', parcelId: 'P-100' };
// ~0.0145 deg latitude ≈ 1 mile
const at = (miles) => ({ lat: 33.9 + miles * 0.01449, lon: -84.5 });
const sale = (o = {}) => ({ address: `${Math.random()}`, parcelId: null, ...at(0.3), sqft: 2000, yearBuilt: 2000, price: 400000, saleDate: daysAgo(90), ...o });

// ── 1. THE QUERY FORMAT THAT HUNG ────────────────────────────────────────────
// INJECTION: return `1:${d}` from saleDateRangeParam -> the first assertion FAILS.
t('saleDateRange is a bare day count (1:365 hung RentCast on 10 Oct)', saleDateRangeParam(365) === '365' && !saleDateRangeParam(730).includes(':'));
t('both fetches use bare day counts', Object.values(KIT_RULES.calls).every((c) => /^\d+$/.test(saleDateRangeParam(c.days))));
let threw = false; try { saleDateRangeParam(0); } catch { threw = true; }
t('a zero/blank window is refused, not sent', threw);

// ── 2. NEVER COMP A HOME AGAINST ITSELF ─────────────────────────────────────
const three = [sale(), sale(), sale()];
let r = selectComps(SUBJECT, [...three, sale({ address: SUBJECT.address })], KIT_RULES.steps[0], NOW);
t('the subject (same address) is never its own comp', r.comps.length === 3 && !r.comps.some((c) => c.address === SUBJECT.address));
r = selectComps(SUBJECT, [...three, sale({ parcelId: 'P-100', address: 'different spelling' })], KIT_RULES.steps[0], NOW);
t('the subject (same parcel, different address spelling) is never its own comp', r.comps.length === 3);

// ── 3. SALE WINDOW ──────────────────────────────────────────────────────────
r = selectComps(SUBJECT, [sale({ saleDate: daysAgo(400) }), sale({ saleDate: daysAgo(400) }), sale({ saleDate: daysAgo(400) })], KIT_RULES.steps[1], NOW);
t('sales older than 365 days do not count at the 12-month steps', r.comps.length === 0);
r = selectComps(SUBJECT, [sale({ saleDate: daysAgo(400) }), sale({ saleDate: daysAgo(400) }), sale({ saleDate: daysAgo(400) })], KIT_RULES.steps[2], NOW);
t('the same sales DO count at the 24-month step', r.comps.length === 3);
r = selectComps(SUBJECT, [...three, sale({ saleDate: new Date('2027-01-01') })], KIT_RULES.steps[0], NOW);
t('a sale dated in the future is ignored', r.comps.length === 3);

// ── 4. SIMILARITY ───────────────────────────────────────────────────────────
r = selectComps(SUBJECT, [...three, sale({ sqft: 2600 }), sale({ yearBuilt: 1970 })], KIT_RULES.steps[0], NOW);
t('a home 30% larger or 30 years older is not a comp', r.comps.length === 3);

// ── 5. DISTRESS SCREEN ──────────────────────────────────────────────────────
// INJECTION: drop the ppsf ratio filter -> this assertion FAILS (the $60k sale gets in).
r = selectComps(SUBJECT, [...three, sale({ price: 60000 }), sale({ price: 20000, sqft: 2000 })], KIT_RULES.steps[0], NOW);
t('a $60k sale on a $200/sqft street and a $20k sale are dropped as distressed', r.comps.length === 3 && r.comps.every((c) => c.price === 400000));

// ── 6. DISTANCE STEPS AND CALL COUNT ────────────────────────────────────────
const near = [sale({ ...at(0.5) }), sale({ ...at(0.6) }), sale({ ...at(0.7) })];
let calls = [];
const fetcher = (data) => async (q) => { calls.push(q); return q.radiusMi === 2 ? data.near : data.wide; };
let out = await findKitComps(SUBJECT, { fetchSales: fetcher({ near, wide: [] }), now: NOW });
t('metro home: comps found at step 1 (1 mile) with ONE billed call', out.ok && out.step === 1 && out.calls === 1 && calls.length === 1);

calls = [];
out = await findKitComps(SUBJECT, { fetchSales: fetcher({ near: [sale({ ...at(1.5) }), sale({ ...at(1.6) }), sale({ ...at(1.8) })], wide: [] }), now: NOW });
t('comps between 1 and 2 miles: step 2, still ONE call (steps 1-2 share it)', out.ok && out.step === 2 && out.calls === 1);

calls = [];
out = await findKitComps(SUBJECT, { fetchSales: fetcher({ near: [], wide: [sale({ ...at(4), saleDate: daysAgo(500) }), sale({ ...at(3) }), sale({ ...at(4.5) })] }), now: NOW });
t('exurban home: step 3 (5 mi / 24 months) with exactly TWO calls', out.ok && out.step === 3 && out.calls === 2);
t('the wide fetch asks for 5 miles and 730 days', calls[1] && calls[1].radiusMi === 5 && calls[1].days === 730);

out = await findKitComps(SUBJECT, { fetchSales: fetcher({ near: [sale()], wide: [sale(), sale()] }), now: NOW });
t('too few comps anywhere: ok=false and NO value (never a guess)', !out.ok && out.indicated === null && out.reason === 'too_few_comps');

out = await findKitComps({ ...SUBJECT, sqft: null }, { fetchSales: fetcher({ near, wide: [] }), now: NOW });
t('no sqft for the home: refused before any billed call', !out.ok && out.reason === 'subject_incomplete' && out.calls === 0);

let outage = false;
try { await findKitComps(SUBJECT, { fetchSales: async () => { throw new Error('RentCast returned 503'); }, now: NOW }); } catch { outage = true; }
t('a vendor outage throws (it must never read as "no case")', outage);

// ── 7. VALUE ────────────────────────────────────────────────────────────────
const comps5 = [180, 190, 200, 210, 900].map((p) => ({ price: p * 2000, sqft: 2000 }));
const iv = indicatedValue(SUBJECT, comps5);
t('median, not mean: one $900/sqft outlier does not move the value', iv && iv.ppsf === 200 && iv.value === 400000);
t('below 3 comps there is no value', indicatedValue(SUBJECT, comps5.slice(0, 2)) === null);
t('median of an even set averages the middle two', median([1, 2, 3, 4]) === 2.5);

// ── 8. CASE CHECK ───────────────────────────────────────────────────────────
t('notice 10% over the sales value: over-assessed, ask for the sales value', (() => {
  const c = caseCheck(440000, { value: 400000 }); return c.verdict === 'over_assessed' && c.requestedValue === 400000 && c.reduction === 40000;
})());
t('within the 5% margin: fair, no case', caseCheck(415000, { value: 400000 }).verdict === 'fair');
t('notice below the sales value: fair', caseCheck(380000, { value: 400000 }).verdict === 'fair');
t('no current value: ask for it, do not assume', caseCheck(null, { value: 400000 }).verdict === 'need_value');
t('no comps: no verdict', caseCheck(440000, null).verdict === 'no_comps');

// ── 9. RECORD MAPPING AND EVIDENCE ROWS ─────────────────────────────────────
const s = toSale({ latitude: 33.9, longitude: -84.5, squareFootage: 1800, yearBuilt: 1999, lastSalePrice: 350000, lastSaleDate: '2026-05-01T00:00:00.000Z', formattedAddress: 'X', assessorID: ' 123 ' });
t('toSale maps RentCast fields 1:1', s.sqft === 1800 && s.price === 350000 && s.parcelId === '123' && s.saleDate.getUTCFullYear() === 2026);
t('toSale drops records without coordinates', toSale({ squareFootage: 1 }) === null);
const ev = evidenceRows({ comps: [{ ...sale({ saleDate: daysAgo(500) }), distanceMi: 3.21 }] }, NOW);
t('evidence rows show distance, sale date and flag sales over 12 months old', ev[0].distanceMi === 3.21 && ev[0].saleDate && ev[0].olderThan12Months === true);

console.log(`verify-kit-comps: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log('  FAIL:', f);
process.exit(failures.length ? 1 : 0);
