import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

import { C } from "../lib/theme";
import LogoMark from '../components/LogoMark';

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');`;

// DEAD CODE as of the webhook migration — receipts are now composed and sent
// server-side by lib/fulfillOrder.js -> /api/send-email. Kept only so a diff
// reviewer can see what moved; safe to delete.
/*
 * buildConfirmationEmail / buildReservedEmail lived here and were deleted 6 Aug 2026.
 *
 * Nothing called them. They were left behind when fulfillment moved server-side to
 * lib/fulfillOrder.js -> /api/send-email, and they had been quietly rotting since:
 * both still described CERTIFIED mail to an APPRAISAL DISTRICT, which is wrong for
 * Florida twice over, and both carried the hearing sentence corrected below. Dead
 * code that is also wrong is worse than dead code — it gets copied.
 *
 * The live templates are in pages/api/email-templates.js, covered by
 * scripts/verify-emails.mjs.
 */

export default function Success() {
  const router = useRouter();
  const { session_id } = router.query;
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);

  /**
   * NOTHING IS SIGNED OR MAILED FROM THIS PAGE. 17 Oct 2026.
   *
   * Every order is a kit (lib/kit/dispatchKit.js): the Stripe webhook
   * (pages/api/webhooks/stripe.js) creates the order and dispatches the kit to
   * the CUSTOMER, who signs it in ink and mails it. The old on-screen signature
   * step and its hand-off to /api/finalize-order went with the generated
   * letter. This page only verifies the payment and confirms the order.
   */
  useEffect(() => {
    if (!session_id) return;
    fetch(`/api/verify-payment?session_id=${session_id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setLoading(false); return; }
        setSession(data);
        setLoading(false);

        // Google Ads / GA4 — purchase conversion event (primary conversion for ROAS tracking).
        // Fires once per successful payment — the transaction id deduplicates repeat
        // page loads. Set NEXT_PUBLIC_GADS_PURCHASE_LABEL in your Vercel env to
        // activate the Google Ads conversion.
        //
        // We send data.transactionId, a hash of the session id, NOT session_id
        // itself. session_id authenticates /api/verify-payment, which returns the
        // customer's name, email and property address — it does not belong in a
        // payload sent to Google. The hash is stable, so dedupe still works.
        const transactionId = data.transactionId || 'unknown';
        // A free kit (data.free) is not a purchase: no conversion is reported.
        if (typeof window !== 'undefined' && window.gtag && !data.free) {
          window.gtag('event', 'purchase', {
            transaction_id: transactionId,
            currency: 'USD',
            value: (data.amountPaid || 8900) / 100,
            items: [{
              item_id: 'property-tax-appeal',
              item_name: 'Property Tax Appeal Filing',
              item_category: data.stateCode || 'FL',
              price: 89,
              quantity: 1,
            }],
          });
          const gadsId = process.env.NEXT_PUBLIC_GADS_ID;
          const purchaseLabel = process.env.NEXT_PUBLIC_GADS_PURCHASE_LABEL;
          if (gadsId && purchaseLabel) {
            window.gtag('event', 'conversion', {
              send_to: `${gadsId}/${purchaseLabel}`,
              value: (data.amountPaid || 8900) / 100,
              currency: 'USD',
              transaction_id: transactionId,
            });
          }
        }
      })
      .catch(() => {
        setError('Could not verify payment. Please contact customerservice@taxappealusa.com');
        setLoading(false);
      });
  }, [session_id]);

  return (
    <>
      <Head>
        <title>TaxAppeal — Your order</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        {/* This page renders the customer's order and property address.
            robots.txt Disallow only stops crawling, not indexing of a URL that is
            linked from elsewhere - noindex is what actually keeps it out of results. */}
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      {/* dangerouslySetInnerHTML, not a text child: React escapes ' & > in text and the client does not, so the two differ and hydration re-renders the whole root. See pages/apply.js. */}
      <style dangerouslySetInnerHTML={{ __html: `
        ${FONT_IMPORT}
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: ${C.bg}; color: ${C.darkNavy}; }
        @keyframes spin { to { transform: rotate(360deg); } }
      ` }} />

      {/* Nav */}
      <div style={{ background: C.white, borderBottom: `1.5px solid ${C.border}`, padding: "16px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LogoMark />
          <div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: C.darkNavy }}>TaxAppeal</div>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "1.5px", color: C.mutedGray }}>Property Tax Dispute</div>
          </div>
        </div>
        <a href="mailto:customerservice@taxappealusa.com" style={{ fontSize: 13, color: C.navy, textDecoration: "none" }}>customerservice@taxappealusa.com</a>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", border: `3px solid ${C.navy}`, borderTopColor: "transparent", animation: "spin 1s linear infinite", margin: "0 auto 20px" }} />
            <p style={{ color: C.bodyGray, fontSize: 15 }}>Verifying your payment...</p>
          </div>
        ) : error ? (
          <div style={{ background: "#FEE8E7", border: "1px solid #F5C6C0", borderRadius: 10, padding: "24px", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: C.darkNavy, marginBottom: 8 }}>Payment issue</h2>
            <p style={{ fontSize: 14, color: C.bodyGray, marginBottom: 16 }}>{error}</p>
            <a href="mailto:customerservice@taxappealusa.com" style={{ color: C.navy, fontSize: 14 }}>Contact us at customerservice@taxappealusa.com</a>
          </div>
        ) : session?.isKit ? (
          // GA, TX and FL kits: mailed or emailed to the customer, signed in ink.
          <KitSuccess session={session} sessionId={session_id} />
        ) : (
          // A paid session that is not a kit should not exist any more. Say
          // nothing we cannot stand behind: the payment is confirmed and a
          // person will follow up.
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ width: 72, height: 72, background: C.lightBlue, border: `2px solid ${C.green}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto 20px" }}>✓</div>
            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, color: C.darkNavy, marginBottom: 10 }}>Your order is confirmed</h1>
            <p style={{ fontSize: 16, color: C.bodyGray, lineHeight: 1.6, marginBottom: 20 }}>
              Thank you{session?.customerName ? `, ${session.customerName.split(' ')[0]}` : ''}. We&rsquo;ll email you{session?.email ? <> at <strong>{session.email}</strong></> : null} about your order shortly.
            </p>
            <div style={{ fontSize: 13, color: C.mutedGray, lineHeight: 1.8 }}>
              Questions? Email <a href="mailto:customerservice@taxappealusa.com" style={{ color: C.navy }}>customerservice@taxappealusa.com</a>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * "Set a password to track your appeal" — offered, never required.
 *
 * ============================================================================
 * WHY IT IS OPTIONAL AND WHY THAT IS NOT A COMPROMISE
 * ============================================================================
 * The portal's job is status: where the petition is, what the Board decided. The
 * customer needs that in three weeks, not now — and we email the dispatch
 * confirmation, the tracking number and the decision prompt anyway, so nothing
 * about this order depends on them choosing a password today.
 *
 * What choosing one today buys is that they do not have to go through a reset
 * link the first time they come back. That is worth one field on a page they are
 * already looking at. It is not worth a wall in front of a purchase, which is
 * what it was until 23 Aug 2026.
 *
 * ============================================================================
 * THE PRE-ORDER BRANCH GETS A DIFFERENT SENTENCE
 * ============================================================================
 * A pre-order customer is not told "your petition is on its way" — they are told
 * it files when their county opens, which can be weeks out. They wait longest
 * with the least visible movement and are the most likely to want to look, so
 * they get the reason rather than the generic offer.
 *
 * ============================================================================
 * EVERY FAILURE SAYS WHAT HAPPENED
 * ============================================================================
 * PASSWORD_ALREADY_SET is not an error and is not styled as one — the ordinary
 * way to reach it is a returning customer buying a second property. ORDER_NOT_READY
 * is a race with the Stripe webhook that writes the order row, so it says "in a
 * moment" and leaves the form usable rather than clearing it.
 *
 * This page has already shipped a control that appeared to do nothing while the
 * server had succeeded. Nothing here reports success unless the response said so.
 */
