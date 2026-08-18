// pages/api/traffic-roster.js
/**
 * HOW MANY PEOPLE CAME TO THE SITE, BY DAY.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * Google Ads switches on 24 August, the same day the Florida window opens. Without
 * a daily traffic number in /admin there is no way to answer "is the spend doing
 * anything" except by opening a second dashboard that does not know what an order
 * is. This endpoint and /api/waitlist-roster and /api/get-orders read the same
 * database, so visitors -> captured leads -> orders is one funnel rather than
 * three unconnected numbers.
 *
 * ============================================================================
 * WHY THE COUNTS ARE SQL AGGREGATES AND NOT COUNTED ROWS
 * ============================================================================
 * waitlist-roster pulls rows and counts them in JavaScript, bounded at 5,000 with
 * a deliberate ceiling check, because it also renders the row bodies. This one
 * does not need bodies -- it needs counts. Pulling rows to count them would mean
 * the daily chart starts understating itself the first day the site exceeds the
 * cap, with no error and no sign, which is the settle-referrals unbounded-read
 * defect wearing different clothes. The RPCs in scripts/sql/site_visits.sql do the
 * counting in Postgres, where it cannot truncate.
 *
 * If a call fails because the function is missing, that is reported as an explicit
 * error rather than rendered as zero. A migration that was run on one environment
 * and not another must not look like a quiet day.
 *
 *   POST /api/traffic-roster   { "password": "..." }
 *   GET  /api/traffic-roster   with header  X-Admin-Password: ...
 */
import { getSupabaseAdmin } from './supabase';
import { requireAdmin } from '../../lib/adminAuth';

export const config = { maxDuration: 60 };

const CHART_DAYS = 45;
const BREAKDOWN_DAYS = 30;

export default async function handler(req, res) {
  // requireAdmin returns TRUE when it has REJECTED and already responded. Written
  // inverted once already in waitlist-roster, where it returned empty for a valid
  // admin and ran the query for an invalid one. Match the working form exactly.
  if (await requireAdmin(req, res, 'traffic-roster')) return;

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase is not configured.' });
    }

    const [daily, byReferrer, byPath] = await Promise.all([
      supabase.rpc('site_visits_daily', { days: CHART_DAYS }),
      supabase.rpc('site_visits_by_referrer', { days: BREAKDOWN_DAYS }),
      supabase.rpc('site_visits_by_path', { days: BREAKDOWN_DAYS }),
    ]);

    // A missing RPC means scripts/sql/site_visits.sql has not been run here. Say
    // that, rather than returning an empty chart that reads as "no visitors".
    if (daily.error) {
      console.error('traffic-roster daily read failed:', daily.error);
      return res.status(500).json({
        error: `Daily visitor read failed: ${daily.error.message}`,
        hint: 'If this says the function does not exist, scripts/sql/site_visits.sql has not been run on this database.',
      });
    }

    const days = (daily.data || []).map((r) => ({
      date: r.visit_date,
      visitors: Number(r.visitors) || 0,
    }));

    // Ordered newest-first by the RPC. The chart wants oldest-first.
    const series = [...days].reverse();

    const todayCentral = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const sumLast = (n) => days.slice(0, n).reduce((acc, d) => acc + d.visitors, 0);

    const withData = days.filter((d) => d.visitors > 0);
    const busiest = withData.reduce(
      (best, d) => (!best || d.visitors > best.visitors ? d : best),
      null
    );

    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      timezone: 'America/Chicago',
      chartDays: CHART_DAYS,
      breakdownDays: BREAKDOWN_DAYS,

      // "today" is a partial day and is labelled as such wherever it is shown.
      today: days.find((d) => d.date === todayCentral)?.visitors || 0,
      todayDate: todayCentral,

      totals: {
        last7: sumLast(7),
        last30: sumLast(30),
        // Deliberately a SUM of daily uniques, NOT distinct people over 30 days.
        // Someone visiting on five days counts five times. Naming it plainly here
        // because "30-day visitors" would be read as an audience size.
        note: 'Totals are the sum of daily unique visitors. A person who visits on five days counts five times.',
      },

      busiestDay: busiest,
      daysRecorded: withData.length,
      series,

      byReferrer: (byReferrer.data || []).map((r) => ({
        host: r.referrer_host,
        visitors: Number(r.visitors) || 0,
      })),
      byReferrerError: byReferrer.error ? byReferrer.error.message : null,

      byLandingPath: (byPath.data || []).map((r) => ({
        path: r.first_path,
        visitors: Number(r.visitors) || 0,
      })),
      byLandingPathError: byPath.error ? byPath.error.message : null,
    });
  } catch (e) {
    console.error('traffic-roster failed:', e);
    return res.status(500).json({ error: e.message || 'Traffic roster failed' });
  }
}
