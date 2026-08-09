// pages/api/referral-stats.js
/**
 * THE OPERATOR'S VIEW OF A SETTLEMENT PERIOD.
 *
 * Read-only. This route has never moved money and must not start: the transfers
 * happen in /api/cron/settle-referrals, which is the only writer of the
 * referral_payouts ledger. This is the sheet you look at before and after that run.
 *
 * The eligibility rules used to live inline here, duplicated (differently, and
 * wrongly) in /api/partner-stats. Both now call lib/referralSettlement.js, so the
 * number a partner sees on their dashboard and the number on this sheet are
 * produced by the same code. When they disagreed, the partner was the one who
 * noticed, and we had nothing to show them.
 *
 * The admin password NO LONGER goes in the query string — see lib/adminAuth.js.
 *   curl -H "X-Admin-Password: $PW" 'https://taxappealusa.com/api/referral-stats?month=2026-07'
 *   curl -X POST -H 'Content-Type: application/json' \
 *        -d '{"password":"...","month":"2026-07"}' https://taxappealusa.com/api/referral-stats
 */
import { getSupabaseAdmin } from './supabase';
import { requireAdmin } from '../../lib/adminAuth';
import { settle, REFERRAL_PAYOUT_CENTS } from '../../lib/referralSettlement';

/**
 * UTC boundaries. `created_at` is UTC; building these in server local time moves the
 * month boundary by the server's offset, which hands a 1st-of-the-month order to the
 * previous period — or drops it out of both.
 */
function periodFor(month) {
  if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    const start = new Date(`${month}-01T00:00:00.000Z`);
    return { start, end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) };
  }
  const now = new Date();
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  };
}

const dollars = (cents) => Number((cents / 100).toFixed(2));

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (await requireAdmin(req, res, 'referral-stats')) return;

  const month = req.body?.month || req.query?.month;
  const { start, end } = periodFor(month);

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

  try {
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, ref_code, amount_paid, created_at, property_address, customer_name, customer_email, payment_status')
      .not('ref_code', 'is', null)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: false });
    if (ordersError) throw ordersError;

    const { data: partners, error: partnersError } = await supabase
      .from('referrals')
      .select('code, name, first_name, last_name, email, phone, stripe_account_id, active, total_referrals, total_paid');
    if (partnersError) throw partnersError;

    // The whole ledger, not this period's slice — see the same note in the cron.
    const { data: ledger, error: ledgerError } = await supabase
      .from('referral_payouts')
      .select('order_id, ref_code, amount_cents, status, stripe_transfer_id, paid_at');
    if (ledgerError) {
      // Do not fall through to an empty Set. "Nothing has ever been paid" is a
      // dangerous default for a sheet someone works from.
      throw new Error(
        `referral_payouts is unreadable (${ledgerError.message}). ` +
        `If the table does not exist yet, run scripts/sql/referral_payouts.sql.`
      );
    }

    const paidRows = (ledger || []).filter(r => r.status === 'paid');
    const paidOrderIds = new Set(paidRows.map(r => r.order_id));

    // Settled is not the same as paid. A clawed_back row was discharged by offset
    // against a reversed order — no money moved and none will. Omitting these would
    // put them back on the sheet as still owed.
    const clawedBackRows = (ledger || []).filter(r => r.status === 'clawed_back');
    const settledOrderIds = new Set([...paidOrderIds, ...clawedBackRows.map(r => r.order_id)]);

    // requirePayoutAccount stays FALSE here. This sheet answers "what do we owe",
    // and we owe a partner their $20 whether or not they have connected a bank yet.
    // The cron applies that filter when it is time to actually send it.
    const result = settle({
      orders: orders || [],
      partners: partners || [],
      settledOrderIds,
      requirePayoutAccount: false,
    });

    const payouts = result.payable.map(g => ({
      code: g.code,
      orderCount: g.orderCount,
      payoutDue: dollars(g.amountCents),
      // Surfaced so the sheet says WHY a partner is on it but unpayable, instead of
      // the operator finding out from the cron's held-for-no-bank list a month later.
      payoutReady: Boolean(g.partner?.stripe_account_id),
      referrer: {
        name: g.partner?.name || [g.partner?.first_name, g.partner?.last_name].filter(Boolean).join(' ') || 'Unknown',
        email: g.partner?.email || null,
        phone: g.partner?.phone || null,
      },
      orders: g.orders.map(o => ({
        orderId: o.id,
        customerName: o.customer_name,
        address: o.property_address,
        date: o.created_at,
      })),
    }));

    // What this period has ALREADY been paid, straight from the ledger. Without it
    // a re-run of this sheet after settlement looks like the money vanished: the
    // orders drop off `payouts` (correctly — they are settled) and nothing accounts
    // for them.
    const periodOrderIds = new Set((orders || []).map(o => o.id));
    const alreadyPaid = paidRows.filter(r => periodOrderIds.has(r.order_id));
    const alreadyPaidCents = alreadyPaid.reduce((s, r) => s + (r.amount_cents || 0), 0);
    const clawedBack = clawedBackRows.filter(r => periodOrderIds.has(r.order_id));

    return res.status(200).json({
      period: { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] },
      ratePerReferral: dollars(REFERRAL_PAYOUT_CENTS),
      summary: {
        totalPayoutDue: dollars(result.totalCents),
        totalOrders: result.totalOrders,
        activeReferrers: payouts.length,
        awaitingPayoutAccount: payouts.filter(p => !p.payoutReady).length,
        alreadyPaidThisPeriod: dollars(alreadyPaidCents),
        alreadyPaidOrders: alreadyPaid.length,
        // Discharged by offset against a reversed order, not by a transfer.
        clawedBackOrders: clawedBack.length,
        clawedBackAmount: dollars(clawedBack.reduce((s, r) => s + (r.amount_cents || 0), 0)),
      },
      payouts,
      // Excluded orders are reported, not silently dropped — a payout sheet that
      // quietly shrinks is worse than one that explains itself.
      excluded: result.excluded,
    });
  } catch (err) {
    console.error('Referral stats error:', err);
    return res.status(500).json({ error: err.message });
  }
}
