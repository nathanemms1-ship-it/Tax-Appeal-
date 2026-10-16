/**
 * lib/kit/delivery.js — how a kit can reach the customer before their deadline.
 * (16 Oct 2026; Nathan, 14 Oct: "only a pdf option in the last few days so we
 * maximize sales"; price stays $89.)
 *
 *   >= MAIL_CUTOFF_DAYS before the deadline   'mail'    printed kit by Lob + PDF emailed
 *   >= LAST_SALE_DAYS                         'pdf'     PDF emailed at once; they print,
 *                                                       sign and mail it themselves
 *   closer than that                          'closed'  we do not sell (or, for a paid
 *                                                       pre-sale, a person decides)
 *
 * One rule, read by the quote (what to offer), checkout (what to sell, from the
 * STORED order) and dispatchKit (what to do at send time). A pre-sale finished
 * late therefore gets the PDF, never a mailing that lands after the deadline.
 *
 * Days are whole calendar days to the deadline date (postmark date), in UTC.
 * Ten days covers Lob's print-and-mail (3-5 business days) plus a weekend and
 * the customer's own trip to the mailbox.
 */
export const MAIL_CUTOFF_DAYS = 10;
export const LAST_SALE_DAYS = 2;
export const DELIVERY = Object.freeze({ MAIL: 'mail', PDF: 'pdf', CLOSED: 'closed' });

const DAY = 86400000;
const utcDay = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export function daysToDeadline(deadline, now = new Date()) {
  const d = deadline instanceof Date ? deadline : new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((utcDay(d) - utcDay(now)) / DAY);
}

/** No known deadline (a pre-sale before its notice or roll): mail. */
export function deliveryMode(deadline, now = new Date()) {
  if (!deadline) return DELIVERY.MAIL;
  const days = daysToDeadline(deadline, now);
  if (days === null) return DELIVERY.CLOSED;
  if (days >= MAIL_CUTOFF_DAYS) return DELIVERY.MAIL;
  if (days >= LAST_SALE_DAYS) return DELIVERY.PDF;
  return DELIVERY.CLOSED;
}
