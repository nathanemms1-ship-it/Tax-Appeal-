// lib/filingWindows.js
//
// Single source of truth for state/county property-tax filing-window dates.
// Imported by pages/apply.js (customer-facing gate), pages/api/cron/notify-waitlist.js
// (waitlist notifications), and pages/api/cron/process-queued-orders.js (pre-order
// fulfillment). Before this file existed, apply.js and notify-waitlist.js each had
// their own copy and had already drifted (FL open date Aug 11 vs Aug 15, and AR/AL
// were missing entirely from the cron's copy). Change dates in exactly one place.

export const FILING_WINDOWS = {
  TX: { openMonth: 4, openDay: 1, closeMonth: 5, closeDay: 31, hardMonth: 5, hardDay: 15, minDays: 3, receiptRequired: false },
  GA: {
    openMonth: 4, openDay: 1, closeMonth: 7, closeDay: 15, hardMonth: 7, hardDay: 15, minDays: 3, receiptRequired: false,
    countyWindows: {
      "Fulton":   { openMonth: 5, openDay: 1,  closeMonth: 7, closeDay: 15 },
      "Cobb":     { openMonth: 5, openDay: 15, closeMonth: 7, closeDay: 15 },
      "Gwinnett": { openMonth: 4, openDay: 1,  closeMonth: 6, closeDay: 15 },
      "DeKalb":   { openMonth: 4, openDay: 1,  closeMonth: 6, closeDay: 1  },
      "Cherokee": { openMonth: 4, openDay: 15, closeMonth: 6, closeDay: 15 },
      "Forsyth":  { openMonth: 4, openDay: 15, closeMonth: 6, closeDay: 15 },
      "Hall":     { openMonth: 4, openDay: 15, closeMonth: 6, closeDay: 15 },
      "Henry":    { openMonth: 5, openDay: 1,  closeMonth: 6, closeDay: 30 },
      "Chatham":  { openMonth: 5, openDay: 1,  closeMonth: 6, closeDay: 30 },
      "Richmond": { openMonth: 4, openDay: 15, closeMonth: 6, closeDay: 15 },
      "Columbia": { openMonth: 4, openDay: 15, closeMonth: 6, closeDay: 15 },
      "Clayton":  { openMonth: 5, openDay: 1,  closeMonth: 6, closeDay: 30 },
      "Muscogee": { openMonth: 4, openDay: 15, closeMonth: 6, closeDay: 15 },
      "Bibb":     { openMonth: 4, openDay: 15, closeMonth: 6, closeDay: 15 },
      "Houston":  { openMonth: 4, openDay: 15, closeMonth: 6, closeDay: 15 },
      "Douglas":  { openMonth: 5, openDay: 1,  closeMonth: 6, closeDay: 30 },
      "Coweta":   { openMonth: 5, openDay: 1,  closeMonth: 6, closeDay: 30 },
      "Fayette":  { openMonth: 5, openDay: 1,  closeMonth: 6, closeDay: 30 },
      "Paulding": { openMonth: 5, openDay: 1,  closeMonth: 6, closeDay: 30 },
      "Lowndes":  { openMonth: 4, openDay: 15, closeMonth: 6, closeDay: 15 },
      "Bartow":   { openMonth: 5, openDay: 1,  closeMonth: 6, closeDay: 30 },
      "Clarke":   { openMonth: 4, openDay: 15, closeMonth: 6, closeDay: 15 },
      "Jackson":  { openMonth: 4, openDay: 15, closeMonth: 6, closeDay: 15 },
      "Walton":   { openMonth: 5, openDay: 1,  closeMonth: 6, closeDay: 30 },
      "Newton":   { openMonth: 5, openDay: 1,  closeMonth: 6, closeDay: 30 },
      "Rockdale": { openMonth: 5, openDay: 1,  closeMonth: 6, closeDay: 30 },
    },
  },
  AR: { openMonth: 6, openDay: 1, closeMonth: 8, closeDay: 10, hardMonth: 8, hardDay: 17, minDays: 7, receiptRequired: false },
  // FL open date moved Aug 11 -> Aug 24.
  //
  // The 2026 VAB petition deadline is confirmed as Sept 18 for Miami-Dade and
  // Orange. The statutory window is 25 days FROM the TRIM notice mailing, so
  // working back from Sept 18 puts TRIM mailing at ~Aug 24. Opening on Aug 11
  // meant we mailed petitions for ~13 days against assessments the county had not
  // yet noticed — premature filings that get returned, using the PRIOR year's
  // assessed value from BatchData, while the customer believed they were filed.
  //
  // This does NOT cost selling days: PRE_ORDER_DAYS (60) means orders still sell
  // from late June. They queue and dispatch on Aug 24 instead of Aug 11.
  // minDays raised 10 -> 12 on 6 Aug 2026, after a live Lob cheque reported its own
  // Expected Delivery Date Range as SEVEN TO FOURTEEN DAYS from creation. At 10, the
  // last dispatch was 8 Sept; at Lob's upper bound that petition arrives 22 Sept,
  // four days past a deadline Florida satisfies by physical RECEIPT — dismissed as
  // untimely, no recourse, no refund path.
  //
  // 12 gives 14 filing days (24 Aug - 6 Sept) and still leaves Lob's worst case two
  // days late, which is why the per-piece delivery check in pages/api/send-letter.js
  // exists: a static buffer is a guess, and Lob hands us its actual estimate for
  // every single cheque. Nathan's call, informed: 14 selling days.
  FL: { openMonth: 8, openDay: 24, closeMonth: 9, closeDay: 18, hardMonth: 9, hardDay: 18, minDays: 12, receiptRequired: true },
  AL: { openMonth: 4, openDay: 1, closeMonth: 8, closeDay: 17, hardMonth: 8, hardDay: 17, minDays: 7, receiptRequired: false },
};

