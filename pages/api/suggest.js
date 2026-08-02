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

  if (!query || query.trim().length < 4) return res.status(200).json({ suggestions: [] });

  try {
    const suggestions = await suggestAddresses(query, { limit: 8, zip: zip || null });
    return res.status(200).json({ suggestions });
  } catch (err) {
    // Never fail the request over autocomplete. A customer can always type the
    // address in full and press the button.
    console.error('[suggest] error:', err?.message);
    return res.status(200).json({ suggestions: [] });
  }
}
