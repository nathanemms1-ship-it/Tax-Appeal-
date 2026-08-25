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

import { FL_COUNTY_NAMES, isFlCountySupported } from './flVabAddresses.js';
/**
 * THE FEE IS THE SECOND GATE AND THIS FILE USED TO IGNORE IT.
 *
 * send-letter.js refuses on TWO independent conditions, not one: no confirmed VAB
 * mailing address (8 counties), AND a fee whose confidence is not 'confirmed'
 * (Nassau, Columbia and Levy, which have a good address and a $50 guess). This
 * module counted only `isFlCountySupported`, which tests the address half — so it
 * reported 59 while the funnel would actually accept 56, and /partners would have
 * recruited referrals in three counties the checkout refuses.
 *
 * Counting both is the whole job of this file. Import the fee table.
 */
import { getFlVabFee } from './flCountyFees.js';
import { SERVING_FROM } from './stateService.js';

/**
 * The single definition of "we can file here", matching pages/api/send-letter.js
 * :148-169 and applyResolvedCounty in pages/apply.js. If these three ever disagree,
 * one of them is either turning away business or selling something we cannot do.
 */
export function canFileInFlCounty(county) {
  return isFlCountySupported(county) && getFlVabFee(county)?.confidence === 'confirmed';
}

/**
 * County totals per state. These are facts about the United States, not about us —
 * they change roughly never, and there is no table in this repo that knows them.
 */
export const COUNTY_TOTALS = { TX: 254, FL: 67, GA: 159, AR: 75, AL: 67 };

/**
 * States we will actually accept an order in today.
 *
 * NOT_YET_SERVING IS NO LONGER A COPY — IT IS THE MAP ITSELF.
 *
 * This used to read `{ AR: 2027, AL: 2027 }`: a hand-written duplicate of a
 * literal in pages/apply.js, reconciled by a regex in
 * scripts/verify-referrals.mjs that scraped apply.js's source. That check was
 * doing real work — it is how a drift between the two would have been caught —
 * but reconciling two copies is not the same as having one, and by 25 Aug 2026
 * there were four: here, in apply.js, in pages/api/join-waitlist.js, and
 * nowhere at all in the eleven Arkansas and Alabama marketing pages, which
 * advertised a $89 service in both states for a season the funnel refused.
 *
 * lib/stateService.js is now the one place, and this is an alias to it. The
 * alias keeps every existing importer working; that it cannot disagree is the
 * point.
 *
 * SERVING_STATES stays written out because it answers a different question —
 * which states we have built for at all — and changes when a state is added,
 * not when a season opens.
 */
export const SERVING_STATES = ['TX', 'FL', 'GA'];
export const NOT_YET_SERVING = SERVING_FROM;

const STATE_NAMES = { TX: 'Texas', FL: 'Florida', GA: 'Georgia', AR: 'Arkansas', AL: 'Alabama' };

/**
 * ============================================================================
 * WE NO LONGER FILE BY HAND, SO "SERVED" NO LONGER MEANS 67
 * ============================================================================
 * This file has now been wrong in both directions. Worth recording, because the two
 * errors look like opposites and have the same cause.
 *
 * v1 returned `florida.supported = 59` and /partners rendered "59 of Florida's 67
 * counties". That UNDERSTATED us: the funnel did then accept orders in the other
 * eight and file them by hand, so we were telling partners not to refer clients we
 * would happily have filed for.
 *
 * v2 corrected it to served: 67 / automatic: 59 / handFiled: 8. Right for the
 * product as it stood — and it stopped being right on 11 Aug 2026, when hand-filing
 * was removed.
 *
 * WHY IT WENT: the hand-filing path never existed below the browser. The
 * `needsManualFiling` flag was set in React state and read by one component. It was
 * never in the checkout body, never in Stripe metadata, never a column, and there
 * was no ops queue for it to land in. An order in one of those eight counties queued
 * like any other, was refused hourly by send-letter.js, and nobody found out. The
 * refund promise this file used to describe was one nobody was positioned to keep.
 *
 * WHAT HAPPENS NOW: pages/apply.js `applyResolvedCounty` refuses the sale BEFORE
 * checkout and shows FloridaCountyUnavailable, which records the homeowner with
 * `blocked_reason = 'fl_county_unconfirmed'`. Nothing is charged.
 * cron/notify-waitlist.js re-tests the same two gates every day and writes to them
 * when their county confirms, or tells them plainly at season's end if it did not.
 *
 * SO THE NUMBER TO SAY IS 59, AND IT IS NOW THE HONEST ONE. The field names carry
 * the distinction, because that is the only thing that stops it collapsing again:
 *
 *   total      — counties in the state.                        (67)
 *   served     — counties we will take an order in TODAY.      (59)
 *   notYetOpen — refused at the funnel, email captured.         (8)
 *
 * `served` is deliberately the count that moves, because `served` is the word every
 * marketing surface reaches for. Anyone who writes "all 67 Florida counties" now
 * disagrees with the checkout gate, and scripts/verify-referrals.mjs fails the build
 * when those two disagree.
 */
export function getServiceCoverage() {
  // Both gates, not just the address one. See canFileInFlCounty above for the bug
  // that produced when only the address was counted.
  const served = FL_COUNTY_NAMES.filter(canFileInFlCounty).length;
  const notYetOpenCounties = FL_COUNTY_NAMES.filter(c => !canFileInFlCounty(c));

  return {
    florida: {
      total: COUNTY_TOTALS.FL,
      served,
      notYetOpen: notYetOpenCounties.length,
      // Named, so a support answer can be specific instead of apologetic.
      notYetOpenCounties,
      // True once every county in the state is open. Collapses the disclosure below
      // on its own, so there is no copy edit waiting to be forgotten.
      complete: served >= COUNTY_TOTALS.FL,
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
 * States the number we can actually file in, then says plainly what happens to a
 * client in one of the others — because a partner WILL be asked that, and "I don't
 * know" is how a referral dies. When the last county confirms, the second sentence
 * disappears on its own and the first is still correct, so there is no edit waiting
 * to be forgotten.
 */
export function coverageSentence(coverage = getServiceCoverage()) {
  const fl = coverage.florida;
  const flPhrase = fl.complete
    ? `all ${fl.total} Florida counties`
    : `${fl.served} of Florida's ${fl.total} counties`;

  const caveat = fl.complete
    ? ''
    : ` The other ${fl.notYetOpen} have not published the Value Adjustment Board mailing address or filing fee we need in order to file correctly, and we are confirming those by phone. We will not take an order we cannot file — so if your client is in one of them we tell them so, charge nothing, and email them the moment their county opens.`;

  const soon = coverage.notYetServing.length
    ? ` ${coverage.notYetServing.map(s => s.state).join(' and ')} open for the ${coverage.notYetServing[0].year} season.`
    : '';

  return (
    `We file in all ${coverage.texas.served} Texas counties, all ${coverage.georgia.served} Georgia counties, ` +
    `and ${flPhrase}.${caveat}${soon}`
  );
}

export default getServiceCoverage;
