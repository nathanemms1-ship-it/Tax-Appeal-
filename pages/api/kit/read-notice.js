/**
 * POST /api/kit/read-notice { state, taxYear, file } — read a photo of the
 * customer's notice and return what to prefill (lib/kit/noticeReader.js).
 * 17 Oct 2026.
 *
 * Before payment, so no login: it is rate limited per address and behind the
 * Anthropic spend ceiling, and it stores nothing. The figures only prefill the
 * form; the customer confirms them and every server check runs as before.
 */
import Anthropic from '@anthropic-ai/sdk';
import { enforceRateLimit } from '../../../lib/rateLimit';
import { cleanUploadFile } from '../../../lib/uploadFile';
import { readNotice, prefillFromNotice } from '../../../lib/kit/noticeReader';

export const config = { api: { bodyParser: { sizeLimit: '4.4mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (await enforceRateLimit(req, res, 'read-notice', 4, 600)) return;
  if (await enforceRateLimit(req, res, 'read-notice', 12, 86400)) return;
  const b = req.body || {};
  const state = String(b.state || '').toUpperCase();
  if (!['GA', 'FL'].includes(state)) return res.status(400).json({ error: 'Photo reading is available for Georgia and Florida notices.' });
  const taxYear = Number(b.taxYear) || new Date().getUTCFullYear();
  const f = cleanUploadFile(b.file);
  if (f.error) return res.status(400).json({ error: f.error === 'size' ? 'That file is too large. Please try a photo, or a PDF under 3 MB.' : 'Please choose a photo (JPEG, PNG or WebP) or a PDF of your notice.' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(200).json({ ok: false, fields: {}, warnings: ['unavailable'] });
  try {
    const read = await readNotice(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }), f, state);
    if (!read) return res.status(200).json({ ok: false, fields: {}, warnings: ['unavailable'] });
    return res.status(200).json(prefillFromNotice(read, state, taxYear));
  } catch (e) {
    console.error('[read-notice] failed:', e?.message);
    return res.status(200).json({ ok: false, fields: {}, warnings: ['unavailable'] });
  }
}
