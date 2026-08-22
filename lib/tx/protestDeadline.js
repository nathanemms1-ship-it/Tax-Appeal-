/**
 * TEXAS PROTEST DEADLINES — DERIVED, WITH THE PREDICTION KEPT SEPARATE FROM THE PROMISE.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 * Until 22 Aug 2026 every Texas page on the site printed a hardcoded
 * "May 15, 2026" — in pages/texas/[city].js twice (the FAQ and the district-info
 * grid), in pages/san-antonio.js once, and as a bare `deadline: "May 15"` string on
 * all 254 records in lib/countyData.js. The 2026 season closed in May. Every Texas
 * page on the site was advertising an expired deadline for three months and nothing
 * said so, because nothing derived it from anything.
 *
 * That is the same shape as the Florida fee defect: a money-gating fact typed as a
 * literal, believed because somebody checked it once, with no mechanism to notice it
 * had gone false.
 *
 * ============================================================================
 * THE RULE, AND WHY A SINGLE DATE IS ALWAYS A LIE
 * ============================================================================
 * Tax Code § 41.44(a)(1): a notice of protest is timely if filed
 *
 *     "not later than May 15 or the 30th day after the date that notice to the
 *      property owner was delivered ... whichever is LATER."
 *
 * The operative deadline is therefore a property of the NOTICE, not of the district.
 * Two owners in the same county can hold different deadlines if their notices were
 * mailed in different batches — Collin mailed real property 15 Apr 2026 and business
 * personal property from 13 May, inside one district.
 *
 * So this module returns two different things and never confuses them:
 *
 *   floor()          the statutory date every Texas owner has at minimum. A promise.
 *   projectFor(slug) what the district's own mailing history suggests. A prediction.
 *
 * Pages print the floor. The projection is available for editorial context and MUST
 * be labelled as a projection wherever it is shown. A projected date presented as the
 * deadline is how a customer misses their filing year.
 *
 * ============================================================================
 * WHY 17 MAY 2027
 * ============================================================================
 * 15 May 2027 is a Saturday. Verified two independent ways:
 *   - OPM publishes Memorial Day 2027 as Monday 31 May. Counting back by sevens:
 *     24 May Mon, 17 May Mon, so 15 May is Saturday and 16 May is Sunday.
 *   - Computed below by getUTCDay() in weekdayOf(), asserted in the self-check.
 *
 * Tax Code § 1.06: "If the last day for the performance of an act is a Saturday,
 * Sunday, or legal state or national holiday, the act is timely if performed on the
 * next regular business day."
 *
 * Monday 17 May 2027 is a regular business day — Gov't Code § 662.003 lists no
 * national or state holiday in mid-May, and the nearest federal holiday is Memorial
 * Day on the 31st.
 *
 *   => 2027 statewide floor: Monday 17 May 2027.
 *
 * ============================================================================
 * WHICH DIRECTION THE ERRORS RUN
 * ============================================================================
 * Every judgement call in this file is resolved toward the EARLIER date, because the
 * two failure modes are not symmetric. Telling a customer the deadline is earlier
 * than it is costs them nothing. Telling them it is later than it is costs them the
 * year. Specifically:
 *
 *   - Partial-staffing state holidays (Texas Independence Day 2 Mar, San Jacinto Day
 *     21 Apr, LBJ Day 27 Aug) are NOT treated as rolls. Gov't Code § 662.003(c)
 *     keeps state offices open on those days, so they are arguably not days on which
 *     performance is excused. Treating them as business days yields the earlier
 *     deadline, so that is what this does. Revisit only with an authority that says
 *     otherwise — and note that getting this wrong in the other direction is the
 *     expensive one.
 *   - A district with no mailing history gets no projection at all, rather than a
 *     guessed one. `projectFor` returns null. This is the lesson of
 *     FL_UNKNOWN_COUNTY_DEADLINE: a fallback derived from the counties you HAVE
 *     checked tells you nothing about the ones you have not.
 *
 * ============================================================================
 * MAINTENANCE
 * ============================================================================
 * Districts announce mailing dates in late March and April. When one announces,
 * add the observed date to `history` with its source URL and re-run
 * `node scripts/verify-tx-seo.mjs`. Do not edit `STATUTORY_FLOOR` to match a
 * district — a district cannot move the floor, only clear it.
 */

