/**
 * lib/kit/afterMailing.js — what happens once the kit has left us. 17 Oct 2026.
 *
 * Until now nothing did. The kit's own checklist told every customer "Tell us
 * it is mailed at taxappealusa.com/mailed", and that page did not exist. We
 * also never reminded anyone that a signed kit on the kitchen table files
 * nothing: the deadline is theirs, and missing it costs them the year.
 *
 *   on dispatch      kit_order.after = { deadline, mode, mailedAt, expectedDelivery }
 *   Lob webhook      arrivedAt  (processed_for_delivery / delivered)
 *                    returnedAt (returned_to_sender: ops paged, customer told)
 *   daily cron       at most three reminders, never after the deadline, and
 *                    none once the customer says it is sent:
 *                      arrived  "your kit should be with you: sign it and send it"
 *                      week     about a week out (Florida: more, receipt counts)
 *                      final    the last safe days
 *   /mailed          the customer's private link marks it sent: status kit_sent
 *
 * Every reminder carries the private "I've sent it" link (sentUrl), an HMAC of
 * the order id under INTERNAL_API_SECRET, like the pre-sale notice link.
 */
import crypto from 'crypto';
import { daysToDeadline } from './delivery';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.taxappealusa.com';
const DAY = 86400000;

export const AFTER_STATUS = Object.freeze({ SENT: 'kit_sent' });
/** Statuses whose kit is with the customer and not yet sent by them. */
export const OUT_WITH_CUSTOMER = Object.freeze(['kit_mailed', 'kit_emailed']);

// ── The private link ─────────────────────────────────────────────────────────
export function sentToken(orderId, secret = process.env.INTERNAL_API_SECRET || '') {
  if (!secret || !orderId) return null;
  return crypto.createHmac('sha256', secret).update(`kit-sent:${orderId}`).digest('hex').slice(0, 40);
}
export function sentUrl(orderId, secret) {
  const t = sentToken(orderId, secret);
  return t ? `${BASE_URL}/mailed?o=${encodeURIComponent(orderId)}&t=${t}` : null;
}
export function checkSentToken(orderId, token, secret = process.env.INTERNAL_API_SECRET || '') {
  const want = sentToken(orderId, secret);
  if (!want || typeof token !== 'string' || token.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(token));
}

// ── The schedule ─────────────────────────────────────────────────────────────
/**
 * Days before the deadline for each reminder. Florida counts RECEIPT, so its
 * customer needs mail time inside the window: earlier, and the last one is a
 * hand-delivery nudge. Georgia and Texas count the postmark: the last one can
 * be the day before.
 */
export const REMINDER_DAYS = Object.freeze({
  FL: Object.freeze({ week: 9, final: 4, last: 1 }),
  default: Object.freeze({ week: 6, final: 2, last: 0 }),
});
const daysFor = (state) => REMINDER_DAYS[String(state || '').toUpperCase()] || REMINDER_DAYS.default;
/** With no Lob arrival event, assume the kit is with them this long after mailing. */
export const ASSUME_ARRIVED_DAYS = 7;

/** The `after` record dispatchKit writes when the kit goes out. */
export function afterRecord({ deadline, mode, now = new Date(), expectedDelivery = null }) {
  const iso = deadline instanceof Date && !Number.isNaN(deadline.getTime()) ? deadline.toISOString().slice(0, 10) : null;
  return { deadline: iso, mode, sentOutAt: now.toISOString(), expectedDelivery: expectedDelivery || null, reminders: {} };
}

/**
 * Which reminder, if any, to send this row today. Pure: verify-after-mailing runs it.
 * @returns {'arrived'|'week'|'final'|null}
 */
export function reminderDue(row, now = new Date()) {
  if (!row || row.payment_status !== 'paid' || !OUT_WITH_CUSTOMER.includes(row.dispute_status)) return null;
  const a = row.kit_order?.after;
  if (!a || !a.deadline || a.sentAt) return null;
  const days = daysToDeadline(new Date(`${a.deadline}T00:00:00Z`), now);
  const d = daysFor(row.state_code);
  if (days === null || days < d.last) return null;
  const sent = a.reminders || {};
  if (days <= d.final) return sent.final ? null : 'final';
  if (days <= d.week) return sent.week || sent.final ? null : 'week';
  if (row.dispute_status !== 'kit_mailed' || sent.arrived) return null;
  const arrived = a.arrivedAt
    || (a.expectedDelivery && now.getTime() >= new Date(`${String(a.expectedDelivery).slice(0, 10)}T00:00:00Z`).getTime() + DAY)
    || (a.sentOutAt && now.getTime() >= new Date(a.sentOutAt).getTime() + ASSUME_ARRIVED_DAYS * DAY);
  return arrived ? 'arrived' : null;
}

