/**
 * Florida VAB Filing Fees — All 67 Counties
 * Based on HB 7031 (effective July 1, 2025) which allows counties to adopt up to $50.
 *
 * Confidence levels:
 *   "confirmed" = verified directly from county VAB/clerk website
 *   "estimated" = unconfirmed; defaulted to $50 pending Aug 2026 review
 *
 * REVIEW REMINDER: Update all "estimated" entries before August 15, 2026.
 *
 * Confirmed sources (June 2026):
 *   Miami-Dade $15  — miamidadeclerk.gov
 *   Orange $15      — occompt.com
 *   Broward $25     — broward.org/VAB (adopted Feb 9, 2026)
 *   Lee $30         — leeclerk.org
 *   Clay $35        — clayclerk.com
 *   Hillsborough $50 — hillsclerk.com (effective 2025 season)
 *   Manatee $50     — manateeclerk.com (effective Aug 25, 2025)
 *   Pasco $50       — pascoclerk.com
 *   Sarasota $50    — sarasotaclerk.com
 *   Okaloosa $50    — okaloosaclerk.com
 *   Walton $50      — waltonclerk.com
 */

// vabFee is in CENTS (matches Stripe unit_amount)
const FL_COUNTY_FEES = {
  // CONFIRMED
  "Miami-Dade":   { vabFee: 1500, confidence: "confirmed", payableTo: "Clerk of the Value Adjustment Board" },
  "Orange":       { vabFee: 1500, confidence: "confirmed", payableTo: "Orange County BCC" },
  "Broward":      { vabFee: 2500, confidence: "confirmed", payableTo: "Broward County VAB" },
  "Lee":          { vabFee: 3000, confidence: "confirmed", payableTo: "Lee County Clerk of Court" },
  "Clay":         { vabFee: 3500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Hillsborough": { vabFee: 5000, confidence: "confirmed", payableTo: "Hillsborough County Clerk of Court" },
  "Manatee":      { vabFee: 5000, confidence: "confirmed", payableTo: "Manatee County Clerk of Court" },
  "Pasco":        { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Sarasota":     { vabFee: 5000, confidence: "confirmed", payableTo: "Sarasota County Clerk of Court" },
  "Okaloosa":     { vabFee: 5000, confidence: "confirmed", payableTo: "Okaloosa County Board of County Commissioners" },
  "Walton":       { vabFee: 5000, confidence: "confirmed", payableTo: "Walton County Board of County Commissioners" },
  // ESTIMATED — default $50 max per HB 7031, verify before Aug 15, 2026
  "Alachua":      { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Baker":        { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Bay":          { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Bradford":     { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Brevard":      { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Calhoun":      { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Charlotte":    { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Citrus":       { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Collier":      { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Columbia":     { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "DeSoto":       { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Dixie":        { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Duval":        { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Escambia":     { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Flagler":      { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Franklin":     { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Gadsden":      { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Gilchrist":    { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Glades":       { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Gulf":         { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Hamilton":     { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Hardee":       { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Hendry":       { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Hernando":     { vabFee: 5000, confidence: "estimated", payableTo: "Clerk of Circuit Court" },
  "Highlands":    { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Holmes":       { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Indian River": { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Jackson":      { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Jefferson":    { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Lafayette":    { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Lake":         { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Leon":         { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Levy":         { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Liberty":      { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Madison":      { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Marion":       { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Martin":       { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Monroe":       { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Nassau":       { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Okeechobee":   { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Osceola":      { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Palm Beach":   { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Pinellas":     { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Polk":         { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Putnam":       { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "St. Johns":    { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "St. Lucie":    { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Santa Rosa":   { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Seminole":     { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Sumter":       { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Suwannee":     { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Taylor":       { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Union":        { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Volusia":      { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Wakulla":      { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Washington":   { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
};

const DEFAULT_FL_VAB_FEE = 5000;

/**
 * Get VAB fee info for a Florida county.
 * @param {string} countyName - e.g. "Miami-Dade", "Hillsborough"
 * @returns {{ vabFee: number, confidence: string, payableTo: string }}
 */
export function getFlVabFee(countyName) {
  if (!countyName) return { vabFee: DEFAULT_FL_VAB_FEE, confidence: "estimated", payableTo: "Board of County Commissioners" };
  const clean = countyName.replace(/ County$/i, "").trim();
  return FL_COUNTY_FEES[clean] || { vabFee: DEFAULT_FL_VAB_FEE, confidence: "estimated", payableTo: "Board of County Commissioners" };
}

/**
 * Format vabFee cents as dollar string e.g. "$15", "$50"
 */
export function formatVabFee(cents) {
  return `$${(cents / 100).toFixed(0)}`;
}

export default FL_COUNTY_FEES;
