// pages/api/partner-roster.js
/**
 * EVERY PARTNER, WHAT THEY HAVE EARNED, AND WHETHER WE CAN ACTUALLY PAY THEM.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * Until this route, the partner programme had no operator view at all.
 *
 *   /admin                showed orders. It did not mention partners.
 *   /api/referral-stats   is the payout sheet for ONE period, JSON only, and it
 *                         only lists partners who are owed money that month.
 *   /partners/dashboard   needs the partner's own code and email.
 *
 * So "who signed up", "who connected a bank", "who has earned money we cannot
 * send" were answerable only by opening the Supabase table editor. The middle one
 * matters most: a partner with earnings and no payout account is owed real money
 * that no automated process will ever deliver. That is a nudge list, and it was
 * invisible.
 *
 * ============================================================================
 * THE NUMBERS COME FROM settle(), NOT FROM A COUNT
 * ============================================================================
 * `referrals.total_referrals` and `referrals.total_paid` exist as columns and are
 * NOT used here. They are written at signup and never maintained, so they are zero
 * for everyone — and a stale column that looks authoritative is worse than no
 * column. Everything below is derived from the orders table through the same
 * settle() the cron uses, so this page cannot disagree with what gets paid.
 *
 *   POST /api/partner-roster   { "password": "..." }
 *   GET  /api/partner-roster   with header  X-Admin-Password: ...
 */
import Stripe from 'stripe';
import { getSupabaseAdmin } from './supabase';
import { requireAdmin } from '../../lib/adminAuth';
import { settle, REFERRAL_PAYOUT_CENTS } from '../../lib/referralSettlement';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/** Stripe account lookups are one API call each; bound it so a big roster cannot stall the page. */
const MAX_STRIPE_LOOKUPS = 100;

