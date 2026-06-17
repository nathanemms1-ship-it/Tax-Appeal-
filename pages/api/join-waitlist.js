import { getSupabaseAdmin } from './supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, name, state, county, propertyAddress, notifyDate } = req.body;
  if (!email || !state) return res.status(400).json({ error: 'Missing required fields' });

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

  try {
    // Check if already on waitlist
    const { data: existing } = await supabase
      .from('waitlist')
      .select('id')
      .eq('email', email)
      .eq('state', state)
      .single();

    if (existing) {
      return res.status(200).json({ success: true, duplicate: true, message: 'Already on the waitlist' });
    }

    const { data, error } = await supabase
      .from('waitlist')
      .insert({
        email,
        name: name || null,
        state,
        county: county || null,
        property_address: propertyAddress || null,
        notify_date: notifyDate || null,
        notified: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Waitlist insert error:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('Waitlist entry saved:', data.id, email, state);
    return res.status(200).json({ success: true, id: data.id });
  } catch (err) {
    console.error('Join waitlist error:', err);
    return res.status(500).json({ error: err.message });
  }
}