// ---------------------------------------------------------------------------
// The floor, per tax year. Add a year here each season; the guard fails the build
// if the current tax year is missing rather than silently falling through.
// ---------------------------------------------------------------------------

/**
 * Raw § 41.44 date before the § 1.06 weekend/holiday roll is applied. Always 15 May
 * — the roll is computed, never typed, so a year cannot be entered wrong.
 */
const RAW_FLOOR_MONTH_DAY = '05-15';

/** Tax years this module is prepared to answer for. */
export const SUPPORTED_TAX_YEARS = [2026, 2027, 2028];

/**
 * Days on which performance is excused under § 1.06, as ISO dates.
 *
 * National holidays per 5 U.S.C. § 6103 / Gov't Code § 662.003(a), plus the Texas
 * state holidays on which state offices actually close. Deliberately EXCLUDES the
 * § 662.003(c) partial-staffing holidays — see the header note on error direction.
 *
 * Only dates that can plausibly fall inside a Texas protest window (roughly 1 March
 * to 31 July of the tax year) need to be present for the deadline computation, but
 * the whole year is listed so the table can be reused.
 */
const OBSERVED_HOLIDAYS = new Set([
  // 2026
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-06-19',
  '2026-07-03', '2026-09-07', '2026-11-11', '2026-11-26', '2026-12-25',
  // 2027
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-05-31', '2027-06-18',
  '2027-07-05', '2027-09-06', '2027-11-11', '2027-11-25', '2027-12-24',
  // 2028
  '2028-01-03', '2028-01-17', '2028-02-21', '2028-05-29', '2028-06-19',
  '2028-07-04', '2028-09-04', '2028-11-10', '2028-11-23', '2028-12-25',
]);

// ---------------------------------------------------------------------------
// Date helpers. All arithmetic is UTC so a server in any timezone agrees.
// ---------------------------------------------------------------------------

const DAY_MS = 86400000;

function toIso(d) {
  return d.toISOString().slice(0, 10);
}

function parseIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m) throw new Error(`protestDeadline: not an ISO date: ${iso}`);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (toIso(d) !== iso) throw new Error(`protestDeadline: not a real date: ${iso}`);
  return d;
}

/** 0 = Sunday ... 6 = Saturday. Exported so the self-check can assert on it. */
export function weekdayOf(iso) {
  return parseIso(iso).getUTCDay();
}

function isBusinessDay(iso) {
  const wd = weekdayOf(iso);
  return wd !== 0 && wd !== 6 && !OBSERVED_HOLIDAYS.has(iso);
}

/**
 * § 1.06 — advance to the next regular business day if the date is a Saturday,
 * Sunday, or observed holiday. Idempotent; a business day is returned unchanged.
 */
export function rollForward(iso) {
  let d = parseIso(iso);
  let guard = 0;
  while (!isBusinessDay(toIso(d))) {
    d = new Date(d.getTime() + DAY_MS);
    if (++guard > 10) throw new Error(`protestDeadline: rollForward ran away from ${iso}`);
  }
  return toIso(d);
}

