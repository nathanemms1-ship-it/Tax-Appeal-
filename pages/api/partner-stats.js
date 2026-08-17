// pages/api/partner-stats.js
/**
 * WHAT THE PARTNER SEES — AND IT NOW MATCHES WHAT WE ACTUALLY OWE THEM.
 *
 * ============================================================================
 * WHAT WAS WRONG
 * ============================================================================
 * This handler computed earnings as:
 *
 *     const totalEarnings = allOrders.length * 20;
 *
 * over every row carrying the partner's code. No payment_status filter, so refunded
 * and abandoned orders paid. No self-referral check, so a partner buying through
 * their own link counted. No active check. And no reference to the payout ledger, so
 * the number never distinguished money we had sent from money we had not.
 *
 * Meanwhile /api/referral-stats — the sheet the payouts are actually made from —
 * applied all of those rules. The two numbers were guaranteed to diverge, and the
 * partner's one was always the larger. Every gap was a support conversation where
 * they were right to be annoyed and we had nothing to show them.
 *
 * Both routes now call lib/referralSettlement.js. One rule set, three callers.
 *
 * ============================================================================
 * EARNED, PAID, PENDING — THREE DIFFERENT NUMBERS
 * ============================================================================
 * The old response had one, and the dashboard labelled it whatever the layout
 * needed — the same figure appeared as "earned total" in one card and "paid out" in
 * the next. So this returns all three separately and the UI cannot invent the
 * distinction:
 *
 *   earned  — eligible orders x $20. What they have made.
 *   paid    — rows in referral_payouts with status 'paid'. What has left our account.
 *   pending — the difference. Owed, not yet sent.
 *
 * GET /api/partner-stats?ref=JANE-SMITH&email=jane@example.com
 */
