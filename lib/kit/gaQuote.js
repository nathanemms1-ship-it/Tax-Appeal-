/**
 * lib/kit/gaQuote.js — "should you appeal?" for one Georgia home, and the kit
 * order that results if the answer is yes.
 *
 * The marketing cornerstone (11 Oct 2026): we check whether an appeal will
 * actually lower the tax bill, after caps and exemptions, BEFORE the customer
 * pays, and we do not sell one that won't. This module is that check:
 *
 *   1. The home: RentCast record (location, heated sqft, year built, parcel).
 *   2. Is it over-assessed?  Recorded sales of similar homes in the 12 (or 24)
 *      months before 1 January of the digest year (lib/kit/comps.js), median
 *      price per sqft x this home's sqft, vs the value on the notice.
 *   3. Does the BILL drop?  lib/ga/savings.js: HB 581 caps, local freezes,
 *      homestead, millage. Sold only if the yearly saving is at least the price.
 *   4. Can we sell it in this county today?  Confirmed appeal address, settled
 *      county form, the county's own questions answered — the same rules the
 *      kit builder enforces, run BEFORE the card is charged.
 *
 * Network calls are injected (lookupSubject, fetchSales) so the build check
 * runs offline.
 */
import { findKitComps, caseCheck, evidenceRows } from './comps';
import { gaSavings } from '../ga/savings';
import { validateGaOrder, valuationDate, KitError } from './gaKit';
import { getAppealAddress, isMailable } from '../appealAddresses';
import { formForCounty, FormError } from './forms/gaForms';
import { SERVICE_PRICE_DOLLARS } from '../pricing';

export const QUOTE = Object.freeze({
  CASE: 'case',               // over-assessed AND the bill drops by at least the price
  NO_CASE: 'no_case',         // we will not sell: say why
  NEED_INFO: 'need_info',     // a question must be answered first
});

