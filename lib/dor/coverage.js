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

/**
 * DOR county numbers currently loaded, with display names.
 *
 * All 67. Every county in Florida files a NAL and an SDF with the Department
 * under the same schema, so statewide is the natural resting state of this map,
 * not an aspiration. Keep it generated from the database rather than edited by
 * hand — a county listed here that is not actually loaded turns a coverage gap
 * into "we have no record of your property", which is the exact wrong answer.
 */
export const LOADED_COUNTIES = {
  11: 'Alachua',
  12: 'Baker',
  13: 'Bay',
  14: 'Bradford',
  15: 'Brevard',
  16: 'Broward',
  17: 'Calhoun',
  18: 'Charlotte',
  19: 'Citrus',
  20: 'Clay',
  21: 'Collier',
  22: 'Columbia',
  23: 'Miami-Dade',
  24: 'DeSoto',
  25: 'Dixie',
  26: 'Duval',
  27: 'Escambia',
  28: 'Flagler',
  29: 'Franklin',
  30: 'Gadsden',
  31: 'Gilchrist',
  32: 'Glades',
  33: 'Gulf',
  34: 'Hamilton',
  35: 'Hardee',
  36: 'Hendry',
  37: 'Hernando',
  38: 'Highlands',
  39: 'Hillsborough',
  40: 'Holmes',
  41: 'Indian River',
  42: 'Jackson',
  43: 'Jefferson',
  44: 'Lafayette',
  45: 'Lake',
  46: 'Lee',
  47: 'Leon',
  48: 'Levy',
  49: 'Liberty',
  50: 'Madison',
  51: 'Manatee',
  52: 'Marion',
  53: 'Martin',
  54: 'Monroe',
  55: 'Nassau',
  56: 'Okaloosa',
  57: 'Okeechobee',
  58: 'Orange',
  59: 'Osceola',
  60: 'Palm Beach',
  61: 'Pasco',
  62: 'Pinellas',
  63: 'Polk',
  64: 'Putnam',
  65: 'St. Johns',
  66: 'St. Lucie',
  67: 'Santa Rosa',
  68: 'Sarasota',
  69: 'Seminole',
  70: 'Sumter',
  71: 'Suwannee',
  72: 'Taylor',
  73: 'Union',
  74: 'Volusia',
  75: 'Wakulla',
  76: 'Walton',
  77: 'Washington',
};

export const LOADED_COUNTY_NAMES = Object.values(LOADED_COUNTIES).sort();

/**
 * Reverse lookup: county NAME -> DOR county number.
 *
 * millageForCounty() is keyed by DOR number, but everything customer-facing carries
 * a name ("Broward", "Broward County", "broward"). Added 5 Aug 2026 so the inbound
 * decision parser can reach a real millage rate instead of letting the model guess
 * one — see pages/api/webhooks/inbound-email.js.
 */
const NAME_TO_CO_NO = Object.fromEntries(
  Object.entries(LOADED_COUNTIES).map(([no, name]) => [name.toLowerCase(), Number(no)])
);

export function countyNoFromName(name) {
  if (!name) return null;
  const key = String(name).trim().replace(/\s+county$/i, '').toLowerCase();
  return NAME_TO_CO_NO[key] ?? null;
}

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

export default { LOADED_COUNTIES, LOADED_COUNTY_NAMES, countyNoFromName, isFloridaZip, ADVERTISED_STATES };