// How many days before a window opens we start accepting "reserve your spot"
// pre-orders. Nathan's call (July 2026): 60 days — short enough that comps/
// assessed-value data won't go stale, long enough to smooth lead capture
// ahead of each state's season.
export const PRE_ORDER_DAYS = 60;

/**
 * ============================================================================
 * FLORIDA HAS NO STATEWIDE DEADLINE. IT NEVER DID.
 * ============================================================================
 * Added 13 Aug 2026 after sweeping all 67 Property Appraiser and Clerk sites.
 *
 * Fla. Stat. s.194.011(3)(d): a VAB petition is due on or before the 25th day
 * FOLLOWING THE MAILING of that county's TRIM notice. Every Property Appraiser
 * mails on its own schedule, so every county has its own deadline. The Sept 18
 * this file carried was never Florida's date — it is Miami-Dade's and Orange's,
 * and it became the whole state's by assumption.
 *
 * It is also close to the LATEST date in the state, which is what made the
 * assumption dangerous rather than merely wrong. Of the seventeen counties whose
 * 2026 date could be established, thirteen close EARLIER, clustered 5-14 Sept:
 *
 *   Hillsborough  7 Sept   <- Tampa. Eleven days earlier than we believed.
 *   Osceola       8 Sept
 *   Pinellas     11 Sept   <- ~1M people
 *   Polk         11 Sept
 *
 * WHY THIS TABLE IS KEYED ON THE TRIM MAILING DATE AND NOT THE DEADLINE.
 * Four counties publish both (Osceola, Pinellas, Polk, Clay) and in all four
 * deadline = mailing + 25 to the day. So the mailing date is the only number we
 * need, it is the one a Property Appraiser announces anyway, and deriving the
 * rest means the statute does the arithmetic instead of a person. `deadline` is
 * accepted for the counties that publish the deadline and not the mailing date.
 *
 * EVERY ENTRY IS 2026 AND THAT IS LOAD-BEARING. Roughly fifty counties still
 * showed no 2026 date on 13 Aug, and several were serving OLD years as current --
 * Calhoun and Okeechobee showing 2024 deadlines, Okaloosa and Charlotte showing
 * 2020 TRIM announcements. A stale page is not an absence of evidence, it is
 * evidence about a different year. Never carry one of those forward.
 */
export const PETITION_DAYS_AFTER_TRIM = 25;

