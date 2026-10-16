/**
 * POST /api/ga-kit-quote — the Georgia "should you appeal?" check, before payment.
 *
 * Runs lib/kit/gaQuote.js on real data: RentCast for the home and its recorded
 * comparable sales, the GA savings check for the bill. When the answer is
 * "yes, and this county can be sold today", the complete kit order is stored
 * in Redis under a random kitKey (7 days). Checkout takes ONLY the kitKey and
 * re-validates the stored order: the browser never supplies the values that
 * get printed on the appeal.
 *
 * Cost control: RentCast is billed per call. The home record and its comps are
 * cached per address + tax year for 24 h, and every uncached call passes
 * checkSpend('rentcast') first.
 */
import crypto from 'crypto';
import { Redis } from '@upstash/redis';
import { enforceRateLimit } from '../../lib/rateLimit';
import { checkSpend } from '../../lib/spendGuard';
import { lookupProperty, RentcastError } from '../../lib/providers/rentcast';
import { rentcastSales } from '../../lib/kit/comps';
import { quoteGaKit, presaleGaKit, QUOTE } from '../../lib/kit/gaQuote';
import { lookupPriorValue } from '../../lib/ga/priorValue';

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };

export const KIT_KEY_TTL_SECONDS = 7 * 24 * 3600;
const CACHE_TTL_SECONDS = 24 * 3600;

let redis = null;
try {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) redis = new Redis({ url, token });
} catch (e) { console.log('Redis init failed:', e.message); }

const str = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const bool = (v) => (typeof v === 'boolean' ? v : undefined);

/** Only the fields the quote uses, trimmed. Anything else in the body is ignored. */
export function cleanQuoteInput(b = {}) {
  const prop = b.property || {};
  const own = b.owner || {};
  return {
    property: { street: str(prop.street), city: str(prop.city, 60), state: str(prop.state, 2).toUpperCase(), zip: str(prop.zip, 10), county: str(prop.county, 40) },
    owner: {
      name: str(own.name, 80), street: str(own.street), street2: str(own.street2), city: str(own.city, 60),
      state: str(own.state, 2).toUpperCase(), zip: str(own.zip, 10), phone: str(own.phone, 20), email: str(own.email, 120).toLowerCase(),
    },
    taxYear: Number(b.taxYear) || null,
    noticeValue: b.noticeValue,
    noticeDate: /^\d{4}-\d{2}-\d{2}$/.test(String(b.noticeDate || '')) ? b.noticeDate : null,
    homestead: bool(b.homestead),
    parcelId: str(b.parcelId, 40),
    indSchool: str(b.indSchool, 60) || null,
    ownedOnJan1: bool(b.ownedOnJan1),
    fultonBilling100: bool(b.fultonBilling100),
    virtualHearing: bool(b.virtualHearing),
    // Pre-sale (16 Oct 2026): before the notice, LAST year's 100% value.
    presale: b.presale === true,
    priorValue: b.priorValue,
    priorValueConfirmed: bool(b.priorValueConfirmed),
  };
}

async function cached(key, fn) {
  if (redis) { try { const v = await redis.get(key); if (v) return typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { /* miss */ } }
  const v = await fn();
  if (redis && v !== undefined) { try { await redis.set(key, JSON.stringify(v), { ex: CACHE_TTL_SECONDS }); } catch (e) { /* non-fatal */ } }
  return v;
}

export function reviveSales(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => ({ ...r, saleDate: r?.saleDate ? new Date(r.saleDate) : null }));
}

async function spendOrThrow(n) {
  const s = await checkSpend('rentcast', n);
  if (!s.ok) { const e = new Error('capacity'); e.capacity = true; throw e; }
}

/**
 * RentCast for one address, cached and spend-capped. Exported so the pre-sale
 * notice step (pages/api/kit/notice.js) re-runs the check through exactly the
 * same cache and ceiling.
 */
export function quoteDeps(input) {
  const p = input.property;
  const addrKey = crypto.createHash('sha256').update(`${p.street}|${p.city}|${p.zip}`.toLowerCase()).digest('hex').slice(0, 24);
  return {
    lookupSubject: (prop) => cached(`kitq:subject:${addrKey}`, async () => {
      await spendOrThrow(1);
      try {
        const r = await lookupProperty({ street: prop.street, city: prop.city, state: 'GA', zip: prop.zip });
        return { lat: r.latitude, lon: r.longitude, sqft: r.sqft, yearBuilt: r.yearBuilt ? Number(r.yearBuilt) : null, parcelId: r.parcelId, propertyType: r.propertyType, address: r.formattedAddress };
      } catch (e) {
        if (e instanceof RentcastError && e.code === 'not_found') return null;
        throw e;
      }
    }),
    // Dates do not survive JSON: cached sales come back with string dates, and
    // the comps engine compares Dates. Revived on every read, cached or not.
    fetchSales: (q) => cached(`kitq:sales:${addrKey}:${input.taxYear}:${q.radiusMi}:${q.days}`, async () => {
      await spendOrThrow(1);
      return rentcastSales(q);
    }).then(reviveSales),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (await enforceRateLimit(req, res, 'ga-kit-quote', 6, 60)) return;
  if (await enforceRateLimit(req, res, 'ga-kit-quote', 40, 3600)) return;

  const input = cleanQuoteInput(req.body || {});
  const p = input.property;
  if (!p.street || !p.city || !p.zip) return res.status(400).json({ error: 'Property address is required.' });
  try {
    // Pre-sale: before the notice, on last year's value (lib/kit/gaQuote.js presaleGaKit).
    const quote = input.presale
      ? await presaleGaKit(input, { ...quoteDeps(input), lookupPriorValue })
      : await quoteGaKit(input, quoteDeps(input));

    let kitKey = null;
    if (quote.decision === QUOTE.CASE && quote.sellable && redis) {
      kitKey = `kit:GA:${crypto.randomUUID()}`;
      await redis.set(kitKey, JSON.stringify(quote.kitOrder), { ex: KIT_KEY_TTL_SECONDS });
    }
    // Never send the kit order itself back: what is printed comes from the server copy.
    const { kitOrder, ...publicQuote } = quote;
    return res.status(200).json({ ...publicQuote, requestedValue: kitOrder?.requestedValue || quote.caseCheck?.requestedValue || null, kitKey });
  } catch (e) {
    if (e.capacity) return res.status(503).json({ error: 'We are briefly at capacity checking homes. Please try again in a few minutes.', code: 'CAPACITY' });
    console.error('[ga-kit-quote] failed:', e?.message);
    return res.status(502).json({ error: 'We could not check this home right now. Please try again shortly.', code: 'UPSTREAM' });
  }
}
