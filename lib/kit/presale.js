/**
 * lib/kit/presale.js — finishing a pre-sale when the notice arrives (16 Oct 2026).
 *
 *   awaiting_notice  --notice entered-->  re-run the full check on the NOTICE value
 *        case, county still sellable  -> kit_order = the real order, kit_queued, dispatchKit
 *        no case                      -> full refund, refunded_no_case, email why
 *        case, county no longer sellable, or refund failed -> needs_review, ops paged
 *        a question to ask (Chatham, Fulton) -> back to awaiting_notice, ask it
 *
 * The guarantee this keeps: "a refund if our check stops the order before anything
 * is mailed". Nothing here decides whether to refund on a whim; the same quote that
 * would have refused the sale on the notice value decides it.
 *
 * One entry at a time: the row is claimed by moving awaiting_notice -> notice_checking
 * with a conditional update, so a double submit cannot refund twice or mail twice.
 *
 * Every side effect is injected so scripts/verify-ga-presale.mjs runs offline.
 */
import { quoteGaKit, noticeQuoteInput, QUOTE } from './gaQuote';
import { KIT_STATUS } from './dispatchKit';

export const PRESALE_STATUS = Object.freeze({
  CHECKING: 'notice_checking',
  REFUNDED: 'refunded_no_case',
  // Texas: the district's data was not out by the cut-off (lib/tx/inSeason.js).
  REFUNDED_NO_DATA: 'refunded_no_data',
});

const NO_CASE_WHY = {
  not_over_assessed: 'recent sales of similar homes no longer show your value is too high',
  bill_wont_drop_enough: 'after your caps and exemptions an appeal would lower your tax bill by less than our fee',
  too_few_comps: 'there are not enough recent sales of similar homes near you to build strong evidence',
  no_property_record: 'we could not find this home in the property records',
};

export function refundEmail(row, reason) {
  const first = String(row.customer_name || '').split(' ')[0] || 'there';
  return {
    subject: 'Your refund: an appeal would not lower your tax bill this year',
    text: [
      `Hi ${first},`,
      '',
      `We checked the value on your assessment notice for ${row.kit_order?.property?.address || 'your home'}. ${NO_CASE_WHY[reason] ? `This year ${NO_CASE_WHY[reason]}` : 'This year our check does not support an appeal'}, so we are not sending you a kit.`,
      '',
      `We have refunded your payment in full. It usually shows on your statement within 5 to 10 business days.`,
      '',
      'That is the promise we made when you reserved: we check before anything is mailed, and if an appeal will not lower your bill, you do not pay for one.',
      '',
      'Questions: customerservice@taxappealusa.com',
    ].join('\n'),
  };
}

/**
 * @param {object} row     orders row (id, state_code, payment_status, dispute_status, kit_order, customer_*, owner_*)
 * @param {object} notice  { noticeValue, noticeDate, parcelId?, ownedOnJan1?, fultonBilling100?, virtualHearing? }
 * @param {object} deps    { quoteDeps, claim, update, refund, dispatch, sendEmail, alertOps, now }
 *   claim(fromStatus, toStatus) -> Promise<boolean>   conditional status move
 *   update(patch) -> Promise<{ error }>
 *   refund(row) -> Promise<{ id }>                     throws on failure
 *   dispatch(row) -> Promise<{ status }>               lib/kit/dispatchKit
 */
export async function processGaNotice(row, notice, { quoteDeps, quote: runQuote = quoteGaKit, claim, update, refund, dispatch, sendEmail = async () => {}, alertOps = async () => {}, now = new Date() }) {
  const id = row?.id;
  if (!row || row.state_code !== 'GA' || row.kit_order?.presale !== true) return { status: row?.dispute_status || null, reason: 'not_a_presale' };
  if (row.payment_status !== 'paid') return { status: row.dispute_status, reason: 'not_paid' };
  if (row.dispute_status !== KIT_STATUS.AWAITING_NOTICE) return { status: row.dispute_status, reason: 'already_done' };

  if (!(await claim(KIT_STATUS.AWAITING_NOTICE, PRESALE_STATUS.CHECKING))) return { status: PRESALE_STATUS.CHECKING, reason: 'in_progress' };
  const release = () => update({ dispute_status: KIT_STATUS.AWAITING_NOTICE });

  let quote;
  try {
    quote = await runQuote(noticeQuoteInput(row.kit_order, notice), { ...quoteDeps, now });
  } catch (e) {
    await release();
    return { status: KIT_STATUS.AWAITING_NOTICE, reason: e?.capacity ? 'capacity' : 'upstream', retry: true };
  }

  const entered = { noticeValue: quote.noticeValue ?? null, noticeDate: notice.noticeDate || null, enteredAt: now.toISOString() };

  if (quote.decision === QUOTE.NEED_INFO) {
    await release();
    return { status: KIT_STATUS.AWAITING_NOTICE, needs: quote.reason };
  }

  if (quote.decision === QUOTE.NO_CASE) {
    try {
      const r = await refund(row);
      await update({
        dispute_status: PRESALE_STATUS.REFUNDED, payment_status: 'refunded',
        kit_order: { ...row.kit_order, notice: entered, noticeResult: { decision: 'no_case', reason: quote.reason, refundId: r?.id || null } },
      });
      const mail = refundEmail(row, quote.reason);
      try { await sendEmail({ to: row.customer_email, ...mail }); } catch (e) { /* refund stands; the page says it too */ }
      return { status: PRESALE_STATUS.REFUNDED, reason: quote.reason };
    } catch (e) {
      await update({ dispute_status: KIT_STATUS.NEEDS_REVIEW, kit_order: { ...row.kit_order, notice: entered, noticeResult: { decision: 'no_case', reason: quote.reason, refundError: String(e?.message || e) } } });
      await alertOps('Pre-sale refund FAILED', `order=${id} reason=${quote.reason}\n${e?.message}`, { force: true });
      return { status: KIT_STATUS.NEEDS_REVIEW, reason: 'refund_failed' };
    }
  }

  // A case. Sellable only if the county still is (address confirmed, form settled).
  if (!quote.sellable) {
    await update({ dispute_status: KIT_STATUS.NEEDS_REVIEW, kit_order: { ...row.kit_order, notice: entered, noticeResult: { decision: 'case', notSellable: quote.notSellableReason } } });
    await alertOps('Pre-sale case, county not sellable', `order=${id} reason=${quote.notSellableReason}`, { force: true });
    return { status: KIT_STATUS.NEEDS_REVIEW, reason: quote.notSellableReason };
  }

  const kitOrder = { ...quote.kitOrder, fromPresale: { prior: row.kit_order.prior, notice: entered } };
  const { error } = await update({ dispute_status: KIT_STATUS.QUEUED, kit_order: kitOrder });
  if (error) {
    await release();
    await alertOps('Pre-sale notice could not be saved', `order=${id}\n${error.message || error}`, { force: true });
    return { status: KIT_STATUS.AWAITING_NOTICE, reason: 'save_failed', retry: true };
  }
  const r = await dispatch({ ...row, dispute_status: KIT_STATUS.QUEUED, kit_order: kitOrder });
  return { status: r?.status || KIT_STATUS.QUEUED, yearlySaving: quote.savings?.yearlySaving ?? null };
}
