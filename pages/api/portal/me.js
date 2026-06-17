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

  // Verify JWT
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }

  // Fetch the order — only return safe fields, never password_hash
  const { data: order, error } = await supabase
    .from('orders')
    .select(
      'id, name, email, property_address, state, county, ' +
      'dispute_status, decision_date, decision_detail, savings_amount, ' +
      'created_at, lob_id, mailed_at'
    )
    .eq('id', payload.orderId)
    .single();

  if (error || !order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  return res.status(200).json({ order });
}
