/**
 * POST /api/kit/outcome — the customer tells us what the county decided, and
 * proves a "not lowered" with the decision letter. (17 Oct 2026; lib/kit/outcome.js,
 * lib/kit/guarantee.js.)
 *
 *   { o, t, action: 'load' }                       what /outcome shows
 *   { o, t, answer, newValue? }                     record the answer
 *   { o, t, action: 'proof', file: { type, data } } upload the decision letter
 *                                                   (base64; image or PDF, under ~3 MB)
 *
 * Authenticated by the private outcome link (an HMAC of the order id).
 * The letter is kept in the private Supabase bucket `decision-letters`, read by
 * a model into fields, and decided by rules (decideFromLetter), never by the
 * model: verified -> one-time code emailed; unclear -> a person; dismissed,
 * withdrawn or lowered -> no free kit, with the reason.
 */
import Anthropic from '@anthropic-ai/sdk';
import { Resend } from 'resend';
import { enforceRateLimit } from '../../../lib/rateLimit';
import { getSupabaseAdmin } from '../supabase';
import { alertOps } from '../../../lib/alertOps';
import { checkOutcomeToken, outcomePatch, guaranteeEmail, outcomeUrl, OUTCOMES, ASKABLE } from '../../../lib/kit/outcome';
import { cleanUploadFile, UPLOAD_TYPES } from '../../../lib/uploadFile';
import { cleanHearing, hearingSheetPdf, hearingEmail } from '../../../lib/kit/hearing';
import { G, readLetter, decideFromLetter, applyDecision, codeEmail, PROOF_COPY } from '../../../lib/kit/guarantee';

export const config = { api: { bodyParser: { sizeLimit: '4.4mb' } } };
const DECIDED = ['approved', 'partial', 'denied'];
export const PROOF_TYPES = UPLOAD_TYPES;
export const PROOF_BUCKET = 'decision-letters';

async function sendMail(to, mail, attachments = null) {
  if (!process.env.RESEND_API_KEY || !to) return;
  try {
    await new Resend(process.env.RESEND_API_KEY).emails.send({ from: 'TaxAppeal USA <customerservice@taxappealusa.com>', reply_to: 'customerservice@taxappealusa.com', to: [to], subject: mail.subject, text: mail.text, ...(attachments ? { attachments } : {}) });
  } catch (e) { console.error('[kit/outcome] email failed:', e?.message); }
}