export const FL_COUNTY_DATES = {
  // TRIM mailing date published by the county -> deadline derived as +25 days.
  // CORRECTED 19 Aug 2026, 11 Aug -> 17 Aug (deadline 5 Sept -> 11 Sept).
  // We held 11 Aug from sjcpa.gov/2026dates/, which says TRIM mails "on or about
  // August 11" — a PRE-SEASON ESTIMATE that was never updated. Two firmer St. Johns
  // sources disagree: sjcpa.gov/trim/ says "2026 TRIM Notices will be mailed on
  // August 17, 2026", and the Clerk (authoritative for the deadline) publishes
  // "September 11, 2026, the petition filing deadline date". 17 Aug + 25 = 11 Sept
  // exactly, so the two reconcile. AN "ON OR ABOUT" DATE IS NOT A DATE — it drove
  // FL_UNKNOWN_COUNTY_DEADLINE for a fortnight and cost this county six days.
  "St. Johns":    { trim: [8, 17], note: "sjcpa.gov/trim/ firm date; Clerk publishes 11 Sept deadline, +25 reconciles" },
  "Hillsborough": { trim: [8, 13], note: "PA press release 7 Aug 2026" },
  "Collier":      { trim: [8, 17], note: "collierappraiser.com TRIM page + Clerk's 11 Sept deadline; +25 exactly. Confirmed 18 Aug 2026" },
  "Volusia":      { trim: [8, 17], note: "volusia.org statutory notice published 4 Aug 2026; 11 Sept. Receipt required" },
  "Leon":         { trim: [8, 17], note: "vab.leonclerk.com/AxiaWeb2026 + leonpa.gov news 17 Aug 2026; 11 Sept. NOTE cvweb.leonclerk.com serves 2024" },
  "Hardee":       { trim: [8, 14], note: "hardeeclerk.com publishes BOTH; 8 Sept 4:00pm confirms +25 exactly" },
  "Osceola":      { trim: [8, 14], note: "osceolaclerk.com publishes BOTH; 8 Sept confirms +25 exactly" },
  "Citrus":       { trim: [8, 14], note: "citruspa.org 2026 news item" },
  "Putnam":       { trim: [8, 14], note: "pa.putnam-fl.com" },
  "Pinellas":     { trim: [8, 17], note: "publishes BOTH; 11 Sept 5:00pm, confirmed on the Clerk portal AND the PA calendar" },
  "Polk":         { trim: [8, 17], note: "polkflpa.gov publishes BOTH; 11 Sept confirms +25" },
  "Seminole":     { trim: [8, 17], note: "scpafl.org" },
  "Palm Beach":   { trim: [8, 20], note: "pbcpao.gov tax roll news" },
  "Clay":         { trim: [8, 24], note: "publishes BOTH; 18 Sept confirms +25" },

  // Deadline published, mailing date not.
  //
  // The twelve entries added 19 Aug 2026 came from a sweep of every county Clerk
  // and Property Appraiser site, run because 46 counties were sitting on the
  // fallback and therefore closing on 24 August — the day sales open. Each is the
  // county's OWN published 2026 date. Nothing here is derived from a neighbouring
  // county, a news article, or a back-calculation from another figure.
  "Indian River": { deadline: [9, 4],  note: "vab.indian-river.org/Axia2026/. EARLIEST IN THE STATE — see FL_UNKNOWN_COUNTY_DEADLINE. Postmarks not sufficient. Portal ROOT still defaults to 2025; use the /Axia2026/ path" },
  "Duval":        { deadline: [9, 8],  note: "vab.coj.net/Axia2026/. The PA page prints 'September 8th, 2025' — A TYPO; the portal, the PA banner, and 14 Aug +25 all give 2026. Receipt only, postmark rejected" },
  "Escambia":     { deadline: [9, 8],  note: "escambiaclerk.com/264/, notice dated 10 Aug 2026. Receipt only" },
  "Martin":       { deadline: [9, 8],  note: "martinclerk.com/188/ and vab.martinclerk.com/axiaweb2026/" },
  "Bay":          { deadline: [9, 8],  note: "baycoclerk.com. 'postmarked on or received after the deadline will be considered late'" },
  "Gulf":         { deadline: [9, 8],  note: "gulfclerk.com, 5:00pm ET. Corroborated by 2026 hearing dates on the same page" },
  "Lee":          { deadline: [9, 11], note: "leepa.org LIVE 2026 TRIM notice, verified on two parcels. THE CLERK'S OWN DATES PAGE STILL SERVES 2025 — do not use it" },
  "Sarasota":     { deadline: [9, 11], note: "sarasotaclerk.com. NOTE the operative Local Admin Procedures are still the 2025 revision" },
  "Nassau":       { deadline: [9, 11], note: "axia.nassauclerk.com, Clerk's own portal with a live countdown. Supersedes the Chamber article this table refused" },
  "Highlands":    { deadline: [9, 14], note: "highlandsclerkfl.gov. 4:30pm HARD CUT. Receipt; 'postmarked by the 25th day is not sufficient'" },
  "Charlotte":    { deadline: [9, 15], note: "webapps.charlotteclerk.com/VAB2026/. Same page corrects the fee to $50 — see flCountyFees.js" },
  "Calhoun":      { deadline: [9, 15], note: "calhounclerk.com. ONE STALE LINE on the same page says 16 Sept — confirm by phone (850) 674-4545 before relying on the extra day" },
  "Manatee":      { deadline: [9, 11], note: "manateepao.gov/vab" },
  "St. Lucie":    { deadline: [9, 11], note: "AxiaWeb2026 portal - the 2026 in the URL is the point" },
  "Orange":       { deadline: [9, 18], note: "occompt.com; re-confirmed 19 Aug 2026 — 'The 2026 petition filing deadline is Friday, September 18, 2026'" },
  "Broward":      { deadline: [9, 18], note: "broward.org VAB. NOTE bcpa.net still shows 17 Sept 2025 - the PA page is stale, the VAB page is not" },
  "Miami-Dade":   { deadline: [9, 18], note: "the original source of the statewide assumption; correct for this county" },

  // DELIBERATELY ABSENT, though we have numbers for them. Each is sourced from
  // something that is not the county itself, and this table decides whether we
  // mail. They fall back with everyone else until an official page or a phone
  // call confirms them:
  //   Bradford 11 Sept - TENTATIVE by the Clerk's own label: "a tentative schedule
  //                      ... based on historical practice", to be settled at the
  //                      25 Aug organisational meeting. RE-CHECK 26 AUG.
  //   Brevard          - the Clerk's 2026 portal says only "September 2026". Its
  //                      historical mailing window is 21-24 Aug, so this should
  //                      surface within days. Worth a DAILY check: Brevard is a
  //                      top-ten county and has the cheapest fee of the ten ($15).
  //
  // Resolved and promoted into the table above on 19 Aug: Nassau (Clerk portal,
  // no longer the Chamber article) and Collier (the PA's own TRIM page).
};

