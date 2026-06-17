import { createClient } from '@supabase/supabase-js';

// Server-side client using service key — bypasses RLS
export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    console.error('Missing Supabase credentials');
    return null;
  }

  return createClient(url, key, {
    auth: { persistSession: false }
  });
}
