/**
 * ONE PLACE FOR WHO WE ARE.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 * The business's postal address is a legal requirement in two directions and it
 * was in NEITHER of them:
 *
 *   1. CAN-SPAM (15 U.S.C. § 7704(a)(5)) requires a valid physical postal address
 *      in commercial email. The abandoned-funnel outreach is commercial mail. The
 *      three email footers in pages/api/email-templates.js carried a name, a domain
 *      and an email address — and no postal address at all.
 *
 *   2. pages/terms.js § 10 "Contact" had an empty line where an address belongs.
 *      People agree to a charge of up to $139 on that page, for a service that
 *      prepares a document they sign under a perjury attestation, and could not
 *      see a street address for whoever they were contracting with.
 *
 * Defining it in three hand-copied places is how one of them ends up stale, so it
 * is defined here once and imported.
 *
 * ============================================================================
 * WHAT IS DELIBERATELY NOT IN THIS FILE YET — READ BEFORE ADDING IT
 * ============================================================================
 * THE LEGAL ENTITY NAME IS ABSENT ON PURPOSE. As of 9 Aug 2026 the registered
 * entity is still `TX Vape Vendor LLC` — a shell registered for a business that
 * never launched. A Form 424 Certificate of Amendment renaming it to
 * `Tax Appeal USA LLC` was filed that day (SOS file 806147096, document
 * 1615886150004) and is awaiting review.
 *
 * Do not add LEGAL_ENTITY until the file-stamped certificate is in hand. Naming an
 * entity in a live contract before the state has approved it is a false statement
 * if the amendment is rejected; naming the vape entity is the exact thing the
 * rename exists to remove. When the certificate lands, add it here and reference it
 * from terms.js § 1 and the email footers — one edit, one place.
 */

export const BUSINESS_NAME = 'TaxAppeal USA';

/** Street address, broken up for stacked display in a footer. */
export const BUSINESS_ADDRESS_LINES = [
  '3130 Sabine St, Ste B',
  'Forest Hill, TX 76119',
];

/** Same address on one line, for plain-text email and single-line contexts. */
export const BUSINESS_ADDRESS = BUSINESS_ADDRESS_LINES.join(', ');

export const SUPPORT_EMAIL = 'customerservice@taxappealusa.com';

export default { BUSINESS_NAME, BUSINESS_ADDRESS, BUSINESS_ADDRESS_LINES, SUPPORT_EMAIL };