/**
 * What a Florida county with no confirmed 2026 date gets. Nathan's call, 13 Aug:
 * conservative.
 *
 * 5 Sept is the EARLIEST date anywhere in the table — St. Johns, whose Property
 * Appraiser says TRIM mails "on or about 11 August". Set optimistically, this
 * constant sells and mails into counties that have already closed, and Florida is
 * satisfied by physical RECEIPT: the owner finds out afterwards, with no way to
 * refile. Set conservatively it costs revenue and harms nobody.
 *
 * ============================================================================
 * READ THIS BEFORE RAISING IT — THE COST IS NOT SMALL
 * ============================================================================
 * With minDays 12, a county on this fallback stops accepting orders on 24 Aug —
 * the same day Florida sales open. In practice **an undated county is not
 * sellable this season at all.** That is 52 of 67 counties as this ships.
 *
 * It was set to 7 Sept first, on the belief that Hillsborough was the earliest
 * date we held. The build check below caught St. Johns at 5 Sept and refused the
 * build. Two days, and it would have shipped as "conservative" while being
 * optimistic for one real county. That check is the only reason this constant is
 * right, and it is why the invariant is expressed as "not later than any date we
 * have verified" rather than as a literal.
 *
 * WHY THIS IS AFFORDABLE ANYWAY: the fifteen dated counties include **seven of
 * Florida's ten largest** — Miami-Dade, Broward, Palm Beach, Hillsborough,
 * Orange, Pinellas and Polk — plus Seminole, Manatee, St. Lucie, Osceola, Clay,
 * St. Johns, Citrus and Putnam. The undated 52 are overwhelmingly small counties.
 *
 * THE THREE CALLS THAT BUY THE MOST BACK, all top-ten and all undated:
 *   Duval    — their VAB page says the 2026 date is "TBD"
 *   Lee
 *   Brevard
 *
 * RAISE THIS BY CONFIRMING COUNTIES, NOT BY EDITING THIS LINE. The TRIM re-sweep
 * is scheduled for 22 Aug, two days before sales open, and about fifty counties
 * mail TRIM in the second half of August — most of these should carry a real date
 * before the window opens.
 */
