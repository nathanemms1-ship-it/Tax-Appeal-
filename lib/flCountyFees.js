/**
 * Florida VAB Filing Fees — All 67 Counties
 * Based on HB 7031 (effective July 1, 2025) which allows counties to adopt up to $50.
 *
 * Confidence levels:
 * "confirmed" = verified directly from county VAB/clerk website or official PDF (2026-07-20 sweep)
 * "estimated" = official page checked but does not publish a fee; defaulted to $50 pending a phone call
 *
 * REVIEW REMINDER: The 10 "estimated" counties below need one phone call each to confirm
 * (numbers in fl_vab_fee_call_sheet.xlsx) — do this before Aug 15, 2026 TRIM season.
 *
 * 🔴 2026-07-20 CORRECTIONS from the prior version of this file — these were wrong and are now fixed:
 * Orange was $15 (wrong) — official fee is $50 general filing (occompt.com)
 * Palm Beach was estimated $50 (wrong) — official fee is $20/folio (mypalmbeachclerk.com)
 * Hernando was estimated $50 (wrong) — official fee is $15 (hernandoclerk.com)
 * Full source list lives in fl_vab_fee_call_sheet.xlsx and TAXAPPEAL-CONTEXT.md §5 item 6.
 */

// vabFee is in CENTS (matches Stripe unit_amount)
const FL_COUNTY_FEES = {
  // CONFIRMED (57 of 67 counties)
  "Alachua": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Baker": { vabFee: 1500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Bay": { vabFee: 5000, confidence: "confirmed", payableTo: "Bay County Clerk of the VAB" },
  "Bradford": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Brevard": { vabFee: 4500, confidence: "confirmed", payableTo: "Brevard Clerk of Courts" },
  "Broward": { vabFee: 2500, confidence: "confirmed", payableTo: "Broward County VAB" },
  "Calhoun": { vabFee: 1500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Charlotte": { vabFee: 1500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Citrus": { vabFee: 1500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Clay": { vabFee: 3500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Collier": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "DeSoto": { vabFee: 1500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Duval": { vabFee: 1500, confidence: "confirmed", payableTo: "Duval County Tax Collector" },
  "Escambia": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Flagler": { vabFee: 5000, confidence: "confirmed", payableTo: "Flagler County Clerk of Court" },
  "Glades": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Gulf": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Hamilton": { vabFee: 1500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Hardee": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Hendry": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Hernando": { vabFee: 1500, confidence: "confirmed", payableTo: "Clerk of Circuit Court" },
  "Highlands": { vabFee: 5000, confidence: "confirmed", payableTo: "Highlands County Clerk of Courts" },
  "Hillsborough": { vabFee: 5000, confidence: "confirmed", payableTo: "Hillsborough County Clerk of Court" },
  "Holmes": { vabFee: 5000, confidence: "confirmed", payableTo: "Holmes County Board of Commissioners" },
  "Indian River": { vabFee: 1500, confidence: "confirmed", payableTo: "Indian River County VAB" },
  "Jackson": { vabFee: 5000, confidence: "confirmed", payableTo: "Jackson County Clerk of Court" },
  "Jefferson": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Lafayette": { vabFee: 1500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Lake": { vabFee: 5000, confidence: "confirmed", payableTo: "Lake County Clerk of the Circuit Court" },
  "Lee": { vabFee: 3000, confidence: "confirmed", payableTo: "Lee County Clerk of Court" },
  "Leon": { vabFee: 1500, confidence: "confirmed", payableTo: "Leon County Clerk of Court" },
  "Liberty": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Manatee": { vabFee: 5000, confidence: "confirmed", payableTo: "Manatee County Clerk of Court" },
  "Marion": { vabFee: 5000, confidence: "confirmed", payableTo: "Marion County Clerk of Court and Comptroller" },
  "Martin": { vabFee: 5000, confidence: "confirmed", payableTo: "Martin County Clerk of the Circuit Court" },
  "Miami-Dade": { vabFee: 1500, confidence: "confirmed", payableTo: "Clerk of the Value Adjustment Board" },
  "Monroe": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Okaloosa": { vabFee: 5000, confidence: "confirmed", payableTo: "Okaloosa County Board of County Commissioners" },
  "Okeechobee": { vabFee: 1500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Orange": { vabFee: 5000, confidence: "confirmed", payableTo: "Orange County BCC" },
  "Osceola": { vabFee: 5000, confidence: "confirmed", payableTo: "Osceola County Clerk of Court" },
  "Palm Beach": { vabFee: 2000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Pasco": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Pinellas": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Polk": { vabFee: 5000, confidence: "confirmed", payableTo: "Polk County Value Adjustment Board" },
  "Putnam": { vabFee: 1500, confidence: "confirmed", payableTo: "Putnam County Clerk of the Circuit Court" },
  "St. Johns": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Santa Rosa": { vabFee: 1500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Sarasota": { vabFee: 5000, confidence: "confirmed", payableTo: "Sarasota County Clerk of Court" },
  "Seminole": { vabFee: 1500, confidence: "confirmed", payableTo: "Seminole County Clerk to the BCC" },
  "Sumter": { vabFee: 3500, confidence: "confirmed", payableTo: "Sumter County Clerk" },
  "Suwannee": { vabFee: 5000, confidence: "confirmed", payableTo: "Suwannee County Clerk of the Value Adjustment Board" },
  "Taylor": { vabFee: 1500, confidence: "confirmed", payableTo: "Taylor County Clerk of Court" },
  "Volusia": { vabFee: 4000, confidence: "confirmed", payableTo: "County of Volusia" },
  "Wakulla": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Walton": { vabFee: 5000, confidence: "confirmed", payableTo: "Walton County Board of County Commissioners" },
  "Washington": { vabFee: 5000, confidence: "confirmed", payableTo: "Washington County Board of County Commissioners" },
  // ESTIMATED — official page checked but no fee published; call to confirm (see header note)
  "Columbia": { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Dixie": { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Franklin": { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Gadsden": { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Gilchrist": { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Levy": { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Madison": { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Nassau": { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "St. Lucie": { vabFee: 5000, confidence: "confirmed", payableTo: "St. Lucie County Clerk" },
  "Union": { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
};

const DEFAULT_FL_VAB_FEE = 5000;

/**
 * Get VAB fee info for a Florida county.
 * @param {string} countyName - e.g. "Miami-Dade", "Hillsborough"
 * @returns {{ vabFee: number, confidence: string, payableTo: string }}
 */
// Must match lib/flVabAddresses.js normalizeCounty. Without this, "Dade County"
// or "MIAMI-DADE" resolved to a valid ADDRESS but missed the fee table, silently
// defaulting to $50 payable to "Board of County Commissioners" — a payee that does
// not exist in Miami-Dade and cannot deposit the check.
function normalizeCounty(countyName) {
  if (!countyName) return "";
  const c = String(countyName).replace(/\s+County$/i, "").trim();
  const aliases = {
    "saint johns": "St. Johns", "st johns": "St. Johns", "st. johns": "St. Johns",
    "saint lucie": "St. Lucie", "st lucie": "St. Lucie", "st. lucie": "St. Lucie",
    "miami dade": "Miami-Dade", "miami-dade": "Miami-Dade", "miamidade": "Miami-Dade", "dade": "Miami-Dade",
    "desoto": "DeSoto", "de soto": "DeSoto",
    "indian river": "Indian River", "palm beach": "Palm Beach", "santa rosa": "Santa Rosa",
  };
  const key = c.toLowerCase();
  if (aliases[key]) return aliases[key];
  // Title-case each ALPHA RUN, not each whitespace-delimited token. `\w\S*`
  // swallowed the hyphen, so "Miami-Dade" normalized to "Miami-dade" — which
  // matched no key in either table, so getFlVabAddress returned null and Florida's
  // LARGEST county was hard-blocked at checkout as "not verified".
  return c.replace(/[A-Za-z]+/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

export function getFlVabFee(countyName) {
  const fallback = { vabFee: DEFAULT_FL_VAB_FEE, confidence: "estimated", payableTo: "Board of County Commissioners" };
  if (!countyName) return fallback;
  return FL_COUNTY_FEES[normalizeCounty(countyName)] || fallback;
}

/**
 * Format vabFee cents as dollar string e.g. "$15", "$50"
 */
export function formatVabFee(cents) {
  return `$${(cents / 100).toFixed(0)}`;
}

export default FL_COUNTY_FEES;
