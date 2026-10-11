/**
 * lib/kit/comps.js — comparable SALES for the Kit model, disclosure states.
 *
 * 11 Oct 2026. Built from the 10 Oct RentCast tests
 * (claude/GA_RentCast_Coverage_Run1_2026-10-10.md). Every rule below traces to
 * something those tests measured:
 *
 *  1. RentCast does NOT return nearest-first. A capped radius search hands back
 *     an arbitrary 500 records. So we never search wide and hope; we ask for
 *     SOLD homes only (saleDateRange), which keeps the result small and complete.
 *
 *  2. saleDateRange MUST be written as a bare number of days ('365'). The form
 *     '1:365' hung past 30 s on every call. A build check guards this.
 *
 *  3. Metro counties pass at 2 mi / 12 months; exurban ones only at
 *     5 mi / 24 months. So the search widens in steps and stops at the first
 *     step with enough comps. Two billed calls at most:
 *        call 1: sold within 2 mi, last 365 days -> tried at 1 mi, then 2 mi
 *        call 2: sold within 5 mi, last 730 days (only if call 1 was not enough)
 *
 *  4. Sales are filtered for similarity (±20% heated sqft, ±15 years) and for
 *     distress: a price per sqft far from the neighbourhood's (below 0.5x or
 *     above 1.6x the median of all recent sales nearby), or under $25,000, is
 *     treated as a foreclosure, family transfer or land-only sale and dropped.
 *
 *  5. The indicated value is the MEDIAN price per sqft of the chosen comps times
 *     the home's heated sqft. Median, not mean: one odd sale must not move it.
 *     Fewer than 3 comps -> NO value. Never a guess.
 *
 * WHAT THIS MODULE DOES NOT DO
 *   - Decide the home's current value. That comes from the county, the notice
 *     photo or manual entry (RentCast's "assessed value" is Georgia's 40% figure
 *     and often a year old). caseCheck() takes it as an input.
 *   - Decide whether a reduction lowers the TAX BILL. That is the savings check
 *     (caps, homestead, millage), a separate module per state.
 *   - Texas. Non-disclosure state: no public sale prices. Texas uses its rolls.
 *
 * NETWORK
 *   findKitComps() takes a `fetchSales` function so tests run offline. The
 *   default, rentcastSales(), is the only code here that touches the network.
 */

export const KIT_RULES = Object.freeze({
  sqftTolerance: 0.20,
  yearTolerance: 15,
  ppsfLow: 0.5,
  ppsfHigh: 1.6,
  minPrice: 25000,
  minComps: 3,
  maxComps: 6,
  // Each step: comps must lie within `radiusMi` and have sold within `days`.
  // `call` says which fetch serves the step (steps 1 and 2 share call 1).
  steps: Object.freeze([
    Object.freeze({ step: 1, radiusMi: 1, days: 365, call: 'near' }),
    Object.freeze({ step: 2, radiusMi: 2, days: 365, call: 'near' }),
    Object.freeze({ step: 3, radiusMi: 5, days: 730, call: 'wide' }),
  ]),
  calls: Object.freeze({
    near: Object.freeze({ radiusMi: 2, days: 365 }),
    wide: Object.freeze({ radiusMi: 5, days: 730 }),
  }),
  // A notice value must exceed the sales-indicated value by more than this
  // before we call it over-assessed. Below it, the gap is within the noise of
  // a 3–6 sale median and not worth a customer's appeal.
  overAssessedMargin: 0.05,
});

/** saleDateRange as RentCast accepts it: a bare day count. See rule 2. */
export function saleDateRangeParam(days) {
  const d = Math.round(Number(days));
  if (!Number.isFinite(d) || d < 1) throw new Error(`saleDateRange needs a positive day count, got ${days}`);
  return String(d);
}