/** The uploaded file, checked (lib/uploadFile.js). Kept under this name for verify-guarantee. */
export const cleanProofFile = cleanUploadFile;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (await enforceRateLimit(req, res, 'kit-outcome', 10, 60)) return;
  const b = req.body || {};
  const orderId = typeof b.o === 'string' ? b.o.trim().slice(0, 64) : '';
  if (!orderId || !checkOutcomeToken(orderId, b.t)) return res.status(403).json({ error: 'This link is not valid. Use the link in your email, or contact customerservice@taxappealusa.com.' });

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Please try again in a few minutes.' });
  const { data: row, error } = await supabase.from('orders').select('id, state_code, customer_name, customer_email, dispute_status, payment_status, kit_order').eq('id', orderId).maybeSingle();
  if (error || !row) return res.status(404).json({ error: 'We could not find this order. Contact customerservice@taxappealusa.com.' });

  const k = row.kit_order || {};
  const viewOf = (kk, status) => ({
    state: row.state_code, status, address: kk.property?.address || null, taxYear: kk.taxYear || null,
    answer: kk.after?.outcome?.answer || null,
    guarantee: kk.after?.guarantee ? { status: kk.after.guarantee.status, reason: kk.after.guarantee.reason, freeKitYear: kk.after.guarantee.freeKitYear || null } : null,
    hearing: kk.after?.hearing ? { date: kk.after.hearing.date, time: kk.after.hearing.time, kind: kk.after.hearing.kind } : null,
  });
  const view = viewOf(k, row.dispute_status);
  if (b.action === 'load') return res.status(200).json(view);

  // ── A hearing date (the hearing help pack, lib/kit/hearing.js) ─────────────
  if (b.action === 'hearing') {
    if (!ASKABLE.includes(row.dispute_status) || row.payment_status !== 'paid') return res.status(409).json({ ...view, error: 'There is nothing to record for this order. Questions: customerservice@taxappealusa.com.' });
    const h = cleanHearing(b);
    if (h.error) return res.status(400).json({ ...view, error: 'Please enter the date on your hearing notice (today or later).' });
    const now = new Date();
    // A changed date is a new hearing: the reminder and follow-up start again.
    const hearing = { ...h, enteredAt: now.toISOString(), prepSentAt: now.toISOString(), remindedAt: null, followedAt: null };
    const kk = { ...k, after: { ...(k.after || {}), hearing } };
    const { error: hErr } = await supabase.from('orders').update({ kit_order: kk }).eq('id', row.id).eq('dispute_status', row.dispute_status);
    if (hErr) return res.status(500).json({ ...view, error: 'We could not save that. Please try again.' });
    const r2 = { ...row, kit_order: kk };
    try {
      const pdf = await hearingSheetPdf(r2);
      await sendMail(row.customer_email, hearingEmail(r2, 'entered', outcomeUrl(row.id)), [{ filename: 'Your-hearing.pdf', content: Buffer.from(pdf) }]);
    } catch (e) { console.error('[kit/outcome] hearing sheet failed:', e?.message); }
    return res.status(200).json({ ...viewOf(kk, row.dispute_status), hearingSaved: true });
  }

  // ── The decision letter ────────────────────────────────────────────────────
  if (b.action === 'proof') {
    if (await enforceRateLimit(req, res, 'kit-outcome-proof', 5, 3600)) return;
    const g = k.after?.guarantee;
    if (!g || ![G.NEEDS_PROOF].includes(g.status)) return res.status(409).json({ ...view, error: 'There is no free-kit claim waiting for a letter on this order.' });
    const f = cleanProofFile(b.file);
    if (f.error) return res.status(400).json({ ...view, error: f.error === 'size' ? 'That file is too large. Please upload a photo or a PDF under 3 MB.' : 'Please upload a photo (JPEG, PNG or WebP) or a PDF of the letter.' });

    const now = new Date();
    const path = `${row.id}/${now.getTime()}.${PROOF_TYPES[f.mediaType]}`;
    const { error: upErr } = await supabase.storage.from(PROOF_BUCKET).upload(path, f.bytes, { contentType: f.mediaType, upsert: false });
    if (upErr) {
      await alertOps('Decision letter upload failed', `order=${row.id}\n${upErr.message}\n(Does the private storage bucket "${PROOF_BUCKET}" exist?)`, { key: 'proof-upload-failed' });
      return res.status(503).json({ ...view, error: 'We could not save your file just now. Please try again later, or email it to customerservice@taxappealusa.com.' });
    }

    let read = null;
    if (process.env.ANTHROPIC_API_KEY) {
      try { read = await readLetter(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }), f); } catch (e) { console.error('[kit/outcome] letter read failed:', e?.message); }
    }
    // No reading (model down or ceiling reached): a person reads it.
    const decision = read ? decideFromLetter(read, row) : { status: G.NEEDS_REVIEW, reason: 'not_read' };
    const guarantee = applyDecision(g, decision, { now, read, proofPath: path });
    const kk = { ...k, after: { ...(k.after || {}), guarantee } };
    const { error: saveErr } = await supabase.from('orders').update({ kit_order: kk }).eq('id', row.id).eq('dispute_status', row.dispute_status);
    if (saveErr) return res.status(500).json({ ...view, error: 'We could not save that. Please try again.' });

    if (guarantee.status === G.VERIFIED) await sendMail(row.customer_email, codeEmail({ ...row, kit_order: kk }, guarantee.code));
    if (guarantee.status === G.NEEDS_REVIEW || guarantee.status === G.REJECTED) {
      await alertOps(`Free-kit letter: ${guarantee.status}`, `order=${row.id} reason=${guarantee.reason}\nfile=${PROOF_BUCKET}/${path}\nread=${JSON.stringify(read)}\nReview it in admin.`, { key: `guarantee-review:${row.id}:${now.getTime()}` });
    }
    const message = guarantee.status === G.VERIFIED ? PROOF_COPY.verified
      : guarantee.status === G.NEEDS_REVIEW ? PROOF_COPY.needs_review
      : PROOF_COPY[guarantee.reason] || PROOF_COPY.needs_review;
    return res.status(200).json({ ...viewOf(kk, row.dispute_status), message, done: true });
  }

  // ── The answer ─────────────────────────────────────────────────────────────
  const answer = typeof b.answer === 'string' ? b.answer : '';
  if (!OUTCOMES[answer]) return res.status(400).json({ error: 'Please choose one of the answers.' });
  // A decision already recorded (by them, or from the county's letter) is not
  // overwritten from a link: a person fixes a wrong one.
  if (DECIDED.includes(row.dispute_status)) return res.status(200).json({ ...view, done: true });
  if (!ASKABLE.includes(row.dispute_status) || row.payment_status !== 'paid') return res.status(409).json({ ...view, error: 'There is nothing to record for this order yet. Questions: customerservice@taxappealusa.com.' });

  const patch = outcomePatch(row, answer, { newValue: b.newValue, source: 'customer' });
  const { error: upErr } = await supabase.from('orders').update(patch).eq('id', row.id).eq('dispute_status', row.dispute_status);
  if (upErr) return res.status(500).json({ error: 'We could not save that. Please try again.' });

  const g = patch.kit_order.after.guarantee;
  if (answer === 'not_lowered' && g?.status === G.NEEDS_PROOF) {
    await sendMail(row.customer_email, guaranteeEmail(row, outcomeUrl(row.id)));
  }
  return res.status(200).json({ ...viewOf(patch.kit_order, patch.dispute_status || row.dispute_status), done: true });
}
