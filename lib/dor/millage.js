/**
 * FLORIDA MILLAGE RATES BY COUNTY — 2025.
 *
 * ============================================================================
 * WHAT THIS REPLACES
 * ============================================================================
 * Every dollar figure the savings gate produced was computed against a flat 18
 * mills, guessed as a plausible statewide average. Actual county rates run from
 * Brevard's 13.77 to Broward's 19.86 — a 44% spread — so that placeholder could
 * be wrong by a third in either direction on any given property.
 *
 * That was tolerable for the file/refuse DECISION (a sensitivity test showed the
 * outcome barely moves across the whole 13-23 range) but never acceptable for
 * showing a homeowner "you would save $1,620".
 *
 * ============================================================================
 * SCHOOL AND NON-SCHOOL ARE SEPARATE, AND MUST STAY THAT WAY
 * ============================================================================
 * School millage is School Board Operating + School Board Debt Service.
 * Non-school is everything else: county government, MSTUs, municipal,
 * independent special districts.
 *
 * They are kept apart because Florida's caps apply differently: Save Our Homes
 * limits both, but the 10% non-homestead cap (s 193.1554) applies to non-school
 * levies ONLY. Collapse them into one rate and you lose the ability to tell a
 * non-homesteaded owner they can win — which is most of the serviceable market.
 *
 * ============================================================================
 * SOURCE AND VINTAGE
 * ============================================================================
 * Florida DOR "Millage and Taxes Levied Report", 2025:
 *   https://floridarevenue.com/property/Documents/millage_taxes_levied.xlsx
 *
 * These are 2025 rates against a 2026 preliminary assessment roll. That is not
 * a mismatch to fix — 2026 millage is not set until each taxing authority adopts
 * it in September, after TRIM notices go out. 2025 is the most recent adopted
 * rate and the correct basis for an estimate made today. Re-run the extraction
 * when the 2026 report publishes.
 *
 * County numbers are the DOR codes used in the NAL (11-77, alphabetical),
 * verified against all 67 loaded counties.
 *
 * GENERATED FILE — re-extract rather than hand-editing.
 */

export const MILLAGE_YEAR = 2025;