export function median(xs) {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function milesBetween(lat1, lon1, lat2, lon2) {
  const R = 3958.8, r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

/** One RentCast record -> the sale fields this module uses. 1:1, no fallbacks. */
export function toSale(p) {
  if (!p) return null;
  const lat = Number(p.latitude), lon = Number(p.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const saleDate = p.lastSaleDate ? new Date(p.lastSaleDate) : null;
  return {
    address: p.formattedAddress || null,
    parcelId: p.assessorID ? String(p.assessorID).trim() : null,
    lat, lon,
    sqft: num(p.squareFootage),
    yearBuilt: num(p.yearBuilt),
    price: num(p.lastSalePrice),
    saleDate: saleDate && !isNaN(saleDate) ? saleDate : null,
  };
}

function isSelf(subject, s) {
  if (subject.parcelId && s.parcelId && subject.parcelId === s.parcelId) return true;
  if (subject.address && s.address && subject.address.trim().toLowerCase() === s.address.trim().toLowerCase()) return true;
  return false;
}

/**
 * Pure: pick comps for one step out of a set of sales. Exercised offline by
 * scripts/verify-kit-comps.mjs.
 *
 * @param subject {lat, lon, sqft, yearBuilt?, address?, parcelId?}
 * @param sales   array from toSale()
 * @param step    { radiusMi, days }
 * @param now     Date the window is measured from
 */
export function selectComps(subject, sales, step, now = new Date(), rules = KIT_RULES) {
  const cutoff = new Date(now.getTime() - step.days * 86400000);
  const priced = sales.filter((s) => s && s.price && s.price >= rules.minPrice && s.sqft && s.saleDate &&
    s.saleDate >= cutoff && s.saleDate <= now && !isSelf(subject, s));
  const withDist = priced.map((s) => ({ ...s, distanceMi: milesBetween(subject.lat, subject.lon, s.lat, s.lon) }))
    .filter((s) => s.distanceMi <= step.radiusMi);
  // Distress screen against ALL recent sales in range, not only similar ones.
  const areaPpsf = median(withDist.map((s) => s.price / s.sqft));
  const clean = withDist.filter((s) => {
    if (!areaPpsf) return true;
    const ratio = (s.price / s.sqft) / areaPpsf;
    return ratio >= rules.ppsfLow && ratio <= rules.ppsfHigh;
  });
  const similar = clean.filter((s) => {
    if (Math.abs(s.sqft - subject.sqft) / subject.sqft > rules.sqftTolerance) return false;
    if (subject.yearBuilt && s.yearBuilt && Math.abs(s.yearBuilt - subject.yearBuilt) > rules.yearTolerance) return false;
    return true;
  });
  // Rank: closest in size, age and distance, most recent breaks ties.
  const score = (s) =>
    Math.abs(s.sqft - subject.sqft) / subject.sqft / rules.sqftTolerance +
    (subject.yearBuilt && s.yearBuilt ? Math.abs(s.yearBuilt - subject.yearBuilt) / rules.yearTolerance : 0.5) +
    s.distanceMi / step.radiusMi;
  const ranked = similar.sort((a, b) => score(a) - score(b) || b.saleDate - a.saleDate);
  return { comps: ranked.slice(0, rules.maxComps), candidates: similar.length, areaPpsf };
}

/** Median $/sqft of the comps x subject sqft. null below the comp floor. */
export function indicatedValue(subject, comps, rules = KIT_RULES) {
  if (!subject?.sqft || comps.length < rules.minComps) return null;
  const ppsf = median(comps.map((c) => c.price / c.sqft));
  return ppsf ? { ppsf: Math.round(ppsf * 100) / 100, value: Math.round(ppsf * subject.sqft) } : null;
}

/**
 * Default fetcher: RentCast /properties, sold homes only.
 * Throws on auth/rate/outage so the caller can say "we couldn't check right
 * now" rather than "no case" (an outage must never read as a verdict).
 */
export async function rentcastSales({ lat, lon, radiusMi, days, propertyType = 'Single Family' }) {
  const key = process.env.RENTCAST_API_KEY;
  if (!key) throw new Error('RENTCAST_API_KEY is not set');
  const url = new URL('https://api.rentcast.io/v1/properties');
  url.searchParams.set('latitude', Number(lat).toFixed(6));
  url.searchParams.set('longitude', Number(lon).toFixed(6));
  url.searchParams.set('radius', String(radiusMi));
  url.searchParams.set('saleDateRange', saleDateRangeParam(days));
  if (propertyType) url.searchParams.set('propertyType', propertyType);
  url.searchParams.set('limit', '500');
  const res = await fetch(url, {
    headers: { 'X-Api-Key': key, Accept: 'application/json' },
    signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined,
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`RentCast returned ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map(toSale).filter(Boolean);
}

/**
 * Walk the steps; at most two billed calls. Returns the first step with enough
 * comps, or `ok: false` with the best attempt (for the "we can't build a strong
 * case for this home" message, which is not a sale).
 */
export async function findKitComps(subject, { fetchSales = rentcastSales, now = new Date(), rules = KIT_RULES } = {}) {
  if (!subject || !Number.isFinite(subject.lat) || !Number.isFinite(subject.lon) || !num(subject.sqft)) {
    return { ok: false, reason: 'subject_incomplete', calls: 0 };
  }
  const cache = {};
  let calls = 0;
  let best = null;
  for (const step of rules.steps) {
    if (!cache[step.call]) {
      const c = rules.calls[step.call];
      cache[step.call] = await fetchSales({ lat: subject.lat, lon: subject.lon, radiusMi: c.radiusMi, days: c.days, propertyType: subject.propertyType });
      calls++;
    }
    const pick = selectComps(subject, cache[step.call], step, now, rules);
    const attempt = { step: step.step, radiusMi: step.radiusMi, days: step.days, ...pick };
    if (!best || pick.comps.length > best.comps.length) best = attempt;
    if (pick.comps.length >= rules.minComps) {
      return { ok: true, calls, ...attempt, indicated: indicatedValue(subject, pick.comps, rules) };
    }
  }
  return { ok: false, reason: 'too_few_comps', calls, ...best, indicated: null };
}

/**
 * Is the home over-assessed? `currentValue` is the FULL (100%) market value from
 * the county, the notice or the customer — never RentCast's assessment figure.
 * This answers question 1 only; whether the bill drops is the savings check.
 */
export function caseCheck(currentValue, indicated, rules = KIT_RULES) {
  const cv = num(currentValue);
  if (!cv) return { verdict: 'need_value' };
  if (!indicated?.value) return { verdict: 'no_comps' };
  const gap = cv - indicated.value;
  const overBy = gap / indicated.value;
  return overBy > rules.overAssessedMargin
    ? { verdict: 'over_assessed', reduction: gap, overByPct: Math.round(overBy * 1000) / 10, requestedValue: indicated.value }
    : { verdict: 'fair', overByPct: Math.round(overBy * 1000) / 10 };
}

/** Evidence rows for the kit's evidence page: what each comp is and why it counts. */
export function evidenceRows(result, now = new Date()) {
  return (result?.comps || []).map((c) => ({
    address: c.address,
    saleDate: c.saleDate ? c.saleDate.toISOString().slice(0, 10) : null,
    price: c.price,
    sqft: c.sqft,
    ppsf: Math.round((c.price / c.sqft) * 100) / 100,
    yearBuilt: c.yearBuilt,
    distanceMi: Math.round(c.distanceMi * 100) / 100,
    olderThan12Months: c.saleDate ? (now.getTime() - c.saleDate.getTime()) > 365 * 86400000 : false,
  }));
}
