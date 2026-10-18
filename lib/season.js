/**
 * lib/season.js — which filing season a public page talks about. 18 Oct 2026.
 *
 * Every state's season had closed by 18 Sept 2026, yet 159 Georgia county pages
 * still read "2026 Deadline: April 1" (a date that was never Georgia's appeal
 * deadline) and the Florida pages printed 2026 dates. Texas had already been
 * moved onto a derived year (lib/tx/protestDeadline.js currentTaxYear) after the
 * same defect on 22 Aug. This does the same for the other states, from ONE rule:
 *
 *   a page talks about this year's season until the state's last filing day
 *   (FILING_WINDOWS hard date) has passed, then next year's.
 *
 * Pages are built at deploy, so the year rolls the first deploy after the cliff.
 *
 * DATES WE KNOW AND DATES WE DON'T. Our window dates (open, reservations) are
 * our own business rules, so they can be printed for any year. A Florida
 * county's petition deadline is NOT ours: it is 25 days after that county mails
 * its TRIM notice, published each summer. We print it only for the year our
 * table was published for (FL_COUNTY_DATES_YEAR); for any other year we say how
 * it is set and what it was last year, never a projected date presented as fact.
 */
import { FILING_WINDOWS, PRE_ORDER_DAYS, flPetitionDeadline, flCountyDateIsKnown, FL_COUNTY_DATES_YEAR } from './filingWindows';
import { currentTaxYear } from './tx/protestDeadline';

const DAY = 86400000;
const clean = (c) => String(c || '').replace(/\s+County$/i, '').trim();
const long = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const short = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const utcOf = (local) => new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));

/** The tax year a page should be about, for this state, today. */
export function seasonYear(state, now = new Date()) {
  const st = String(state || '').toUpperCase();
  if (st === 'TX') return currentTaxYear(now);
  const y = now.getUTCFullYear();
  const w = FILING_WINDOWS[st];
  if (!w) return y;
  return now.getTime() >= Date.UTC(y, w.hardMonth - 1, w.hardDay) + DAY ? y + 1 : y;
}

/** Our own dates for that season: when the window opens and when reservations open. */
export function seasonDates(state, now = new Date()) {
  const st = String(state || '').toUpperCase();
  const year = seasonYear(st, now);
  const w = FILING_WINDOWS[st];
  if (!w) return { year, open: null, openText: null, preOrder: null, preOrderText: null };
  const open = new Date(Date.UTC(year, w.openMonth - 1, w.openDay));
  const preOrder = new Date(open.getTime() - PRE_ORDER_DAYS * DAY);
  return {
    year, open, openISO: open.toISOString().slice(0, 10), openText: long(open),
    preOrder, preOrderISO: preOrder.toISOString().slice(0, 10), preOrderText: long(preOrder),
    hard: new Date(Date.UTC(year, w.hardMonth - 1, w.hardDay)),
  };
}

/**
 * A Florida county's petition deadline for the season a page is about.
 * @returns {{ year, known: boolean, date: Date|null, iso: string|null,
 *            text: string,       fits "must be received by ___"
 *            short: string,      a stat tile
 *            sentence: string,   one full sentence for an answer box or FAQ
 *            lastText: string|null }}
 */
export function flSeasonDeadline(county, now = new Date()) {
  const c = clean(county);
  const year = seasonYear('FL', now);
  const dated = flCountyDateIsKnown(c);
  if (dated && year === FL_COUNTY_DATES_YEAR) {
    const d = utcOf(flPetitionDeadline(c, year));
    return { year, known: true, date: d, iso: d.toISOString().slice(0, 10), text: long(d), short: short(d), sentence: `For the ${year} tax year the ${c} County deadline is ${long(d)}.`, lastText: null };
  }
  const last = dated ? long(utcOf(flPetitionDeadline(c, FL_COUNTY_DATES_YEAR))) : null;
  return {
    year, known: false, date: null, iso: null,
    text: `the date printed on your ${year} TRIM notice`,
    short: '25 days after TRIM',
    sentence: `The ${year} deadline is 25 days after ${c} County mails its ${year} TRIM notices, usually in August, and it is printed on your notice${last ? `. In ${FL_COUNTY_DATES_YEAR} it was ${last}` : ''}.`,
    lastText: last,
  };
}

/** Georgia has no single date: 45 days from the date printed on each owner's notice. */
export const GA_DEADLINE = '45 days from the date on your assessment notice';
