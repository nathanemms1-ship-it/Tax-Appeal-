/**
 * lib/kit/outcome.js — "What did the county decide?" 17 Oct 2026.
 *
 * The guarantee on every page says: if the county doesn't lower your value,
 * next year's kit is free. Under the kit model the county writes to the
 * CUSTOMER, not to us, so unless we ask we never learn the outcome and cannot
 * keep that promise. Two ways in, one record:
 *
 *   /outcome (private link in our emails)   the customer picks an answer
 *   pages/api/webhooks/inbound-email.js     a forwarded decision letter
 *
 * Both write orders.outcome / outcome_reported_at, and for a decision
 * dispute_status + decision_date, the columns the portal and admin already read.
 * The guarantee is RECORDED here (kit_order.after.guarantee), never decided by a
 * model: "not lowered" from the customer or a denied letter makes next year's
 * kit free for that property. Redeeming it is next season's checkout.
 *
 * The ask (daily cron): first some weeks after the deadline, when decisions
 * usually exist, then every 30 days while the answer is "still waiting", at
 * most four times.
 */
import crypto from 'crypto';
import { daysToDeadline } from './delivery';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.taxappealusa.com';
const DAY = 86400000;

/** What the customer can answer. `decision` is what dispute_status becomes. */
export const OUTCOMES = Object.freeze({
  lowered: { outcome: 'approved', decision: 'approved', label: 'They lowered it to what I asked for, or close to it' },
  partial: { outcome: 'partial', decision: 'partial', label: 'They lowered it, but by less than I asked' },
  not_lowered: { outcome: 'denied', decision: 'denied', label: 'They did not lower it' },
  waiting: { outcome: 'pending', decision: null, label: 'I have not heard yet, or my hearing has not happened' },
  not_sent: { outcome: 'not_sent', decision: null, label: 'I did not send it in the end' },
});

/** Days after the deadline before the first ask: when most boards have decided. */
export const FIRST_ASK_DAYS = Object.freeze({ GA: 75, TX: 60, FL: 120, default: 75 });
export const ASK_EVERY_DAYS = 30;
export const MAX_ASKS = 4;
/** Statuses that can still be asked: the kit is with them, or they told us it is sent. */
export const ASKABLE = Object.freeze(['kit_mailed', 'kit_emailed', 'kit_sent']);

export function outcomeToken(orderId, secret = process.env.INTERNAL_API_SECRET || '') {
  if (!secret || !orderId) return null;
  return crypto.createHmac('sha256', secret).update(`kit-outcome:${orderId}`).digest('hex').slice(0, 40);
}
export function outcomeUrl(orderId, secret) {
  const t = outcomeToken(orderId, secret);
  return t ? `${BASE_URL}/outcome?o=${encodeURIComponent(orderId)}&t=${t}` : null;
}
export function checkOutcomeToken(orderId, token, secret = process.env.INTERNAL_API_SECRET || '') {
  const want = outcomeToken(orderId, secret);
  if (!want || typeof token !== 'string' || token.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(token));
}

/** Should we ask this row today? Pure: verify-outcome runs it. */
export function askDue(row, now = new Date()) {
  if (!row || row.payment_status !== 'paid' || !ASKABLE.includes(row.dispute_status)) return false;
  const a = row.kit_order?.after;
  if (!a?.deadline) return false;
  const o = a.outcome;
  if (o && o.answer !== 'waiting') return false;
  const asks = Array.isArray(a.outcomeAsks) ? a.outcomeAsks : [];
  if (asks.length >= MAX_ASKS) return false;
  const since = -daysToDeadline(new Date(`${a.deadline}T00:00:00Z`), now);
  const first = FIRST_ASK_DAYS[String(row.state_code || '').toUpperCase()] || FIRST_ASK_DAYS.default;
  if (since < first) return false;
  const last = Math.max(asks.length ? new Date(asks[asks.length - 1]).getTime() : 0, o?.at ? new Date(o.at).getTime() : 0);
  return !last || now.getTime() - last >= ASK_EVERY_DAYS * DAY;
}

