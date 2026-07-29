// pages/api/partner-stats.js
// Partner-facing stats endpoint — authenticated by ref code + email match.
// GET /api/partner-stats?ref=JANE-SMITH&email=jane@example.com
import { getSupabaseAdmin } from './supabase';
import Stripe from 'stripe';
import { enforceRateLimit } from '../../lib/rateLimit';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // The (ref, email) pair is the credential, and a referral code is public by
  // design — it is in every link the partner shares. That makes this an email
  // guessing oracle against a known code, and each call also hits Stripe's
  // accounts.retrieve. Bound it.
  if (await enforceRateLimit(req, res, 'partner-stats', 15, 60)) return;
  if (await enforceRateLimit(req, res, 'partner-stats', 100, 3600)) return;

  const { ref, email } = req.query;
  if (!ref || !email) return res.status(400).json({ error: 'Missing ref or email' });

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

  try {
    // Authenticate: ref code must belong to this email
    const { data: partner, error: partnerError } = await supabase
      .from('referrals')
      .select('id, code, name, first_name, email, role, states_active, stripe_account_id, total_referrals, total_paid, created_at')
      .eq('code', ref.toUpperCase())
      .eq('email', email.toLowerCase().trim())
      .single();

    if (partnerError || !partner) {
      return res.status(401).json({ error: 'Invalid referral code or email address.' });
    }

    // Fetch all orders attributed to this ref code
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      // No customer_name. The response only ever exposes date/state/city (see
      // recentActivity below), so there is no reason to pull a buyer's name into a
      // partner-facing handler where a later edit could leak it.
      .select('id, amount_paid, created_at, property_address, state_code')
      .eq('ref_code', partner.code)
      .order('created_at', { ascending: false });

    if (ordersError) throw ordersError;

    const allOrders = orders || [];

    // All-time stats
    const totalReferrals = allOrders.length;
    const totalEarnings = totalReferrals * 20; // $20 per referral

    // This month's stats
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthOrders = allOrders.filter(o => new Date(o.created_at) >= monthStart);
    const thisMonthReferrals = thisMonthOrders.length;
    const thisMonthEarnings = thisMonthReferrals * 20;

    // Last month's stats
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthOrders = allOrders.filter(o => {
      const d = new Date(o.created_at);
      return d >= lastMonthStart && d < monthStart;
    });
    const lastMonthReferrals = lastMonthOrders.length;
    const lastMonthEarnings = lastMonthReferrals * 20;

    // State breakdown (all-time)
    const byState = {};
    for (const o of allOrders) {
      const s = (o.state_code || 'Unknown').toUpperCase();
      byState[s] = (byState[s] || 0) + 1;
    }

    // Recent activity — last 10 orders, redacted for privacy
    const recentActivity = allOrders.slice(0, 10).map(o => ({
      date: o.created_at,
      state: (o.state_code || '').toUpperCase(),
      city: extractCity(o.property_address),
      earnings: 20,
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
      },
      allTime: {
        referrals: totalReferrals,
        earnings: totalEarnings,
      },
      thisMonth: {
        referrals: thisMonthReferrals,
        earnings: thisMonthEarnings,
        month: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      },
      lastMonth: {
        referrals: lastMonthReferrals,
        earnings: lastMonthEarnings,
        month: lastMonthStart.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      },
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