export const COUNTY_MILLAGE = {
  11: { name: 'Alachua', school: 6.251, nonSchool: 14.6384 },
  12: { name: 'Baker', school: 5.325, nonSchool: 9.2881 },
  13: { name: 'Bay', school: 5.337, nonSchool: 7.3596 },
  14: { name: 'Bradford', school: 5.366, nonSchool: 11.2072 },
  15: { name: 'Brevard', school: 5.31, nonSchool: 8.4569 },
  16: { name: 'Broward', school: 6.4845, nonSchool: 13.3793 },
  17: { name: 'Calhoun', school: 5.223, nonSchool: 10.111 },
  18: { name: 'Charlotte', school: 6.496, nonSchool: 9.1803 },
  19: { name: 'Citrus', school: 5.351, nonSchool: 10.1248 },
  20: { name: 'Clay', school: 6.272, nonSchool: 9.0746 },
  21: { name: 'Collier', school: 4.249, nonSchool: 5.5695 },
  22: { name: 'Columbia', school: 5.349, nonSchool: 9.3351 },
  23: { name: 'Dade', school: 6.633, nonSchool: 11.8563 },
  24: { name: 'DeSoto', school: 5.281, nonSchool: 10.6509 },
  25: { name: 'Dixie', school: 5.41, nonSchool: 14.4632 },
  26: { name: 'Duval', school: 6.34, nonSchool: 11.551 },
  27: { name: 'Escambia', school: 5.359, nonSchool: 8.7726 },
  28: { name: 'Flagler', school: 5.349, nonSchool: 11.8061 },
  29: { name: 'Franklin', school: 4.192, nonSchool: 6.4083 },
  30: { name: 'Gadsden', school: 5.248, nonSchool: 10.8943 },
  31: { name: 'Gilchrist', school: 5.398, nonSchool: 10.1317 },
  32: { name: 'Glades', school: 5.329, nonSchool: 13.0442 },
  33: { name: 'Gulf', school: 5.322, nonSchool: 6.8978 },
  34: { name: 'Hamilton', school: 5.533, nonSchool: 9.6785 },
  35: { name: 'Hardee', school: 5.252, nonSchool: 8.8724 },
  36: { name: 'Hendry', school: 5.346, nonSchool: 11.8272 },
  37: { name: 'Hernando', school: 6.265, nonSchool: 8.3045 },
  38: { name: 'Highlands', school: 5.352, nonSchool: 9.1696 },
  39: { name: 'Hillsborough', school: 6.34, nonSchool: 12.5153 },
  40: { name: 'Holmes', school: 5.134, nonSchool: 10.2775 },
  41: { name: 'Indian River', school: 5.753, nonSchool: 8.4129 },
  42: { name: 'Jackson', school: 5.368, nonSchool: 8.8957 },
  43: { name: 'Jefferson', school: 5.296, nonSchool: 8.5714 },
  44: { name: 'Lafayette', school: 5.386, nonSchool: 10.8371 },
  45: { name: 'Lake', school: 6.085, nonSchool: 9.5474 },
  46: { name: 'Lee', school: 5.319, nonSchool: 8.6777 },
  47: { name: 'Leon', school: 5.366, nonSchool: 12.4343 },
  48: { name: 'Levy', school: 5.332, nonSchool: 10.7079 },
  49: { name: 'Liberty', school: 5.38, nonSchool: 9.7944 },
  50: { name: 'Madison', school: 5.334, nonSchool: 9.8328 },
  51: { name: 'Manatee', school: 6.304, nonSchool: 8.2484 },
  52: { name: 'Marion', school: 6.32, nonSchool: 9.5638 },
  53: { name: 'Martin', school: 5.177, nonSchool: 10.8828 },
  54: { name: 'Monroe', school: 2.947, nonSchool: 5.2891 },
  55: { name: 'Nassau', school: 6.191, nonSchool: 9.8649 },
  56: { name: 'Okaloosa', school: 5.377, nonSchool: 6.9003 },
  57: { name: 'Okeechobee', school: 5.384, nonSchool: 9.0517 },
  58: { name: 'Orange', school: 6.449, nonSchool: 10.961 },
  59: { name: 'Osceola', school: 5.306, nonSchool: 9.6678 },
  60: { name: 'Palm Beach', school: 6.321, nonSchool: 11.1708 },
  61: { name: 'Pasco', school: 6.274, nonSchool: 10.9428 },
  62: { name: 'Pinellas', school: 6.293, nonSchool: 12.2011 },
  63: { name: 'Polk', school: 5.29, nonSchool: 10.1478 },
  64: { name: 'Putnam', school: 6.865, nonSchool: 10.8492 },
  65: { name: 'Saint Johns', school: 6.272, nonSchool: 7.7018 },
  66: { name: 'Saint Lucie', school: 6.296, nonSchool: 15.261 },
  67: { name: 'Santa Rosa', school: 5.414, nonSchool: 6.3031 },
  68: { name: 'Sarasota', school: 6.095, nonSchool: 6.6577 },
  69: { name: 'Seminole', school: 5.249, nonSchool: 10.099 },
  70: { name: 'Sumter', school: 4.912, nonSchool: 6.2932 },
  71: { name: 'Suwannee', school: 5.415, nonSchool: 10.2461 },
  72: { name: 'Taylor', school: 5.637, nonSchool: 9.7956 },
  73: { name: 'Union', school: 5.454, nonSchool: 11.2625 },
  74: { name: 'Volusia', school: 5.279, nonSchool: 12.1379 },
  75: { name: 'Wakulla', school: 5.427, nonSchool: 8.0151 },
  76: { name: 'Walton', school: 4.261, nonSchool: 4.8902 },
  77: { name: 'Washington', school: 5.33, nonSchool: 9.634 },
};

/**
 * Millage for a county number, or null when unknown.
 *
 * Returns null rather than a default on purpose. A caller that silently
 * substitutes an average produces a dollar figure indistinguishable from a
 * computed one, and the whole point of this file is that the customer-facing
 * number stops being a guess. Callers should present "we cannot estimate the
 * dollars for this county" instead.
 */
export function millageForCounty(coNo) {
  const m = COUNTY_MILLAGE[Number(coNo)];
  return m ? { school: m.school, nonSchool: m.nonSchool, year: MILLAGE_YEAR, county: m.name } : null;
}

export default { COUNTY_MILLAGE, millageForCounty, MILLAGE_YEAR };
