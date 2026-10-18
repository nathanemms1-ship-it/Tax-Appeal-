/**
 * lib/kit/flQuote.js — whether a Florida petition kit may be sold. 16 Oct 2026.
 *
 * Florida joins the Kit model (Nathan, 16 Oct: "Kit wording everywhere"). Same
 * promise as Georgia and Texas: we check whether a petition will actually lower
 * the tax bill, after the Save Our Homes cap and exemptions, BEFORE the owner
 * pays, and if it won't, we say so and do not sell one.
 *
 * THE CHECK, all on the county's own figures (our copy of the DOR roll):
 *
 *   1. the parcel is on THIS tax year's roll (the values on the TRIM notice)
 *   2. it is residential (qualify.js RESIDENTIAL_USE_CODES)
 *   3. the county's own qualified sales (lib/dor/comps.js findComps) are
 *      sufficient AND support a value below the county's just value. No comps,
 *      no case: the kit is evidence, and a petition with none is not sold.
 *   4. requested just value = the value those sales indicate, less any cost to
 *      cure the owner reported (itemised and sourced on the evidence page).
 *   5. taxEffect() at that value with the county's real millage: the yearly
 *      bill must drop by at least what the owner pays in total, our $89 plus
 *      the county's filing fee. Homestead caps are why this step exists: a
 *      capped home can be over-valued and still save nothing.
 *
 * WHEN IT CAN BE SOLD (flSellability, run by the quote route and again by
 * checkout on the STORED order, and by flKit at mailing):
 *   - the Value Adjustment Board address AND fee are confirmed for the county
 *   - the owner's mailing details are complete
 *   - the petition deadline is known and far enough away (lib/kit/delivery.js,
 *     Florida's longer cut-offs because Florida counts RECEIPT, not postmark)
 *
 * THE DEADLINE. Florida has no statewide date: each county's is 25 days after
 * its TRIM notices were mailed, and it is printed on the notice. The owner
 * types it from their notice. Where lib/filingWindows.js holds that county's
 * date for THIS tax year (FL_COUNTY_DATES_YEAR), the earlier of the two is
 * used. Telling someone an earlier date costs nothing; a later one costs the year.
 */
import { SERVICE_PRICE_DOLLARS } from '../pricing';
import { RESIDENTIAL_USE_CODES, taxEffect } from '../dor/qualify';
import { getFlVabAddress } from '../flVabAddresses';
import { getFlVabFee } from '../flCountyFees';
import { flPetitionDeadline, flCountyDateIsKnown, FL_COUNTY_DATES_YEAR } from '../filingWindows';
import { deliveryMode, DELIVERY } from './delivery';

export const FL_QUOTE = Object.freeze({ CASE: 'case', NO_CASE: 'no_case' });

const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };
const cleanCounty = (c) => String(c || '').replace(/\s+County$/i, '').trim();

/** What the owner pays in total to petition: our fee plus the county's. Null if the fee is not confirmed. */
export function flTotalCost(county) {
  const fee = getFlVabFee(cleanCounty(county));
  if (!fee || fee.confidence !== 'confirmed' || !(Number(fee.vabFee) > 0)) return null;
  return { dollars: SERVICE_PRICE_DOLLARS + Math.round(Number(fee.vabFee) / 100), feeCents: Number(fee.vabFee), payableTo: fee.payableTo };
}

/**
 * The petition's own verdict, on stored facts only (so checkout and the kit
 * builder re-run exactly what the quote ran).
 * @param {object} c { parcel (NAL facts), comps, cure, millage, taxYear, county }
 */
export function flKitDecision(c) {
  const p = c?.parcel;
  const no = (reason, extra = {}) => ({ decision: FL_QUOTE.NO_CASE, reason, ...extra });
  if (!p || !(num(p.jv) > 0)) return no('no_value_on_roll');
  if (num(p.asmnt_yr) !== num(c.taxYear)) return no('roll_not_this_year');
  const use = num(p.dor_uc);
  if (use !== null && !RESIDENTIAL_USE_CODES.has(use)) return no('not_residential');
  const comps = c.comps;
  if (!comps || !comps.sufficient || !Array.isArray(comps.list) || comps.list.length < 3) return no(comps?.reason || 'insufficient_comparables');
  if (comps.supportsReduction !== true || !(num(comps.indicatedValue) > 0) || num(comps.indicatedValue) >= num(p.jv)) return no('comps_do_not_support_reduction');
  const cure = Math.max(0, num(c.cure?.total) || 0);
  const requestedValue = Math.max(0, Math.round((num(comps.indicatedValue) - cure) / 1000) * 1000);
  if (!c.millage || !(num(c.millage.school) > 0 || num(c.millage.nonSchool) > 0)) return no('no_millage');
  const eff = taxEffect(p, requestedValue, c.millage);
  if (eff.noEffect) return no('capped_beyond_reach', { requestedValue });
  const cost = flTotalCost(c.county);
  if (!cost) return no('fee_not_confirmed', { requestedValue });
  if (!(num(eff.dollarsSaved) >= cost.dollars)) return no('bill_wont_drop_enough', { requestedValue, yearlySaving: eff.dollarsSaved, totalCost: cost.dollars });
  return { decision: FL_QUOTE.CASE, reason: null, requestedValue, yearlySaving: eff.dollarsSaved, totalCost: cost.dollars, taxableAfter: eff.taxableAfter };
}

