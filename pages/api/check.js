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
import { isFloridaZip, LOADED_COUNTY_NAMES } from '../../lib/dor/coverage';

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

  if (!street || (!zip && !city)) {
    return res.status(400).json({ error: 'Street address and either ZIP or city are required.' });
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

    return res.status(200).json({
      found: true,
      parcel,

      eligible: savings.eligible,
      // NOT eligible, but NOT a refusal either: comparable sales alone fall short
      // while a documented cost to cure would clear the cap. 688,497 Florida homes
      // sit in this band. The UI must route these to the condition step rather
      // than dead-ending them. See lib/dor/qualify.js, 7 Aug 2026.
      rescuable: savings.rescuable === true,
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
    return res.status(500).json({ error: 'Internal server error' });
  }
}
