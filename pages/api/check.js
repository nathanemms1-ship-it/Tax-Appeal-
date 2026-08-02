/**
 * THE FREE SAVINGS CHECK — "can an appeal actually lower your tax bill?"
 *
 * ============================================================================
 * WHY THIS IS THE MOST IMPORTANT ENDPOINT IN THE PRODUCT
 * ============================================================================
 * Roughly 42% of Florida residential parcels cannot benefit from an appeal at
 * all. Their assessed value is capped so far below market by Save Our Homes
 * (Fla. Stat. § 193.155) that reducing the market value changes nothing — the
 * cap is already doing the work. Measured across the 13 largest counties:
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
    const result = await lookupAndQualify({ street, zip, city });

    if (!result.found) {
      return res.status(200).json({
        found: false,
        reason: result.reason,
        candidates: result.candidates || null,
        message: result.message,
      });
    }

    const { parcel, savings } = result;

    return res.status(200).json({
      found: true,
      parcel,

      eligible: savings.eligible,
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
