/**
 * WHERE THE COUNTY SENDS THINGS, WHICH IS NOT ALWAYS WHERE THE HOUSE IS.
 *
 * ============================================================================
 * WHY THIS FUNCTION EXISTS
 * ============================================================================
 * The DR-486 has TWO addresses on it and they are not the same field. One is the
 * property under appeal, which identifies the parcel to the Board. The other is
 * the petitioner's mailing address, and the petition we generate prints, in bold,
 * directly beneath it:
 *
 *   "Direct all correspondence and the Board's determination to the property
 *    owner at the address above."
 *
 * pages/api/generate-dr486.js has always taken those as separate parameters and
 * rendered them in separate fields. This file filled BOTH from the property:
 *
 *   apply.js:2555  ownerStreet: property.street,     <- the order row
 *   apply.js:3223  ownerStreet: property.street,     <- the signed petition
 *   apply.js:3280  ownerStreet: property.street,     <- the preview petition
 *
 * For an owner-occupier that is right and nobody notices. For a landlord, a
 * snowbird, or anyone who has moved, it directs the county's correspondence to a
 * tenant's mailbox or an empty house — and they never find out, because the thing
 * that goes missing is a letter they were not expecting to receive.
 *
 * It was found on 25 Aug 2026 by a customer who asked before buying. Nobody else
 * had asked in the life of the product, which is the argument for a default that
 * is right rather than a question that is answered.
 *
 * ============================================================================
 * BLANK MEANS THE PROPERTY, DELIBERATELY
 * ============================================================================
 * Most people do have it sent to the property, so that stays the default and the
 * fields stay closed behind a disclosure — the same treatment the TRIM override
 * gets in StepProperty, and for the same reason: an input nobody needs is words
 * where a control belongs.
 *
 * The consequence is that an empty `mailStreet` is not missing data, it is an
 * answer. Every reader has to agree on that, which is why there is one function
 * and three callers rather than three inline ternaries.
 *
 * Per-part fallback rather than all-or-nothing: somebody who opens the panel to
 * change only the street should not silently lose the city.
 */
export function resolveOwnerMailing(account, property) {
  // `= {}` default parameters do NOT apply to an explicit null, and this runs
  // inside doCheckout between the Stripe conversion event and the network call.
  // A throw there loses the sale with no error anyone sees. Caught by
  // scripts/verify-owner-mailing.mjs, not by reasoning about the call sites.
  const a = account || {};
  const p = property || {};
  const street = String(a.mailStreet || '').trim();
  if (!street) {
    return {
      street: p.street || '',
      city: p.city || '',
      state: p.state || '',
      zip: p.zip || '',
      isDifferent: false,
    };
  }
  return {
    street,
    city: String(a.mailCity || '').trim() || p.city || '',
    state: String(a.mailState || '').trim() || p.state || '',
    zip: String(a.mailZip || '').trim() || p.zip || '',
    isDifferent: true,
  };
}
