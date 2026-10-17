/**
 * POST /api/admin-guarantees — free-kit claims a person decides. 17 Oct 2026.
 *
 *   { password }                                      list claims needing review
 *   { password, orderId, action: 'verify'|'reject', reason? }   decide one
 *   { password, orderId, action: 'file' }              a signed link to the uploaded letter (10 min)
 *
 * Verify creates the one-time code and emails it (lib/kit/guarantee.js).
 * Reject keeps the reason; the customer is told it by email.
 */
import { Resend } from 'resend';
import { requireAdmin } from '../../lib/adminAuth';
import { getSupabaseAdmin } from './supabase';
import { G, applyDecision, codeEmail } from '../../lib/kit/guarantee';

export const REJECT_REASONS = Object.freeze(['dismissed', 'withdrawn', 'lowered', 'not_a_decision', 'wrong_property', 'other']);

async function sendMail(to, mail) {
  if (!process.env.RESEND_API_KEY || !to) return;
  try { await new Resend(process.env.RESEND_API_KEY).emails.send({ from: 'TaxAppeal USA <customerservice@taxappealusa.com>', reply_to: 'customerservice@taxappealusa.com', to: [to], subject: mail.subject, text: mail.text }); }
  catch (e) { console.error('[admin-guarantees] email failed:', e?.message); }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (await requireAdmin(req, res, 'admin-guarantees')) return;
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });
  const b = req.body || {};

  if (!b.orderId) {
    const { data, error } = await supabase.from('orders').select('id, state_code, customer_name, customer_email, dispute_status, kit_order, decision_detail')
      .eq('kit_order->after->guarantee->>status', G.NEEDS_REVIEW).limit(100);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ claims: (data || []).map((r) => ({ id: r.id, state: r.state_code, name: r.customer_name, email: r.customer_email, status: r.dispute_status, decisionDetail: r.decision_detail, guarantee: r.kit_order?.after?.guarantee || null, address: r.kit_order?.property?.address || null, parcelId: r.kit_order?.property?.parcelId || null, taxYear: r.kit_order?.taxYear || null })) });
  }

  const { data: row, error } = await supabase.from('orders').select('id, state_code, customer_name, customer_email, dispute_status, kit_order').eq('id', String(b.orderId)).maybeSingle();
  if (error || !row) return res.status(404).json({ error: 'Order not found' });
  const k = row.kit_order || {};
  const g = k.after?.guarantee;
  if (!g) return res.status(409).json({ error: 'This order has no free-kit claim.' });

  if (b.action === 'file') {
    if (!g.proof?.path) return res.status(404).json({ error: 'No uploaded letter (check the forwarded email text instead).' });
    const { data: signed, error: sErr } = await supabase.storage.from('decision-letters').createSignedUrl(g.proof.path, 600);
    if (sErr) return res.status(500).json({ error: sErr.message });
    return res.status(200).json({ url: signed.signedUrl });
  }
  if (![G.NEEDS_REVIEW, G.NEEDS_PROOF].includes(g.status)) return res.status(409).json({ error: `This claim is already ${g.status}.` });
  let decision;
  if (b.action === 'verify') decision = { status: G.VERIFIED, reason: 'reviewed' };
  else if (b.action === 'reject') decision = { status: G.REJECTED, reason: REJECT_REASONS.includes(b.reason) ? b.reason : 'other' };
  else return res.status(400).json({ error: 'action must be verify, reject or file' });

  const guarantee = { ...applyDecision(g, decision), reviewedBy: 'admin' };
  const kk = { ...k, after: { ...(k.after || {}), guarantee } };
  const { error: upErr } = await supabase.from('orders').update({ kit_order: kk }).eq('id', row.id).eq('kit_order->after->guarantee->>status', g.status);
  if (upErr) return res.status(500).json({ error: upErr.message });

  if (guarantee.status === G.VERIFIED) await sendMail(row.customer_email, codeEmail({ ...row, kit_order: kk }, guarantee.code));
  else {
    const first = String(row.customer_name || '').split(' ')[0] || 'there';
    const why = {
      dismissed: 'the decision shows the appeal was dismissed (for example, because nobody attended the hearing), so the value was never decided on the evidence',
      withdrawn: 'the appeal was withdrawn', lowered: 'the value was lowered, so the promise was met',
      not_a_decision: 'the document is not the decision on the appeal', wrong_property: 'the letter is for a different property or tax year',
    }[guarantee.reason] || 'the decision does not meet the terms of the free kit';
    await sendMail(row.customer_email, { subject: 'About your free-kit claim', text: [`Hi ${first},`, '', `We have checked the letter you sent. The free kit does not apply because ${why}.`, '', 'If you think we got this wrong, reply to this email and a person will look again.', '', 'Questions: customerservice@taxappealusa.com'].join('\n') });
  }
  return res.status(200).json({ ok: true, status: guarantee.status, code: guarantee.code || null });
}
