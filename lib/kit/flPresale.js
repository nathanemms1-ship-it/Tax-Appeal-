/**
 * lib/kit/flPresale.js — Florida pre-sale. 18 Oct 2026; same promise as
 * Georgia's and Texas's.
 *
 * Most of the year a Florida owner cannot buy a kit: this year's values (the
 * DOR roll) arrive around July, the TRIM notice with the petition deadline in
 * mid-August, and the deadline is about 25 days later. So, outside that window:
 *
 *   screen   build the petition case on the latest roll we hold (flCaseFromRow,
 *            the quote's own code). Reserve only if it is a case that lowers the
 *            bill by at least what the owner pays, in a county whose Value
 *            Adjustment Board address and fee are confirmed (flPresaleSellability).
 *   wait     awaiting_notice. Nothing is built for the customer, nothing mailed.
 *   finish   (processFlPresale) in two steps, either order:
 *            1. this year's roll for the county is loaded: rebuild the case on
 *               it. No case -> full refund. Case -> kept, waiting for step 2.
 *            2. the petition deadline is known: our county table for this year
 *               (FL_COUNTY_DATES_YEAR), or the date the customer enters from
 *               their TRIM notice at /kit/trim. Then the ordinary Florida gate
 *               (flSellability) and the kit is mailed, or emailed when late.
 *            Anything odd (parcel gone from the roll, deadline already too
 *            close) -> a person (needs_review), never a guess.
 *
 * The daily cron (pages/api/cron/notice-reminder.js flRollPass) runs step 1,
 * asks for the deadline once TRIM notices are out, and pages ops when a roll
 * or a deadline is late. Every side effect is injected so
 * scripts/verify-fl-presale.mjs runs offline.
 */
import { flCaseFromRow, flSellability, flKitDeadline, flOrderProblems, FL_QUOTE } from './flQuote';
import { flPetitionDeadline, flTrimMailDate, flCountyDateIsKnown, FL_COUNTY_DATES_YEAR, FL_UNKNOWN_COUNTY_DEADLINE, PETITION_DAYS_AFTER_TRIM } from '../filingWindows';
import { KIT_STATUS } from './dispatchKit';
import { PRESALE_STATUS } from './presale';

const DAY = 86400000;
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };
const cleanCounty = (c) => String(c || '').replace(/\s+County$/i, '').trim();
const utc = (local) => new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));

/** Days after a county's TRIM notices go out by which an owner has theirs. */
export const TRIM_ARRIVED_DAYS = 10;
/** Ask for the deadline from this date (TRIM notices go out mid-August), weekly, at most this often. */
export const FL_ASK = Object.freeze({ fromMonth: 8, fromDay: 10, everyDays: 7, max: 6 });
/** Page ops when this year's roll is still not loaded, or no deadline entered, by these dates. */
export const FL_LATE = Object.freeze({ roll: { month: 8, day: 1 }, deadline: { month: 9, day: 5 } });

/**
 * The tax year a reservation made today is for. This year's, until the owner
 * would have their TRIM notice (mailing date plus TRIM_ARRIVED_DAYS); after
 * that they buy the ordinary kit from the notice, and a reservation is for
 * next year. A county with no date in our table uses the statewide fallback.
 */
export function flPresaleSeasonYear(county, now = new Date()) {
  const y = now.getUTCFullYear();
  const c = cleanCounty(county);
  let trim = flCountyDateIsKnown(c) ? flTrimMailDate(c, y) : null;
  if (!trim) {
    trim = new Date(y, FL_UNKNOWN_COUNTY_DEADLINE[0] - 1, FL_UNKNOWN_COUNTY_DEADLINE[1]);
    trim.setDate(trim.getDate() - PETITION_DAYS_AFTER_TRIM);
  }
  const arrived = utc(trim).getTime() + TRIM_ARRIVED_DAYS * DAY;
  return now.getTime() < arrived ? y : y + 1;
}

/** Our table's deadline for this county and tax year, ISO, or null. Never a date from another year's table. */
export function flTableDeadline(county, taxYear) {
  const c = cleanCounty(county);
  if (num(taxYear) !== FL_COUNTY_DATES_YEAR || !flCountyDateIsKnown(c)) return null;
  return utc(flPetitionDeadline(c, num(taxYear))).toISOString().slice(0, 10);
}

/** The reservation, as stored under its kitKey and on the order row. Built from the case on the screening roll. */
export function flPresaleOrder({ caseOrder, base, taxYear, screenYear, issues = [], costOverrides = {} }) {
  return {
    presale: true, state: 'FL', taxYear: num(taxYear), screenYear: num(screenYear),
    property: { ...caseOrder.property },
    owner: { ...caseOrder.owner },
    willNotAttend: caseOrder.willNotAttend === true,
    caseInput: { issues, costOverrides },
    prior: {
      decision: base.decision, justValue: base.justValue ?? null, requestedValue: base.requestedValue ?? null,
      yearlySaving: base.yearlySaving ?? null, totalCost: base.totalCost ?? null,
    },
    trimDeadline: null,
  };
}

