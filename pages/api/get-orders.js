import { getSupabaseAdmin } from './supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password } = req.body;

  // Simple password protection — change this before going live
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(500).json({ error: 'Database unavailable' });
  }

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
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
