/**
 * lib/kit/txPresale.js — Texas pre-sale (16 Oct 2026; same rules as Georgia's).
 *
 * From 31 January the filing season's roll does not exist yet: districts publish
 * this year's values around April. Every roll we hold before then is LAST year's
 * (lib/tx/rollYear.js). So, like Georgia:
 *
 *   screen   build the protest on last year's roll; reserve only if it is a case
 *            that lowers the bill by at least the price (txKitDecision), in a
 *            district we can mail a kit for (txPresaleSellability)
 *   wait     awaiting_notice. Nothing is built for the customer, nothing mailed.
 *   finish   when THIS year's roll for that district is loaded, rebuild the
 *            protest on it (processTxPresale): case -> kit mailed;
 *            no case -> full refund; anything odd -> a person.
 *
 * Unlike Georgia the customer types nothing: the trigger is our roll load, not
 * their notice. The daily cron (pages/api/cron/notice-reminder.js) runs it, and
 * pages ops if a district's roll is still missing late in April.
 */
import { getAppealAddress, isMailable } from '../appealAddresses';
import { txKitDecision, txSellability, TX_QUOTE } from './txQuote';
import { KIT_STATUS } from './dispatchKit';
import { PRESALE_STATUS } from './presale';

/** The reservation, as stored under its kitKey and on the order row. */
export function txPresaleOrder({ packet, taxYear, screenYear, cadId, accountNumber, county, owner, protestOwner, issues = [], costOverrides = {} }) {
  return {
    presale: true, state: 'TX', taxYear, screenYear, cadId, accountNumber,
    property: { address: packet?.form50132?.propertyAddress || null, county, parcelId: accountNumber },
    owner: { ...owner },
    protestInput: { owner: { ...protestOwner }, issues, costOverrides },
    prior: { estimatedSaving: packet?.estimatedSaving ?? null, requestedValue: packet?.requestedValue ?? null, decision: txKitDecision(packet).decision },
  };
}

/** The pre-sale gate, run when the reservation is offered and again at checkout. */
export function txPresaleSellability(order, { now = new Date() } = {}) {
  const o = order || {};
  if (o.presale !== true || o.state !== 'TX') return { ok: false, reason: 'not_a_presale' };
  if (o.prior?.decision !== TX_QUOTE.CASE) return { ok: false, reason: 'no_case', noCase: true };
  if (!(Number(o.taxYear) > Number(o.screenYear))) return { ok: false, reason: 'not_a_presale' };
  if (!Number.isFinite(Number(o.cadId)) || !String(o.accountNumber || '').trim()) return { ok: false, reason: 'property_incomplete' };
  for (const k of ['name', 'street', 'city', 'state', 'zip']) if (!String(o.owner?.[k] || '').trim()) return { ok: false, reason: 'owner_incomplete' };
  const row = getAppealAddress('TX', o.property?.county);
  if (!row || !isMailable(row, now)) return { ok: false, reason: 'address_not_confirmed' };
  return { ok: true };
}

/**
 * Finish one reservation on this year's roll.
 * @param {object} deps { loadParcel(cadId, account, year) -> roll row|null, findComps, buildProtest,
 *                        claim, update, refund, dispatch, sendEmail, alertOps, now }
 */