/** The pre-sale gate, run when the reservation is offered and again at checkout on the STORED order. */
export function flPresaleSellability(order, { now = new Date() } = {}) {
  const o = order || {};
  if (o.presale !== true || o.state !== 'FL') return { ok: false, reason: 'not_a_presale' };
  if (o.prior?.decision !== FL_QUOTE.CASE) return { ok: false, reason: 'no_case', noCase: true };
  const gap = num(o.taxYear) - num(o.screenYear);
  if (!(gap === 0 || gap === 1)) return { ok: false, reason: 'not_a_presale' };
  if (num(o.property?.coNo) === null) return { ok: false, reason: 'property_incomplete' };
  const problem = flOrderProblems(o);
  if (problem) return { ok: false, reason: problem };
  // Bought late in the season, a reservation would be for a year that has moved on.
  if (flPresaleSeasonYear(o.property.county, now) !== num(o.taxYear)) return { ok: false, reason: 'season_moved' };
  return { ok: true, delivery: 'mail' };
}

/**
 * The reservation quote: the latest roll we hold, for the season ahead.
 * @param {object} input  as quoteFlKit's (no deadline needed)
 * @param {object} deps   { findParcel, findComps, millageForCounty, countyName, totalCostToCure, now }
 */
export async function quoteFlPresale(input, deps) {
  const { findParcel, countyName, now = new Date() } = deps;
  const row = await findParcel({ street: input.property.street, zip: input.property.zip, city: input.property.city || null });
  if (row?.lookupFailed) { const e = new Error('roll lookup failed'); e.upstream = true; throw e; }
  if (!row || row.noMatch) return { presale: true, decision: FL_QUOTE.NO_CASE, reason: 'no_parcel', sellable: false };
  if (row.ambiguous) return { presale: true, decision: FL_QUOTE.NO_CASE, reason: 'ambiguous', sellable: false };

  const screenYear = num(row.asmnt_yr);
  const taxYear = flPresaleSeasonYear(countyName(row.co_no), now);
  // Once this year's TRIM notices are out the owner has a deadline and buys the
  // ordinary kit; we do not sell a reservation for a season ten months away.
  if (taxYear !== now.getUTCFullYear()) return { presale: true, decision: FL_QUOTE.NO_CASE, reason: 'trim_already_out', taxYear, screenYear, sellable: false };
  if (!(taxYear - screenYear === 0 || taxYear - screenYear === 1)) {
    return { presale: true, decision: FL_QUOTE.NO_CASE, reason: 'roll_out_of_date', taxYear, screenYear, sellable: false };
  }
  const { base, kitOrder } = await flCaseFromRow(row, { ...input, taxYear: screenYear, trimDeadline: null }, deps);
  const out = { ...base, presale: true, taxYear, screenYear, sellable: false };
  if (!kitOrder) return out;
  const order = flPresaleOrder({ caseOrder: kitOrder, base, taxYear, screenYear, issues: input.issues, costOverrides: input.costOverrides });
  const sell = flPresaleSellability(order, { now });
  return { ...out, sellable: sell.ok, notSellableReason: sell.ok ? null : sell.reason, kitOrder: sell.ok ? order : null };
}

/** A deadline the customer typed, checked the way the kit will check it. ISO or null. */
export function cleanTrimDeadline(k, typed) {
  // The kit itself prints the earlier of this and our table's date (flKitDeadline).
  return flKitDeadline({ county: k?.property?.county, taxYear: k?.taxYear, trimDeadline: typed }) ? typed : null;
}

/**
 * Finish one reservation as far as it can go today. Safe to call daily and on
 * every deadline entry: the row is claimed first, and released unchanged in
 * status if there is nothing to do yet.
 * @param {object} deps { rollLoaded(coNo, year), loadParcel(coNo, parcelId, year), caseDeps,
 *                        claim, update, refund, dispatch, sendEmail, alertOps, now, trimDeadline? }
 */