/**
 * The deadline to print and to time delivery by: the date from the owner's
 * TRIM notice, or our table's date for this county and year if earlier.
 * @returns {{ date: Date, iso: string, source: 'notice'|'county_table' } | null}
 */
export function flKitDeadline({ county, taxYear, trimDeadline }) {
  const year = num(taxYear);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(trimDeadline || ''))) return null;
  const typed = new Date(`${trimDeadline}T00:00:00Z`);
  if (Number.isNaN(typed.getTime()) || typed.getUTCFullYear() !== year) return null;
  // Florida's petition deadlines fall between mid-August and October. A date
  // outside that is a typo (or the wrong date on the notice), never a deadline.
  const m = typed.getUTCMonth() + 1;
  if (m < 8 || m > 10) return null;
  let best = { date: typed, source: 'notice' };
  if (year === FL_COUNTY_DATES_YEAR && flCountyDateIsKnown(cleanCounty(county))) {
    const local = flPetitionDeadline(cleanCounty(county), year);
    const t = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
    if (t < best.date) best = { date: t, source: 'county_table' };
  }
  return { ...best, iso: best.date.toISOString().slice(0, 10) };
}

/** Everything about the order that must be true before a Florida kit exists. Codes, not sentences. */
export function flOrderProblems(o) {
  const ow = o?.owner || {};
  for (const k of ['name', 'street', 'city', 'state', 'zip']) if (!nonEmpty(ow[k])) return 'owner_incomplete';
  if (!nonEmpty(o?.property?.parcelId) || !nonEmpty(o?.property?.address)) return 'property_incomplete';
  if (!getFlVabAddress(cleanCounty(o?.property?.county))) return 'address_not_confirmed';
  if (!flTotalCost(o?.property?.county)) return 'fee_not_confirmed';
  return null;
}

/**
 * The gate the quote route, checkout and the kit builder all run.
 * @returns {{ ok: true, delivery: 'mail'|'pdf', deadline: string } | { ok: false, reason: string, noCase?: true }}
 */
export function flSellability(kitOrder, { now = new Date() } = {}) {
  const o = kitOrder || {};
  if (o.state !== 'FL') return { ok: false, reason: 'wrong_state' };
  const d = flKitDecision({ parcel: o.parcel, comps: o.comps, cure: o.cure, millage: o.millage, taxYear: o.taxYear, county: o.property?.county });
  if (d.decision !== FL_QUOTE.CASE) return { ok: false, reason: d.reason, noCase: true };
  if (num(o.requestedValue) !== d.requestedValue) return { ok: false, reason: 'stored_value_mismatch' };
  const problem = flOrderProblems(o);
  if (problem) return { ok: false, reason: problem };
  const dl = flKitDeadline({ county: o.property.county, taxYear: o.taxYear, trimDeadline: o.trimDeadline });
  if (!dl) return { ok: false, reason: 'need_deadline' };
  const delivery = deliveryMode(dl.date, now, 'FL');
  if (delivery === DELIVERY.CLOSED) return { ok: false, reason: 'deadline_too_close' };
  return { ok: true, delivery, deadline: dl.iso };
}

/** The NAL facts the kit prints and the decision re-reads. Nothing else from the row is stored. */
export function parcelFacts(row) {
  const pick = ['parcel_id', 'co_no', 'asmnt_yr', 'jv', 'av_sd', 'av_nsd', 'tv_sd', 'tv_nsd', 'lnd_val', 'tot_lvg_area', 'act_yr_blt', 'dor_uc', 'phy_addr1', 'phy_city', 'phy_zipcd', 'own_name'];
  return Object.fromEntries(pick.map((k) => [k, row?.[k] ?? null]));
}

/**
 * The case for one roll row, before any deadline: the facts, the comps, the
 * cure, the decision, and (when it is a case) the kit order without its
 * deadline. Shared by the quote below and the Florida pre-sale
 * (lib/kit/flPresale.js), which runs it on last year's roll to reserve and on
 * this year's to finish, so the two can never decide differently.
 * @param {object} row    a parcels row (the DOR NAL)
 * @param {object} input  { owner, taxYear, issues, costOverrides, trimDeadline?, willNotAttend? }
 * @param {object} deps   { findComps, millageForCounty, countyName, totalCostToCure }
 */