// ── The words ────────────────────────────────────────────────────────────────
const WORDS = {
  GA: { doc: 'appeal', body: 'the county', sign: 'Sign and date the appeal form in ink' },
  TX: { doc: 'protest', body: 'the appraisal district', sign: 'Sign and date Section 8 of Form 50-132 in ink' },
  FL: { doc: 'petition', body: 'the Value Adjustment Board', sign: 'Sign and date Part 3 of the DR-486 in ink, and add the county filing-fee check' },
};
const w = (state) => WORDS[String(state || '').toUpperCase()] || WORDS.GA;
const longDay = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function deadlineSentence(state, iso) {
  if (String(state).toUpperCase() === 'FL') return `${w(state).body} must RECEIVE it by ${longDay(iso)}. Florida does not count postmarks.`;
  if (String(state).toUpperCase() === 'TX') return `It must be postmarked by ${longDay(iso)} (or 30 days after your notice was delivered, if that is later).`;
  return `It must be postmarked by ${longDay(iso)}.`;
}

/** The reminder email. `link` is the private "I've sent it" link. */
export function reminderEmail(row, stage, link, now = new Date()) {
  const first = String(row.customer_name || '').split(' ')[0] || 'there';
  const st = String(row.state_code || '').toUpperCase();
  const a = row.kit_order?.after || {};
  const words = w(st);
  const days = daysToDeadline(new Date(`${a.deadline}T00:00:00Z`), now);
  const addr = row.kit_order?.property?.address || 'your home';
  const how = st === 'FL'
    ? (stage === 'final'
      ? 'With only a few days left, hand-deliver it to the board\'s office (the address is on the kit) and ask for a date-stamped copy. Mail may not get there in time.'
      : 'Mail it as soon as you have signed it, or hand-deliver it to the board\'s office for a date-stamped copy.')
    : stage === 'final'
      ? 'Take it to a post office counter and ask for a postmark today: that date is what counts.'
      : 'Add a stamp and mail it, or have a post office counter postmark it.';
  const subject = stage === 'arrived'
    ? `Your ${words.doc} kit should be with you: sign it and send it`
    : stage === 'week'
      ? `${days} days left to send your ${words.doc}`
      : `Last days to send your ${words.doc}`;
  return {
    subject,
    text: [
      `Hi ${first},`,
      '',
      stage === 'arrived'
        ? `Your ${words.doc} kit for ${addr} should have reached you by now. Nothing is filed until you send it.`
        : `This is a reminder about your ${words.doc} for ${addr}. Nothing is filed until you send it.`,
      '',
      `  1. ${words.sign}.`,
      `  2. Put it, with the evidence pages, in the return envelope (or any envelope addressed to ${words.body}, as shown in the kit).`,
      `  3. ${how}`,
      '',
      deadlineSentence(st, a.deadline),
      '',
      'Already sent it? Tell us here, and we will stop reminding you:',
      link || 'https://www.taxappealusa.com/mailed',
      '',
      a.mode === 'pdf' || row.dispute_status === 'kit_emailed'
        ? 'Your kit is the PDF we emailed you: print it on plain paper.'
        : 'Can\'t find the printed kit? The PDF copy we emailed you is complete: print it and use any envelope.',
      '',
      `TaxAppeal USA prepares ${words.doc} documents. We do not file your ${words.doc} or represent you; you sign and send it.`,
      'Questions: customerservice@taxappealusa.com',
    ].join('\n'),
  };
}

/** Sent when USPS returns the printed kit to Lob. */
export function returnedEmail(row) {
  const first = String(row.customer_name || '').split(' ')[0] || 'there';
  const words = w(row.state_code);
  const a = row.kit_order?.after || {};
  return {
    subject: `The post office returned your printed ${words.doc} kit`,
    text: [
      `Hi ${first},`,
      '',
      `USPS could not deliver the printed ${words.doc} kit we mailed to you and has returned it. Please check the mailing address on your order.`,
      '',
      `You do not need the printed copy: the PDF we emailed you when we mailed it is the complete kit. Print it, ${words.sign.charAt(0).toLowerCase()}${words.sign.slice(1)}, and send it in any envelope addressed to ${words.body} as shown in the kit.`,
      a.deadline ? deadlineSentence(row.state_code, a.deadline) : null,
      '',
      'Can\'t find that email? Reply to this one and we will send the PDF again.',
      'Questions: customerservice@taxappealusa.com',
    ].filter((l) => l !== null).join('\n'),
  };
}

/** The email that answers "send me my link" from /mailed. */
export function linkEmail(row, link) {
  const first = String(row.customer_name || '').split(' ')[0] || 'there';
  const words = w(row.state_code);
  return {
    subject: `Your link to tell us your ${words.doc} is sent`,
    text: [
      `Hi ${first},`,
      '',
      `Once you have sent your ${words.doc} for ${row.kit_order?.property?.address || 'your home'}, open this link and tap the button. It is private to your order:`,
      '',
      link,
      '',
      'Questions: customerservice@taxappealusa.com',
    ].join('\n'),
  };
}
