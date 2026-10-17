/**
 * POST /api/fl-kit-quote — the Florida "should you petition?" check, before payment.
 *
 * Runs lib/kit/flQuote.js on our copy of the DOR roll and sale file (Supabase):
 * the parcel, the property appraiser's own qualified sales, the county's
 * millage. When the answer is "yes, and this county can be sold today", the
 * complete kit order is stored in Redis under a random kitKey (7 days).
 * Checkout takes ONLY the kitKey and re-validates the stored order: the browser
 * never supplies the values printed on the petition.
 */
import crypto from 'crypto';
import { Redis } from '@upstash/redis';
import { enforceRateLimit } from '../../lib/rateLimit';
import { findParcel } from '../../lib/dor/parcels';
import { findComps } from '../../lib/dor/comps';
import { millageForCounty } from '../../lib/dor/millage';
import { LOADED_COUNTIES } from '../../lib/dor/coverage';
import { totalCostToCure } from '../../lib/costToCure';
import { quoteFlKit, FL_QUOTE } from '../../lib/kit/flQuote';

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };
export const KIT_KEY_TTL_SECONDS = 7 * 24 * 3600;

let redis = null;
try {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) redis = new Redis({ url, token });
} catch (e) { console.log('Redis init failed:', e.message); }

const str = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Only the fields the quote uses, trimmed. Anything else in the body is ignored. */
export function cleanFlQuoteInput(b = {}) {
  const prop = b.property || {};
  const own = b.owner || {};
  return {
    property: { street: str(prop.street), city: str(prop.city, 60), zip: str(prop.zip, 10) },
    owner: {
      name: str(own.name, 80), street: str(own.street), street2: str(own.street2), city: str(own.city, 60),
      state: str(own.state, 2).toUpperCase(), zip: str(own.zip, 10), phone: str(own.phone, 20), email: str(own.email, 120).toLowerCase(),
    },
    taxYear: Number(b.taxYear) || null,
    trimDeadline: /^\d{4}-\d{2}-\d{2}$/.test(String(b.trimDeadline || '')) ? b.trimDeadline : null,
    willNotAttend: b.willNotAttend === true,
    issues: Array.isArray(b.issues) ? b.issues.filter((x) => typeof x === 'string').slice(0, 20).map((x) => x.slice(0, 80)) : [],
    costOverrides: b.costOverrides && typeof b.costOverrides === 'object' ? Object.fromEntries(Object.entries(b.costOverrides).slice(0, 20).map(([k, v]) => [String(k).slice(0, 80), String(v).slice(0, 12)])) : {},
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (await enforceRateLimit(req, res, 'fl-kit-quote', 8, 60)) return;
  if (await enforceRateLimit(req, res, 'fl-kit-quote', 60, 3600)) return;

  const input = cleanFlQuoteInput(req.body || {});
  if (!input.property.street || !input.property.zip) return res.status(400).json({ error: 'Property address is required.' });
  try {
    const quote = await quoteFlKit(input, {
      findParcel, findComps, millageForCounty, totalCostToCure,
      countyName: (coNo) => LOADED_COUNTIES[Number(coNo)] || null,
    });
    let kitKey = null;
    if (quote.decision === FL_QUOTE.CASE && quote.sellable) {
      if (!redis) return res.status(200).json({ ...stripKit(quote), sellable: false, notSellableReason: 'kit_store_unavailable', kitKey: null });
      kitKey = `kit:FL:${crypto.randomUUID()}`;
      await redis.set(kitKey, JSON.stringify(quote.kitOrder), { ex: KIT_KEY_TTL_SECONDS });
    }
    return res.status(200).json({ ...stripKit(quote), kitKey });
  } catch (e) {
    console.error('[fl-kit-quote] failed:', e?.message);
    return res.status(502).json({ error: 'We could not check this home right now. Please try again shortly.', code: 'UPSTREAM' });
  }
}

// Never send the kit order itself back: what is printed comes from the server copy.
function stripKit(q) { const { kitOrder, ...rest } = q; return rest; }
