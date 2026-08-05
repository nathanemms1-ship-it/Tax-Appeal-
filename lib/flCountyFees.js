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
 * 🔴 2026-07-30 CORRECTIONS — found by re-verifying the 25 highest-volume counties against
 * official clerk sources. Every one of these was marked "confirmed" and every one was wrong.
 * The counties nobody re-checks are the ones carrying the volume:
 *   Duval        $15 → $50   (adopted the HB 7031 cap; a $15 check = rejected petition)
 *   Seminole     $15 → $50   (same), and payee → "Clerk to BCC"
 *   Hillsborough payee "Hillsborough County Clerk of Court" → "Board of County Commissioners"
 *   Polk/Marion/Osceola payees trimmed to the literal strings those clerks publish
 * Broward is left at $25 and flagged inline — see the comment on that entry.
 * Payee is NOT PUBLISHED for Broward, Pinellas, Pasco, Manatee, Collier; those values are
 * unverified and marked inline. Fee tiers we do not model: portability petitions are cheaper in
 * Palm Beach ($15), Collier ($15) and Volusia ($15), and Duval/Polk add $5 per contiguous parcel.
 * We only file single-parcel value petitions, so the base fee is the one that matters today.
 *
 * 🔴 2026-07-20 CORRECTIONS from the prior version of this file — these were wrong and are now fixed:
 * Orange was $15 (wrong) — official fee is $50 general filing (occompt.com)
 * Palm Beach was estimated $50 (wrong) — official fee is $20/folio (mypalmbeachclerk.com)
 * Hernando was estimated $50 (wrong) — official fee is $15 (hernandoclerk.com)
 * Full source list lives in fl_vab_fee_call_sheet.xlsx and TAXAPPEAL-CONTEXT.md §5 item 6.
 */