import { getSupabaseAdmin } from './supabase';
import Stripe from 'stripe';
import { enforceRateLimit } from '../../lib/rateLimit';
import { verifyPartnerToken } from '../../lib/partnerToken';
import { settle, REFERRAL_PAYOUT_CENTS } from '../../lib/referralSettlement';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const RATE = REFERRAL_PAYOUT_CENTS / 100;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // The (ref, email) pair is the credential, and a referral code is public by
  // design — it is in every link the partner shares. That makes this an email
  // guessing oracle against a known code, and each call also hits Stripe's
  // accounts.retrieve. Bound it.
  if (await enforceRateLimit(req, res, 'partner-stats', 15, 60)) return;
  if (await enforceRateLimit(req, res, 'partner-stats', 100, 3600)) return;

  const { ref, email, token } = req.query;
  if (!ref || !email) return res.status(400).json({ error: 'Missing ref or email' });

  /**
   * A DASHBOARD URL WAS A BEARER CREDENTIAL.
   *
   * The note above already calls the pair "the credential" and a code "public by
   * design" — which is the contradiction. /partners/dashboard authenticated on
   * ?ref=CODE&email=EMAIL alone, so the URL in a partner's address bar was enough to
   * read their earnings: browser history, a screenshot, a forwarded message, a
   * Referer header on any outbound link.
   *
   * The rate limiter makes this a slow oracle rather than a fast one. It does nothing
   * about someone who holds the link.
   *
   * Signature checked BEFORE the row is read, so an unsigned caller cannot use the
   * response to learn whether a (code, email) pair exists at all.
   */
  const codeUpper = String(ref).trim().toUpperCase();
  const emailLower = String(email).trim().toLowerCase();
  const linkCheck = verifyPartnerToken(codeUpper, emailLower, token);
  if (!linkCheck.ok) {
    console.warn(`[partner-stats] rejected token for ${codeUpper}: ${linkCheck.reason}`);
    return res.status(403).json({
      error: 'This dashboard link is not valid or has expired. Request a fresh link from the partners page.',
    });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

  try {
    // Authenticate: ref code must belong to this email
    const { data: partner, error: partnerError } = await supabase
      .from('referrals')
      .select('id, code, name, first_name, email, role, states_active, stripe_account_id, active, created_at, perk_code, perk_redeemed_at')
      .eq('code', ref.toUpperCase())
      .eq('email', email.toLowerCase().trim())
      .single();

    if (partnerError || !partner) {
      return res.status(401).json({ error: 'Invalid referral code or email address.' });
    }

    // customer_email is selected ONLY so eligibility() can compare it to the
    // partner's own address and catch self-referrals. It is never placed in the
    // response — see recentActivity below, which emits date/state/city and nothing
    // else. Do not add it to the payload.
    //
    // customer_name is deliberately still absent for the same reason it always was.
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, amount_paid, created_at, property_address, state_code, ref_code, customer_email, payment_status')
      .eq('ref_code', partner.code)
      .order('created_at', { ascending: false });
    if (ordersError) throw ordersError;

    const allOrders = orders || [];

    // What has actually been sent. A missing table here is NOT fatal on a partner-
    // facing page — degrade to "nothing recorded as paid yet", which understates
    // rather than overstates, and is the safe direction to be wrong in.
    const { data: ledger, error: ledgerError } = await supabase
      .from('referral_payouts')
      .select('order_id, amount_cents, status, paid_at, stripe_transfer_id')
      .eq('ref_code', partner.code);
    if (ledgerError) console.error('partner-stats: referral_payouts unreadable:', ledgerError.message);

    const paidRows = (ledger || []).filter(r => r.status === 'paid');
    const paidOrderIds = new Set(paidRows.map(r => r.order_id));

    // Orders discharged by OFFSET rather than by money moving — see the clawback in
    // /api/cron/settle-referrals. They are settled: not paid, and never pending.
    // Counting them as pending would leave a permanent phantom balance on the
    // dashboard for money the partner is never going to receive.
/**
 * ============================================================================
 * ONE CLAWBACK WRITES TWO ROWS. COUNTING BOTH DOUBLES IT.
 * ============================================================================
 * A single $20 recovery marks TWO rows `clawed_back` in
 * /api/cron/settle-referrals: the REVERSED order that was already paid, and the
 * WITHHELD order taken to offset it. Summing the status counted $40 for one $20
 * event, and the partner's dashboard read "$40 adjustment (2 referrals withheld)"
 * when one referral was withheld.
 *
 * The two rows are told apart structurally, not by parsing failure_reason:
 *
 *   reversed  — was `paid`, so it carries a stripe_transfer_id
 *   withheld  — never paid, so it does not
 *
 * That holds because status only becomes `paid` after a transfer id is written,
 * and a paid order is in settledOrderIds so it can never be chosen for withholding.
 * The cron also writes stripe_transfer_id: null on the withheld row explicitly, so
 * the discriminator is asserted rather than incidental.
 *
 * WHICH ONE IS THE ADJUSTMENT: the withheld order. That is the $20 taken off what
 * this partner is about to receive. The reversed order's $20 was paid in an earlier
 * period and is already out of `paid` — counting it here would deduct it a second
 * time from money that was never in this balance.
 */
    const clawedBackRows = (ledger || []).filter(r => r.status === 'clawed_back');
    const withheldRows = clawedBackRows.filter(r => !r.stripe_transfer_id);
    // Both kinds are SETTLED — neither is owed — so both belong in this set.
    const settledOrderIds = new Set([...paidOrderIds, ...clawedBackRows.map(r => r.order_id)]);

    // settledOrderIds is EMPTY on purpose. We want the full picture of what this
    // partner has earned all-time, including orders already paid; the paid/pending
    // split is applied below from the ledger. Passing the settled set here would
    // make their lifetime earnings shrink every time we paid them.
    //
    // requirePayoutAccount is false: someone who has not connected a bank has still
    // earned the money and should see it. The cron is the caller that cares.
    const result = settle({
      orders: allOrders,
      partners: [partner],
      settledOrderIds: new Set(),
      requirePayoutAccount: false,
    });

    const eligible = result.payable[0]?.orders || [];
    const eligibleIds = new Set(eligible.map(o => o.id));

    // Why orders they can see did not count. Counts only — no order ids, no
    // addresses, nothing that turns this into a lookup for someone who guessed an
    // email. Enough for support to answer "why is it 9 and not 11".
    const notCounted = {};
    for (const e of result.excluded) notCounted[e.reason] = (notCounted[e.reason] || 0) + 1;

    const inRange = (o, from, to) => {
      const d = new Date(o.created_at);
      return d >= from && (!to || d < to);
    };

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const thisMonthOrders = eligible.filter(o => inRange(o, monthStart, null));
    const lastMonthOrders = eligible.filter(o => inRange(o, lastMonthStart, monthStart));

    const paidCents = paidRows.reduce((s, r) => s + (r.amount_cents || 0), 0);
    const withheldCents = withheldRows.reduce((s, r) => s + (r.amount_cents || 0), 0);
    const earnedCents = eligible.length * REFERRAL_PAYOUT_CENTS;
    // Clamped at zero: a manual out-of-band transfer could in principle exceed what
    // the rules say is earned, and "-$20 pending" on a partner's dashboard is worse
    // than $0. Clawed-back orders come out here too — they are settled, not owed.
    const pendingCents = Math.max(0, earnedCents - paidCents - withheldCents);

    // State breakdown counts ELIGIBLE orders only, so the bars add up to the
    // headline referral count. They used to be computed over every row, which is
    // how a dashboard ends up showing 11 referrals in the chart and 9 in the total.
    const byState = {};
    for (const o of eligible) {
      const s = (o.state_code || 'Unknown').toUpperCase();
      byState[s] = (byState[s] || 0) + 1;
    }

    // Recent activity — eligible orders only, redacted. Showing ineligible orders
    // here with a "+$20" beside them is the original bug in miniature.
    const recentActivity = eligible.slice(0, 10).map(o => ({
      date: o.created_at,
      state: (o.state_code || '').toUpperCase(),
      city: extractCity(o.property_address),
      earnings: RATE,
      paid: paidOrderIds.has(o.id),
    }));

    // Stripe Connect status
    let stripeStatus = 'not_connected';
    let stripePayoutsEnabled = false;
    if (partner.stripe_account_id) {
      try {
        const account = await stripe.accounts.retrieve(partner.stripe_account_id);
        stripePayoutsEnabled = account.payouts_enabled;
        stripeStatus = account.payouts_enabled ? 'active' : 'pending';
      } catch (e) {
        stripeStatus = 'error';
      }
    }

    const referralLink = `${process.env.NEXT_PUBLIC_BASE_URL}/apply?ref=${partner.code}`;

    return res.status(200).json({
      partner: {
        name: partner.name || partner.first_name || '',
        firstName: partner.first_name || '',
        email: partner.email,
        code: partner.code,
        role: partner.role || '',
        statesActive: partner.states_active || '',
        memberSince: partner.created_at,
        referralLink,
        // THE COUPON. Exposed here because an email gets buried and "where is my
        // code again" is otherwise a support message. This is its permanent home.
        //
        // `perkRedeemedAt` is sent alongside it rather than hiding a spent code:
        // a partner who gave theirs away should be able to see that it was used,
        // instead of handing out a dead code and being told so by the recipient.
        perkCode: partner.perk_code || null,
        perkRedeemedAt: partner.perk_redeemed_at || null,
        // A deactivated partner should not be looking at a page that implies money
        // is on the way. The UI reads this.
        active: partner.active !== false,
      },
      ratePerReferral: RATE,
      allTime: {
        referrals: eligible.length,
        earnings: eligible.length * RATE,
      },
      // The three numbers that used to be one.
      paid: { orders: paidRows.length, amount: paidCents / 100 },
      pending: { orders: Math.max(0, eligible.length - settledOrderIds.size), amount: pendingCents / 100 },
      // Referrals withheld to offset an earlier one that was refunded or charged
      // back. Shown rather than silently netted, because a partner watching their
      // pending total drop with no explanation will — reasonably — ask why.
      adjustments: { orders: withheldRows.length, amount: withheldCents / 100 },
      thisMonth: {
        referrals: thisMonthOrders.length,
        earnings: thisMonthOrders.length * RATE,
        month: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      },
      lastMonth: {
        referrals: lastMonthOrders.length,
        earnings: lastMonthOrders.length * RATE,
        paidAmount: lastMonthOrders.filter(o => paidOrderIds.has(o.id)).length * RATE,
        month: lastMonthStart.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      },
      notCounted,
      byState,
      recentActivity,
      stripe: {
        status: stripeStatus,
        payoutsEnabled: stripePayoutsEnabled,
        accountId: partner.stripe_account_id || null,
      },
    });
  } catch (err) {
    console.error('partner-stats error:', err);
    return res.status(500).json({ error: err.message });
  }
}

function extractCity(address) {
  if (!address) return '';
  // "123 Main St, Austin, TX 78701" → "Austin"
  const parts = address.split(',');
  if (parts.length >= 2) return parts[parts.length - 2].trim().split(' ')[0];
  return '';
}