export async function processTxPresale(row, { loadParcel, findComps, buildProtest, sellability = txSellability, claim, update, refund, dispatch, sendEmail = async () => {}, alertOps = async () => {}, now = new Date() }) {
  const k = row?.kit_order || {};
  const id = row?.id;
  if (row?.state_code !== 'TX' || k.presale !== true) return { status: row?.dispute_status || null, reason: 'not_a_presale' };
  if (row.payment_status !== 'paid') return { status: row.dispute_status, reason: 'not_paid' };
  if (row.dispute_status !== KIT_STATUS.AWAITING_NOTICE) return { status: row.dispute_status, reason: 'already_done' };
  if (!(await claim(KIT_STATUS.AWAITING_NOTICE, PRESALE_STATUS.CHECKING))) return { status: PRESALE_STATUS.CHECKING, reason: 'in_progress' };
  const release = () => update({ dispute_status: KIT_STATUS.AWAITING_NOTICE });

  let parcel;
  try { parcel = await loadParcel(k.cadId, k.accountNumber, k.taxYear); } catch (e) { await release(); return { status: KIT_STATUS.AWAITING_NOTICE, reason: 'upstream', retry: true }; }
  if (!parcel) {
    // Renumbered or split since last year: never guess which account is theirs.
    await update({ dispute_status: KIT_STATUS.NEEDS_REVIEW });
    await alertOps('TX pre-sale: account not on the new roll', `order=${id} cad=${k.cadId} account=${k.accountNumber} year=${k.taxYear}`, { force: true });
    return { status: KIT_STATUS.NEEDS_REVIEW, reason: 'account_not_on_roll' };
  }

  let packet;
  try {
    const comps = await findComps(parcel, k.taxYear);
    packet = buildProtest({ parcel, comps, taxYear: k.taxYear, ...(k.protestInput || {}) });
  } catch (e) {
    await release();
    await alertOps('TX pre-sale: rebuild failed', `order=${id}\n${e?.message}`, { force: true });
    return { status: KIT_STATUS.AWAITING_NOTICE, reason: 'rebuild_failed', retry: true };
  }

  const decision = txKitDecision(packet);
  const result = { decision: decision.decision, reason: decision.reason, estimatedSaving: packet.estimatedSaving ?? null, checkedAt: now.toISOString() };

  if (decision.decision !== TX_QUOTE.CASE) {
    try {
      const r = await refund(row);
      await update({ dispute_status: PRESALE_STATUS.REFUNDED, payment_status: 'refunded', kit_order: { ...k, rollResult: { ...result, refundId: r?.id || null } } });
      try { await sendEmail({ to: row.customer_email, ...txRefundEmail(row, decision.reason) }); } catch (e) { /* the refund stands */ }
      return { status: PRESALE_STATUS.REFUNDED, reason: decision.reason };
    } catch (e) {
      await update({ dispute_status: KIT_STATUS.NEEDS_REVIEW, kit_order: { ...k, rollResult: { ...result, refundError: String(e?.message || e) } } });
      await alertOps('TX pre-sale refund FAILED', `order=${id} reason=${decision.reason}\n${e?.message}`, { force: true });
      return { status: KIT_STATUS.NEEDS_REVIEW, reason: 'refund_failed' };
    }
  }

  const kitOrder = {
    state: 'TX', taxYear: k.taxYear, packet, property: k.property, owner: k.owner,
    savings: { yearlySaving: packet.estimatedSaving ?? null },
    fromPresale: { screenYear: k.screenYear, prior: k.prior, rollResult: result },
  };
  const sell = sellability(kitOrder, { now });
  if (!sell.ok) {
    await update({ dispute_status: KIT_STATUS.NEEDS_REVIEW, kit_order: { ...k, rollResult: { ...result, notSellable: sell.reason } } });
    await alertOps('TX pre-sale case, district not sellable', `order=${id} reason=${sell.reason}`, { force: true });
    return { status: KIT_STATUS.NEEDS_REVIEW, reason: sell.reason };
  }
  const { error } = await update({ dispute_status: KIT_STATUS.QUEUED, kit_order: kitOrder });
  if (error) {
    await release();
    await alertOps('TX pre-sale could not be saved', `order=${id}\n${error.message || error}`, { force: true });
    return { status: KIT_STATUS.AWAITING_NOTICE, reason: 'save_failed', retry: true };
  }
  const r = await dispatch({ ...row, dispute_status: KIT_STATUS.QUEUED, kit_order: kitOrder });
  return { status: r?.status || KIT_STATUS.QUEUED, yearlySaving: packet.estimatedSaving ?? null };
}

const TX_NO_CASE_WHY = {
  not_over_appraised: "your home is appraised at or below similar homes nearby on this year's roll",
  saving_below_fee: 'a protest would lower your tax bill by less than our fee',
  bill_wont_drop_enough: 'a protest would lower your tax bill by less than our fee',
  capped_beyond_reach: 'your homestead cap already keeps your taxed value below the market value',
  insufficient_comparables: "there are not enough similar homes on the district's roll to build strong evidence",
  cap_artifact_only: "your neighbours look lower mainly because their values are capped",
  nothing_to_ask_for: 'the comparison does not support asking for a lower value',
  no_value_on_roll: "the district's roll has no value for your home",
};

export function txRefundEmail(row, reason) {
  const first = String(row.customer_name || '').split(' ')[0] || 'there';
  const k = row.kit_order || {};
  return {
    subject: 'Your refund: a protest would not lower your tax bill this year',
    text: [
      `Hi ${first},`,
      '',
      `Your appraisal district has published this year's values, and we checked ${k.property?.address || 'your home'} again. ${TX_NO_CASE_WHY[reason] ? `This year ${TX_NO_CASE_WHY[reason]}` : 'This year our check does not support a protest'}, so we are not sending you a kit.`,
      '',
      'We have refunded your payment in full. It usually shows on your statement within 5 to 10 business days.',
      '',
      'That is the promise we made when you reserved: we check before anything is mailed, and if a protest will not lower your bill, you do not pay for one.',
      '',
      'Questions: customerservice@taxappealusa.com',
    ].join('\n'),
  };
}