// LOWERED 19 Aug 2026, 5 Sept -> 4 Sept. Indian River publishes 4 September, and the
// build check below is what forced this: the invariant is "not later than any date we
// have verified", and Indian River is now verified.
//
// READ WHAT THAT MEANS. The fallback was justified in this file as "the EARLIEST date
// anywhere in the table" and was therefore believed to be conservative. It was not.
// It was only conservative with respect to the counties we had already checked — and
// the risk lives entirely in the ones we had not. An Indian River order taken on
// 24 August would have been mailed believing it had the full 12 days of lead when it
// had 11. Nothing was sold, so nothing was lost, but the guard was proving a property
// about the wrong set.
//
// CONSEQUENCE, STATED PLAINLY: 4 Sept minus minDays 12 is 23 August, which is BEFORE
// sales open on the 24th. An undated Florida county is therefore not sellable at all
// this season. That is the honest number. At 5 Sept it looked like one day of runway,
// which was never real — it was one day of selling against a date nobody had checked.
//
// RAISE THIS BY CONFIRMING COUNTIES, NOT BY EDITING THIS LINE. The 19 Aug sweep took
// the dated set from 15 counties to 31; the remaining 30 are a phone list, not a
// constant to be tuned.
export const FL_UNKNOWN_COUNTY_DEADLINE = [9, 4];

/**
 * The Florida deadline for one county, as a Date in `year`.
 * Order of preference: published deadline, then TRIM + 25, then the fallback.
 */
export function flPetitionDeadline(countyName, year) {
  const clean = String(countyName || '').replace(/\s+County$/i, '').trim();
  const entry = Object.entries(FL_COUNTY_DATES)
    .find(([k]) => k.toLowerCase() === clean.toLowerCase())?.[1];

  if (entry?.deadline) return new Date(year, entry.deadline[0] - 1, entry.deadline[1]);
  if (entry?.trim) {
    const d = new Date(year, entry.trim[0] - 1, entry.trim[1]);
    d.setDate(d.getDate() + PETITION_DAYS_AFTER_TRIM);
    return d;
  }
  return new Date(year, FL_UNKNOWN_COUNTY_DEADLINE[0] - 1, FL_UNKNOWN_COUNTY_DEADLINE[1]);
}

/** True when this county's date is real rather than the fallback. */
export function flCountyDateIsKnown(countyName) {
  const clean = String(countyName || '').replace(/\s+County$/i, '').trim();
  return Object.keys(FL_COUNTY_DATES).some((k) => k.toLowerCase() === clean.toLowerCase());
}

