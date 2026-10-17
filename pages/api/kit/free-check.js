/**
 * POST /api/kit/free-check { kitKey, code? } — does a proved free kit apply to
 * this checked kit? (components/FreeKitField.js.) Read-only: checkout decides
 * and claims. Answers only yes/no about the kit the caller already holds.
 */
import { Redis } from '@upstash/redis';
import { enforceRateLimit } from '../../../lib/rateLimit';
import { getSupabaseAdmin } from '../supabase';
import { findFreeKit } from '../../../lib/kit/freeKit';

let redis = null;
try {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) redis = new Redis({ url, token });
} catch (e) { /* no store: never free */ }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (await enforceRateLimit(req, res, 'kit-free-check', 20, 600)) return;
  const kitKey = typeof req.body?.kitKey === 'string' ? req.body.kitKey : '';
  if (!/^kit:[A-Z]{2}:[0-9a-f-]{36}$/.test(kitKey) || !redis) return res.status(200).json({ free: false });
  try {
    const raw = await redis.get(kitKey);
    const kitOrder = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
    const hit = await findFreeKit(getSupabaseAdmin(), kitOrder, req.body?.code);
    return res.status(200).json({ free: Boolean(hit) });
  } catch (e) {
    return res.status(200).json({ free: false });
  }
}
