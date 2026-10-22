/**
 * lib/tx/inSeason.js — when each district's data for the season arrives, and
 * what we promise a customer who orders before it does. 19 Oct 2026.
 *
 * A Texas kit is built from the district's own data file for THIS year, not from
 * the customer's notice. Notices arrive from late March; most districts publish
 * that file later, some only in July (after the deadline). So:
 *
 *   reserve   the district published this year's values before the deadline
 *             last year. We take a reservation; the kit goes out when the file
 *             is loaded. The copy says when it came last year, and that kits do
 *             not all go out on the first day of the season.
 *   waitlist  it did not, or we could not confirm that it did. We take NO
 *             money (Nathan, 19 Oct 2026: "Waitlist, not reserve"). If its data
 *             does load before the cut-off, the district sells ordinary kits and
 *             the waitlist is told.
 *
 * THE CUT-OFF. If a reserved district's file is still not loaded 10 days before
 * the deadline, the reservation is refunded in full and the customer is emailed
 * Form 50-132 filled in with their name, address and account, to sign and mail
 * themselves (Nathan, 19 Oct 2026: "Refund + free filed form"). In Texas the
 * form alone preserves the protest (§ 41.44(d)); evidence can follow at the
 * informal conference. Ten days, not two weeks: Grayson published on 4 May in
 * 2026, and close to the deadline the kit goes out as a PDF anyway.
 *
 * Source: scripts/tx/sources.json `in_season` (research 19 Oct 2026).
 * scripts/verify-tx-season-data.mjs holds this table to that file.
 */
import { floor } from './protestDeadline.js';

const DAY = 86400000;
export const CUTOFF_DAYS_BEFORE_DEADLINE = 10;

/**
 * cad_id -> { county, tier, lastYear }. `lastYear` is when the 2026 file was
 * first seen ('YYYY-MM-DD' or 'YYYY-MM'), or null when only the pattern is known.
 */
export const TX_SEASON_DATA = Object.freeze({
  3: { county: 'Angelina', tier: 'waitlist', lastYear: null },
  7: { county: 'Atascosa', tier: 'waitlist', lastYear: null },
  14: { county: 'Bell', tier: 'waitlist', lastYear: null },
  20: { county: 'Brazoria', tier: 'waitlist', lastYear: null },
  28: { county: 'Caldwell', tier: 'reserve', lastYear: '2026-04-10' },
  31: { county: 'Cameron', tier: 'waitlist', lastYear: null },
  43: { county: 'Collin', tier: 'reserve', lastYear: '2026-04' },
  57: { county: 'Dallas', tier: 'reserve', lastYear: '2026-03' },
  61: { county: 'Denton', tier: 'waitlist', lastYear: null },
  71: { county: 'El Paso', tier: 'waitlist', lastYear: null },
  79: { county: 'Fort Bend', tier: 'reserve', lastYear: '2026-03-27' },
  84: { county: 'Galveston', tier: 'waitlist', lastYear: null },
  91: { county: 'Grayson', tier: 'reserve', lastYear: '2026-05-04' },
  94: { county: 'Guadalupe', tier: 'waitlist', lastYear: null },
  101: { county: 'Harris', tier: 'reserve', lastYear: '2026-04' },
  105: { county: 'Hays', tier: 'waitlist', lastYear: null },
  108: { county: 'Hidalgo', tier: 'waitlist', lastYear: null },
  // Published before the deadline in 2026, but a file "as of 12 May": after
  // the cut-off, so every reservation would end in a refund. Waitlist.
  123: { county: 'Jefferson', tier: 'waitlist', lastYear: null, tooLate: '2026-05-12' },
  126: { county: 'Johnson', tier: 'reserve', lastYear: '2026-03-31' },
  129: { county: 'Kaufman', tier: 'reserve', lastYear: '2026-04-17' },
  146: { county: 'Liberty', tier: 'reserve', lastYear: '2026-04-02' },
  170: { county: 'Montgomery', tier: 'reserve', lastYear: '2026-04-17' },
  178: { county: 'Nueces', tier: 'waitlist', lastYear: null },
  181: { county: 'Orange', tier: 'reserve', lastYear: '2026-04-17' },
  199: { county: 'Rockwall', tier: 'reserve', lastYear: '2026-03-16' },
  212: { county: 'Smith', tier: 'waitlist', lastYear: null },
  // Refreshed continuously; this year's values appear with the April notices.
  220: { county: 'Tarrant', tier: 'reserve', lastYear: null },
  221: { county: 'Taylor', tier: 'waitlist', lastYear: null },
  227: { county: 'Travis', tier: 'waitlist', lastYear: null },
  235: { county: 'Victoria', tier: 'waitlist', lastYear: null },
  243: { county: 'Wichita', tier: 'reserve', lastYear: '2026-03-30' },
  246: { county: 'Williamson', tier: 'reserve', lastYear: '2026-04' },
  249: { county: 'Wise', tier: 'reserve', lastYear: '2026-04-15' },
});

/** A district we hold no research for is treated as waitlist: never take money on a guess. */
export function seasonData(cadId) {
  return TX_SEASON_DATA[Number(cadId)] || { county: null, tier: 'waitlist', lastYear: null };
}

export const canReserve = (cadId) => seasonData(cadId).tier === 'reserve';

/** cad_id for a county name ("Dallas" or "Dallas County"), or null. */
export function cadForCounty(county) {
  const c = String(county || '').replace(/\s+County$/i, '').trim().toLowerCase();
  const hit = Object.entries(TX_SEASON_DATA).find(([, v]) => v.county.toLowerCase() === c);
  return hit ? Number(hit[0]) : null;
}

/** The day reservations still waiting are refunded (and new ones stop). UTC midnight. */
export function dataCutoff(taxYear) {
  const d = new Date(`${floor(Number(taxYear)).iso}T00:00:00Z`);
  return new Date(d.getTime() - CUTOFF_DAYS_BEFORE_DEADLINE * DAY);
}

const longDate = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });

/** "on March 31 last year" / "in April last year" / null. */
export function lastYearText(cadId) {
  const ly = seasonData(cadId).lastYear;
  if (!ly) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(ly)) return `on ${longDate(new Date(`${ly}T00:00:00Z`))} last year`;
  const m = new Date(`${ly}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  return `in ${m} last year`;
}

/**
 * Everything the reservation copy needs, in one place, so the checkout screen,
 * the success page and the email cannot say different things.
 */
export function reservationTiming(cadId, taxYear) {
  const sd = seasonData(cadId);
  const cutoff = dataCutoff(taxYear);
  const district = sd.county ? `the ${sd.county} County appraisal district` : 'your appraisal district';
  const deadline = floor(Number(taxYear)).us;
  const when = lastYearText(cadId);
  return {
    district,
    lastYearText: when,
    cutoffText: longDate(cutoff),
    deadlineText: deadline,
    // One paragraph, plain text.
    paragraph:
      `We build your kit from ${district}'s ${taxYear} data file, not from your notice, so it does not go out the day notices arrive. ` +
      (when ? `Last year it published that file ${when.replace(/ last year$/, '')}. ` : 'The district publishes it each spring. ') +
      `Kits go out district by district, once we have loaded each district's file. ` +
      `If the file is not out by ${longDate(cutoff)}, we refund you in full and email you the protest form filled in with your details, so you can still sign and mail it before the ${deadline} deadline.`,
  };
}

export default { TX_SEASON_DATA, seasonData, canReserve, cadForCounty, dataCutoff, lastYearText, reservationTiming, CUTOFF_DAYS_BEFORE_DEADLINE };
