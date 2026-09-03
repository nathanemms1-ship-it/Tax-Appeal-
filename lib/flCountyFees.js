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
  // No count in this comment on purpose. It has read 56, 58 and 60 in a single day and a
  // typed number here is wrong the moment a county is confirmed. getServiceCoverage()
  // counts BOTH gates from this file and flVabAddresses.js, and every surface that
  // publishes a figure reads it from there. `npm run build` prints the current number.
  // PAYEE CORRECTED 2026-08-20. We held "Board of County Commissioners"; the county
  // publishes "Cash, money orders, checks (made payable to the Clerk of Court)".
  // The BOCC does not collect this fee — that string named the wrong entity outright,
  // not merely the wrong wording, so a cheque would have come back.
  // alachuacounty.us/Depts/Clerk/VAB/pages/valueadjustmentboard.aspx
  //
  // ⚠️ THE FEE IS WEAKER THAN THIS "confirmed" SUGGESTS. Alachua publishes no standard
  // single-parcel figure anywhere. The $50 is inferred from their joint-petition floor
  // ("no less than $50 per petition") plus a vab.alachuaclerk.org page that said
  // "$50.00 per petition" — and that portal is headed "Tax Year 2025" and now errors.
  // The inference is sound and matches the cap, but nobody has read $50 off a 2026
  // Alachua page. CORROBORATE BY PHONE (352) 374-3605.
  "Alachua": { vabFee: 5000, confidence: "confirmed", payableTo: "Clerk of Court" },
  "Baker": { vabFee: 1500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Bay": { vabFee: 5000, confidence: "confirmed", payableTo: "Bay County Clerk of the VAB" },
  // PAYEE CORRECTED 13 Aug 2026. The Clerk publishes it verbatim — "checks (made payable
  // to the Clerk of Court)" — and we held "Board of County Commissioners". Kept as the
  // literal published string rather than expanded to "Bradford County Clerk of Court":
  // the rule is the payee as they write it, and we have no evidence for the longer form.
  // https://bradfordclerk.com/value-adjustment-board/fees-charged-to-file-your-petition/
  "Bradford": { vabFee: 5000, confidence: "confirmed", payableTo: "Clerk of Court" },
  // CORRECTED 2026-08-20: 45 -> 50. $45 matched no published Brevard figure at all — it
  // is neither the old $15 cap nor the new $50 one, so this was not a stale-cap error
  // but an invented number that has been sitting here marked "confirmed" since.
  //
  // THE COUNTY CONTRADICTS ITSELF, AND YOU SHOULD KNOW WHICH SIDE WE TOOK.
  // brevardclerk.us/file-a-petition: "There is a $50.00 filing fee for each separate
  // parcel of real property or tangible personal property." The Clerk collects the fee,
  // so the Clerk is the party that would reject a short cheque. Its OWN 2026 Axia portal
  // still says "$15.00 per single parcel" and cites Rule 12D-9 — the rule that recites
  // the cap Ch. 2025-208 superseded. s. 194.013(1) now allows up to $50.
  //
  // We take the Clerk page. Overpaying by $35 still files; underpaying is rejected and
  // Florida counts receipt, so the owner finds out with no way to refile. PHONE-CONFIRM
  // before volume goes through Brevard.
  "Brevard": { vabFee: 5000, confidence: "confirmed", payableTo: "Brevard Clerk of Courts" },
  // ✅ 2026-08-13 RESOLVED. The $25 is now supported by Broward's own words, and the TY2026
  // portal that was down on 30 July is up:
  //
  //   "At the February 9, 2026, Value Adjustment Board (VAB) meeting, the Board approved
  //    the filing fee of $25.00 per petition to take effect starting March 01, 2026."
  //   — broward.org/VAB/Pages/FilingAPetition.aspx and .../Welcome.aspx, both
  //
  // That also explains the $15 the 30 July sweep found and could not reconcile: $15 was
  // TY2025's fee, still live on the archived axiaweb2025 portal. We were comparing this
  // year's number against last year's page. **A stale portal is not an absence of
  // evidence — it is evidence about a different year.** Check the year on the page.
  //
  // Broward's TY2026 window is also its own: filing opens 17 Aug 2026 (a week before our
  // 24 Aug), deadline 18 Sept — bcvab.broward.org/axiaweb2026.
  //
  // STILL UNVERIFIED: the payee "Broward County VAB" appears on no official page. Checked
  // broward.org/VAB (Welcome, Filing, FAQ), bcpa.net, and both e-filing portals. This is
  // now the only open question on Florida's second-largest county — 954-357-7205.
  "Broward": { vabFee: 2500, confidence: "confirmed", payableTo: "Broward County VAB" },
  "Calhoun": { vabFee: 1500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  // CORRECTED 2026-08-19: 15 -> 50. SAME FAILURE AS DeSoto ABOVE, found the same way.
  // The Clerk's own 2026 VAB portal states "$50.00" plus a 3.5% convenience fee:
  // webapps.charlotteclerk.com/VAB2026/ (fetched 19 Aug 2026). This entry was marked
  // "confirmed" at $15, so send-letter would have mailed a $15 cheque into a $50
  // county — an INCOMPLETE petition under 12D-9.015(12)(b)4. The customer pays, we
  // mail, and nothing is filed.
  //
  // Found by re-deriving the whole table against 21 counties' published 2026 fees:
  // 19 of 21 matched, Charlotte was low, Orange was high (see its entry). Charlotte
  // matters because its 15 Sept deadline gives it one of the longest selling windows
  // in the state — it is genuinely sellable, unlike most of the counties we block.
  //
  // THE PATTERN, NOW SEEN TWICE: `confidence: "confirmed"` records that somebody
  // checked once. It carries no date and nothing re-derives it, so a county that
  // raises its fee under HB 7031 goes silently wrong. See the REVIEW REMINDER above.
  "Charlotte": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Citrus": { vabFee: 1500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Clay": { vabFee: 3500, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  // 2026-07-30: fee verified; PAYEE IS NOT PUBLISHED ANYWHERE on official pages —
  // the value below is unverified. Confirm by phone (239-252-1029) before relying on it.
  "Collier": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  // CORRECTED BY PHONE 2026-08-06: 15 -> 50. This entry was marked "confirmed" at $15
  // and was wrong. HB 7031 raised the s. 194.013(1) cap from $15 to $50 effective
  // 1 July 2025 and DeSoto adopted it. An underpaid filing fee gets the petition
  // rejected, which is the failure that costs a homeowner the year.
  "DeSoto": { vabFee: 5000, confidence: "confirmed", payableTo: "DeSoto County Board of Commissioners" },
  // 2026-07-30: was 1500. Duval adopted the HB 7031 cap. jacksonville.gov VAB "Fees and
  // Charges": "the filing fee is $50.00 for the first parcel and $5.00 for each additional
  // parcel listed". A $15 check against a $50 fee is a rejected petition in Florida's
  // largest-by-area market, and the rejection lands after the receipt deadline.
  "Duval": { vabFee: 5000, confidence: "confirmed", payableTo: "Duval County Tax Collector" },
  "Escambia": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  // PAYEE narrowed 2026-08-20 to the literal published string: "Please make checks
  // payable to: Clerk of Court". We held "Flagler County Clerk of Court" — the expanded
  // form, which this file's rule says not to invent. Fee confirmed the same day:
  // "A nonrefundable filing fee of $50 per parcel must accompany each petition."
  // Their counter closes 4:30 PM, not 5:00 — earlier than most, and it is the receipt
  // that counts. flaglerclerk.gov/vab/
  "Flagler": { vabFee: 5000, confidence: "confirmed", payableTo: "Clerk of Court" },
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
  // PAYEE CORRECTED 2026-08-20. Lake names the OFFICEHOLDER, not the office, and
  // publishes it verbatim: 'Please make checks and money orders payable to "Gary J.
  // Cooney, Clerk of the Circuit Court & Comptroller."' We held the office form.
  //
  // Kept exactly as they write it, including the personal name, per this file's rule
  // that the payee is the string the county prints. That does create a maintenance
  // edge nothing else here has — this entry goes stale at an ELECTION rather than at a
  // fee change, and no re-derivation will catch it. Re-read the Clerk's VAB page after
  // any Lake County clerk election.
  // lakecountyclerkfl.gov/departments/executive-office/value-adjustment-board/
  "Lake": { vabFee: 5000, confidence: "confirmed", payableTo: "Gary J. Cooney, Clerk of the Circuit Court & Comptroller" },
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
  // ⚠️ DOWNGRADED 2026-08-20, confirmed -> estimated. NOT corrected, because there is
  // nothing to correct it TO.
  //
  // Santa Rosa's DATE was confirmed on 20 Aug (14 Sept, off two TRIM notices at
  // parcelview.srcpa.gov/trims/) and was DELIBERATELY WITHHELD from FL_COUNTY_DATES so
  // this county stays unsellable. This entry is why.
  //
  // The Clerk publishes no VAB fee at all — santarosaclerk.com has one VAB page and it
  // is a meeting notice. The only figure anywhere in the county is on the PA's site:
  // "There will be a $15.00 fee payable at filing", in an UNDATED paragraph whose page
  // is otherwise stamped 2026. $15 is the OLD s. 194.013(1) cap, superseded by
  // Ch. 2025-208, which allows up to $50.
  //
  // That is the Charlotte signature exactly — a stale-cap $15 sitting under
  // confidence:"confirmed", caught on 6 Aug only because somebody phoned. Nobody has
  // phoned Santa Rosa. The payee is not published either, so "Board of County
  // Commissioners" is a guess on top of a guess.
  //
  // CALL (850) 983-1928, THEN restore confidence and add the 14 Sept date. Until then
  // the county is dark on purpose, and that is the cheap failure: a $35-short cheque is
  // rejected on receipt with no way to refile.
  "Santa Rosa": { vabFee: 1500, confidence: "estimated", payableTo: "Board of County Commissioners" },
  // Payee CONFIRMED BY PHONE 2026-08-06: "Board of County Commissioners", NOT the
  // Clerk of Court that the Clerk's own VAB page implied. A cheque to the wrong payee
  // cannot be deposited, so the phone answer governs.
  "Sarasota": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
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
  // CONFIRMED BY PHONE 13 Aug 2026 (Nathan). $50, payee as we already held it. The address
  // was NOT as we held it — see the Room 214 correction in lib/flVabAddresses.js.
  "Columbia": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
  "Dixie": { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Franklin": { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Gadsden": { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Gilchrist": { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  "Levy": { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  // Stays `estimated` on purpose — see the long note on Madison in
  // lib/flVabAddresses.js. Called 13 Aug 2026; the clerk could not confirm the
  // fee or the payee. Written confirmation only.
  "Madison": { vabFee: 5000, confidence: "estimated", payableTo: "Board of County Commissioners" },
  // CONFIRMED BY PHONE 13 Aug 2026 (Nathan). $50, and the payee is the CLERK, not the
  // Board of County Commissioners we had guessed — a cheque to the BOCC would have been
  // the wrong payee on every Nassau petition, in the largest of the three counties that
  // were blocked on fee alone. The county's own VAB page routes all VAB enquiries to the
  // "Nassau County Clerk of Courts" (vab@nassauclerk.com), which corroborates it.
  //
  // ONE LOOSE END, DELIBERATELY RECORDED: the phone answer was written down as "Nassau
  // County Clerk Of Ct". "Of Ct" is an abbreviation, expanded here to the entity name the
  // county and our own vabName both use. If a written confirmation ever says "Clerk of
  // Court" singular, change this string — do not assume the abbreviation was harmless.
  "Nassau": { vabFee: 5000, confidence: "confirmed", payableTo: "Nassau County Clerk of Courts" },
  // CORRECTED 2026-09-01. The held payee "St. Lucie County Clerk" was marked
  // confirmed and was WRONG. St. Lucie VAB returned a live customer's petition
  // and cheque uncashed: "The check is to be made payable to Board of County
  // Commissioner (BOCC)." Confirmed independently on the county's own VAB
  // portal, slcvab.stlucieco.gov/axiaweb2026 — "made payable to Board of County
  // Commissioners". Same Clerk-vs-BOCC error Sarasota turned out to have.
  "St. Lucie": { vabFee: 5000, confidence: "confirmed", payableTo: "Board of County Commissioners" },
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
