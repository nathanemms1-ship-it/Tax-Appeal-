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
 * THE LEGAL ENTITY — ADDED 11 AUG 2026, CERTIFICATE IN HAND
 * ============================================================================
 * This block previously said "do not add LEGAL_ENTITY until the file-stamped
 * certificate is in hand," because until 9 Aug the registered entity was still
 * `TX Vape Vendor LLC` — a shell registered for a business that never launched.
 * Naming an entity in a live contract before the state approves the amendment is a
 * false statement if it is rejected; naming the vape entity is the thing the rename
 * existed to remove. So the contract named neither, which is its own problem: until
 * today /terms identified the counterparty only as "TaxAppeal USA", a brand, and a
 * brand cannot be a party to an agreement.
 *
 * The Texas Secretary of State issued the Certificate of Filing on 08/09/2026,
 * effective the same day. SOS file 806147096, document 1615886150004, signed
 * Robert S. Howden. `Tax Appeal USA LLC`, formerly `TX Vape Vendor LLC`.
 *
 * ============================================================================
 * BRAND AND LEGAL NAME ARE DIFFERENT STRINGS. DO NOT COLLAPSE THEM.
 * ============================================================================
 *   BUSINESS_NAME  'TaxAppeal USA'      — one word. The brand. Headers, emails.
 *   LEGAL_ENTITY   'Tax Appeal USA LLC' — two words + LLC. The certificate's exact
 *                                          spelling. Contracts, and anywhere a
 *                                          third party verifies us against the
 *                                          state record.
 *
 * Google advertiser verification, Stripe's legal-name field and the bank will each
 * compare what we give them against the certificate character for character.
 * "TaxAppeal USA LLC" is NOT the registered name and will fail those checks.
 */

export const BUSINESS_NAME = 'TaxAppeal USA';

/**
 * The registered entity, spelled exactly as the Texas Secretary of State has it.
 *
 * NOTE FOR WHOEVER UPDATES STRIPE AND THE BANK: the IRS still has the EIN under
 * the old name until the name-change letter is processed, so changing Stripe's
 * legal name first creates a TIN mismatch — which is what triggers verification
 * holds and 1099 filing failures. Order: IRS acknowledgement, then Stripe, then
 * the bank. Nothing on this site depends on that sequence; the constant below is
 * about who the customer is contracting with, which is already true today.
 */
export const LEGAL_ENTITY = 'Tax Appeal USA LLC';
export const LEGAL_ENTITY_STATE = 'Texas';
/** Texas SOS file number, for the record and for anyone verifying us. */
export const LEGAL_ENTITY_FILE_NUMBER = '806147096';

/** Street address, broken up for stacked display in a footer. */
export const BUSINESS_ADDRESS_LINES = [
  '3130 Sabine St, Ste B',
  'Forest Hill, TX 76119',
];

/** Same address on one line, for plain-text email and single-line contexts. */
export const BUSINESS_ADDRESS = BUSINESS_ADDRESS_LINES.join(', ');

export const SUPPORT_EMAIL = 'customerservice@taxappealusa.com';

export default { BUSINESS_NAME, LEGAL_ENTITY, LEGAL_ENTITY_STATE, LEGAL_ENTITY_FILE_NUMBER, BUSINESS_ADDRESS, BUSINESS_ADDRESS_LINES, SUPPORT_EMAIL };
