/**
 * THE CLOSED VOCABULARY OF /api/check OUTCOMES.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS RATHER THAN A CHECK CONSTRAINT
 * ============================================================================
 * lib/waitlistReasons.js is the same idea and it was only half of one. The list
 * lived here in code, a matching CHECK constraint lived in the database, and the
 * two drifted: `fl_not_eligible` was added to the code and never to the
 * constraint, so every insert carrying it was rejected and every one of those
 * leads was thrown away. Nothing compared the two lists, because the build has
 * no database connection.
 *
 * So check_events has no constraint at all -- an unanticipated outcome is the
 * most interesting row the table can hold and must never be rejected -- and the
 * enforcement moved entirely to where the build CAN see it:
 * scripts/verify-check-events.mjs reads every `reason: '...'` literal out of
 * lib/dor/qualify.js, lib/dor/parcels.js and pages/api/check.js and fails the
 * build if any of them is missing from OUTCOMES below.
 *
 * ADD A NEW REFUSAL BRANCH TO qualify.js AND THE BUILD WILL TELL YOU TO COME
 * HERE. That is the whole design. Do not add a constraint that recreates the
 * failure this replaced.
 *
 * ============================================================================
 * THE GROUPS ARE NOT COSMETIC
 * ============================================================================
 * `group` is what /admin counts and what check_events.sql filters on, so the two
 * must agree -- the verify script asserts that too, by parsing the outcome lists
 * back out of the SQL. Getting a group wrong does not error; it moves a customer
 * from one side of the refusal rate to the other, which is the number this whole
 * table was built to produce.
 */

/**
 * `refused`   we told them an appeal cannot help and there is nothing to sell.
 * `rescuable` comps alone fall short, but a documented cost to cure might clear
 *             it -- routed to the condition step, NOT a dead end. 688,497
 *             Florida homes sit in this band. Counting these as refusals would
 *             overstate the wall by a wide margin.
 * `eligible`  an appeal can produce real savings. The sellable population.
 * `our_failure` we did not reach a finding AND it was our fault: the roll held
 *             the property and the matcher refused it, the database did not
 *             answer, the form submitted nothing, or a 500.
 * `no_answer` we did not reach a finding and there is nothing to fix in code:
 *             outside Florida, genuinely not on the roll, or several parcels
 *             matched and the visitor was asked to pick. Neither group may be
 *             blended into the refusal rate -- "we cannot help you" and "we
 *             could not find your house" are different problems with different
 *             fixes.
 *
 * ============================================================================
 * THE FIFTH GROUP EXISTED IN SQL AND NOT HERE, FOR TWO DAYS. 27 Aug 2026.
 * ============================================================================
 * scripts/sql/check_events_daily_split.sql split the grey bar on 26 Aug into
 * `our_failure` and `no_answer`, and /admin has drawn five chart segments ever
 * since. This file was never told. So `outcomeGroup()` kept returning
 * 'no_answer' for all seven, and every surface that labels a row through this
 * module -- the by-outcome table, the per-day tooltip added 27 Aug -- filed
 * `no_parcel_near_miss` under "No finding", the group whose own caption reads
 * "reasons outside the code".
 *
 * The effect was to hide our own bugs inside the bucket labelled not-our-fault,
 * on the one screen built to tell them apart, while the chart four inches above
 * drew them in a different colour. On 27 Aug that was 8 checks reading as
 * coverage when they were retrieval.
 *
 * This file's own header, thirty lines up, says `group` "is what /admin counts
 * and what check_events.sql filters on, so the two must agree -- the verify
 * script asserts that too". It asserted it for the refusal and eligible lists
 * only. It now asserts it for all four, which is why this could drift.
 */
