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
 *
 * WHICH DISTRICTS, AND THE CUT-OFF (19 Oct 2026, lib/tx/inSeason.js). Only a
 * district that published this year's data before the deadline last year takes
 * reservations; the rest go on the waitlist and no money is taken. If a
 * reserved district's data is still not loaded at the cut-off (10 days before
 * the deadline), processTxCutoff refunds in full and emails Form 50-132 filled
 * in with the owner's details, so the protest can still be filed on time.
 */
import { getAppealAddress, isMailable } from '../appealAddresses';
import { txKitDecision, txSellability, TX_QUOTE } from './txQuote';
import { KIT_STATUS } from './dispatchKit';
import { deadlineShort } from '../tx/protestDeadline.js';
import { PRESALE_STATUS } from './presale';
import { canReserve, dataCutoff } from '../tx/inSeason.js';
import { fill50132 } from '../tx/fill50132';

/** The reservation, as stored under its kitKey and on the order row. */
export function txPresaleOrder({ packet, taxYear, screenYear, cadId, accountNumber, county, owner, protestOwner, issues = [], costOverrides = {} }) {
  return {
    presale: true, state: 'TX', taxYear, screenYear, cadId, accountNumber,
    property: { address: packet?.form50132?.propertyAddress || null, county, parcelId: accountNumber },
    owner: { ...owner },
    protestInput: { owner: { ...protestOwner }, issues, costOverrides },
    prior: { estimatedSaving: packet?.estimatedSaving ?? null, requestedValue: packet?.requestedValue ?? null, decision: txKitDecision(packet).decision },
    // For the cut-off: the form, filled in with who and what, for the season's
    // year. No opinion of value: last year's number is not this year's case.
    form50132: packet?.form50132 ? { ...packet.form50132, taxYear, opinionOfValue: null } : null,
  };
}

/** The pre-sale gate, run when the reservation is offered and again at checkout. */
export function txPresaleSellability(order, { now = new Date() } = {}) {
  const o = order || {};
  if (o.presale !== true || o.state !== 'TX') return { ok: false, reason: 'not_a_presale' };
  if (o.prior?.decision !== TX_QUOTE.CASE) return { ok: false, reason: 'no_case', noCase: true };
  if (!(Number(o.taxYear) > Number(o.screenYear))) return { ok: false, reason: 'not_a_presale' };
  if (!Number.isFinite(Number(o.cadId)) || !String(o.accountNumber || '').trim()) return { ok: false, reason: 'property_incomplete' };
  // No data before the deadline last year: waitlist, take no money.
  if (!canReserve(o.cadId)) return { ok: false, reason: 'no_season_data', waitlist: true };
  // Too late to promise a kit built on data that is not out yet.
  if (now >= dataCutoff(o.taxYear)) return { ok: false, reason: 'past_data_cutoff' };
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

/**
 * The cut-off: the district's data is still not loaded. Refund in full and email
 * the filled-in form, so the customer can protest on time without us.
 * @param {object} deps { claim, update, refund, sendEmail, alertOps, fill = fill50132, appealAddress?, now }
 */
export async function processTxCutoff(row, { claim, update, refund, sendEmail = async () => {}, alertOps = async () => {}, fill = fill50132, appealAddress = null, now = new Date() }) {
  const k = row?.kit_order || {};
  const id = row?.id;
  if (row?.state_code !== 'TX' || k.presale !== true) return { status: row?.dispute_status || null, reason: 'not_a_presale' };
  if (row.payment_status !== 'paid') return { status: row.dispute_status, reason: 'not_paid' };
  if (row.dispute_status !== KIT_STATUS.AWAITING_NOTICE) return { status: row.dispute_status, reason: 'already_done' };
  if (!(await claim(KIT_STATUS.AWAITING_NOTICE, PRESALE_STATUS.CHECKING))) return { status: PRESALE_STATUS.CHECKING, reason: 'in_progress' };

  let r;
  try { r = await refund(row); } catch (e) {
    await update({ dispute_status: KIT_STATUS.NEEDS_REVIEW, kit_order: { ...k, cutoff: { at: now.toISOString(), refundError: String(e?.message || e) } } });
    await alertOps('TX pre-sale cut-off refund FAILED', `order=${id}\n${e?.message}`, { force: true });
    return { status: KIT_STATUS.NEEDS_REVIEW, reason: 'refund_failed' };
  }
  await update({ dispute_status: PRESALE_STATUS.REFUNDED_NO_DATA, payment_status: 'refunded', kit_order: { ...k, cutoff: { at: now.toISOString(), refundId: r?.id || null } } });

  let attachments = null;
  if (k.form50132) {
    try {
      const pdf = await fill({ form50132: { ...k.form50132, taxYear: k.taxYear, opinionOfValue: null }, hasGrid: false, noticeOnly: true });
      attachments = [{ filename: `Form-50-132-${k.taxYear}.pdf`, content: Buffer.from(pdf) }];
    } catch (e) {
      await alertOps('TX pre-sale cut-off: form not filled', `order=${id}\n${e?.message}`, { force: true });
    }
  }
  try { await sendEmail({ to: row.customer_email, ...txCutoffEmail(row, { attached: !!attachments, appealAddress }), ...(attachments ? { attachments } : {}) }); } catch (e) {
    await alertOps('TX pre-sale cut-off email failed', `order=${id}\n${e?.message}`, { force: true });
  }
  return { status: PRESALE_STATUS.REFUNDED_NO_DATA, attached: !!attachments };
}

export function txCutoffEmail(row, { attached = false, appealAddress = null } = {}) {
  const first = String(row.customer_name || '').split(' ')[0] || 'there';
  const k = row.kit_order || {};
  const year = k.taxYear;
  let deadline = 'the deadline printed on your notice';
  try { deadline = deadlineShort(Number(year)); } catch { /* unsupported year: keep the generic words */ }
  const a = appealAddress;
  const addr = a && [a.addressee, a.attnLine, a.line1, a.line2, [a.city, a.stateAbbr, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return {
    subject: 'Your refund, and your protest form so you can still file on time',
    text: [
      `Hi ${first},`,
      '',
      `Your appraisal district has not yet published the ${year} data we build protest kits from, and it is now too close to the deadline to wait for it. So we are not sending you a kit, and we have refunded your payment in full. It usually shows on your statement within 5 to 10 business days.`,
      '',
      attached
        ? `You can still protest. Attached is the Comptroller's Form 50-132 for ${k.property?.address || 'your home'}, filled in with your name, address and account number. Box 1 in Section 3 is ticked, which covers both an incorrect market value and unequal appraisal, and it asks for an informal conference. Add the value you believe is right in Section 4 if you wish, sign and date it, and mail it to the appraisal district.`
        : `You can still protest. Download the Comptroller's Form 50-132 from comptroller.texas.gov, fill in your name, address and account number for ${k.property?.address || 'your home'}, tick box 1 in Section 3, sign it, and mail it to the appraisal district.`,
      '',
      `It must be postmarked by ${deadline}, or within 30 days of the date your notice was delivered if that is later.${addr ? ` Mail it to: ${addr}.` : ' The district\'s mailing address is printed on your notice.'}`,
      '',
      'The form on its own preserves your protest. You can bring your evidence to the informal conference the district will offer you.',
      '',
      'Questions: customerservice@taxappealusa.com',
    ].join('\n'),
  };
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

