import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }

  // Select using actual Supabase column names
  const { data: order, error } = await supabase
    .from('orders')
    .select(
      'id, customer_name, customer_email, property_address, state, county, ' +
      'dispute_status, decision_date, decision_detail, savings_amount, actual_savings, ' +
      'created_at, lob_letter_id, lob_tracking_number, lob_status, mailed_at, ' +
      'assessed_value, estimated_savings, outcome'
    )
    .eq('id', payload.orderId)
    .single();

  if (error || !order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  return res.status(200).json({ order });
}