export const OUTCOMES = {
  // ── Refusals: a finding, and the finding is no ────────────────────────────
  // lib/dor/qualify.js. The one Nathan asked about is cap_absorbs_everything:
  // Save Our Homes has capped the assessed value so far below market that even a
  // strong reduction moves no tax at all.
  cap_absorbs_everything: { group: 'refused',   label: 'Capped below market (Save Our Homes)' },
  saving_below_cost:      { group: 'refused',   label: 'Would save less than it costs to file' },
  no_just_value:          { group: 'refused',   label: 'No just value on the roll' },
  not_residential:        { group: 'refused',   label: 'Not a residential property' },
  no_taxable_value:       { group: 'refused',   label: 'No taxable value' },

  // ── Not a refusal. The UI owes these people a question, not a door ─────────
  needs_condition_case:   { group: 'rescuable', label: 'Might clear it with a condition case' },

  // ── Sellable ──────────────────────────────────────────────────────────────
  clearable:              { group: 'eligible',  label: 'Appeal can produce savings' },
  no_cap_differential:    { group: 'eligible',  label: 'No cap in the way — assessed at market' },

  // ── No finding reached, and nothing for us to fix ─────────────────────────
  outside_coverage:       { group: 'no_answer', label: 'Outside Florida' },
  no_parcel:              { group: 'no_answer', label: 'No parcel on the roll' },
  ambiguous:              { group: 'no_answer', label: 'Address matched several parcels' },

  // ── No finding reached, and it was ours ───────────────────────────────────
  /**
   * SPLIT FROM no_parcel, 25 Aug 2026. The SQL returned rows for this street and
   * rowMatches rejected every one of them — so the roll HOLDS the property and
   * our matcher failed. That is our bug, and it needed to stop being averaged in
   * with "nothing like it is on the roll", which is coverage and has the opposite
   * fix. 41% of checks that day were no_parcel and nothing could tell the two
   * apart. See the miss in lib/dor/parcels.js findParcel.
   */
  no_parcel_near_miss:    { group: 'our_failure', label: 'On the roll, but our matcher missed it' },
  /**
   * SPLIT OUT OF no_parcel, 25 Aug 2026. findParcel returned null on a Supabase
   * error, which is what a genuine miss returns, so every database problem was
   * counted as a property that does not exist — and the homeowner was told so.
   * Keeping these together made the funnel's largest bucket unreadable: it moved
   * when the database moved, and nothing said which.
   */
  lookup_failed:          { group: 'our_failure', label: 'Our lookup failed (database)' },
  /** `bad_input` means the FORM broke -- see check_events_daily_split.sql. */
  bad_input:              { group: 'our_failure', label: 'No street address submitted' },
  error:                  { group: 'our_failure', label: 'Lookup failed (500)' },
};

/** Which page ran the check. See check_events.source. */
export const CHECK_SOURCES = ['check', 'apply', 'unknown'];

const inGroup = (g) => Object.keys(OUTCOMES).filter((k) => OUTCOMES[k].group === g);

export const REFUSAL_OUTCOMES = inGroup('refused');
export const ELIGIBLE_OUTCOMES = inGroup('eligible');
/**
 * Exported for the same reason the two above are: check_events_daily_split.sql
 * repeats both lists inside its aggregate, a SQL function cannot import this
 * module, and scripts/verify-check-events.mjs parses them back out and compares.
 * Without these two exports there was nothing to compare the grey split against,
 * which is exactly how the two halves drifted apart.
 */
export const OUR_FAILURE_OUTCOMES = inGroup('our_failure');
export const NO_ANSWER_OUTCOMES = inGroup('no_answer');

/**
 * Unknown outcomes resolve to a group rather than throwing.
 *
 * The build guard is what stops an unknown outcome existing. If one reaches
 * production anyway -- a hotfix that skipped the build, a branch added in a
 * hurry -- the row is still written and still counted, it just does not land in
 * the refusal rate. Losing a row here to protect a category label would be the
 * waitlist constraint again, in JavaScript.
 */
export function outcomeGroup(outcome) {
  return OUTCOMES[outcome]?.group || 'no_answer';
}

export function outcomeLabel(outcome) {
  return OUTCOMES[outcome]?.label || `Unrecognised (${outcome})`;
}

export function isKnownOutcome(outcome) {
  return Object.prototype.hasOwnProperty.call(OUTCOMES, outcome);
}

export default OUTCOMES;