const int = (v) => { const n = Number(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };
const normCounty = (c) => String(c || '').replace(/\s+County$/i, '').trim();

/**
 * @param {object} input
 * @param {object} input.property    { street, city, state:'GA', zip, county }
 * @param {object} input.owner       { name, street, street2?, city, state, zip, phone?, email }
 * @param {number} input.taxYear     the digest year on the notice
 * @param {number|string} input.noticeValue   current-year FULL (100%) value on the notice
 * @param {string} input.noticeDate  YYYY-MM-DD (the date printed on the notice)
 * @param {boolean} input.homestead
 * @param {string} [input.parcelId]  as printed on the notice (overrides the RentCast record)
 * @param {string} [input.indSchool] DOR name of an independent city school system, if any
 * @param {boolean} [input.ownedOnJan1]       Chatham's form asks
 * @param {boolean} [input.fultonBilling100]  Fulton's form asks (false = 85%, the default)
 * @param {boolean} [input.virtualHearing]    Fulton's form asks (optional)
 * @param {object} deps { lookupSubject(property) -> subject, fetchSales, now }
 */
export async function quoteGaKit(input, { lookupSubject, fetchSales, now = new Date() } = {}) {
  const p = input?.property || {};
  const county = normCounty(p.county);
  const taxYear = Number(input?.taxYear);
  const noticeValue = int(input?.noticeValue);
  const out = { decision: null, reason: null, county, taxYear, noticeValue, sellable: false };

  if (String(p.state || '').toUpperCase() !== 'GA') return { ...out, decision: QUOTE.NO_CASE, reason: 'not_georgia' };
  if (!county) return { ...out, decision: QUOTE.NEED_INFO, reason: 'need_county' };
  if (!(taxYear >= 2026 && taxYear <= 2100)) return { ...out, decision: QUOTE.NEED_INFO, reason: 'need_tax_year' };
  if (!noticeValue) return { ...out, decision: QUOTE.NEED_INFO, reason: 'need_notice_value' };
  if (typeof input.homestead !== 'boolean') return { ...out, decision: QUOTE.NEED_INFO, reason: 'need_homestead_answer' };

  // 1. The home.
  const subject = await lookupSubject(p);
  if (!subject || !Number.isFinite(subject.lat) || !Number.isFinite(subject.lon) || !int(subject.sqft)) {
    return { ...out, decision: QUOTE.NO_CASE, reason: 'no_property_record' };
  }

  // 2. Over-assessed? Sales measured back from 1 January of the digest year.
  const asOf = valuationDate(taxYear);
  const comps = await findKitComps({ ...subject, sqft: int(subject.sqft) }, { fetchSales, now, asOf: asOf <= now ? asOf : null });
  const rows = comps.ok ? evidenceRows(comps, asOf <= now ? asOf : now) : [];
  const verdict = caseCheck(noticeValue, comps.ok ? comps.indicated : null);
  const base = {
    ...out,
    subject: { sqft: int(subject.sqft), yearBuilt: subject.yearBuilt || null, parcelId: subject.parcelId || null },
    comps: rows,
    indicatedValue: comps.indicated?.value || null,
    ppsf: comps.indicated?.ppsf || null,
    caseCheck: verdict,
  };
  if (!comps.ok) return { ...base, decision: QUOTE.NO_CASE, reason: 'too_few_comps' };
  if (verdict.verdict !== 'over_assessed') return { ...base, decision: QUOTE.NO_CASE, reason: 'not_over_assessed' };

  // 3. Does the bill drop by at least what we charge?
  const savings = gaSavings({
    county, homestead: input.homestead, reduction: verdict.reduction, price: SERVICE_PRICE_DOLLARS,
    indSchool: input.indSchool || null, taxYear,
  });
  const withSavings = { ...base, savings };
  if (!savings.ok) return { ...withSavings, decision: QUOTE.NO_CASE, reason: savings.reason };
  if (savings.verdict === 'no_bill_change' || savings.verdict === 'saving_below_price') {
    return { ...withSavings, decision: QUOTE.NO_CASE, reason: 'bill_wont_drop_enough' };
  }

  // 4. The kit order, and whether this county can be sold today.
  const kitOrder = {
    state: 'GA', taxYear, noticeDate: input.noticeDate || null, homestead: input.homestead,
    owner: { ...input.owner },
    property: { address: `${p.street}, ${p.city}, GA ${p.zip}`, county, parcelId: String(input.parcelId || subject.parcelId || '').trim() },
    noticeValue, requestedValue: verdict.requestedValue,
    evidence: {
      subjectSqft: int(subject.sqft), subjectYearBuilt: subject.yearBuilt || null,
      radiusMi: comps.radiusMi, days: comps.days, ppsf: comps.indicated.ppsf, indicatedValue: comps.indicated.value,
      comps: rows,
    },
    savings,
    ...(typeof input.ownedOnJan1 === 'boolean' ? { ownedOnJan1: input.ownedOnJan1 } : {}),
    ...(typeof input.fultonBilling100 === 'boolean' ? { fultonBilling100: input.fultonBilling100 } : {}),
    ...(typeof input.virtualHearing === 'boolean' ? { virtualHearing: input.virtualHearing } : {}),
    ...(input.indSchool ? { indSchool: input.indSchool } : {}),
  };

  const sell = gaSellability(kitOrder, { now });
  return { ...withSavings, decision: sell.needs ? QUOTE.NEED_INFO : QUOTE.CASE, reason: sell.needs || null, sellable: sell.ok, notSellableReason: sell.ok ? null : sell.reason, kitOrder };
}

/**
 * The same rules the kit builder enforces at mailing time, run before payment.
 * Returns { ok } or { ok:false, reason } (not sellable here yet) or { needs } (ask the customer).
 */
export function gaSellability(kitOrder, { now = new Date() } = {}) {
  const county = kitOrder?.property?.county;
  let form;
  try { form = formForCounty(county, { taxYear: kitOrder.taxYear }); }
  catch (e) { if (e instanceof FormError) return { ok: false, reason: e.code }; throw e; }
  // The county's own form asks something only the owner can answer: ask first.
  for (const k of form.needs || []) {
    if (typeof kitOrder[k] !== 'boolean') return { ok: false, needs: `need_${k}`, reason: `need_${k}` };
  }
  const row = getAppealAddress('GA', county);
  if (!row || !isMailable(row, now)) return { ok: false, reason: 'address_not_confirmed' };
  try {
    validateGaOrder({ ...kitOrder, countyAddress: row }, { now });
    return { ok: true };
  } catch (e) {
    if (!(e instanceof KitError)) throw e;
    return { ok: false, reason: e.code };
  }
}

/*
 * ============================================================================
 * PRE-SALE (Nathan, 16 Oct 2026: "I want to keep pre sale")
 * ============================================================================
 * Before the notice arrives the current-year value does not exist anywhere, and
 * a Georgia appeal is an appeal OF the notice (45 days from its date, its value
 * on the form). So a pre-sale is "pay now, kit built the day the notice comes
 * in, full refund if the case is gone" — and nothing is built or mailed early.
 *
 * What makes it honest is the screen: we pre-sell only when LAST year's value
 * (the 2026 value, the only one that exists) already shows a case against
 * recorded sales before 1 January of the digest year, AND that gap would lower
 * the bill by at least the price after caps and freezes. Every refund costs us
 * Stripe's fee, so a loose screen is not free.
 *
 * The 40% trap: a Georgia notice and tax bill print both the 100% fair market
 * value and the 40% assessed value. A typed figure near 40% of what sales
 * support is almost certainly the assessed value; we ask them to check rather
 * than tell them they have no case.
 */
const ASSESSED_LOW = 0.3;
const ASSESSED_HIGH = 0.5;

/** The quote input the notice step re-runs, carried on the pre-sale order. */
function presaleQuoteInput(input) {
  const p = input.property || {};
  return {
    property: { street: p.street, city: p.city, state: 'GA', zip: p.zip, county: normCounty(p.county) },
    owner: { ...input.owner },
    taxYear: Number(input.taxYear),
    homestead: input.homestead,
    ...(input.parcelId ? { parcelId: String(input.parcelId).trim() } : {}),
    ...(input.indSchool ? { indSchool: input.indSchool } : {}),
  };
}

/**
 * @param {object} input  as quoteGaKit, but priorValue (the 100% value from LAST
 *                        year's notice or tax bill) instead of noticeValue/noticeDate
 */
export async function presaleGaKit(input, { lookupSubject, fetchSales, now = new Date() } = {}) {
  const p = input?.property || {};
  const county = normCounty(p.county);
  const taxYear = Number(input?.taxYear);
  const priorValue = int(input?.priorValue);
  const out = { presale: true, decision: null, reason: null, county, taxYear, priorValue, sellable: false };

  if (String(p.state || '').toUpperCase() !== 'GA') return { ...out, decision: QUOTE.NO_CASE, reason: 'not_georgia' };
  if (!county) return { ...out, decision: QUOTE.NEED_INFO, reason: 'need_county' };
  if (!(taxYear >= 2026 && taxYear <= 2100)) return { ...out, decision: QUOTE.NEED_INFO, reason: 'need_tax_year' };
  if (!priorValue) return { ...out, decision: QUOTE.NEED_INFO, reason: 'need_prior_value' };
  if (typeof input.homestead !== 'boolean') return { ...out, decision: QUOTE.NEED_INFO, reason: 'need_homestead_answer' };

  const subject = await lookupSubject(p);
  if (!subject || !Number.isFinite(subject.lat) || !Number.isFinite(subject.lon) || !int(subject.sqft)) {
    return { ...out, decision: QUOTE.NO_CASE, reason: 'no_property_record' };
  }
  const asOf = valuationDate(taxYear);
  const comps = await findKitComps({ ...subject, sqft: int(subject.sqft) }, { fetchSales, now, asOf: asOf <= now ? asOf : null });
  const rows = comps.ok ? evidenceRows(comps, asOf <= now ? asOf : now) : [];
  const base = {
    ...out,
    subject: { sqft: int(subject.sqft), yearBuilt: subject.yearBuilt || null, parcelId: subject.parcelId || null },
    comps: rows, indicatedValue: comps.indicated?.value || null, ppsf: comps.indicated?.ppsf || null,
  };
  if (!comps.ok) return { ...base, decision: QUOTE.NO_CASE, reason: 'too_few_comps' };

  const ratio = priorValue / comps.indicated.value;
  if (ratio >= ASSESSED_LOW && ratio <= ASSESSED_HIGH && input.priorValueConfirmed !== true) {
    return { ...base, decision: QUOTE.NEED_INFO, reason: 'prior_value_looks_assessed' };
  }
  const verdict = caseCheck(priorValue, comps.indicated);
  const withVerdict = { ...base, caseCheck: verdict };
  if (verdict.verdict !== 'over_assessed') return { ...withVerdict, decision: QUOTE.NO_CASE, reason: 'not_over_assessed' };

  const savings = gaSavings({
    county, homestead: input.homestead, reduction: verdict.reduction, price: SERVICE_PRICE_DOLLARS,
    indSchool: input.indSchool || null, taxYear,
  });
  const withSavings = { ...withVerdict, savings };
  if (!savings.ok) return { ...withSavings, decision: QUOTE.NO_CASE, reason: savings.reason };
  if (savings.verdict === 'no_bill_change' || savings.verdict === 'saving_below_price') {
    return { ...withSavings, decision: QUOTE.NO_CASE, reason: 'bill_wont_drop_enough' };
  }

  const kitOrder = {
    presale: true, state: 'GA', taxYear, homestead: input.homestead,
    owner: { ...input.owner },
    property: { address: `${p.street}, ${p.city}, GA ${p.zip}`, county, parcelId: String(input.parcelId || subject.parcelId || '').trim() },
    quoteInput: presaleQuoteInput(input),
    prior: { value: priorValue, indicatedValue: comps.indicated.value, yearlySaving: savings.yearlySaving ?? null, checkedAt: now.toISOString() },
  };
  const sell = gaPresaleSellability(kitOrder, { now });
  return { ...withSavings, decision: QUOTE.CASE, sellable: sell.ok, notSellableReason: sell.ok ? null : sell.reason, kitOrder };
}

/**
 * The pre-sale gate, run by the quote route and again by checkout on the STORED
 * order: the county must be one we could mail a kit in (settled form, confirmed
 * address) and the order complete enough to finish when the notice arrives.
 * County questions (Chatham, Fulton) are asked at the notice step, not here.
 */
export function gaPresaleSellability(kitOrder, { now = new Date() } = {}) {
  const o = kitOrder || {};
  if (o.presale !== true || o.state !== 'GA') return { ok: false, reason: 'not_a_presale' };
  const taxYear = Number(o.taxYear);
  if (!(taxYear >= 2026 && taxYear <= 2100)) return { ok: false, reason: 'bad_tax_year' };
  if (typeof o.homestead !== 'boolean') return { ok: false, reason: 'need_homestead_answer' };
  const q = o.quoteInput || {};
  for (const k of ['street', 'city', 'zip', 'county']) if (!String(q.property?.[k] || '').trim()) return { ok: false, reason: 'property_incomplete' };
  for (const k of ['name', 'street', 'city', 'state', 'zip']) if (!String(o.owner?.[k] || '').trim()) return { ok: false, reason: 'owner_incomplete' };
  if (!(Number(o.prior?.value) > 0)) return { ok: false, reason: 'no_prior_check' };
  try { formForCounty(o.property?.county, { taxYear }); } catch (e) {
    if (e instanceof FormError) return { ok: false, reason: e.code };
    throw e;
  }
  const row = getAppealAddress('GA', o.property?.county);
  if (!row || !isMailable(row, now)) return { ok: false, reason: 'address_not_confirmed' };
  return { ok: true };
}

/** The full quote input once the notice is in: the pre-sale's own facts plus the notice. */
export function noticeQuoteInput(presaleOrder, notice = {}) {
  const q = presaleOrder?.quoteInput || {};
  const b = (v) => (typeof v === 'boolean' ? v : undefined);
  return {
    ...q,
    owner: { ...q.owner, ...(presaleOrder?.owner || {}) },
    noticeValue: notice.noticeValue,
    noticeDate: notice.noticeDate,
    ...(notice.parcelId ? { parcelId: String(notice.parcelId).trim() } : {}),
    ...(b(notice.ownedOnJan1) !== undefined ? { ownedOnJan1: notice.ownedOnJan1 } : {}),
    ...(b(notice.fultonBilling100) !== undefined ? { fultonBilling100: notice.fultonBilling100 } : {}),
    ...(b(notice.virtualHearing) !== undefined ? { virtualHearing: notice.virtualHearing } : {}),
  };
}