export async function processFlPresale(row, { rollLoaded, loadParcel, caseDeps, claim, update, refund, dispatch, sendEmail = async () => {}, alertOps = async () => {}, now = new Date(), trimDeadline }) {
  const id = row?.id;
  if (row?.state_code !== 'FL' || row?.kit_order?.presale !== true) return { status: row?.dispute_status || null, reason: 'not_a_presale' };
  if (row.payment_status !== 'paid') return { status: row.dispute_status, reason: 'not_paid' };
  if (row.dispute_status !== KIT_STATUS.AWAITING_NOTICE) return { status: row.dispute_status, reason: 'already_done' };
  if (!(await claim(KIT_STATUS.AWAITING_NOTICE, PRESALE_STATUS.CHECKING))) return { status: PRESALE_STATUS.CHECKING, reason: 'in_progress' };

  let k = { ...row.kit_order };
  const release = (extra = {}) => update({ dispute_status: KIT_STATUS.AWAITING_NOTICE, kit_order: k }).then(() => ({ status: KIT_STATUS.AWAITING_NOTICE, confirmed: k.rollResult?.decision === FL_QUOTE.CASE, ...extra }));

  if (trimDeadline !== undefined) {
    const clean = cleanTrimDeadline(k, trimDeadline);
    if (!clean) return release({ reason: 'bad_deadline' });
    k = { ...k, trimDeadline: clean, trimEnteredAt: now.toISOString() };
  }

  // ── 1. This year's roll ──────────────────────────────────────────────────
  if (k.rollResult?.decision !== FL_QUOTE.CASE) {
    let loaded;
    try { loaded = await rollLoaded(k.property.coNo, k.taxYear); } catch (e) { return release({ reason: 'upstream', retry: true }); }
    if (!loaded) return release({ reason: 'roll_not_loaded' });

    let parcel;
    try { parcel = await loadParcel(k.property.coNo, k.property.parcelId, k.taxYear); } catch (e) { return release({ reason: 'upstream', retry: true }); }
    if (!parcel) {
      // Renumbered or split since last year: never guess which parcel is theirs.
      await update({ dispute_status: KIT_STATUS.NEEDS_REVIEW, kit_order: k });
      await alertOps('FL pre-sale: parcel not on the new roll', `order=${id} co_no=${k.property.coNo} parcel=${k.property.parcelId} year=${k.taxYear}`, { force: true });
      return { status: KIT_STATUS.NEEDS_REVIEW, reason: 'parcel_not_on_roll' };
    }

    let built;
    try {
      built = await flCaseFromRow(parcel, { owner: k.owner, taxYear: k.taxYear, willNotAttend: k.willNotAttend, trimDeadline: null, ...(k.caseInput || {}) }, caseDeps);
    } catch (e) {
      await alertOps('FL pre-sale: rebuild failed', `order=${id}\n${e?.message}`, { force: true });
      return release({ reason: 'rebuild_failed', retry: true });
    }
    const result = { decision: built.base.decision, reason: built.base.reason, justValue: built.base.justValue ?? null, requestedValue: built.base.requestedValue ?? null, yearlySaving: built.base.yearlySaving ?? null, checkedAt: now.toISOString() };

    if (!built.kitOrder) {
      try {
        const r = await refund(row);
        await update({ dispute_status: PRESALE_STATUS.REFUNDED, payment_status: 'refunded', kit_order: { ...k, rollResult: { ...result, refundId: r?.id || null } } });
        try { await sendEmail({ to: row.customer_email, ...flRefundEmail(row, result.reason) }); } catch (e) { /* the refund stands */ }
        return { status: PRESALE_STATUS.REFUNDED, reason: result.reason };
      } catch (e) {
        await update({ dispute_status: KIT_STATUS.NEEDS_REVIEW, kit_order: { ...k, rollResult: { ...result, refundError: String(e?.message || e) } } });
        await alertOps('FL pre-sale refund FAILED', `order=${id} reason=${result.reason}\n${e?.message}`, { force: true });
        return { status: KIT_STATUS.NEEDS_REVIEW, reason: 'refund_failed' };
      }
    }
    k = { ...k, rollResult: result, built: built.kitOrder };
  }

  // ── 2. The deadline ──────────────────────────────────────────────────────
  const deadline = flTableDeadline(k.property.county, k.taxYear) || k.trimDeadline || null;
  if (!deadline) return release({ reason: 'need_deadline' });

  const kitOrder = {
    ...k.built, trimDeadline: deadline,
    fromPresale: { screenYear: k.screenYear, prior: k.prior, rollResult: k.rollResult, deadlineSource: flTableDeadline(k.property.county, k.taxYear) ? 'county_table' : 'customer' },
  };
  const sell = flSellability(kitOrder, { now });
  if (!sell.ok) {
    if (sell.reason === 'need_deadline') { k = { ...k, trimDeadline: null }; return release({ reason: 'bad_deadline' }); }
    await update({ dispute_status: KIT_STATUS.NEEDS_REVIEW, kit_order: { ...k, notSellable: sell.reason } });
    await alertOps('FL pre-sale case, cannot send', `order=${id} reason=${sell.reason} deadline=${deadline}\nCall the customer: a PDF they hand-deliver, or a refund.`, { force: true });
    return { status: KIT_STATUS.NEEDS_REVIEW, reason: sell.reason };
  }
  const { error } = await update({ dispute_status: KIT_STATUS.QUEUED, kit_order: kitOrder });
  if (error) {
    await alertOps('FL pre-sale could not be saved', `order=${id}\n${error.message || error}`, { force: true });
    return release({ reason: 'save_failed', retry: true });
  }
  const r = await dispatch({ ...row, dispute_status: KIT_STATUS.QUEUED, kit_order: kitOrder });
  return { status: r?.status || KIT_STATUS.QUEUED, delivery: sell.delivery, yearlySaving: kitOrder.savings?.yearlySaving ?? null };
}

