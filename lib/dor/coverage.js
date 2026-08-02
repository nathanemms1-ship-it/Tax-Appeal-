/**
 * WHAT WE ACTUALLY HOLD DATA FOR.
 *
 * ============================================================================
 * WHY THIS EXISTS AS ITS OWN FILE
 * ============================================================================
 * Without it, every address we cannot check gets the same answer — "we do not
 * have a record for this address on the current tax roll" — and that sentence is
 * wrong in three different ways depending on why we missed:
 *
 *   - A Texas address: we have a tax roll, just not theirs. Saying we have no
 *     record of their property reads as "your house does not exist".
 *   - A Florida county we have not loaded: same problem, and it is our gap, not
 *     theirs.
 *   - A genuine miss inside a loaded county: new construction or a recent split.
 *     Here the message is actually correct.
 *
 * Only the third deserves that wording. The other two are a coverage gap and
 * should say so, because the honest version is also the one that captures an
 * email instead of turning someone away.
 */

/** DOR county numbers currently loaded, with display names. */
export const LOADED_COUNTIES = {
  15: 'Brevard',
  16: 'Broward',
  23: 'Miami-Dade',
  26: 'Duval',
  39: 'Hillsborough',
  46: 'Lee',
  58: 'Orange',
  60: 'Palm Beach',
  61: 'Pasco',
  62: 'Pinellas',
  63: 'Polk',
  69: 'Seminole',
  74: 'Volusia',
};

export const LOADED_COUNTY_NAMES = Object.values(LOADED_COUNTIES).sort();

/**
 * Florida ZIP codes run 32000–34999, with no other state inside that range.
 *
 * Used only to tell a coverage gap from a genuine miss — never to decide
 * anything that reaches a petition. A ZIP is not a jurisdiction: the county that
 * governs the filing fee, the payee and the office comes from the Census
 * geocoder, and there is deliberately no shortcut around that (see
 * pages/api/resolve-county.js).
 */
export function isFloridaZip(zip) {
  const z = String(zip || '').trim().slice(0, 5);
  if (!/^\d{5}$/.test(z)) return false;
  const n = Number(z);
  return n >= 32000 && n <= 34999;
}

/** States the site advertises, for the "tell me when you open" selector. */
export const ADVERTISED_STATES = [
  { code: 'FL', name: 'Florida' },
  { code: 'TX', name: 'Texas' },
  { code: 'GA', name: 'Georgia' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'AL', name: 'Alabama' },
];

export default { LOADED_COUNTIES, LOADED_COUNTY_NAMES, isFloridaZip, ADVERTISED_STATES };
