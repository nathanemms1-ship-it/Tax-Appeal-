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
  "St. Johns":    { trim: [8, 11], note: "sjcpa.gov 2026 dates - 'on or about', softest of the set" },
  "Hillsborough": { trim: [8, 13], note: "PA press release 7 Aug 2026" },
  "Osceola":      { trim: [8, 14], note: "osceolaclerk.com publishes BOTH; 8 Sept confirms +25 exactly" },
  "Citrus":       { trim: [8, 14], note: "citruspa.org 2026 news item" },
  "Putnam":       { trim: [8, 14], note: "pa.putnam-fl.com" },
  "Pinellas":     { trim: [8, 17], note: "publishes BOTH; 11 Sept 5:00pm, confirmed on the Clerk portal AND the PA calendar" },
  "Polk":         { trim: [8, 17], note: "polkflpa.gov publishes BOTH; 11 Sept confirms +25" },
  "Seminole":     { trim: [8, 17], note: "scpafl.org" },
  "Palm Beach":   { trim: [8, 20], note: "pbcpao.gov tax roll news" },
  "Clay":         { trim: [8, 24], note: "publishes BOTH; 18 Sept confirms +25" },

  // Deadline published, mailing date not.
  "Manatee":      { deadline: [9, 11], note: "manateepao.gov/vab" },
  "St. Lucie":    { deadline: [9, 11], note: "AxiaWeb2026 portal - the 2026 in the URL is the point" },
  "Orange":       { deadline: [9, 18], note: "occompt.com" },
  "Broward":      { deadline: [9, 18], note: "broward.org VAB. NOTE bcpa.net still shows 17 Sept 2025 - the PA page is stale, the VAB page is not" },
  "Miami-Dade":   { deadline: [9, 18], note: "the original source of the statewide assumption; correct for this county" },

  // DELIBERATELY ABSENT, though we have numbers for them. Each is sourced from
  // something that is not the county itself, and this table decides whether we
  // mail. They fall back with everyone else until an official page or a phone
  // call confirms them:
  //   Nassau   17 Aug / 11 Sept - Chamber of Commerce article
  //   Collier  ~17 Aug          - news article; the Clerk says only "mid-September"
  //   Bradford 11 Sept          - TENTATIVE, confirmed at the 25 Aug VAB org meeting
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
export const FL_UNKNOWN_COUNTY_DEADLINE = [9, 5];

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

export function getFilingWindowStatus(stateCode, countyName) {
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
  // WITH NO COUNTY we keep the statewide date rather than the fallback. apply.js:256
  // calls this at the top of the funnel before the property is known, and that call
  // only drives "N days left" copy. The call that decides whether an order is
  // ACCEPTED (apply.js:824) passes the county, and so do send-letter, both crons and
  // the health check. If a caller that gates money is ever added without a county,
  // it will silently get the most generous date in the state — so pass the county.
  if (stateCode === "FL" && countyName) {
    hardDeadline = flPetitionDeadline(countyName, year);
    closeDate = hardDeadline;
  }

  if (today > closeDate) {
    openDate = new Date(year + 1, openMonth - 1, openDay);
    closeDate = new Date(year + 1, closeMonth - 1, closeDay);
    hardDeadline = new Date(year + 1, hardMonth - 1, hardDay);
    if (stateCode === "FL" && countyName) {
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