export async function flCaseFromRow(row, input, { findComps, millageForCounty, countyName, totalCostToCure }) {
  const county = countyName(row.co_no);
  const taxYear = num(input.taxYear) || num(row.asmnt_yr);
  const parcel = parcelFacts(row);
  const millage = millageForCounty(Number(row.co_no)) || null;

  let cure = { total: 0, items: [] };
  if (Array.isArray(input.issues) && input.issues.length) {
    try {
      const t = totalCostToCure(input.issues, row, input.costOverrides || {});
      cure = { total: Math.round(Number(t.total) || 0), items: (t.priced || []).map((p) => ({ issue: p.issue, asked: Math.round(Number(p.asked) || 0), source: p.source || null, ownerSupplied: p.ownerSupplied === true })) };
    } catch (e) { cure = { total: 0, items: [] }; }
  }

  const raw = await findComps(row, { rollYear: num(row.asmnt_yr) });
  const comps = {
    sufficient: raw?.sufficient === true,
    supportsReduction: raw?.supportsReduction === true,
    reason: raw?.reason || null,
    indicatedValue: num(raw?.indicatedValue),
    medianPricePerSqft: num(raw?.medianPricePerSqft),
    sizeBandPct: num(raw?.sizeBandPct),
    ageBandYears: num(raw?.ageBandYears),
    level: raw?.level || null,
    attribution: raw?.attribution || null,
    subjectSale: raw?.subjectSale?.found ? { salePrice: raw.subjectSale.salePrice, saleDate: raw.subjectSale.saleDate } : null,
    list: (raw?.comps || []).slice(0, 6).map((c) => ({ address: c.address, saleDate: String(c.saleDate || '').slice(0, 10), salePrice: num(c.salePrice), sqft: num(c.sqft), yearBuilt: num(c.yearBuilt), pricePerSqft: num(c.pricePerSqft) })),
  };

  const d = flKitDecision({ parcel, comps, cure, millage, taxYear, county });
  const base = {
    decision: d.decision, reason: d.reason, county, taxYear,
    justValue: parcel.jv, indicatedValue: comps.indicatedValue, requestedValue: d.requestedValue ?? null,
    yearlySaving: d.yearlySaving ?? null, totalCost: d.totalCost ?? flTotalCost(county)?.dollars ?? null,
    homesteaded: num(row.exmpt_01) > 0,
  };
  if (d.decision !== FL_QUOTE.CASE) return { base, kitOrder: null };

  const ow = input.owner || {};
  const kitOrder = {
    state: 'FL', taxYear,
    property: { address: `${[row.phy_addr1, row.phy_city].filter(Boolean).join(', ')}, FL ${String(row.phy_zipcd || '').slice(0, 5)}`.trim(), county, parcelId: String(row.parcel_id), coNo: num(row.co_no), source: `${row.asmnt_yr} Florida DOR assessment roll, county ${row.co_no}` },
    owner: { name: ow.name, street: ow.street, street2: ow.street2 || '', city: ow.city, state: ow.state, zip: ow.zip, phone: ow.phone || '', email: ow.email || '' },
    parcel, comps, cure, millage,
    requestedValue: d.requestedValue,
    savings: { yearlySaving: d.yearlySaving },
    trimDeadline: input.trimDeadline || null,
    willNotAttend: input.willNotAttend === true,
  };
  return { base, kitOrder };
}

/**
 * Run the check for one address. Dependencies injected so verify-fl-kit runs offline.
 * @param {object} input  { property:{street,city,zip}, owner:{...}, taxYear, trimDeadline, willNotAttend, issues, costOverrides }
 * @param {object} deps   { findParcel, findComps, millageForCounty, countyName(co_no), totalCostToCure, now }
 */
export async function quoteFlKit(input, deps) {
  const { findParcel, now = new Date() } = deps;
  const row = await findParcel({ street: input.property.street, zip: input.property.zip, city: input.property.city || null });
  if (row?.lookupFailed) { const e = new Error('roll lookup failed'); e.upstream = true; throw e; }
  if (!row || row.noMatch) return { decision: FL_QUOTE.NO_CASE, reason: 'no_parcel', sellable: false };
  if (row.ambiguous) return { decision: FL_QUOTE.NO_CASE, reason: 'ambiguous', sellable: false };

  const { base, kitOrder } = await flCaseFromRow(row, input, deps);
  if (!kitOrder) return { ...base, sellable: false };
  const sell = flSellability(kitOrder, { now });
  return { ...base, sellable: sell.ok, notSellableReason: sell.ok ? null : sell.reason, delivery: sell.ok ? sell.delivery : null, deadline: sell.ok ? sell.deadline : null, kitOrder: sell.ok ? kitOrder : null };
}
