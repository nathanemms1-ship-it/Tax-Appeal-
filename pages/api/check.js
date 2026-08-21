/**
 * THE FREE SAVINGS CHECK — "can an appeal actually lower your tax bill?"
 *
 * ============================================================================
 * WHY THIS IS THE MOST IMPORTANT ENDPOINT IN THE PRODUCT
 * ============================================================================
 * Roughly 42% of Florida residential parcels cannot benefit from an appeal at
 * all. Their assessed value is capped so far below market by Save Our Homes
 * (Fla. Stat. § 193.155) that reducing the market value changes nothing — the
 * cap is already doing the work. Measured across the 13 largest counties, which
 * is where this ratio was derived — the roll now covers all 67 counties and
 * 8,410,126 residential parcels, so this split should be recomputed statewide
 * before it is quoted as a Florida-wide figure again:
 *
 *   5,155,929 residential parcels
 *   3,013,018 where an appeal can produce real savings   (58.4%)
 *   1,995,000 where it cannot
 *
 * Competitors charge those two million households anyway, because finding out
 * requires per-parcel just AND assessed values, which no commercial API returns.
 * We hold the county roll, so we can answer it for free, instantly, and say no.
 *
 * That refusal is the product, not a cost of doing business. It is the only
 * claim in this market that can be checked by the person hearing it — against
 * their own TRIM notice — which is what makes it worth more than any assertion
 * we could make about ourselves.
 *
 * ============================================================================
 * FACT vs OPINION
 * ============================================================================
 * The response deliberately separates these and the UI must not merge them:
 *
 *   parcel.*                  county roll figures. Facts. State them flatly.
 *   savings.breakEvenStatement arithmetic on those figures. Also a fact.
 *   savings.scenarios          projections. Estimates. Must read as estimates.
 *
 * Dollar figures additionally carry `millageIsEstimated`, because the real
 * per-district rates are not loaded yet and a flat 18 mills can be off by ±30%.
 * Good enough to decide whether to file; NOT good enough to quote to a customer
 * as though it were computed for them.
 *
 * ============================================================================
 * NO AUTHENTICATION, NO PAYMENT, NO VENDOR CALLS
 * ============================================================================
 * This is deliberately free and public. It costs an indexed query against our
 * own database — no metered API, no per-lookup cost — so there is no commercial
 * reason to gate it, and gating it would destroy the thing that makes it work.
 */

import { enforceRateLimit } from '../../lib/rateLimit';
import { LIMITS, cap } from '../../lib/inputLimits';
import { lookupAndQualify } from '../../lib/dor/parcels';
import { DEFAULT_MILLAGE } from '../../lib/dor/qualify';
import { isFloridaZip, LOADED_COUNTY_NAMES, LOADED_COUNTIES } from '../../lib/dor/coverage';
import { recordCheckOutcome } from '../../lib/recordCheck';

/**
 * ============================================================================
 * EVERY BRANCH BELOW RECORDS ITS OUTCOME. THAT IS NEW, AND HERE IS WHY.
 * ============================================================================
 * Until 21 Aug 2026 this endpoint -- described in its own header as the most
 * important in the product -- wrote nothing on any path. It answered, and the
 * answer evaporated.
 *
 * What that cost: the header above says roughly 39% of Florida residential
 * parcels cannot benefit from an appeal at all. Nobody could say whether that
 * was what visitors were actually hitting, because the only trace a refused
 * homeowner could leave was an email address they chose to type afterwards --
 * and all-time that had happened zero times. site_visits records the first page
 * of a visitor's day and nothing after it, so /check -> /apply drop-off was not
 * measured either. The whole span between "arrived" and "started checkout" was
 * dark, and /check became the Google Ads final URL on 21 Aug -- so that dark
 * span is now exactly where the money lands.
 *
 * WHAT IS RECORDED IS THE SHAPE OF THE ANSWER, NOT WHO ASKED: the date, which
 * outcome, which page ran the check, the county, and how far below the cap the
 * parcel sat. No address, no ZIP, no email, no IP, no parcel ID, no just value,
 * and no digest of any of them. See scripts/sql/check_events.sql -- the refusal
 * to store a visitor key there is deliberate and load-bearing, and it is why
 * repeat checks count as repeat checks.
 *
 * RECORDING MUST NEVER CHANGE THE ANSWER. recordCheckOutcome throws nothing,
 * caps its own latency, and abandons the row rather than delay a response.
 */