const dollars = (cents) => Number((cents / 100).toFixed(2));
const norm = (s) => String(s || '').trim().toUpperCase();

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (await requireAdmin(req, res, 'partner-roster')) return;

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

  try {
    const { data: partners, error: partnersError } = await supabase
      .from('referrals')
      .select('id, code, name, first_name, last_name, email, phone, role, states_active, client_volume, stripe_account_id, active, created_at')
      .order('created_at', { ascending: false });
    if (partnersError) throw partnersError;

    // Every referred order, all time. Lifetime figures are the point of this view.
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, ref_code, customer_email, payment_status, created_at')
      .not('ref_code', 'is', null);
    if (ordersError) throw ordersError;

    const { data: ledger, error: ledgerError } = await supabase
      .from('referral_payouts')
      .select('order_id, ref_code, amount_cents, status, paid_at');
    if (ledgerError) {
      throw new Error(
        `referral_payouts is unreadable (${ledgerError.message}). ` +
        `If the table does not exist yet, run scripts/sql/referral_payouts.sql.`
      );
    }

    // Lifetime earned: settledOrderIds empty and minAgeDays 0 on purpose. This answers
    // "what has this partner earned since they joined", not "what is payable today" —
    // the paid / withheld / pending split comes from the ledger below.
    const result = settle({
      orders: orders || [],
      partners: partners || [],
      settledOrderIds: new Set(),
      requirePayoutAccount: false,
    });

    const earnedByCode = {};
    for (const g of result.payable) earnedByCode[g.code] = g.orderCount;

    const ledgerByCode = {};
    for (const row of ledger || []) {
      const code = norm(row.ref_code);
      const b = (ledgerByCode[code] ||= { paid: 0, paidCents: 0, clawedBack: 0, failed: 0, lastPaidAt: null });
      if (row.status === 'paid') {
        b.paid += 1;
        b.paidCents += row.amount_cents || 0;
        if (row.paid_at && (!b.lastPaidAt || row.paid_at > b.lastPaidAt)) b.lastPaidAt = row.paid_at;
      } else if (row.status === 'clawed_back') b.clawedBack += 1;
      else if (row.status === 'failed') b.failed += 1;
    }

    // Stripe status, so the nudge list can tell "never started" from "started and
    // never finished". Those need different emails.
    const withAccounts = (partners || []).filter(p => p.stripe_account_id).slice(0, MAX_STRIPE_LOOKUPS);
    const stripeByAccount = {};
    await Promise.all(withAccounts.map(async (p) => {
      try {
        const acct = await stripe.accounts.retrieve(p.stripe_account_id);
        stripeByAccount[p.stripe_account_id] = {
          status: acct.payouts_enabled ? 'active' : 'pending',
          payoutsEnabled: Boolean(acct.payouts_enabled),
          detailsSubmitted: Boolean(acct.details_submitted),
        };
      } catch (e) {
        // A retrievable-account failure must not blank the whole roster.
        stripeByAccount[p.stripe_account_id] = { status: 'error', payoutsEnabled: false, detailsSubmitted: false };
      }
    }));

    const roster = (partners || []).map(p => {
      const code = norm(p.code);
      const l = ledgerByCode[code] || { paid: 0, paidCents: 0, clawedBack: 0, failed: 0, lastPaidAt: null };
      const earnedOrders = earnedByCode[code] || 0;
      const earnedCents = earnedOrders * REFERRAL_PAYOUT_CENTS;
      const settledOrders = l.paid + l.clawedBack;
      const stripeInfo = p.stripe_account_id
        ? (stripeByAccount[p.stripe_account_id] || { status: 'unknown', payoutsEnabled: false, detailsSubmitted: false })
        : { status: 'not_connected', payoutsEnabled: false, detailsSubmitted: false };

      return {
        code: p.code,
        name: p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || '—',
        email: p.email,
        phone: p.phone || null,
        role: p.role || null,
        statesActive: p.states_active || null,
        clientVolume: p.client_volume || null,
        joined: p.created_at,
        active: p.active !== false,
        stripe: stripeInfo,
        earnedOrders,
        earned: dollars(earnedCents),
        paidOrders: l.paid,
        paid: dollars(l.paidCents),
        clawedBackOrders: l.clawedBack,
        failedOrders: l.failed,
        pendingOrders: Math.max(0, earnedOrders - settledOrders),
        pending: dollars(Math.max(0, earnedCents - l.paidCents - l.clawedBack * REFERRAL_PAYOUT_CENTS)),
        lastPaidAt: l.lastPaidAt,
      };
    });

    // THE NUDGE LIST. Partners who have earned money we physically cannot send,
    // because Stripe payouts are not enabled on their account. Every name here is
    // money owed and a one-line email away from being deliverable.
    const awaitingPayoutAccount = roster
      .filter(r => r.pending > 0 && !r.stripe.payoutsEnabled)
      .sort((a, b) => b.pending - a.pending);

    return res.status(200).json({
      ratePerReferral: dollars(REFERRAL_PAYOUT_CENTS),
      summary: {
        partners: roster.length,
        activePartners: roster.filter(r => r.active).length,
        connected: roster.filter(r => r.stripe.payoutsEnabled).length,
        withEarnings: roster.filter(r => r.earnedOrders > 0).length,
        totalEarned: dollars(roster.reduce((s, r) => s + r.earned * 100, 0)),
        totalPaid: dollars(roster.reduce((s, r) => s + r.paid * 100, 0)),
        totalPending: dollars(roster.reduce((s, r) => s + r.pending * 100, 0)),
        awaitingPayoutAccount: awaitingPayoutAccount.length,
        owedButUnpayable: dollars(awaitingPayoutAccount.reduce((s, r) => s + r.pending * 100, 0)),
      },
      roster,
      awaitingPayoutAccount,
      // Why referred orders did not count, across the whole programme. Aggregated by
      // reason so a spike in one — self_referral especially — is visible.
      notCounted: result.excluded.reduce((acc, e) => {
        acc[e.reason] = (acc[e.reason] || 0) + 1;
        return acc;
      }, {}),
    });
  } catch (err) {
    console.error('partner-roster error:', err);
    return res.status(500).json({ error: err.message });
  }
}