/**
 * THE KIT CONFIRMATION. Georgia and Texas, 15 Oct 2026.
 *
 * Until this existed a paid kit customer fell through to the bottom of this
 * page: "Your protest is filed!", "Letter queued for manual dispatch", and a
 * timeline promising USPS certified mail to the appraisal district. Every line
 * of that is false for a kit. We mail the kit to the CUSTOMER; they sign it,
 * add postage and mail it themselves. scripts/verify-kit-dispatch.mjs holds
 * this branch to that.
 */
function KitSuccess({ session, sessionId }) {
  const isTX = session?.stateCode === 'TX';
  const isFL = session?.stateCode === 'FL';
  const word = isTX ? 'protest' : isFL ? 'petition' : 'appeal';
  const countyBare = String(session?.county || '').replace(/\s+County\s*$/i, '').trim();
  const where = isTX ? 'your appraisal district' : isFL ? `the ${countyBare ? countyBare + ' County ' : ''}Value Adjustment Board` : `the ${countyBare || 'county'} County Board of Assessors`;
  const body = isTX ? 'The district' : isFL ? 'The Board' : 'The county';
  const first = session?.customerName ? `, ${session.customerName.split(' ')[0]}` : '';
  const card = { background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', marginBottom: 20 };
  const label = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: C.mutedGray, marginBottom: 14, fontWeight: 500 };
  const presale = session?.kitPresale === true;
  const pdfOnly = session?.kitPdfOnly === true;
  const steps = pdfOnly ? [
    { title: 'Payment confirmed', desc: 'Your payment has been processed.', done: true },
    { title: `Your ${word} kit arrives by email`, desc: 'In the next few minutes, as a PDF. Your deadline is close, so nothing is mailed to you.' },
    { title: 'Print it, sign it, mail it', desc: isFL
      ? `Print it on plain paper, sign Part 3 in ink, add your check for the county's filing fee, and mail it to ${where} at the address shown in the kit so it is received by your deadline, or hand-deliver it. Florida counts the day it arrives, not the postmark.`
      : `Print it on plain paper, sign the form in ink and mail it in any envelope to ${where}, at the address shown in the kit. A post office counter postmark is safest.` },
    { title: `${body} writes to you`, desc: 'Forward us anything it sends and we will help you understand it.' },
  ] : presale && isTX ? [
    { title: 'Reserved', desc: 'Your payment has been processed and your kit is reserved.', done: true },
    { title: 'Your district publishes this year\'s values', desc: 'Usually in April. You don\'t need to do anything.' },
    { title: 'We check your protest again', desc: 'If it still lowers your bill, we print and mail your kit, and email you a PDF copy of the full kit. If it no longer does, we refund you in full before anything is mailed.' },
    { title: 'You sign it and mail it', desc: `Sign the form in ink, add a stamp and mail it to ${where} in the return envelope we include.` },
  ] : presale ? [
    { title: 'Reserved', desc: 'Your payment has been processed and your kit is reserved.', done: true },
    { title: 'Your notice arrives', desc: 'Counties mail notices between April and June. Enter its value and date from the link in your receipt email; we remind you too.' },
    { title: 'We check your case again', desc: `If an ${word} still lowers your bill, we print and mail your kit, and email you a PDF copy of the full kit. If it no longer does, we refund you in full before anything is mailed.` },
    { title: 'You sign it and mail it', desc: `Sign the form in ink, add a stamp and mail it to ${where} in the return envelope we include.` },
  ] : [
    { title: 'Payment confirmed', desc: 'Your payment has been processed.', done: true },
    { title: `Your ${word} kit is printed and mailed to you`, desc: `By first-class mail, usually within a few business days. We also email you a PDF copy of the full kit the moment it is sent, so you can start right away.` },
    { title: 'You sign it and mail it', desc: isFL
      ? `Sign Part 3 of the form in ink, add your check for the county's filing fee, put both in the return envelope we include, add a stamp and mail it to ${where} the day the kit arrives, or hand-deliver it. Florida counts your petition when the Board receives it, not by postmark. The checklist inside shows the exact pages and your deadline.`
      : `Sign the form in ink, put it in the return envelope we include, add a stamp and mail it to ${where}. The checklist inside shows the exact pages and the postmark deadline.` },
    { title: `${body} writes to you`, desc: isTX ? 'Usually with an informal conference or a hearing date. Forward us anything it sends and we will help you understand it.' : isFL ? 'The Board schedules a hearing for every petition and mails you the date, then its decision. That is normal. Forward us anything it sends and we will help you understand it.' : 'With its decision or a hearing date. Forward us anything it sends and we will help you understand it.' },
  ];
  return (
    <>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ width: 72, height: 72, background: C.lightBlue, border: `2px solid ${C.green}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 20px' }}>✓</div>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 34, color: C.darkNavy, marginBottom: 10 }}>{pdfOnly ? `Your ${word} kit is coming by email` : presale ? `Your ${word} kit is reserved` : `Your ${word} kit is on its way`}</h1>
        <p style={{ fontSize: 16, color: C.bodyGray, lineHeight: 1.6 }}>
          {pdfOnly
            ? (isFL
              ? `Thank you${first}. Your deadline is close, so we are emailing you the completed, ready-to-sign ${word} as a PDF in the next few minutes. Print it, sign it, add your check for the county's filing fee, and mail it to ${where} so it is received by the deadline printed on it, or hand-deliver it.`
              : `Thank you${first}. Your deadline is close, so we are emailing you the completed, ready-to-sign ${word} as a PDF in the next few minutes. Print it, sign it and mail it to ${where} before the postmark deadline printed on it.`)
            : presale && isTX
            ? `Thank you${first}. When your appraisal district publishes this year's values, we check your protest again automatically: we mail your kit, or refund you in full.`
            : presale
            ? `Thank you${first}. When your assessment notice arrives, enter its value from the link in your receipt email. We check your case again then: we mail your kit, or refund you in full.`
            : isFL
            ? `Thank you${first}. We are printing your completed, ready-to-sign ${word} and mailing it to you. You sign it, add your check for the county's filing fee, and mail it to ${where}.`
            : `Thank you${first}. We are printing your completed, ready-to-sign ${word} and mailing it to you. You sign it and mail it to ${where}.`}
        </p>
      </div>

      <div style={card}>
        <div style={label}>Order Summary</div>
        {[
          ['Property', session?.address],
          ['County', session?.county],
          session?.targetReduction && !presale ? ['Value your ' + word + ' asks for', `$${Number(session.targetReduction).toLocaleString()}`] : null,
          session?.savings ? ['Estimated yearly saving if granted', `$${Number(session.savings).toLocaleString()}`] : null,
        ].filter(Boolean).map(([k, v]) => v ? (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 14, gap: 16 }}>
            <span style={{ color: C.bodyGray, flexShrink: 0 }}>{k}</span>
            <span style={{ color: C.darkNavy, fontWeight: 500, textAlign: 'right' }}>{v}</span>
          </div>
        ) : null)}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
          <span style={{ fontWeight: 500, color: C.darkNavy }}>Amount paid</span>
          <span style={{ fontWeight: 700, color: C.darkNavy }}>{session?.free ? '$0.00 (free kit)' : `$${(((session && session.amountPaid) || 8900) / 100).toFixed(2)}`}</span>
        </div>
      </div>

      <div style={card}>
        <div style={label}>What Happens Next</div>
        {steps.map((st, i) => (
          <div key={i} style={{ display: 'flex', gap: 14, marginBottom: i < steps.length - 1 ? 16 : 0, paddingBottom: i < steps.length - 1 ? 16 : 0, borderBottom: i < steps.length - 1 ? `1px solid ${C.border}` : 'none', opacity: st.done || i === 1 ? 1 : 0.6 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: st.done ? C.navy : C.bg, border: `1.5px solid ${st.done ? C.navy : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, color: st.done ? C.white : C.darkNavy }}>
              {st.done ? '✓' : i + 1}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.darkNavy, marginBottom: 3 }}>{st.title}</div>
              <div style={{ fontSize: 12.5, color: C.bodyGray, lineHeight: 1.5 }}>{st.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: C.lightBlue, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 20px', marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 6 }}>Important</div>
        <div style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.6 }}>
          TaxAppeal USA prepares your {word} documents. We do not file your {word}, represent you or appear for you: you sign it and mail it, and the deadline is yours to meet.{isFL ? <> The county&rsquo;s filing fee is paid by you, to the county, with the check you put in the envelope. It is not part of our fee.</> : null} If {isTX ? 'the district' : isFL ? 'the Board' : 'the county'} does not lower your value, next year&rsquo;s kit is free.
          A confirmation has been sent to <strong>{session?.email}</strong>.
        </div>
      </div>

      <SetPasswordCard sessionId={sessionId} email={session?.email} isPreOrder={false} />

      <div style={{ textAlign: 'center', fontSize: 13, color: C.mutedGray, lineHeight: 1.8 }}>
        Questions? Email <a href="mailto:customerservice@taxappealusa.com" style={{ color: C.navy }}>customerservice@taxappealusa.com</a>
        <br />
        <a href="/" style={{ color: C.navy }}>← Back to TaxAppeal</a>
      </div>
    </>
  );
}

function SetPasswordCard({ sessionId, email, isPreOrder }) {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle | saving | done | already | error
  const [message, setMessage] = useState('');

  // No session id means no way to prove who this is, so there is nothing to
  // offer. Rendering a dead field would be worse than rendering nothing.
  if (!sessionId) return null;

  const submit = async () => {
    if (password.length < 6) { setStatus('error'); setMessage('Password must be at least 6 characters.'); return; }
    setStatus('saving'); setMessage('');
    try {
      const r = await fetch('/api/portal/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, password }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.success) { setStatus('done'); setPassword(''); return; }
      if (d.code === 'PASSWORD_ALREADY_SET') { setStatus('already'); setMessage(d.error || ''); return; }
      setStatus('error');
      setMessage(d.error || 'That did not save. Please try again.');
    } catch {
      setStatus('error');
      setMessage('That did not save. Please try again.');
    }
  };

  if (status === 'done') {
    return (
      <div style={{ background: "#E6F4ED", border: `1px solid #B7DEC8`, borderRadius: 10, padding: "16px 20px", marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 6 }}>✓ Password set</div>
        <div style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.6 }}>
          Sign in at <a href="/portal" style={{ color: C.navy }}>/portal</a> with{' '}
          <strong style={{ color: C.darkNavy }}>{email || 'your email address'}</strong> whenever you want to check on this.
        </div>
      </div>
    );
  }

  if (status === 'already') {
    return (
      <div style={{ background: C.lightBlue, border: `1px solid #C5D3E8`, borderRadius: 10, padding: "16px 20px", marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 6 }}>🔐 You already have a password</div>
        <div style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.6 }}>
          {message} Your new order is already on the same account — sign in at{' '}
          <a href="/portal" style={{ color: C.navy }}>/portal</a>.
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "16px 20px", marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.darkNavy, marginBottom: 6 }}>
        🔐 Set a password to track your appeal <span style={{ fontWeight: 400, color: C.mutedGray }}>— optional</span>
      </div>
      <div style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.6, marginBottom: 12 }}>
        {isPreOrder
          ? <>Your petition is prepared and waiting for your county to open, so there will be a stretch with nothing in your inbox. A password lets you look in on it any time — we still email you every update.</>
          : <>We email you every update, so you do not need one. It just saves you a reset link the first time you come back to check on your appeal.</>}
      </div>
      {status === 'error' && message && (
        <div style={{ fontSize: 12.5, color: C.red || C.red, marginBottom: 10 }}>{message}</div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
          aria-label="Choose a password"
          autoComplete="new-password"
          style={{ flex: "2 1 220px", padding: "11px 13px", fontSize: 15, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: "inherit" }}
        />
        <button
          onClick={submit}
          disabled={status === 'saving'}
          style={{ flex: "1 1 150px", padding: "11px 18px", fontSize: 14, fontWeight: 600, background: C.navy, color: C.white, border: "none", borderRadius: 8, cursor: status === 'saving' ? 'wait' : 'pointer', fontFamily: "inherit" }}
        >
          {status === 'saving' ? 'Saving…' : 'Set password'}
        </button>
      </div>
    </div>
  );
}
