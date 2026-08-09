/**
 * WHAT WE ARE ALLOWED TO SAY WE COVER.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 * /partners told partners, in a FAQ answer they were expected to repeat to their
 * own clients:
 *
 *   "Yes — all 254 Texas counties, all 67 Florida counties, all 159 Georgia
 *    counties, all 75 Arkansas counties, and all 67 Alabama counties."
 *
 * Two things were wrong with that sentence, and both of them are the kind that
 * ends with a homeowner's petition not being filed:
 *
 *   1. FLORIDA. It gave no hint that eight counties are filed BY HAND rather than
 *      automatically — send-letter.js refuses to mail to a county whose VAB address
 *      is not `confidence: 'confirmed'`. The coverage claim was fine; the silence
 *      about how those eight are handled was not. See the long note above
 *      getServiceCoverage for the correction that followed.
 *
 *   2. ARKANSAS AND ALABAMA. pages/apply.js marks both `servingFrom: 2027` and
 *      blocks them at the state selector. We were advertising, to the people doing
 *      our selling for us, two states we will not take an order in.
 *
 * ============================================================================
 * WHY IT IS DERIVED AND NOT WRITTEN DOWN
 * ============================================================================
 * The Florida numbers move every week that Nathan works through the county call
 * sheet — a call gets made, a clerk confirms an address, `confidence` flips to
 * 'confirmed', and one county moves from hand-filed to automatic. Any page that
 * states those numbers as prose is wrong again the next afternoon, and nobody
 * remembers which pages they were.
 *
 * So it is counted from lib/flVabAddresses.js at build time. Confirm a county,
 * deploy, and every surface importing this file is correct with no copy edit and
 * nothing to remember.
 *
 * ============================================================================
 * SERVER-SIDE ONLY — DO NOT IMPORT THIS INTO A COMPONENT BODY
 * ============================================================================
 * This pulls in the whole 67-entry Florida address table. Importing it into
 * client-rendered code ships every VAB street address, phone note and source URL
 * into the browser bundle to display one integer.
 *
 * Call it from getStaticProps (see pages/partners.js) and pass down the numbers.
 */

import { FL_COUNTY_NAMES, isFlCountySupported, getUnconfirmedFlCounties } from './flVabAddresses.js';

/**
 * County totals per state. These are facts about the United States, not about us —
 * they change roughly never, and there is no table in this repo that knows them.
 */
export const COUNTY_TOTALS = { TX: 254, FL: 67, GA: 159, AR: 75, AL: 67 };

/**
 * States we will actually accept an order in today.
 *
 * MUST agree with `servingFrom` in pages/apply.js, which is the gate that enforces
 * it. scripts/verify-referrals.mjs fails the build if the two ever disagree — a
 * marketing page that outruns the checkout gate is precisely the failure this file
 * was written to stop, so it is checked rather than trusted.
 */
export const SERVING_STATES = ['TX', 'FL', 'GA'];
export const NOT_YET_SERVING = { AR: 2027, AL: 2027 };

const STATE_NAMES = { TX: 'Texas', FL: 'Florida', GA: 'Georgia', AR: 'Arkansas', AL: 'Alabama' };

/**
 * ============================================================================
 * SERVED IS NOT THE SAME AS AUTOMATIC — AND CONFLATING THEM COST US REFERRALS
 * ============================================================================
 * The first version of this file returned `florida.supported = 59` and /partners
 * rendered "59 of Florida's 67 counties". That was WRONG, in the expensive
 * direction, and it contradicted every other page on the site.
 *
 * What the code actually does for an unconfirmed county (pages/apply.js,
 * `applyResolvedCounty`): the order is accepted, flagged `needsManualFiling`, the
 * customer is warned on the payment screen BEFORE being charged, and the order is
 * routed to the ops queue instead of the automated one. pages/terms.js § 3 and the
 * Florida FAQ both promise a full refund — including the county fee — if we cannot
 * file before the deadline.
 *
 * So we serve all 67. We AUTOMATE 59 of them. Telling a partner "59 of 67" tells
 * them not to refer clients in eight counties we would happily have filed for, and
 * leaves /partners disagreeing with /florida on the same website.
 *
 * The distinction is now in the field names, because that is the only thing that
 * stops it being collapsed again:
 *
 *   served     — every county we will take an order in.       (67)
 *   automatic  — mailed without a human touching it.          (59)
 *   handFiled  — prepared manually, disclosed before payment. (8)
 *
 * There is no `supported`. It was ambiguous, and the ambiguity is what produced the
 * wrong sentence.
 */
export function getServiceCoverage() {
  const automatic = FL_COUNTY_NAMES.filter(isFlCountySupported).length;
  const handFiledCounties = getUnconfirmedFlCounties();

  return {
    florida: {
      served: COUNTY_TOTALS.FL,
      automatic,
      handFiled: handFiledCounties.length,
      // Named, so a support answer can be specific instead of apologetic.
      handFiledCounties,
      // True once every county is automated — NOT a statement about coverage,
      // which is already complete.
      fullyAutomated: automatic >= COUNTY_TOTALS.FL,
    },
    texas: { served: COUNTY_TOTALS.TX },
    georgia: { served: COUNTY_TOTALS.GA },
    servingStates: SERVING_STATES.map(c => STATE_NAMES[c]),
    notYetServing: Object.entries(NOT_YET_SERVING).map(([c, year]) => ({ state: STATE_NAMES[c], year })),
  };
}

/**
 * The coverage sentence, built from the counts.
 *
 * Leads with the true headline — all 67 — and then discloses the hand-filed ones
 * rather than burying them. When the last county is confirmed the disclosure
 * disappears on its own and the sentence is still correct, so there is no edit
 * waiting to be forgotten.
 */
export function coverageSentence(coverage = getServiceCoverage()) {
  const caveat = coverage.florida.fullyAutomated
    ? ''
    : ` In ${coverage.florida.automatic} of those Florida counties we mail automatically. For the remaining ${coverage.florida.handFiled} we are still confirming the Value Adjustment Board address and fee by phone, so those petitions are prepared by hand — your client is told before they pay, and refunded in full including the county fee if we cannot file before their deadline.`;

  const soon = coverage.notYetServing.length
    ? ` ${coverage.notYetServing.map(s => s.state).join(' and ')} open for the ${coverage.notYetServing[0].year} season.`
    : '';

  return (
    `We file in all ${coverage.texas.served} Texas counties, all ${coverage.georgia.served} Georgia counties, ` +
    `and all ${coverage.florida.served} Florida counties.${caveat}${soon}`
  );
}

export default getServiceCoverage;
