/**
 * ============================================================================
 * FORM 50-132 + THE EQUITY PACKET — the Texas filing, rendered
 * ============================================================================
 *
 * Written 7 Sept 2026. Decisions: claude/TX_Model_Decided_2026-09-04.md.
 * Anatomy and citations: claude/TX_Protest_Document_Anatomy_2026-09-01.md.
 *
 * ── WHY THERE IS NO MODEL CALL IN THIS FILE ─────────────────────────────────
 *
 * generate-pt311a.js asks Claude to write a comparable-sales analysis, because
 * Georgia gives us no roll and there is nothing else to write it from. Texas is
 * the opposite case: we hold El Paso's certified roll, so every number in this
 * document is COMPUTED from the district's own published data and every
 * comparable carries a real account number the panel can look up.
 *
 * That difference is the product. A generated paragraph about comparables is
 * argument; a grid of the district's own parcels with their own account numbers
 * is evidence. Do not add a model call here to make the prose warmer.
 *
 * ── THE 5-MINUTE CONSTRAINT ─────────────────────────────────────────────────
 *
 * Travis allots 15 minutes per hearing INCLUDING both parties, panel questions,
 * deliberation and decision — about 5-6 minutes of owner time. The packet's
 * first page therefore has to carry the entire argument: the test, the grid, the
 * median, the ask. Everything else is appendix. That constraint drove this
 * layout more than anything else.
 */

import { Redis } from '@upstash/redis';
import { enforceRateLimit } from '../../lib/rateLimit';
import { getSupabaseAdmin } from './supabase';
import { buildProtest } from '../../lib/tx/protest';
import { findComps } from '../../lib/tx/comps';
import { isCovered, LOADED_CADS } from '../../lib/tx/coverage';
import { ROLL_YEAR } from '../../lib/tx/parcels';
import { renderProtestHtml } from '../../lib/tx/protestHtml';

let redis = null;
try {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) redis = new Redis({ url, token });
} catch (e) { console.log('Redis init failed:', e.message); }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Matches the other generators, tightened one notch: this route runs the comp
  // ladder, which can touch several hundred roll rows per call.
  if (await enforceRateLimit(req, res, 'p50132', 8, 60)) return;
  if (await enforceRateLimit(req, res, 'p50132', 60, 3600)) return;

  const b = req.body || {};
  const cadId = Number(b.cadId);
  const accountNumber = typeof b.accountNumber === 'string' ? b.accountNumber.trim() : '';
  const taxYear = Number(b.taxYear) || ROLL_YEAR;

  if (!accountNumber || !Number.isFinite(cadId)) {
    return res.status(400).json({ error: 'accountNumber and cadId are required.' });
  }
  // Coverage before the query, for the same reason findParcel checks it first:
  // without a roll we cannot tell "not on it" from "we never downloaded it".
  if (!isCovered(cadId)) {
    return res.status(400).json({ error: 'not_covered', county: LOADED_CADS[cadId] || null });
  }

  try {
    const db = getSupabaseAdmin();
    if (!db) return res.status(503).json({ error: 'lookup_failed', reason: 'no_database' });

    const { data, error } = await db.from('tx_parcels').select('*')
      .eq('cad_id', cadId).eq('account_number', accountNumber).eq('tax_year', taxYear).limit(1);
    if (error) return res.status(503).json({ error: 'lookup_failed', reason: 'query_error' });
    if (!data || !data.length) return res.status(404).json({ error: 'no_parcel' });

    // The untouched roll row. buildProtest, qualify and findComps all read the
    // roll's own column names -- see the seam note in lib/tx/parcels.js.
    const parcel = data[0];
    const comps = await findComps(parcel, { rollYear: taxYear, db });
    const packet = buildProtest({ parcel, comps, taxYear, owner: b.owner || {} });

    // A refusal is a 200. It is a finding, not an error, and the caller has to
    // show it to the customer rather than retry.
    if (!packet.filable) {
      return res.status(200).json({ success: false, filable: false,
        reason: packet.reason, message: packet.message || null });
    }

    const html = renderProtestHtml(packet);

    let letterKey = null;
    if (redis) {
      try {
        letterKey = `p50132:TX:${cadId}:${accountNumber}:${Date.now()}`;
        await redis.set(letterKey, html, { ex: 7200 });
      } catch (err) { console.log('Redis cache failed:', err.message); }
    }

    return res.status(200).json({
      success: true, filable: true, isTX: true, letterKey, html,
      requestedValue: packet.requestedValue,
      reductionSought: packet.reductionSought,
      confidence: packet.grid.confidence,
      compCount: packet.grid.compCount,
    });
  } catch (err) {
    console.error('50-132 error:', err);
    return res.status(500).json({ error: err.message || '50-132 generation failed' });
  }
}
