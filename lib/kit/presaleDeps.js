/**
 * lib/kit/presaleDeps.js — the real side effects for finishing a pre-sale,
 * shared by the Georgia notice route (pages/api/kit/notice.js) and the Texas
 * roll pass in the daily cron (pages/api/cron/notice-reminder.js), so the two
 * cannot drift: the same conditional claim, the same idempotent refund, the
 * same dispatch.
 */
import Stripe from 'stripe';
import { Resend } from 'resend';
import { dispatchKit } from './dispatchKit';

export function presaleDeps(row, { supabase, alertOps }) {
  const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  return {
    // Conditional on the status the caller expects: two runs cannot both win.
    claim: async (from, to) => {
      const { data } = await supabase.from('orders').update({ dispute_status: to }).eq('id', row.id).eq('dispute_status', from).select('id');
      return Array.isArray(data) && data.length === 1;
    },
    update: (patch) => supabase.from('orders').update(patch).eq('id', row.id),
    // Idempotent per order: a retry returns the first refund, never a second.
    refund: async (o) => {
      if (!stripe) throw new Error('Stripe is not configured');
      const session = await stripe.checkout.sessions.retrieve(o.stripe_session_id);
      const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      if (!pi) throw new Error('No payment intent on the session');
      return stripe.refunds.create({ payment_intent: pi, metadata: { order_id: o.id, reason: 'presale_no_case' } }, { idempotencyKey: `presale-refund-${o.id}` });
    },
    dispatch: (o) => dispatchKit(o, { supabase, resend, alertOps }),
    sendEmail: async ({ to, subject, text }) => {
      if (!resend || !to) return;
      await resend.emails.send({ from: 'TaxAppeal USA <customerservice@taxappealusa.com>', reply_to: 'customerservice@taxappealusa.com', to: [to], subject, text });
    },
    alertOps,
  };
}