/** County NAME for the log, never the DOR number. See lib/recordCheck.js. */
function countyName(parcel) {
  const no = Number(parcel?.coNo);
  return Number.isFinite(no) ? LOADED_COUNTIES[no] || null : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Generous, because this costs us nothing per call and the whole point is that
  // people use it. Bounded only so it cannot be turned into a bulk extraction
  // tool for the parcel database, which took real work to assemble.
  if (await enforceRateLimit(req, res, 'check', 30, 60)) return;
  if (await enforceRateLimit(req, res, 'check', 300, 3600)) return;

  const b = req.body || {};
  const street = cap(b.street, LIMITS.address);
  const zip = cap(b.zip, 20);
  const city = cap(b.city, 120);

  /**
   * WHICH PAGE ASKED. 'check' | 'apply' | anything else -> 'unknown'.
   *
   * pages/apply.js runs this same endpoint again at the property step, for
   * somebody who has already cleared the gate on /check. Without this field the
   * two are indistinguishable and the top-of-funnel refusal rate is diluted by
   * re-checks from people who were never going to be refused -- which would
   * understate the exact number check_events was built to measure.
   *
   * Sanitised in lib/recordCheck.js rather than trusted here: it arrives in a
   * request body, so it is a value a caller controls.
   */
  const source = b.source;

  /**
   * STREET ALONE IS ENOUGH.
   *
   * This was `!street || (!zip && !city)`, and the client was changed to make ZIP
   * optional without changing it — so the form let you submit and the server sent
   * back "Street address and either ZIP or city are required." The two halves have
   * to agree, and this is the half that decides.
   *
   * ZIP became optional because it stopped being a filter: lib/dor/parcels.js now
   * treats it as a hint that narrows and never excludes, after an exact-match ZIP
   * filter was found returning "we have no record" for a parcel we hold. Requiring
   * a value we no longer depend on only blocks people.
   *
   * WHAT WE GIVE UP, STATED PLAINLY. The out-of-state branch below keys off the
   * ZIP, so a zipless query can no longer be answered "your state's window is
   * closed" before touching the database — it falls through to the roll, misses,
   * and gets the ordinary not-found copy. That is a worse answer for a Texan on a
   * page headed "Covering all 67 Florida counties", and a better one for every
   * Floridian who does not know which ZIP their county wrote down. Given who this
   * page is advertised to, that is the right way round.
   */
  if (!street) {
    // Recorded because a spike here means the FORM is broken, not the market.
    // The client and server disagreed about whether ZIP was required once
    // already, and the symptom was a button that appeared dead -- invisible from
    // this side, and it would have been visible from this side with this row.
    await recordCheckOutcome({ outcome: 'bad_input', source });
    return res.status(400).json({ error: 'Enter a street address to check.' });
  }

  try {
    // OUTSIDE FLORIDA — a coverage gap, not a missing property.
    //
    // Answered before touching the database, because the honest message is
    // different in kind: we hold a tax roll, just not theirs. Telling a Texas
    // homeowner we have no record of their property reads as "your house does
    // not exist", which is both wrong and the fastest way to lose a lead we
    // could have captured.
    if (zip && !isFloridaZip(zip)) {
      // No county: this branch answers before touching the roll, on the ZIP
      // alone. Counting these as refusals would blend "we cannot help you" into
      // "we do not cover your state" -- different problems, different fixes.
      // check_events groups it under no_answer for that reason.
      await recordCheckOutcome({ outcome: 'outside_coverage', source });
      return res.status(200).json({
        found: false,
        reason: 'outside_coverage',
        // WHAT THIS SAYS, AND WHY IT MATTERS.
        //
        // "We only cover Florida so far" reads as "we are not ready" — an
        // admission that the product is unfinished, to someone who arrived
        // wanting to buy. The true and more useful statement is about THEIR
        // deadline: every state we serve outside Florida has a filing window that
        // is currently closed, so there is nothing they could file today even
        // with a finished product in front of them.
        //
        // Same outcome, same email capture, and the reason given is a fact about
        // their county rather than a shortcoming of ours.
        message: 'Your state\'s filing window is closed right now — there is nothing that can be filed until it reopens. Tell us your state and we\'ll email you the moment it does, with time to spare before the deadline.',
      });
    }

    // Defect LABELS, not dollars. lib/dor/parcels.js prices them server-side
    // against this parcel and hands the total to qualify() as cureDollars. Empty
    // on the first visit — the owner has not been asked yet — so the first answer
    // is comps-only, exactly as before.
    const result = await lookupAndQualify(
      { street, zip, city },
      { issues: Array.isArray(b.issues) ? b.issues : [], costOverrides: b.costOverrides || {} }
    );

    if (!result.found) {
      /**
       * 'no_parcel' or 'ambiguous', from lib/dor/parcels.js.
       *
       * Worth separating in the panel: no_parcel is a coverage or data problem
       * we can fix by loading a roll, and ambiguous is a UI problem -- the
       * address matched several parcels and the visitor has to pick. A rising
       * ambiguous count is people being asked a question they may not answer,
       * which looks identical to disinterest from every other angle.
       */
      await recordCheckOutcome({ outcome: result.reason || 'no_parcel', source });
      return res.status(200).json({
        found: false,
        // Inside Florida but no parcel. Could be a county we have not loaded, or
        // genuine new construction. We cannot tell which without the county, and
        // the county comes from a geocoder we are not calling here — so the
        // message covers both rather than asserting either.
        reason: result.reason,
        candidates: result.candidates || null,
        message: result.message,
        coveredCounties: result.reason === 'no_parcel' ? LOADED_COUNTY_NAMES : undefined,
      });
    }

    const { parcel, savings } = result;

    /**
     * THE ROW THIS WHOLE TABLE WAS BUILT FOR.
     *
     * savings.reason is the finding: 'cap_absorbs_everything' is the Save Our
     * Homes wall, 'saving_below_cost' is the appeal that wins and still leaves
     * the owner out of pocket, 'needs_condition_case' is the one that is NOT a
     * refusal and must not be counted as one, and 'clearable' /
     * 'no_cap_differential' are the sellable population.
     *
     * requiredCutPct is stored because it separates two refused populations that
     * look identical in a count: one sitting 8% below the cap, who a soft market
     * rescues and who are worth holding an email address for, and one sitting
     * 60% below, who never become customers under any conditions. That
     * distinction is the difference between a waitlist and a dead list.
     */
    await recordCheckOutcome({
      outcome: savings.reason,
      source,
      county: countyName(parcel),
      requiredCutPct: savings.requiredCutPct,
    });

    return res.status(200).json({
      found: true,
      parcel,

      eligible: savings.eligible,
      // NOT eligible, but NOT a refusal either: comparable sales alone fall short
      // while a documented cost to cure would clear the cap. 688,497 Florida homes
      // sit in this band. The UI must route these to the condition step rather
      // than dead-ending them. See lib/dor/qualify.js, 7 Aug 2026.
      rescuable: savings.rescuable === true,
      // The question, kept apart from the finding so the UI can emphasise it.
      conditionPrompt: savings.conditionPrompt || null,
      confidence: savings.confidence || null,
      reason: savings.reason,

      // FACTS — arithmetic on the county's own published roll. The homeowner can
      // check every one of these against their TRIM notice, which is precisely
      // why we lead with them.
      facts: {
        justValue: parcel.justValue,
        cappedAt: savings.breakEven,
        differential: savings.differential,
        requiredReductionPct: savings.requiredCutPct != null
          ? Math.round(savings.requiredCutPct * 1000) / 10
          : null,
        statement: savings.breakEvenStatement,
      },

      // ESTIMATES — must be presented as estimates. See millageIsEstimated.
      estimates: savings.scenarios
        ? {
            conservative: savings.scenarios.conservative?.dollarsSaved ?? null,
            likely: savings.scenarios.likely?.dollarsSaved ?? null,
            optimistic: savings.scenarios.optimistic?.dollarsSaved ?? null,
            // What reduction each figure assumes, so the screen can say "at a 15%
            // reduction" instead of an adjective. A saving with no stated
            // assumption behind it is a number the customer cannot check.
            pcts: savings.scenarioPcts || null,
            millageIsEstimated: true,
            millageUsed: DEFAULT_MILLAGE,
          }
        : null,

      // Present when we are declining. Shown verbatim — it is the most valuable
      // thing on the page for the ~42% who cannot win.
      message: savings.message || null,
      // Present on long-odds cases we WILL take. Must appear before checkout so
      // nobody is surprised by the shape of what they bought.
      disclosure: savings.disclosure || null,

      checkedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[check] error:', err);
    /**
     * A 500 is a funnel outcome too, and the one most likely to be mistaken for
     * disinterest. Somebody whose lookup threw sees a generic error and leaves;
     * from every other vantage point that is indistinguishable from a visitor
     * who typed nothing. This is also not hypothetical here -- generate-dr486.js
     * once carried a model ID the account may not have had, which would have
     * 500'd the Florida funnel at lookup 100% of the time with no counter
     * anywhere that would have shown it.
     *
     * Wrapped rather than awaited bare: if the handler is already failing, a
     * failure inside the recorder must not replace a 500 with an unhandled
     * rejection.
     */
    try { await recordCheckOutcome({ outcome: 'error', source }); } catch { /* never mask the original */ }
    return res.status(500).json({ error: 'Internal server error' });
  }
}
