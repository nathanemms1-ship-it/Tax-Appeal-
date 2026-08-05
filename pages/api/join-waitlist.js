import { getSupabaseAdmin } from './supabase';
import { enforceRateLimit } from '../../lib/rateLimit';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // signup spam
  if (await enforceRateLimit(req, res, 'waitlist', 5, 60)) return;

  const { email, name, state, county, propertyAddress, notifyDate } = req.body;
  if (!email || !state) return res.status(400).json({ error: 'Missing required fields' });

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(500).json({ error: 'Database unavailable' });

  try {
    const currentYear = new Date().getFullYear();

    // Determine filing_year — FL waitlist in June-July is for the current year (Aug-Sep window)
    // TX/GA waitlist mid-year is for next year since their windows have passed
    const stateUpper = (state || '').toUpperCase();
    let filingYear = currentYear;
    if (stateUpper === 'TX' || stateUpper === 'GA') {
      // TX window closes May 31, GA window closes July 15
      // If we're past those dates, they're filing for next year
      const today = new Date();
      const txClose = new Date(currentYear, 4, 31); // May 31
      const gaClose = new Date(currentYear, 6, 15); // Jul 15
      if (stateUpper === 'TX' && today > txClose) filingYear = currentYear + 1;
      if (stateUpper === 'GA' && today > gaClose) filingYear = currentYear + 1;
    }

    // AR and AL are marked servingFrom: 2027 in pages/apply.js — we are deliberately
    // not filing in either this season, whatever their window says. Without this they
    // would be stamped with the CURRENT year, and cron/notify-waitlist.js would email
    // them the moment their window looked open — which is precisely the promise we
    // are not in a position to keep. Anyone signing up now is a 2027 filer.
    if (stateUpper === 'AR' || stateUpper === 'AL') {
      filingYear = currentYear + 1;
    }

    // Check if already on waitlist for this state + year
    const { data: existing } = await supabase
      .from('waitlist')
      .select('id')
      .eq('email', email.toLowerCase())
      .eq('state', stateUpper)
      .eq('filing_year', filingYear)
      .limit(1);

    if (existing?.length) {
      return res.status(200).json({ success: true, duplicate: true, message: 'Already on the waitlist' });
    }

    const { data, error } = await supabase
      .from('waitlist')
      .insert({
        email: email.toLowerCase(),
        name: name || null,
        state: stateUpper,
        county: county || null,
        property_address: propertyAddress || null,
        notify_date: notifyDate || null,
        filing_year: filingYear,
        notified_count: 0,
        notified: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Waitlist insert error:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('Waitlist entry saved:', data.id, email, stateUpper, `year=${filingYear}`);
    return res.status(200).json({ success: true, id: data.id });
  } catch (err) {
    console.error('Join waitlist error:', err);
    return res.status(500).json({ error: err.message });
  }
}