export function getFilingWindowStatus(stateCode, countyName, { strict = false } = {}) {
  const fw = FILING_WINDOWS[stateCode];
  if (!fw) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const year = today.getFullYear();

  let openMonth = fw.openMonth, openDay = fw.openDay, closeMonth = fw.closeMonth, closeDay = fw.closeDay;
  let hardMonth = fw.hardMonth, hardDay = fw.hardDay;

  if (stateCode === "GA" && countyName && fw.countyWindows) {
    const countyClean = countyName.replace(/ County$/i, "").trim();
    const cw = Object.entries(fw.countyWindows).find(([k]) => k.toLowerCase() === countyClean.toLowerCase())?.[1];
    if (cw) {
      openMonth = cw.openMonth; openDay = cw.openDay; closeMonth = cw.closeMonth; closeDay = cw.closeDay;
      // THE COUNTY OVERRIDE USED TO MOVE close AND LEAVE hardDeadline BEHIND.
      // That is the bug Florida exposed on 13 Aug 2026, and it was live here too.
      // hardDeadline is the date send-letter.js:319 compares Lob's own per-piece
      // delivery estimate against, and the date `minDays`/`tooClose` measure back
      // from. A county that closes on 1 June with a hard deadline still reading
      // 15 July is a county where both safety checks are aimed two weeks past the
      // cliff. In Georgia the county close IS the county's statutory cliff, so
      // they move together.
      hardMonth = cw.closeMonth; hardDay = cw.closeDay;
    } else {
      closeMonth = 6; closeDay = 15; hardMonth = 6; hardDay = 15; // unknown GA county — conservative
    }
  }

  let openDate = new Date(year, openMonth - 1, openDay);
  let closeDate = new Date(year, closeMonth - 1, closeDay);
  let hardDeadline = new Date(year, hardMonth - 1, hardDay);

  // FLORIDA IS PER-COUNTY, DERIVED, NOT TABULATED. See the long note above
  // FL_COUNTY_DATES. The open date is NOT moved — that stays statewide at 24 Aug,
  // which is published on 131 city pages and 6 metro pages and is build-checked.
  // Only the cliff moves, because only the cliff can hurt a customer.
  //
  // WITH NO COUNTY the behaviour depends on why you are asking, which is what
  // `strict` selects.
  //
  //   strict: false (default) — keep the statewide date. apply.js:256 calls this at
  //     the top of the funnel before the property is known, and that call only drives
  //     "N days left" copy.
  //
  //   strict: true — use the unknown-county fallback, the EARLIEST date we are willing
  //     to stand behind. Every caller that gates money passes this.
  //
  // The previous version of this comment asked callers to "pass the county" and left
  // it at that. Two of them did not, and the omission was invisible because the code
  // silently returned the most generous date in the state:
  //
  //   lib/fulfillOrder.js:287  getFilingWindowStatus(stateCode)      — the mail gate
  //   pages/apply.js:824       county resolved for GA only           — the sale gate
  //
  // A Hillsborough order bought on 1 Sept was measured against 18 Sept — Miami-Dade's
  // date — when that county closes on the 7th. Florida is satisfied by physical
  // RECEIPT, so the petition mailed, arrived late, and the owner lost the year on an
  // order they had paid for. An asked-nicely convention is not a safety property;
  // `strict` makes the conservative answer the one you get by asking wrongly, and
  // scripts/verify-fl-data.mjs now fails the build if a money-gating caller drops it.
  if (stateCode === "FL" && (countyName || strict)) {
    // flPetitionDeadline() returns FL_UNKNOWN_COUNTY_DEADLINE for a blank or
    // unrecognised county, so the strict-with-no-county path needs no special case.
    hardDeadline = flPetitionDeadline(countyName, year);
    closeDate = hardDeadline;
  }

  if (today > closeDate) {
    openDate = new Date(year + 1, openMonth - 1, openDay);
    closeDate = new Date(year + 1, closeMonth - 1, closeDay);
    hardDeadline = new Date(year + 1, hardMonth - 1, hardDay);
    // Same condition as the current-year branch above. If these two ever disagree,
    // a strict caller gets the conservative date this season and the generous one
    // the moment the season rolls over — which is the harder bug to find.
    if (stateCode === "FL" && (countyName || strict)) {
      hardDeadline = flPetitionDeadline(countyName, year + 1);
      closeDate = hardDeadline;
    }
  }

  const preOrderOpenDate = new Date(openDate);
  preOrderOpenDate.setDate(preOrderOpenDate.getDate() - PRE_ORDER_DAYS);

  const isOpen = today >= openDate && today <= closeDate;
  const daysUntilOpen = !isOpen ? Math.ceil((openDate - today) / (1000 * 60 * 60 * 24)) : 0;
  const daysUntilClose = isOpen ? Math.ceil((closeDate - today) / (1000 * 60 * 60 * 24)) : 0;
  const daysUntilHard = isOpen ? Math.ceil((hardDeadline - today) / (1000 * 60 * 60 * 24)) : 0;
  const tooClose = isOpen && daysUntilHard < fw.minDays;
  const canFile = isOpen && !tooClose;

  // Pre-order window: PRE_ORDER_DAYS before openDate, through closeDate.
  // Not subject to `tooClose` — a pre-order taken now files the moment the
  // window opens, long before any deadline risk.
  const canPreOrder = !isOpen && today >= preOrderOpenDate && today <= closeDate;
  const daysUntilPreOrder = !canPreOrder && !isOpen ? Math.ceil((preOrderOpenDate - today) / (1000 * 60 * 60 * 24)) : 0;

  const isFirstDay = today.getTime() === openDate.getTime();
  const urgency = !isOpen ? "closed" : daysUntilClose <= 7 ? "critical" : daysUntilClose <= 14 ? "urgent" : daysUntilClose <= 30 ? "warning" : "normal";

  return {
    isOpen, canFile, canPreOrder, isFirstDay,
    daysUntilOpen, daysUntilPreOrder, daysUntilClose, daysUntilHard,
    tooClose, urgency, receiptRequired: fw.receiptRequired,
    // hardDeadline is returned so callers can compare a REAL delivery estimate
    // against it. send-letter.js checks Lob's per-piece expected_delivery_date
    // rather than trusting minDays to have been set generously enough.
    openDate, closeDate, preOrderOpenDate, hardDeadline,
  };
}