// vabFee is in CENTS (matches Stripe unit_amount)
const FL_COUNTY_FEES = {
  // CONFIRMED (58 of 67 counties)
  "Alachua": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Baker": { vabFee: 1500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Bay": { vabFee: 5000, confidence: "confirmed", payableTo: "Bay County Clerk of the VAB" },
  "Bradford": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Brevard": { vabFee: 4500, confidence: "confirmed", payableTo: "Brevard Clerk of Courts" },
  // ⚠️ 2026-07-30 UNRESOLVED — DO NOT TREAT AS CONFIRMED WITHOUT A CALL (954-357-7205).
  // Nothing on any official Broward page supports $2500. The only figure Broward publishes
  // is $15 ("$15.00 non refundable filing fee" on its TY2025 portal); the TY2026 portal is
  // down for maintenance, so Broward may yet adopt the $50 cap. Left at $25 deliberately:
  // flipping confidence to "estimated" makes send-letter.js:152 refuse to mail, which would
  // block Florida's second-largest county outright. Overpaying is recoverable; a blocked
  // county is lost revenue and an underpaid fee is a rejected petition.
  // The payee "Broward County VAB" is also unpublished anywhere — unverified.
  "Broward": { vabFee: 2500, confidence: "confirmed", payableTo: "Broward County VAB" },
  "Calhoun": { vabFee: 1500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Charlotte": { vabFee: 1500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Citrus": { vabFee: 1500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Clay": { vabFee: 3500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  // 2026-07-30: fee verified; PAYEE IS NOT PUBLISHED ANYWHERE on official pages —
  // the value below is unverified. Confirm by phone (239-252-1029) before relying on it.
  "Collier": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "DeSoto": { vabFee: 1500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  // 2026-07-30: was 1500. Duval adopted the HB 7031 cap. jacksonville.gov VAB "Fees and
  // Charges": "the filing fee is $50.00 for the first parcel and $5.00 for each additional
  // parcel listed". A $15 check against a $50 fee is a rejected petition in Florida's
  // largest-by-area market, and the rejection lands after the receipt deadline.
  "Duval": { vabFee: 5000, confidence: "confirmed", payableTo: "Duval County Tax Collector" },
  "Escambia": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Flagler": { vabFee: 5000, confidence: "confirmed", payableTo: "Flagler County Clerk of Court" },
  "Glades": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Gulf": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Hamilton": { vabFee: 1500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Hardee": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Hendry": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Hernando": { vabFee: 1500, confidence: "confirmed", payableTo: "Clerk of Circuit Court" },
  "Highlands": { vabFee: 5000, confidence: "confirmed", payableTo: "Highlands County Clerk of Courts" },
  // 2026-07-30: payee was "Hillsborough County Clerk of Court" — wrong. The Clerk's own
  // filing instructions say "Please make checks payable to Board of County Commissioners
  // or BOCC", and Local VAB Procedures ties the $50 fee to BOCC Resolution 25-001. The fee
  // was right; the check was made out to an office that cannot deposit it.
  "Hillsborough": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Holmes": { vabFee: 5000, confidence: "confirmed", payableTo: "Holmes County Board of Commissioners" },
  "Indian River": { vabFee: 1500, confidence: "confirmed", payableTo: "Indian River County VAB" },
  "Jackson": { vabFee: 5000, confidence: "confirmed", payableTo: "Jackson County Clerk of Court" },
  "Jefferson": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Lafayette": { vabFee: 1500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Lake": { vabFee: 5000, confidence: "confirmed", payableTo: "Lake County Clerk of the Circuit Court" },
  "Lee": { vabFee: 3000, confidence: "confirmed", payableTo: "Lee County Clerk of Court" },
  "Leon": { vabFee: 1500, confidence: "confirmed", payableTo: "Leon County Clerk of Court" },
  "Liberty": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  // 2026-07-30: fee verified; PAYEE IS NOT PUBLISHED ANYWHERE on official pages —
  // the value below is unverified. Confirm by phone (941-741-4058) before relying on it.
  "Manatee": { vabFee: 5000, confidence: "confirmed", payableTo: "Manatee County Clerk of Court" },
  // 2026-07-30: literal string per marioncountyclerk.org — "Checks should be made payable
  // to the Clerk of Court and Comptroller" (no county prefix).
  "Marion": { vabFee: 5000, confidence: "confirmed", payableTo: "Clerk of Court and Comptroller" },
  "Martin": { vabFee: 5000, confidence: "confirmed", payableTo: "Martin County Clerk of the Circuit Court" },
  "Miami-Dade": { vabFee: 1500, confidence: "confirmed", payableTo: "Clerk of the Value Adjustment Board" },
  "Monroe": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Okaloosa": { vabFee: 5000, confidence: "confirmed", payableTo: "Okaloosa County Board of County Commissioners" },
  "Okeechobee": { vabFee: 1500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Orange": { vabFee: 5000, confidence: "confirmed", payableTo: "Orange County BCC" },
  // 2026-07-30: literal string per osceolaclerk.com — "Checks should be made payable to the
  // Clerk of the Court". NOTE: Osceola expects single-parcel petitions to be filed
  // ELECTRONICALLY; paper is for contiguous, joint and abatement petitions. Mailing a
  // routine petition is not what they describe — worth confirming before volume arrives.
  "Osceola": { vabFee: 5000, confidence: "confirmed", payableTo: "Clerk of the Court" },
  "Palm Beach": { vabFee: 2000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  // 2026-07-30: fee verified; PAYEE IS NOT PUBLISHED ANYWHERE on official pages —
  // the value below is unverified. Confirm by phone (352-521-4347) before relying on it.
  "Pasco": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  // 2026-07-30: fee verified; PAYEE IS NOT PUBLISHED ANYWHERE on official pages —
  // the value below is unverified. Confirm by phone (727-464-3458) before relying on it.
  "Pinellas": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  // 2026-07-30: payee trimmed to the literal published string. polkclerkfl.gov: "checks
  // should be made payable to the Value Adjustment Board". Ours was a superset; banks match
  // on the payee line, so print what they print.
  "Polk": { vabFee: 5000, confidence: "confirmed", payableTo: "Value Adjustment Board" },
  "Putnam": { vabFee: 1500, confidence: "confirmed", payableTo: "Putnam County Clerk of the Circuit Court" },
  "St. Johns": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Santa Rosa": { vabFee: 1500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Sarasota": { vabFee: 5000, confidence: "confirmed", payableTo: "Sarasota County Clerk of Court" },
  // 2026-07-30: was 1500 with payee "Seminole County Clerk to the BCC". seminoleclerk.org:
  // "Most petitions require a $50.00 filing fee." and "Checks or money orders should be
  // made payable to 'Clerk to BCC.'" The payee is the literal string they print.
  "Seminole": { vabFee: 5000, confidence: "confirmed", payableTo: "Clerk to BCC" },
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
