// pages/api/waitlist-roster.js
/**
 * EVERY HOMEOWNER WE TURNED AWAY, AND WHY.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * The funnel refuses a sale in five different places — an unsupported state, a
 * state we are not serving until 2027, a filing window that has closed, a Florida
 * county whose fee or address we have not confirmed, and a Florida property with
 * no parcel record. Each one writes the homeowner to `waitlist`.
 *
 * Nothing read it back. `/admin` showed orders and partners; `lib/healthChecks.js`
 * had no waitlist check. So "how many people did we turn away this week, and
 * where" was answerable only by opening the Supabase table editor, which means in
 * practice it was never answered.
 *
 * That is the wrong thing to be blind to during the Florida season. A refusal is
 * not a lost customer — it is a customer who told us their county, their address
 * and their email, and is waiting. The Florida county breakdown below is a demand
 * ranking: if forty Sarasota homeowners were refused this week and one was refused
 * in Levy, that is the call order, and it beats ranking counties by population as
 * the call sheet currently does.
 *
 * ============================================================================
 * WHAT THE REASONS MEAN, BECAUSE THEY ARE NOT INTERCHANGEABLE
 * ============================================================================
 *   fl_county_unconfirmed  We can fix this with a phone call. cron/notify-waitlist
 *                          re-tests both gates daily and emails them the moment the
 *                          county confirms. THIS IS THE ACTIONABLE BUCKET.
 *
 *   fl_no_parcel_record    The property is not on the DOR roll we hold. Nothing is
 *                          scheduled to contact these people — the cron skips any
 *                          blocked_reason as a catch-all and, unlike the county
 *                          case, no branch ever clears this one. Surfaced here
 *                          precisely because it is a silent dead end and somebody
 *                          should decide what it is for.
 *
 *   null + a served state  An ordinary "window is closed, we will write when it
 *                          opens" row. The cron handles these.
 *
 *   null + AR or AL        Stamped filing_year = next year at capture, so this
 *                          season's cron cannot see them and cannot email them a
 *                          promise we are not in a position to keep.
 *
 *   null + anything else   California, New York and so on. getFilingWindowStatus
 *                          returns null for these, so the cron skips them every
 *                          run, and they carry the CURRENT filing year with no
 *                          rollover — so they are orphaned rather than waiting.
 *                          Counted separately below under `orphaned` for that
 *                          reason; do not read it as a pipeline.
 *
 *   POST /api/waitlist-roster   { "password": "..." }
 *   GET  /api/waitlist-roster   with header  X-Admin-Password: ...
 */
import { getSupabaseAdmin } from './supabase';
import { requireAdmin } from '../../lib/adminAuth';

export const config = { maxDuration: 60 };

// Bounded on purpose. An unbounded select is the defect recorded against
// settle-referrals — if PostgREST's db-max-rows is set, the read silently
// truncates and every total below is understated with no sign that it happened.
// Asking for one more than we intend to use is how we detect the ceiling.
const ROW_CAP = 5000;
const RECENT_SHOWN = 60;

const SERVED = ['TX', 'GA', 'FL'];

export default async function handler(req, res) {
  // requireAdmin returns TRUE when it has REJECTED the request and already sent a
  // response. Written inverted first, which returned empty for a valid admin and ran
  // the query for an invalid one — caught by verify-routes reaching the database with
  // no password. The convention reads backwards; match partner-roster exactly.
  if (await requireAdmin(req, res, 'waitlist-roster')) return;

  try {
    const supabase = getSupabaseAdmin();
    const { data: rows, error } = await supabase
      .from('waitlist')
      .select('id, email, name, state, county, property_address, blocked_reason, filing_year, notify_date, notified, notified_count, created_at')
      .order('created_at', { ascending: false })
      .limit(ROW_CAP + 1);

    if (error) {
      console.error('waitlist-roster read failed:', error);
      return res.status(500).json({ error: `Waitlist read failed: ${error.message}` });
    }

    const truncated = (rows || []).length > ROW_CAP;
    const all = (rows || []).slice(0, ROW_CAP);

    const now = new Date();
    const since = (days) => new Date(now.getTime() - days * 86400000);
    const inLast = (days) => all.filter((r) => r.created_at && new Date(r.created_at) >= since(days));

    const tally = (list, key) => {
      const out = {};
      for (const r of list) {
        const k = key(r) || '—';
        out[k] = (out[k] || 0) + 1;
      }
      return Object.entries(out).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
    };

    /**
     * The Florida call ranking. Only fl_county_unconfirmed rows, because those are
     * the ones a phone call converts — a no_parcel_record row in the same county
     * tells you nothing about whether to ring the VAB clerk, so mixing them would
     * make the ranking say something it does not mean.
     */
    const flBlocked = all.filter((r) => r.blocked_reason === 'fl_county_unconfirmed');
    const flDemand = tally(flBlocked, (r) => r.county).map((c) => ({
      ...c,
      last7: flBlocked.filter((r) => r.county === c.name && r.created_at && new Date(r.created_at) >= since(7)).length,
    }));

    const orphaned = all.filter((r) => !r.blocked_reason && !SERVED.includes((r.state || '').toUpperCase()) &&
      !['AR', 'AL'].includes((r.state || '').toUpperCase()));

    return res.status(200).json({
      generatedAt: now.toISOString(),
      truncated,
      rowCap: ROW_CAP,
      totals: {
        all: all.length,
        last7: inLast(7).length,
        last30: inLast(30).length,
      },
      byReason: tally(all, (r) => r.blocked_reason || 'window_or_state_not_open'),
      byState: tally(all, (r) => (r.state || '').toUpperCase()),
      byYear: tally(all, (r) => String(r.filing_year || '—')),
      flDemand,
      deadEnds: {
        // Captured and never contacted. Both numbers should prompt a decision, not
        // sit in a log line.
        noParcelRecord: all.filter((r) => r.blocked_reason === 'fl_no_parcel_record').length,
        orphanedStates: orphaned.length,
        orphanedList: tally(orphaned, (r) => (r.state || '').toUpperCase()),
      },
      recent: all.slice(0, RECENT_SHOWN).map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        email: r.email,
        name: r.name,
        state: (r.state || '').toUpperCase(),
        county: r.county,
        propertyAddress: r.property_address,
        reason: r.blocked_reason || null,
        filingYear: r.filing_year,
        notified: !!r.notified,
      })),
    });
  } catch (e) {
    console.error('waitlist-roster failed:', e);
    return res.status(500).json({ error: e.message || 'Waitlist roster failed' });
  }
}
