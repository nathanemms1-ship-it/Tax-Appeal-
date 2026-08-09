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
 *   1. FLORIDA. send-letter.js refuses to mail to a county whose VAB address is
 *      not `confidence: 'confirmed'` in lib/flVabAddresses.js. Eight counties are
 *      still unconfirmed. "All 67" was a promise the code would decline to keep.
 *
 *   2. ARKANSAS AND ALABAMA. pages/apply.js marks both `servingFrom: 2027` and
 *      blocks them at the state selector. We were advertising, to the people doing
 *      our selling for us, two states we will not take an order in.
 *
 * ============================================================================
 * WHY IT IS DERIVED AND NOT WRITTEN DOWN
 * ============================================================================
 * The Florida number moves every week that Nathan works through the county call
 * sheet — a call gets made, a clerk confirms an address, `confidence` flips to
 * 'confirmed', and the number goes up by one. Any page that states that number as
 * prose is wrong again the next afternoon, and nobody remembers which pages they
 * were.
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
 * Everything a page needs to describe coverage truthfully. Plain JSON — safe to
 * hand straight to a component through getStaticProps.
 */
export function getServiceCoverage() {
  const flSupported = FL_COUNTY_NAMES.filter(isFlCountySupported).length;
  const flPending = getUnconfirmedFlCounties();

  return {
    florida: {
      supported: flSupported,
      total: COUNTY_TOTALS.FL,
      pending: flPending.length,
      // Named so a support answer can be specific instead of apologetic.
      pendingCounties: flPending,
      complete: flSupported >= COUNTY_TOTALS.FL,
    },
    texas: { supported: COUNTY_TOTALS.TX, total: COUNTY_TOTALS.TX },
    georgia: { supported: COUNTY_TOTALS.GA, total: COUNTY_TOTALS.GA },
    servingStates: SERVING_STATES.map(c => STATE_NAMES[c]),
    notYetServing: Object.entries(NOT_YET_SERVING).map(([c, year]) => ({ state: STATE_NAMES[c], year })),
  };
}

/**
 * The coverage sentence itself, built from the counts.
 *
 * Florida is phrased as "N of 67" while confirmation is in progress, and collapses
 * to "all 67" on its own the moment the last county lands — so the honest version
 * and the eventual version are the same string with no edit in between.
 */
export function coverageSentence(coverage = getServiceCoverage()) {
  const fl = coverage.florida.complete
    ? `all ${coverage.florida.total} Florida counties`
    : `${coverage.florida.supported} of Florida's ${coverage.florida.total} counties`;

  // Only claim work-in-progress while there is work in progress.
  const caveat = coverage.florida.complete
    ? ''
    : ` We are confirming the remaining ${coverage.florida.pending} Florida filing addresses by phone, and we will not mail to a county address we have not verified — if your client's county is not covered yet, they are told before they pay, not after.`;

  const soon = coverage.notYetServing.length
    ? ` ${coverage.notYetServing.map(s => s.state).join(' and ')} open for the ${coverage.notYetServing[0].year} season.`
    : '';

  return (
    `We file in all ${coverage.texas.total} Texas counties, all ${coverage.georgia.total} Georgia counties, and ${fl}.` +
    `${caveat}${soon}`
  );
}

export default getServiceCoverage;
