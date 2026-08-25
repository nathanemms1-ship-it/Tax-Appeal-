/**
 * WHICH STATES WE ARE ACTUALLY WILLING TO SELL IN, AND FROM WHEN.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 * On 25 Aug 2026 the fact "we do not take Arkansas or Alabama orders until the
 * 2027 season" was written down in three unrelated places, in three different
 * shapes, none of which could see the others:
 *
 *   pages/apply.js:56          SUPPORTED_STATES[sc].servingFrom = 2027
 *                              — the gate that actually refuses the order.
 *   pages/api/join-waitlist.js if (state === 'AR' || state === 'AL') filingYear++
 *                              — so the notify cron does not email them this year.
 *   lib/serviceCoverage.js     a prose comment explaining that /partners must not
 *                              advertise the two states.
 *
 * And in a fourth place it was not written down at all: the eleven marketing
 * pages and one dynamic template that SELL those two states. /alabama carried a
 * green "✅ Now Serving All 67 Alabama Counties" badge, a FAQ answer reading
 * "Yes. TaxAppeal USA files appeals in all 67 Alabama counties", six "$89"
 * buttons, sixty-seven clickable county tiles that were all buy buttons, and a
 * schema.org Offer at price 89.00 that Google reads as a live commercial offer.
 *
 * Every one of those buttons led to a state selector that rejects the state on
 * sight — but only AFTER the homeowner had created an account with a password
 * and typed their full property address. Two forms, then the truth.
 *
 * That is not a copy problem. It is the same failure this codebase keeps
 * producing: a fact the code knows, restated by hand somewhere the code cannot
 * check. lib/serviceCoverage.js was written to end it for /partners and did.
 * This file does the same job for the state pages, and apply.js and
 * join-waitlist.js now read from here rather than carrying their own copy, so
 * the gate, the waitlist year and the marketing can no longer disagree.
 *
 * ============================================================================
 * TO OPEN A STATE
 * ============================================================================
 * Delete its line from SERVING_FROM. That is the whole change: the funnel stops
 * refusing it, the waitlist stops post-dating it, and every page selling it
 * turns its CTA back on. Do NOT delete the line before that state has a
 * verified filing-address table AND a send-letter.js gate that refuses an
 * unconfirmed one — that is the condition the entry is standing in for. See the
 * note in pages/apply.js above SUPPORTED_STATES.
 *
 * ============================================================================
 * CLIENT-SAFE ON PURPOSE
 * ============================================================================
 * This module imports nothing. lib/serviceCoverage.js cannot be used here
 * because it pulls in the 67-entry Florida address table, and lib/filingWindows
 * carries FL_COUNTY_DATES. Marketing pages render this in the browser, so the
 * only thing it is allowed to cost is the object below.
 */

/**
 * state code -> the first filing season we will accept an order for.
 * A state absent from this map is one we sell in now (subject to its filing
 * window, which is a separate question — see lib/filingWindows.js).
 */
export const SERVING_FROM = {
  AR: 2027,
  AL: 2027,
};

export const STATE_NAMES = {
  TX: 'Texas',
  GA: 'Georgia',
  FL: 'Florida',
  AR: 'Arkansas',
  AL: 'Alabama',
};

/**
 * The state's filing deadline stated as the RULE, not as a date.
 *
 * These pages used to print "August 17, 2026" as an upcoming deadline. On 25
 * August that date was eight days gone, so five Arkansas pages and one template
 * covering twenty more were urging homeowners to beat a deadline that had
 * already passed. A rule cannot go stale: the third Monday in August is the
 * deadline in 2026, in 2027 and in every year after.
 *
 * THE CONCRETE DATE DELIBERATELY IS NOT HERE. It is 17 Aug in 2026 and 16 Aug
 * in 2027, and lib/filingWindows.js owns filing dates. A second copy in a
 * marketing module is exactly how Florida ended up with one county's deadline
 * standing in for the whole state for a fortnight. If a page needs the day, it
 * asks filingWindows.
 *
 * Each string is written to drop into a sentence after "due"/"by"/"at", which is
 * why it carries its own leading article where the phrasing needs one.
 */
