import { adminPasswordMatches } from '../../lib/adminAuth';
import { getSupabaseAdmin } from './supabase';
import { enforceRateLimit } from '../../lib/rateLimit';

/**
 * Columns the admin UI actually renders (see pages/admin.js). This replaces
 * select('*').
 *
 * select('*') returned EVERY column of EVERY order to the browser, including
 * password_hash for every customer — a full bcrypt hash dump behind one shared
 * password, sitting in the admin tab's memory and in any HAR file or client-side
 * error report. It also returned the signature name/timestamp fields, i.e. the
 * attestation data on sworn petitions. None of it was displayed.
 */
const ADMIN_FIELDS = [
  'id', 'created_at',
  'customer_name', 'customer_email',
  'property_address', 'county', 'state', 'state_code',
  'assessed_value', 'market_value', 'target_reduction', 'reduction_pct',
  'estimated_savings', 'actual_savings',
  'district_name', 'district_address', 'district_city', 'district_state', 'district_zip',
  'lob_letter_id', 'lob_tracking_number', 'lob_status',
  'amount_paid', 'payment_status', 'stripe_session_id',
  'dispute_status', 'outcome', 'outcome_reported_at',
  'scheduled_file_date',
].join(', ');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // A single shared password with no lockout is online-guessable. Cap the attempts.
  if (await enforceRateLimit(req, res, 'admin-orders', 10, 60)) return;
  if (await enforceRateLimit(req, res, 'admin-orders', 60, 3600)) return;

  const { password } = req.body || {};

  if (!adminPasswordMatches(password)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(500).json({ error: 'Database unavailable' });
  }

  try {
    const { data, error } = await supabase
      .from('orders')
      .select(ADMIN_FIELDS)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Get orders error:', error);
      return res.status(500).json({ error: error.message });
    }

    // Calculate stats
    const totalOrders = data.length;
    const totalRevenue = data.reduce((sum, o) => sum + (o.amount_paid || 0), 0);
    const totalSavings = data.reduce((sum, o) => sum + (o.estimated_savings || 0), 0);
    const filed = data.filter(o => o.dispute_status === 'filed').length;
    const approved = data.filter(o => o.outcome === 'approved').length;
    const denied = data.filter(o => o.outcome === 'denied').length;
    const pending = data.filter(o => !o.outcome || o.outcome === 'pending').length;

    return res.status(200).json({
      orders: data,
      stats: {
        totalOrders,
        totalRevenue,
        totalSavings,
        filed,
        approved,
        denied,
        pending,
      },
    });
  } catch (err) {
    console.error('Get orders error:', err);
    return res.status(500).json({ error: err.message });
  }
}