/**
 * Next year's free kit, CLAIMED when the value was not lowered. Not granted:
 * it must be proved with the county's decision letter (lib/kit/guarantee.js,
 * Nathan 17 Oct). A customer's answer waits for the upload (needs_proof); a
 * forwarded letter goes to a person (needs_review), because the forwarded-email
 * reader cannot tell a denial from a no-show dismissal.
 */
export function guaranteeFor(answer, row, source = 'customer') {
  if (answer !== 'not_lowered') return null;
  const year = Number(row?.kit_order?.taxYear);
  return {
    status: source === 'letter' ? 'needs_review' : 'needs_proof',
    reason: source === 'letter' ? 'forwarded_letter' : 'awaiting_letter',
    freeKitYear: Number.isFinite(year) ? year + 1 : null, property: row?.kit_order?.property?.address || null, parcelId: row?.kit_order?.property?.parcelId || null,
  };
}

/**
 * The orders patch for an answer. `row` is the current row; `extra` carries the
 * new value the customer may give and where the answer came from.
 */
export function outcomePatch(row, answer, { newValue = null, source = 'customer', now = new Date() } = {}) {
  const spec = OUTCOMES[answer];
  if (!spec) return null;
  const k = row.kit_order || {};
  const v = Number(String(newValue ?? '').replace(/[^0-9.]/g, ''));
  const after = {
    ...(k.after || {}),
    outcome: { answer, source, at: now.toISOString(), newValue: Number.isFinite(v) && v > 0 ? Math.round(v) : null },
  };
  // Never touches a guarantee already decided (verified, rejected, redeemed).
  const g = k.after?.guarantee ? null : guaranteeFor(answer, row, source);
  if (g) after.guarantee = { ...g, recordedAt: now.toISOString() };
  const patch = { outcome: spec.outcome, outcome_reported_at: now.toISOString(), kit_order: { ...k, after } };
  if (spec.decision) { patch.dispute_status = spec.decision; patch.decision_date = now.toISOString(); }
  return patch;
}

const DOC = { GA: 'appeal', TX: 'protest', FL: 'petition' };
const BODY = { GA: 'the county', TX: 'the appraisal district', FL: 'the Value Adjustment Board' };

export function askEmail(row, link) {
  const first = String(row.customer_name || '').split(' ')[0] || 'there';
  const st = String(row.state_code || '').toUpperCase();
  const doc = DOC[st] || 'appeal';
  const asks = row.kit_order?.after?.outcomeAsks || [];
  return {
    subject: asks.length ? `Any news on your ${doc}?` : `What did ${BODY[st] || 'the county'} decide?`,
    text: [
      `Hi ${first},`,
      '',
      `Has ${BODY[st] || 'the county'} decided your ${doc} for ${row.kit_order?.property?.address || 'your home'}? It takes ten seconds to tell us:`,
      '',
      link,
      '',
      'If they did not lower your value, next year\'s kit is free: tell us here and upload their decision letter (a phone photo is fine).',
      'If a letter came, you can also email a photo of it to customerservice@taxappealusa.com and we will read it for you.',
      '',
      'Questions: customerservice@taxappealusa.com',
    ].join('\n'),
  };
}

/** After "not lowered": what we need to confirm the free kit. */
export function guaranteeEmail(row, link = null) {
  const first = String(row.customer_name || '').split(' ')[0] || 'there';
  const year = Number(row.kit_order?.taxYear) + 1;
  return {
    subject: `One step to confirm your free ${Number.isFinite(year) ? year : 'next'} kit`,
    text: [
      `Hi ${first},`,
      '',
      'Thank you for telling us. We are sorry the value was not lowered this time.',
      '',
      `To confirm your free ${Number.isFinite(year) ? year : 'next'} kit for ${row.kit_order?.property?.address || 'this property'}, upload the decision letter ${BODY[String(row.state_code).toUpperCase()] || 'the county'} sent you (a phone photo is fine):`,
      '',
      link || 'Reply to this email with a photo of the letter.',
      '',
      'Once we have checked it we email you a one-time code. The free kit applies to a decision that kept the value the same or raised it; it does not apply when an appeal was dismissed or withdrawn, or when the value was lowered by any amount.',
      '',
      'Questions: customerservice@taxappealusa.com',
    ].join('\n'),
  };
}