function addDays(iso, n) {
  return toIso(new Date(parseIso(iso).getTime() + n * DAY_MS));
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Monday 17 May 2027" — the weekday is included deliberately. HCAD's own 2026 */
/** press release headlined "Thursday, May 15" when 15 May 2026 was a Friday. */
export function formatLong(iso) {
  const d = parseIso(iso);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "May 17, 2027" — US order, for running prose. */
export function formatUS(iso) {
  const d = parseIso(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

// ---------------------------------------------------------------------------
// The floor
// ---------------------------------------------------------------------------

/**
 * The statutory minimum deadline for a tax year, after the § 1.06 roll.
 * This is the date the site promises. It is correct for every Texas county and
 * every property in every batch, because § 41.44 makes it a floor.
 *
 * @param {number} taxYear
 * @returns {{ iso: string, raw: string, rolled: boolean, long: string, us: string }}
 */
export function floor(taxYear) {
  if (!SUPPORTED_TAX_YEARS.includes(taxYear)) {
    throw new Error(
      `protestDeadline: tax year ${taxYear} is not in SUPPORTED_TAX_YEARS ` +
      `[${SUPPORTED_TAX_YEARS.join(', ')}]. Add it — and add that year's holidays ` +
      `to OBSERVED_HOLIDAYS — rather than letting a page print a date for a year ` +
      `this module has not been checked against.`
    );
  }
  const raw = `${taxYear}-${RAW_FLOOR_MONTH_DAY}`;
  const iso = rollForward(raw);
  return { iso, raw, rolled: iso !== raw, long: formatLong(iso), us: formatUS(iso) };
}

// ---------------------------------------------------------------------------
// Observed mailing history
// ---------------------------------------------------------------------------

/**
 * What each district has actually done, keyed by the countyData slug.
 *
 * `history` holds OBSERVED mailing dates only — a date goes in here when a primary
 * source states it. `confidence` describes the best source behind the series:
 *
 *   'district'  the district's own press release or calendar states the date
 *   'press'     a named news outlet states the date
 *   'thirdparty' only a competitor or law-firm blog states it, citing nothing
 *
 * `anchor` is the calendar date the district appears to aim at. Derived by hand from
 * `history`, not computed — two data points is not a trend and the judgement should
 * be visible. Districts anchor to a calendar DATE, not a weekday: Fort Bend mailed
 * 1 Apr in 2024 (Monday), 2025 (Tuesday) and 2026 (Wednesday). Do not build weekday
 * logic on top of this.
 *
 * A district with fewer than two observed dates gets `anchor: null` and produces no
 * projection at all.
 */
export const DISTRICT_MAILING = {
  'harris-county-tx': {
    district: 'Harris Central Appraisal District',
    history: [{ year: 2026, date: '2026-04-17', confidence: 'thirdparty' }],
    anchor: null,
    note:
      'The 17 Apr 2026 date comes only from third-party write-ups (O\'Connor, ' +
      'Saegert Law) that cite nothing; HCAD releases 26-07 and 26-08 both omit a ' +
      'mailing date. It is consistent with the 18 May 2026 deadline everyone ' +
      'reported, but it is not district-sourced. Harris is the highest-volume ' +
      'county on the site and still has no verified mailing date — fix this first.',
    caution:
      'HCAD release 26-08 headlined "until Thursday, May 15" when 15 May 2026 was a ' +
      'Friday, and the practical deadline for April-17 notices was Monday 18 May. ' +
      'The district itself published a date that was wrong on both the weekday and ' +
      'the arithmetic. Never quote a Harris deadline from HCAD\'s own headline.',
  },
  'dallas-county-tx': {
    district: 'Dallas Central Appraisal District',
    history: [],
    anchor: null,
    note:
      'No mailing date found for any year — dallascad.org news and the Dallas ' +
      'Morning News are both robots-blocked. DCAD historically publishes deadlines ' +
      'LATER than 15 May (its own protest-process PDF shows 22 May for 2023 real ' +
      'property), which implies a late-April mailing. Needs a browser check.',
  },
  'tarrant-county-tx': {
    district: 'Tarrant Appraisal District',
    history: [
      { year: 2025, date: '2025-04-15', confidence: 'press' },
      { year: 2024, date: '2024-04-17', confidence: 'press' },
    ],
    anchor: '04-15',
    note:
      'tad.org returns 403 to automated fetching, so 2026 is unobserved. Dates are ' +
      'from Fort Worth Report (2025) and NBC DFW (2024), the latter reported as ' +
      '"started going out this week" rather than a specific day.',
    caution:
      'Tarrant extended its 2024 deadline to 24 May after a cyberattack. A shock ' +
      'event has moved this district before and the projection does not model it.',
  },
  'bexar-county-tx': {
    district: 'Bexar Central Appraisal District',
    history: [
      { year: 2026, date: '2026-04-10', confidence: 'district' },
      { year: 2025, date: '2025-04-11', confidence: 'district' },
    ],
    anchor: '04-10',
    note:
      'Renamed from "Bexar Appraisal District" to "Bexar Central Appraisal ' +
      'District" effective 1 Jan 2026. Both releases say "this week" rather than ' +
      'naming a single day, so treat the anchor as a week, not a date.',
  },
  'travis-county-tx': {
    district: 'Travis Central Appraisal District',
    history: [
      { year: 2026, date: '2026-03-25', confidence: 'district' },
      { year: 2025, date: '2025-04-09', confidence: 'district' },
      { year: 2024, date: '2024-04-11', confidence: 'district' },
    ],
    anchor: null,
    note:
      'Three district-sourced dates and deliberately NO anchor. Travis is drifting ' +
      'earlier and fast — 11 Apr, 9 Apr, 25 Mar. That is a 2.5-week jump in one ' +
      'year, not noise, so an anchor derived from the series would be a worse ' +
      'predictor than saying nothing. TCAD also never names a single mailing day; ' +
      'every release says "beginning this week".',
  },
  'collin-county-tx': {
    district: 'Collin Central Appraisal District',
    history: [
      { year: 2026, date: '2026-04-15', confidence: 'district' },
      { year: 2024, date: '2024-04-15', confidence: 'district' },
    ],
    anchor: '04-15',
    note:
      'The cleanest published pattern in Texas — CCAD names an exact day and hits ' +
      'the same calendar date. Note the split: real property mailed 15 Apr 2026, ' +
      'business personal property from 13 May into early June, producing two ' +
      'materially different deadlines inside one district.',
  },
  'denton-county-tx': {
    district: 'Denton Central Appraisal District',
    history: [{ year: 2025, date: '2025-04-15', confidence: 'press' }],
    anchor: null,
    note:
      'dentoncad.com serves a JavaScript portal with no server-rendered content. ' +
      'The single date is from the Denton Record-Chronicle. One observation is not ' +
      'an anchor, though 15 Apr matches its Collin neighbour.',
  },
  'fort-bend-county-tx': {
    district: 'Fort Bend Central Appraisal District',
    history: [
      { year: 2026, date: '2026-04-01', confidence: 'district' },
      { year: 2025, date: '2025-04-01', confidence: 'district' },
      { year: 2024, date: '2024-04-01', confidence: 'district' },
    ],
    anchor: '04-01',
    note:
      'The most predictable district in Texas: dated press releases on 1 April in ' +
      'three consecutive years, across three different weekdays. FBCAD also states ' +
      'the § 41.44 rule correctly in its own release, which almost no district does.',
  },
  'williamson-county-tx': {
    district: 'Williamson Central Appraisal District',
    history: [{ year: 2026, date: '2026-03-31', confidence: 'press' }],
    anchor: null,
    note:
      'Williamson County Sun reports 285,118 notices mailed 31 Mar 2026. WCAD\'s ' +
      'own site hedges to "usually in April or May". One observation, no anchor.',
  },
  'bell-county-tx': {
    district: 'Tax Appraisal District of Bell County',
    history: [{ year: 2025, date: '2025-04-01', confidence: 'press' }],
    anchor: null,
    note:
      'Legal name is "Tax Appraisal District of Bell County" — not a "CAD" ' +
      'construction. Date from KWTX quoting Chief Appraiser Billy White.',
  },
  'el-paso-county-tx': {
    district: 'El Paso Central Appraisal District',
    history: [],
    anchor: null,
    note:
      'EPCAD posted its filing-deadline notice on 8 Apr 2026 saying notices were ' +
      '"now being mailed", so mailing was on or before that date — but no exact ' +
      'day. EPCAD publishes the most statutorily correct deadline language of any ' +
      'district: "thirty (30) days from the notice date, or until May 15, ' +
      'whichever is later."',
  },
};

/**
 * Districts named in the research with no usable mailing data at all. Listed
 * explicitly rather than left absent so the gap is visible and countable, and so
 * `verify-tx-seo.mjs` can report it as work outstanding rather than as an error.
 */
export const MAILING_DATA_GAPS = [
  'montgomery-county-tx',
  'galveston-county-tx',
  'brazoria-county-tx',
  'hidalgo-county-tx',
  'nueces-county-tx',
  'lubbock-county-tx',
  'jefferson-county-tx',
  'mclennan-county-tx',
  'rockwall-county-tx',
];

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

/**
 * What the district's history suggests its deadline will be — a PREDICTION.
 *
 * Returns null unless the district has an `anchor`, which is only set by hand where
 * two or more observations agree on a calendar date. Never invents one.
 *
 * The returned date is `max(floor, anchor + 30 days)` with the § 1.06 roll applied,
 * which is the § 41.44 computation run against a predicted mailing date. Because it
 * is bounded below by the floor it can never be earlier than the promise.
 *
 * @returns {null | { iso, long, us, basis, anchorDate, confidence, note, caution }}
 */
export function projectFor(countySlug, taxYear) {
  const d = DISTRICT_MAILING[countySlug];
  if (!d || !d.anchor) return null;

  const f = floor(taxYear);
  const anchorDate = `${taxYear}-${d.anchor}`;
  const thirtyDays = rollForward(addDays(anchorDate, 30));
  const iso = thirtyDays > f.iso ? thirtyDays : f.iso;

  // Weakest link in the chain wins.
  const RANK = { district: 3, press: 2, thirdparty: 1 };
  const confidence = d.history.reduce(
    (worst, h) => (RANK[h.confidence] < RANK[worst] ? h.confidence : worst),
    'district'
  );

  return {
    iso,
    long: formatLong(iso),
    us: formatUS(iso),
    basis: iso === f.iso ? 'floor' : 'notice+30',
    anchorDate,
    observations: d.history.length,
    confidence,
    district: d.district,
    note: d.note || null,
    caution: d.caution || null,
  };
}

// ---------------------------------------------------------------------------
// What the pages actually call
// ---------------------------------------------------------------------------

/**
 * The single sentence every Texas page should print for a deadline, and the reason
 * this module exists. It states the floor as a date and the § 41.44 rule as a rule,
 * which is the only formulation that is true for every reader of the page.
 *
 * Deliberately does NOT interpolate a projection. A page that prints "your deadline
 * is 19 May" to a reader whose notice arrived in March has told them a lie that
 * costs them the year.
 */
export function deadlineSentence(taxYear, districtName) {
  const f = floor(taxYear);
  const who = districtName ? `the ${districtName}` : 'your appraisal district';
  const rollNote = f.rolled
    ? ` (${formatUS(f.raw)} falls on a ${WEEKDAYS[weekdayOf(f.raw)]}, so Tax Code ` +
      `§ 1.06 moves it to the next business day)`
    : '';
  return (
    `The ${taxYear} deadline is ${f.us}${rollNote}, or 30 days after ${who} mails ` +
    `your Notice of Appraised Value — whichever is later. Texas Tax Code § 41.44 ` +
    `sets it from the date on your notice, so check that date: if your notice is ` +
    `dated after mid-April, you have longer than ${f.us}.`
  );
}

/** Short form for stat tiles and table cells: "May 17, 2027". */
export function deadlineShort(taxYear) {
  return floor(taxYear).us;
}

/**
 * The tax year Texas pages should currently be selling.
 *
 * Texas notices land Mar–Apr and the protest window closes in May, so the sellable
 * year rolls over the day after the previous year's floor passes. Computed from the
 * supplied date rather than a build constant, because a build constant is exactly
 * how the site came to be advertising May 2026 in August 2026.
 *
 * @param {Date} [now] injectable for tests
 */
export function currentTaxYear(now = new Date()) {
  const today = toIso(now);
  const year = Number(today.slice(0, 4));
  // Before this year's floor has passed, this year is still live.
  if (SUPPORTED_TAX_YEARS.includes(year) && today <= floor(year).iso) return year;
  const next = year + 1;
  if (SUPPORTED_TAX_YEARS.includes(next)) return next;
  throw new Error(
    `protestDeadline: no supported tax year for ${today}. SUPPORTED_TAX_YEARS is ` +
    `[${SUPPORTED_TAX_YEARS.join(', ')}] — extend it before the season rolls over.`
  );
}

export default {
  SUPPORTED_TAX_YEARS,
  DISTRICT_MAILING,
  MAILING_DATA_GAPS,
  floor,
  projectFor,
  deadlineSentence,
  deadlineShort,
  currentTaxYear,
  rollForward,
  weekdayOf,
  formatLong,
  formatUS,
};
