/**
 * ADDRESS AUTOCOMPLETE, against our own parcel table.
 *
 * ============================================================================
 * WHY THIS IS BETTER THAN GOOGLE PLACES, NOT JUST CHEAPER
 * ============================================================================
 * The existing /api/autocomplete calls Google Places and then a separate
 * Geocoding request per prediction — six billed calls to show five suggestions,
 * which is why it was cut to three and why the dropdown feels thin.
 *
 * But cost is the smaller problem. Google will happily suggest an address that
 * no property-data source has a record for, and that customer then hits "we have
 * no record of your property" through no fault of their own — which is exactly
 * what happened on the first two addresses tried against /check.
 *
 * Here the autocomplete source and the property-data source are THE SAME TABLE.
 * Every suggestion is a parcel we hold, so selecting one cannot fail to resolve.
 * That entire class of dead end disappears, and it costs nothing per call, so
 * there is no reason to ration suggestions.
 *
 * Runs on the trigram GIN index over (phy_addr1 || phy_city), so it matches
 * mid-string: "marbella" finds "8023 MARBELLA CREEK AVE".
 */

import { enforceRateLimit } from '../../lib/rateLimit';
import { LIMITS, cap } from '../../lib/inputLimits';
import { suggestAddresses } from '../../lib/dor/parcels';
import { suggestAddresses as suggestTexas } from '../../lib/tx/parcels';
import { isTexasZip } from '../../lib/tx/coverage';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // This fires on keystrokes, so the per-minute allowance is high — but it costs
  // us nothing per call, unlike the Google path it replaces. The limits exist to
  // stop the parcel table being bulk-extracted a page at a time, not to control
  // spend.
  if (await enforceRateLimit(req, res, 'suggest', 60, 60)) return;
  if (await enforceRateLimit(req, res, 'suggest', 900, 3600)) return;

  const query = cap(req.body?.query, LIMITS.address);
  const zip = cap(req.body?.zip, 20);
  const state = String(cap(req.body?.state, 4) || '').trim().toUpperCase();

  if (!query || query.trim().length < 4) return res.status(200).json({ suggestions: [] });

  /**
   * ==========================================================================
   * WHICH ROLL — 10 Sept 2026
   * ==========================================================================
   * This route was Florida-only, which is why /check offered a Texas homeowner
   * no suggestions at all and /apply fell through to an unbiased Google Places
   * call that answered "3207 high ridge ct" with a street in Maryland.
   *
   * The state box is usually still EMPTY while the street is being typed, so the
   * ZIP decides when it can and both rolls are asked when neither is known.
   * Asking both is cheap — these are our own tables, not a billed API — and it
   * is the only answer that works before the customer has told us where they
   * are. Texas leads because it is the larger roll and the open season.
   */
  const wantsTx = state === 'TX' || (!state && isTexasZip(zip));
  const wantsFl = state === 'FL' || (!state && !isTexasZip(zip));

  try {
    const [tx, fl] = await Promise.all([
      wantsTx ? suggestTexas(query, { limit: 8, zip: zip || null }) : Promise.resolve([]),
      wantsFl ? suggestAddresses(query, { limit: 8, zip: zip || null }) : Promise.resolve([]),
    ]);
    // Every row carries its own state now. /check used to hardcode "FL" into the
    // second line of the dropdown, which was wrong the moment a second state had
    // a roll.
    const suggestions = [
      ...tx,
      ...fl.map((r) => ({ ...r, state: r.state || 'FL' })),
    ].slice(0, 8);
    return res.status(200).json({ suggestions });
  } catch (err) {
    // Never fail the request over autocomplete. A customer can always type the
    // address in full and press the button.
    console.error('[suggest] error:', err?.message);
    return res.status(200).json({ suggestions: [] });
  }
}
