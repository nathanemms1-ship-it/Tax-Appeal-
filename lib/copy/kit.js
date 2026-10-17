/**
 * lib/copy/kit.js — what the public site says the product is. ONE source.
 * (Site overhaul, 16 Oct 2026. Nathan, 14 Oct: "We also have to change our
 * entire website, county pages, SEO, pricing." Florida included, Nathan 16 Oct.)
 *
 * THE PRODUCT (Kit model, decided 10 Oct 2026):
 *   - We check whether an appeal will actually lower the tax bill, after caps
 *     and exemptions, BEFORE the customer pays. If it won't, we say so and do
 *     not sell one.
 *   - For $89 we mail the CUSTOMER a ready-to-sign kit: the official county or
 *     state form filled in, the evidence, a checklist, and a return envelope
 *     addressed to the county (appraisal district in Texas, Value Adjustment
 *     Board in Florida). The same kit is emailed as a PDF the same day.
 *   - The customer signs it in ink, adds a stamp and mails it. We never file,
 *     represent the customer, appear at a hearing or contact the county.
 *   - In the last days before a deadline the kit is emailed as a PDF only.
 *   - Reservations open before notices go out (Georgia and Texas from 31 Jan).
 *   - Guarantee: a full refund if our check stops the order before anything is
 *     mailed; next year's kit free if the county doesn't lower the value.
 *   - Florida: the county's filing fee is paid by the customer to the county
 *     (a cheque in the kit), not part of the $89.
 *
 * NEVER SAY (scripts/verify-site-copy.mjs fails the build): that we file,
 * submit or mail anything to the county; certified mail; "on your behalf";
 * that we pay the county fee; that we represent anyone or attend hearings;
 * "done for you"; "the only company". Never promise an outcome.
 */
import { SERVICE_PRICE_DOLLARS } from '../pricing';

export const PRICE = SERVICE_PRICE_DOLLARS;

/** Per-state vocabulary. A Texas "protest" goes to an appraisal district; a Florida "petition" to the VAB. */
export const STATE_WORDS = Object.freeze({
  GA: { doc: 'appeal', Doc: 'Appeal', form: 'the appeal form your county accepts (PT-311A or the county\'s own)', body: 'county board of assessors', Body: 'County Board of Assessors', deadline: '45 days from the date on your assessment notice', fee: null },
  TX: { doc: 'protest', Doc: 'Protest', form: 'the Comptroller\'s Form 50-132', body: 'appraisal district', Body: 'Appraisal District', deadline: 'May 15, or 30 days after your notice was delivered if that is later', fee: null },
  FL: { doc: 'petition', Doc: 'Petition', form: 'Form DR-486', body: 'Value Adjustment Board', Body: 'Value Adjustment Board', deadline: '25 days after your TRIM notice was mailed — and Florida counts it when it is RECEIVED, not postmarked', fee: 'Your county\'s filing fee ($15 to $50 depending on the county) is paid by you, to the county, with a cheque you put in the envelope. It is not part of our fee.' },
  AR: { doc: 'appeal', Doc: 'Appeal', form: 'your county\'s equalization board appeal form', body: 'county equalization board', Body: 'County Equalization Board', deadline: 'the deadline printed on your assessment notice', fee: null },
  AL: { doc: 'appeal', Doc: 'Appeal', form: 'your county\'s board of equalization appeal', body: 'county board of equalization', Body: 'County Board of Equalization', deadline: 'the deadline printed on your assessment notice', fee: null },
});
export const words = (state) => STATE_WORDS[String(state || '').toUpperCase()] || STATE_WORDS.GA;

/** The cornerstone, word for word. */
export const PROMISE = 'We check whether an appeal will actually lower your tax bill, after caps and exemptions, before you pay. If it won\'t, we\'ll tell you, and we won\'t sell you one.';

/** One line for meta descriptions and cards. */
export function oneLiner(state) {
  const w = words(state);
  return `We check whether a ${w.doc} will lower your tax bill before you pay. If it will, we mail you a ready-to-sign ${w.doc} kit for $${PRICE}: you sign it and mail it.`;
}

/** What's in the kit. */
export function kitContents(state) {
  const w = words(state);
  return [
    `${w.form.charAt(0).toUpperCase()}${w.form.slice(1)}, filled in for your home`,
    'Your evidence: the comparison that supports a lower value, ready to send',
    `A return envelope addressed to the ${w.body}`,
    'A one-page checklist: where to sign, what to send, the postmark deadline',
    'The same kit as a PDF, emailed to you the day you order',
  ];
}

/** How it works, three steps. */
export function howItWorks(state) {
  const w = words(state);
  return [
    { title: 'We check first', body: `We compare your value with similar homes and run your bill through your county's caps and exemptions. If a ${w.doc} won't lower your bill by more than our $${PRICE} fee, we tell you and don't sell you one.` },
    { title: 'We mail you the kit', body: `Your ${w.doc}, completed on the official form with your evidence and a return envelope addressed to the ${w.body}. The PDF is emailed the same day.` },
    { title: 'You sign it and mail it', body: `Sign in ink, add a stamp, and mail it before the deadline (${w.deadline}). The ${w.body} writes to you directly.` },
  ];
}

export const GUARANTEE = [
  'If our check stops your order before anything is mailed, you get a full refund.',
  'If the county doesn\'t lower your value, next year\'s kit is free.',
];

/** What we are not. Stated plainly wherever the product is described. */
export function notALawyer(state) {
  const w = words(state);
  return `TaxAppeal USA prepares ${w.doc} documents. We do not file your ${w.doc}, represent you, or appear at any hearing: you sign it and mail it yourself, and you are the ${state === 'TX' ? 'property owner of record on the protest' : state === 'FL' ? 'petitioner' : 'appellant'}.`;
}

export const LAST_DAYS = 'In the last days before a deadline there isn\'t time to mail a printed kit, so we email it to you as a PDF to print, sign and mail.';
export const PRESALE = 'Before notices go out you can reserve your kit: we check again when your values are published, and refund you in full if the case is gone.';