/**
 * What the daily cron does with one Florida reservation. Pure.
 * @returns {{ process: boolean, ask: boolean, alert: null|'roll'|'deadline' }}
 */
export function flRollPlan(row, rollIsLoaded, now = new Date()) {
  const k = row?.kit_order || {};
  const none = { process: false, ask: false, alert: null };
  if (row?.state_code !== 'FL' || k.presale !== true || row.payment_status !== 'paid' || row.dispute_status !== KIT_STATUS.AWAITING_NOTICE) return none;
  const y = num(k.taxYear);
  const at = (m, d) => Date.UTC(y, m - 1, d);
  if (k.rollResult?.decision !== FL_QUOTE.CASE) {
    if (rollIsLoaded) return { ...none, process: true };
    return { ...none, alert: now.getTime() >= at(FL_LATE.roll.month, FL_LATE.roll.day) && !k.rollLateAlertAt ? 'roll' : null };
  }
  if (flTableDeadline(k.property?.county, y) || k.trimDeadline) return { ...none, process: true };
  const last = k.trimAskedAt ? new Date(k.trimAskedAt).getTime() : 0;
  const ask = now.getTime() >= at(FL_ASK.fromMonth, FL_ASK.fromDay) && (Number(k.trimAsks) || 0) < FL_ASK.max && (!last || now.getTime() - last >= FL_ASK.everyDays * DAY);
  const alert = now.getTime() >= at(FL_LATE.deadline.month, FL_LATE.deadline.day) && !k.trimLateAlertAt ? 'deadline' : null;
  return { process: false, ask, alert };
}

const FL_NO_CASE_WHY = {
  comps_do_not_support_reduction: "sales of similar homes no longer show your just value is too high",
  subject_sold_above_indicated_value: "your home's own recent sale supports the county's value",
  capped_beyond_reach: 'your Save Our Homes cap already keeps your taxed value below the just value, so lowering it would not change your bill',
  bill_wont_drop_enough: "after your cap and exemptions a petition would lower your tax bill by less than it would cost you, our fee plus the county's filing fee",
  insufficient_comparables: 'there are not enough recent qualified sales of similar homes near you to build strong evidence',
  too_few_comparable_in_size: 'there are not enough recent qualified sales of homes like yours near you to build strong evidence',
  no_qualified_sales: 'there are not enough recent qualified sales near you to build strong evidence',
  not_residential: 'the county roll no longer lists the property as residential',
  no_value_on_roll: "the county's roll has no value for your home",
};

export function flRefundEmail(row, reason) {
  const first = String(row.customer_name || '').split(' ')[0] || 'there';
  const k = row.kit_order || {};
  return {
    subject: 'Your refund: a petition would not lower your tax bill this year',
    text: [
      `Hi ${first},`,
      '',
      `Your county's ${k.taxYear || 'new'} values are out, and we checked ${k.property?.address || 'your home'} again. ${FL_NO_CASE_WHY[reason] ? `This year ${FL_NO_CASE_WHY[reason]}` : 'This year our check does not support a petition'}, so we are not sending you a kit.`,
      '',
      'We have refunded your payment in full. It usually shows on your statement within 5 to 10 business days.',
      '',
      'That is the promise we made when you reserved: we check before anything is mailed, and if a petition will not lower your bill, you do not pay for one.',
      '',
      'Questions: customerservice@taxappealusa.com',
    ].join('\n'),
  };
}

export function flTrimAskEmail(row, link) {
  const first = String(row.customer_name || '').split(' ')[0] || 'there';
  const k = row.kit_order || {};
  return {
    subject: 'Has your TRIM notice arrived? We need your petition deadline',
    text: [
      `Hi ${first},`,
      '',
      `Your petition for ${k.property?.address || 'your home'} still has a case on this year's values. To send your kit we need one thing from your TRIM notice (the "Notice of Proposed Property Taxes" the property appraiser mails in August): the last day to file a petition with the Value Adjustment Board.`,
      '',
      'Enter it here, or take a photo of the notice and we read it for you:',
      '',
      link,
      '',
      'Florida counts a petition on the day the board receives it, not the postmark, so the sooner you enter it the more time you have.',
      '',
      'Questions: customerservice@taxappealusa.com',
    ].join('\n'),
  };
}