export const STATE_DEADLINE_RULE = {
  TX: 'May 15, or 30 days after your appraisal notice — whichever is later',
  GA: '45 days from the date on your assessment notice',
  FL: '25 days after your county mails its TRIM notice',
  AR: 'the third Monday in August',
  AL: '30 days from the date on your Notice of Valuation',
};

/**
 * Every state this product has content for, in the order the site lists them.
 * Membership here is "we have built for it at all"; SERVING_FROM decides whether
 * we will take an order today.
 */
export const ALL_STATES = ['TX', 'GA', 'FL', 'AR', 'AL'];

function code(stateCode) {
  return String(stateCode || '').trim().toUpperCase();
}

/** State codes we will take an order in today, in site order. */
export function sellingStates() {
  return ALL_STATES.filter((c) => !SERVING_FROM[c]);
}

/** [{ code, name, servingFrom }] for the states we are not serving yet. */
export function pendingStates() {
  return ALL_STATES.filter((c) => SERVING_FROM[c])
    .map((c) => ({ code: c, name: STATE_NAMES[c], servingFrom: SERVING_FROM[c] }));
}

/**
 * "Texas, Georgia and Florida" — an Oxford-free English list, because these
 * strings land in prose and in schema.org descriptions where a trailing "and
 * Alabama" for a state we refuse is the exact defect this module exists to stop.
 */
export function nameList(codes) {
  const names = codes.map((c) => STATE_NAMES[code(c)] || c);
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The first season we will file in this state, or null if that is now. */
export function servingFrom(stateCode) {
  return SERVING_FROM[code(stateCode)] || null;
}

/**
 * Are we willing to take an order in this state at all?
 *
 * This is NOT "is the filing window open" — a state can be servable and out of
 * season (Texas in August), or in season and unservable (Arkansas right now,
 * whose window ran to 17 August). Callers that gate money need both this and
 * getFilingWindowStatus(); the marketing pages need this one, because a state
 * we will not serve until 2027 should not advertise a price whatever its
 * window says today.
 */
export function isStateServable(stateCode) {
  return !servingFrom(stateCode);
}

/**
 * The filing year a waitlist signup made TODAY belongs to.
 *
 * Somebody who joins the Arkansas list in August 2026 is a 2027 filer, and
 * cron/notify-waitlist.js keys off this to decide whether it may tell them
 * their window is open. Stamping the current year makes it send that email in
 * a season we have already declined to file in.
 *
 * `today` is injectable so this is testable without freezing the clock.
 */
export function waitlistFilingYear(stateCode, today = new Date()) {
  const sc = code(stateCode);
  const year = today.getFullYear();
  const from = SERVING_FROM[sc];
  // A state we are not serving yet post-dates to the season we WILL serve —
  // even if that is several years out and even if its window is open today.
  if (from) return Math.max(from, year);
  return year;
}

/**
 * What a marketing page for this state should say and offer, right now.
 *
 * Returns a plain object so the page does no reasoning of its own:
 *
 *   selling      — may this page show a price and a buy button?
 *   servingFrom  — the season we open, when selling is false
 *   heading      — the honest replacement headline
 *   body         — one sentence of explanation, in the homeowner's terms
 *   promise      — completes "we'll email you ..." in the signup box
 *
 * Deliberately says nothing about WHY we are not serving yet. The reason is an
 * operational one (we cannot yet vouch for the envelope) and the homeowner has
 * no use for it; what they need is the date and a way to be told.
 */
export function stateSaleStatus(stateCode) {
  const sc = code(stateCode);
  const name = STATE_NAMES[sc] || sc;
  const from = SERVING_FROM[sc];
  // Present in BOTH branches on purpose. It is a fact about the state's law, not
  // about whether we are selling, and a field that exists in one branch only is
  // a field every caller has to remember to guard.
  const deadlineRule = STATE_DEADLINE_RULE[sc] || null;

  if (!from) {
    return { code: sc, name, selling: true, servingFrom: null, deadlineRule, heading: null, body: null, promise: null };
  }

  return {
    code: sc,
    name,
    selling: false,
    servingFrom: from,
    deadlineRule,
    heading: `We're not filing in ${name} yet`,
    body: `We are not filing ${name} appeals this season. We will be filing for the ${from} season, and we will email you the day it opens so you have time to get yours in.`,
    promise: `the day ${name} filing opens in ${from}.`,
  };
}
