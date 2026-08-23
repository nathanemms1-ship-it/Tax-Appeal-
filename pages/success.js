import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import SignatureStep from '../components/SignatureStep';

const C = {
  navy:     "#1B3A6B",
  gold:     "#FFC940",
  darkNavy: "#0F1F3D",
  bg:       "#F4F7FC",
  lightBlue:"#EEF3FB",
  bodyGray: "#5A6B82",
  mutedGray:"#8596AF",
  border:   "#E8EDF4",
  white:    "#FFFFFF",
  green:    "#2E7D52",
  amber:    "#FFF8E6",
};

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
  const [signed, setSigned] = useState(false);
  const [mailStatus, setMailStatus] = useState(null);
  const [trackingNumber, setTrackingNumber] = useState(null);
  const [lobPreviewUrl, setLobPreviewUrl] = useState(null);
  const [error, setError] = useState(null);

  // Hands the post-payment signature (TX/GA/AR/AL) to the server. FL signs DR-486
  // Part 3 before payment, so it never calls this.
  // for TX/GA/AR/AL it carries the owner's post-payment e-signature.
  /**
   * The browser no longer fulfills anything.
   *
   * The Stripe webhook (pages/api/webhooks/stripe.js) creates the order row and,
   * for Florida, mails the petition — server-side, on Stripe's delivery guarantee
   * rather than on this tab staying open. All this function does now is hand over
   * the post-payment signature for TX/GA/AR/AL and report the outcome.
   *
   * What used to live here: /api/save-order with a client-built body, then
   * /api/send-letter with a client-supplied check amount, payee, and mailing
   * address, then /api/send-email. Every reload re-ran the whole chain and cut a
   * second real check; closing the tab mid-chain lost the order entirely.
   */
  async function runMail(data, sig) {
    setMailStatus('sending');
    try {
      const res = await fetch('/api/finalize-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session_id,
          signatureImage: sig ? sig.image : null,
          typedName: sig ? sig.typedName : null,
          // Florida: DR-486 Part 3 name plus the owner's own two elections.
          flSignatureName: sig ? sig.flSignatureName : undefined,
          flWillNotAttend: sig ? sig.flWillNotAttend : undefined,
          flAuthorizeConfidential: sig ? sig.flAuthorizeConfidential : undefined,
        }),
      });
      const out = await res.json();
      if (!res.ok || !out.success) {
        setMailStatus('error');
        // Signature may not have been recorded — stay on the signing screen so the
        // owner can retry rather than being shown a confirmation for something that
        // did not happen.
        return false;
      }
      const status = out.result && out.result.status;
      if (status === 'filed') {
        setMailStatus('sent');
        if (out.result.trackingNumber) setTrackingNumber(out.result.trackingNumber);
      } else if (status === 'queued') {
        setMailStatus('queued');
      } else {
        setMailStatus('manual');
      }
      return true;
    } catch (e) {
      console.error('finalize-order failed:', e);
      setMailStatus('error');
      return false;
    }
  }

  // Fired by SignatureStep once the owner signs.
  //
  // setSigned(true) IS THE FIX. `signed` was declared at the top of this component
  // and never set anywhere in the file, so needsSignature stayed true forever and
  // SignatureStep re-rendered permanently. The owner paid, signed, watched the button
  // do nothing, and had no confirmation their petition existed — while server-side
  // everything had in fact succeeded. Reproduced twice, 5 and 6 Aug 2026.
  //
  // Advance only on success: a failed finalize-order may mean the signature was not
  // recorded, and showing a confirmation screen for that would be worse than the bug.
  async function handleSigned(sig) {
    if (!session) return;
    const ok = await runMail(session, sig);
    if (ok) setSigned(true);
  }

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
        if (typeof window !== 'undefined' && window.gtag) {
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

        const canMail = data.districtName && data.districtAddress && data.letter && data.ownerStreet;
        if (!canMail) { setMailStatus('manual'); return; }


        // TX/GA/AR/AL wait for the on-screen signature step (handleSigned → runMail).
        // Florida signs Part 3 BEFORE payment, so there is no post-payment
        // signature to submit. The Stripe webhook has already created the order and
        // mailed the petition. Calling finalize-order here always returned 400
        // ("A signature is required") and showed the customer a failure banner for
        // an order that actually succeeded.
        // Florida used to be marked sent/queued here because it had signed before
        // payment and the webhook mailed immediately. It now waits for the signature
        // below, exactly like TX/GA/AR/AL, so nothing is set here for any state.
      })
      .catch(() => {
        setError('Could not verify payment. Please contact customerservice@taxappealusa.com');
        setLoading(false);
      });
  }, [session_id]);

  /**
   * DECLARED HERE, NOT NEXT TO `steps`, AND THAT PLACEMENT IS LOad-BEARING.
   *
   * getMailStatusBadge() reads isFlorida and is CALLED a few lines below, which is above
   * where the timeline strings live. Declaring `const isFlorida` down there put a read
   * before the declaration in the same scope — a temporal dead zone crash on every
   * Florida success page. That is the third time this exact class of bug has shipped
   * in this codebase (savings, cure), which is why scripts/verify-tdz.mjs exists.
   * Run it before pushing.
   */
  const isFlorida = session?.stateCode === 'FL';
  // County without a doubled suffix — orders.county is stored as "Broward County".
  const sessionCounty = String(session?.county || '').replace(/\s+County\s*$/i, '').trim() || 'your county';

  const getMailStatusBadge = () => {
    switch (mailStatus) {
      case 'sending': return { icon: '⏳', text: 'Filing your protest...', color: C.bodyGray, bg: C.bg };
      case 'sent':    return { icon: '📬', text: isFlorida ? 'Petition dispatched!' : 'Certified letter dispatched!', color: C.green, bg: '#E6F4ED' };
      case 'error':   return { icon: '⚠️', text: 'Letter will be dispatched manually within 1 business day', color: '#7A5C10', bg: C.amber };
      case 'manual':  return { icon: '📋', text: 'Letter queued for manual dispatch within 1 business day', color: '#7A5C10', bg: C.amber };
      // runMail sets 'queued' (it mirrors ORDER_STATUS.QUEUED). This case read only
      // 'reserved', so the badge came back null and a pre-order customer saw no
      // confirmation at all. Both accepted; 'queued' is the one actually emitted.
      case 'queued':
      case 'reserved': return { icon: '🎟️', text: session?.scheduledFileDate ? `Reserved — files ${new Date(session.scheduledFileDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} when your window opens` : 'Reserved — files as soon as your filing window opens', color: C.navy, bg: C.lightBlue };
      default: return null;
    }
  };

  const badge = getMailStatusBadge();

  const scheduledDateLabel = session?.scheduledFileDate ? new Date(session.scheduledFileDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'your filing window opening';

  /**
   * FLORIDA IS FIRST CLASS, NOT CERTIFIED.
   *
   * A Florida filing leaves as a Lob CHECK — the county VAB filing fee — with the
   * petition as its attachment (pages/api/send-letter.js). Lob's check product only
   * offers usps_first_class; certified is not available on it, which is why the code
   * already sends FL as mail_type: 'usps_first_class'. This timeline claimed
   * "certified mail with return receipt" to every customer including Florida, four
   * inches below the signature screen where we had just corrected exactly that claim.
   *
   * The vocabulary is wrong for Florida too, not only the mail class: a Florida
   * filing is a PETITION to the VALUE ADJUSTMENT BOARD, not a protest to an
   * APPRAISAL DISTRICT (that is the Texas term). Both are fixed together, because
   * a customer who reads "appraisal district" on their receipt has been told their
   * petition went somewhere that does not exist in their state.
   */
  const mailLine = isFlorida ? 'tracked USPS First Class mail' : 'USPS certified mail with return receipt';
  const doc = isFlorida ? 'petition' : 'protest';
  const recipient = isFlorida ? 'Value Adjustment Board' : 'appraisal district';
  const Doc = doc.charAt(0).toUpperCase() + doc.slice(1);

  const steps = session?.isPreOrder ? [
    { icon: '✓', title: 'Payment confirmed', desc: 'Your payment has been processed successfully.', done: true },
    { icon: '✍️', title: `${Doc} reviewed & signed`, desc: `You reviewed and signed your ${doc} — it is prepared and held in your name.`, done: true },
    { icon: '🎟️', title: 'Reserved — first in line', desc: `Your filing window opens ${scheduledDateLabel}. We will submit your ${doc} via ${mailLine} the moment it opens.`, done: false, active: true },
    { icon: '🧾', title: 'Tracking receipt', desc: 'Your USPS tracking number will be emailed to you once it is dispatched.', done: false },
    { icon: '⏳', title: `Await ${isFlorida ? 'Board' : 'district'} response`, desc: `The ${recipient} responds directly to you, typically within 30–90 days after filing.`, done: false },
  ] : [
    { icon: '✓', title: 'Payment confirmed', desc: 'Your payment has been processed successfully.', done: true },
    { icon: '✍️', title: `${Doc} reviewed & signed`, desc: `You reviewed and signed your ${doc} — it is filed in your name.`, done: true },
    { icon: '📬', title: isFlorida ? 'Petition dispatch' : 'Certified mail dispatch', desc: mailStatus === 'sent' ? `Your signed ${doc} has been dispatched via ${mailLine}.${trackingNumber ? ' Tracking: ' + trackingNumber : ''}` : `Your ${doc} will be mailed via ${mailLine} within 1 business day.`, done: mailStatus === 'sent', active: mailStatus === 'sending' },
    { icon: '🧾', title: 'Tracking receipt', desc: trackingNumber ? `USPS tracking number: ${trackingNumber}` : 'Your USPS tracking number will be emailed to you once dispatched.', done: !!trackingNumber },
    { icon: '⏳', title: `Await ${isFlorida ? 'Board' : 'district'} response`, desc: `The ${recipient} responds directly to you, typically within 30–90 days.`, done: false },
  ];

  // Florida is no longer excluded. It used to sign Part 3 before payment, on the
  // review screen where half the petition is blurred - attesting under penalties of
  // perjury to having read a document the page was hiding. Florida now signs here,
  // on the complete petition, like every other state.
  //
  // Florida also has no appraisal "district": its petition goes to the Clerk of the
  // Value Adjustment Board, so districtName/ownerStreet are not the right gate.
  const needsSignature = session && !signed && (
    session.isFL
      ? !!session.letter
      : !!(session.letter && session.districtName && session.ownerStreet)
  );

  return (
    <>
      <Head>
        <title>TaxAppeal — Review and sign your protest</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        {/* This page renders the customer's order, property address and petition.
            robots.txt Disallow only stops crawling, not indexing of a URL that is
            linked from elsewhere - noindex is what actually keeps it out of results. */}
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <style>{`
        ${FONT_IMPORT}
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: ${C.bg}; color: ${C.darkNavy}; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
      `}</style>

      {/* Nav */}
      <div style={{ background: C.white, borderBottom: `1.5px solid ${C.border}`, padding: "16px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, background: C.navy, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🏠</div>
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
        ) : needsSignature ? (
          // TX/GA/AR/AL: review + sign. Nothing mails until this completes.
          <SignatureStep
            letter={session.letter}
            ownerName={session.customerName}
            propertyAddress={session.address}
            sending={mailStatus === 'sending'}
            onSigned={handleSigned}
            isFL={!!session.isFL}
            // For Florida the letterKey holds the rendered DR-486 HTML, so
            // session.letter IS the petition. Other states store plain text.
            petitionHtml={session.isFL ? session.letter : null}
          />
        ) : (
          <>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ width: 72, height: 72, background: "#E6F4ED", border: `2px solid ${C.green}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto 20px" }}>✓</div>
              <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 34, color: C.darkNavy, marginBottom: 10 }}>{session?.isPreOrder ? 'You are reserved — first in line!' : 'Your protest is filed!'}</h1>
              <p style={{ fontSize: 16, color: C.bodyGray, lineHeight: 1.6 }}>
                Thank you{session?.customerName ? `, ${session.customerName.split(' ')[0]}` : ''}. {session?.isPreOrder ? ('Your property tax protest is prepared and reserved — it will be filed as soon as your filing window opens on ' + scheduledDateLabel + '.') : (session?.stateCode === 'FL' ? 'Your petition and county filing fee are on their way to the Value Adjustment Board by trackable USPS First Class mail.' : 'Your property tax protest is being sent via USPS certified mail with return receipt.')}
              </p>
            </div>

            {badge && (
              <div style={{ background: badge.bg, border: `1px solid ${badge.color}30`, borderRadius: 8, padding: "12px 16px", marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20, flexShrink: 0, animation: mailStatus === 'sending' ? 'pulse 1.5s ease-in-out infinite' : 'none' }}>{badge.icon}</span>
                <div style={{ fontSize: 14, fontWeight: 500, color: badge.color, fontFamily: "'DM Sans', sans-serif" }}>{badge.text}</div>
              </div>
            )}

            <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", color: C.mutedGray, marginBottom: 14, fontWeight: 500 }}>Order Summary</div>
              {[
                ["Property", session?.address],
                ["County", session?.county],
                ["Filed with", session?.districtName],
                session?.assessedValue ? ["Current assessed value", `$${Number(session.assessedValue).toLocaleString()}`] : null,
                session?.targetReduction ? ["Reduction requested", `Down to $${Number(session.targetReduction).toLocaleString()}`] : null,
                session?.savings ? ["Potential annual savings", `$${Number(session.savings).toLocaleString()}`] : null,
              ].filter(Boolean).map(([label, value]) => value ? (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 14, gap: 16 }}>
                  <span style={{ color: C.bodyGray, flexShrink: 0 }}>{label}</span>
                  <span style={{ color: C.darkNavy, fontWeight: 500, textAlign: "right" }}>{value}</span>
                </div>
              ) : null)}
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 4, display: "flex", justifyContent: "space-between", fontSize: 15 }}>
                <span style={{ fontWeight: 500, color: C.darkNavy }}>Amount paid</span>
                <span style={{ fontWeight: 700, color: C.darkNavy }}>${(((session && session.amountPaid) || 8900)/100).toFixed(2)}</span>
              </div>
            </div>

            <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", color: C.mutedGray, marginBottom: 16, fontWeight: 500 }}>What Happens Next</div>
              {steps.map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: i < steps.length - 1 ? 16 : 0, paddingBottom: i < steps.length - 1 ? 16 : 0, borderBottom: i < steps.length - 1 ? `1px solid ${C.border}` : "none", opacity: step.done || step.active ? 1 : 0.5 }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: step.done ? C.navy : step.active ? C.lightBlue : C.bg, border: `1.5px solid ${step.done ? C.navy : step.active ? C.navy : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, animation: step.active ? 'pulse 1.5s ease-in-out infinite' : 'none' }}>
                    {step.done ? <span style={{ color: C.white }}>✓</span> : step.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: C.darkNavy, marginBottom: 3 }}>{step.title}</div>
                    <div style={{ fontSize: 12, color: C.bodyGray, lineHeight: 1.5 }}>{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: C.amber, border: "1px solid #FFD97A", borderRadius: 10, padding: "16px 20px", marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#7A5C10", marginBottom: 6 }}>📧 Confirmation email sent</div>
              <div style={{ fontSize: 13, color: "#7A5C10", lineHeight: 1.6 }}>
                {session?.isPreOrder ? <>A confirmation has been sent to <strong>{session?.email}</strong>. We will email you again with tracking once your protest is filed on {scheduledDateLabel}.</> : <>A confirmation has been sent to <strong>{session?.email}</strong>. Your tracking number will follow once your letter has been dispatched.</>}
              </div>
            </div>

            {/*
              THE PASSWORD, AND THIS IS NOW THE ONLY PLACE IT IS ASKED FOR.

              It used to be the first field in the funnel — name, email, password,
              before a stranger had been told one thing about their property. What it
              protects is the portal, and the portal shows the status of an appeal
              that did not exist at the point the question was being asked.

              BELOW THE SIGNATURE, NEVER ABOVE IT. Everything in this branch renders
              only once `signed` is true. Nothing mails until the owner signs, and no
              optional field belongs in front of a required one. The version of that
              mistake this page has already made — a signature button that appeared to
              do nothing while the server had in fact succeeded — is why the ordering
              is worth writing down rather than assuming.

              Optional, and it says so. A customer who skips it still gets in through
              "Forgot password?", which looks them up by their ORDER rather than by a
              hash they do not have.
            */}
            <SetPasswordCard sessionId={session_id} email={session?.email} isPreOrder={!!session?.isPreOrder} />

            <div style={{ background: C.lightBlue, border: `1px solid #C5D3E8`, borderRadius: 10, padding: "16px 20px", marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 6 }}>⚖️ Important</div>
              <div style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.6 }}>
                {session?.isPreOrder ? <>We will mail your protest the moment your filing window opens on {scheduledDateLabel}. You do not need to do anything else — we will email you as soon as it is dispatched, with tracking.</> : <>{isFlorida
                      /* FLORIDA GETS A HEARING WHETHER OR NOT THE OWNER ATTENDS.
                         The old copy said "if they schedule a hearing, you can attend
                         yourself or hire a licensed representative" — which reads as
                         though a hearing were a contingency. It is not. Under Fla.
                         Admin. Code R. 12D-9.001 the petitioner has a right to prior
                         notice of the hearing date, so the Board schedules one and
                         posts a notice for every petition. Ticking "I will not attend
                         but would like my evidence considered" on the DR-486 does not
                         prevent that; it means the Board weighs the enclosed evidence
                         without the owner present.
                         Saying nothing would be worse than the old wording: an
                         official hearing notice would arrive in the post and the owner
                         would think something had gone wrong. */
                      ? <>The {sessionCounty} Value Adjustment Board will schedule a hearing and mail you a notice of the date — that happens for every petition and is not a sign of a problem. Because you elected not to attend, the Board considers your enclosed evidence without you, and there is nothing you need to do. You may attend if you change your mind. TaxAppeal does not attend or represent you. Forward the Board&rsquo;s decision to <strong>disputes@mail.taxappealusa.com</strong> and we will help you understand it.</>
                      : <>Your appraisal district will contact you directly with their decision — typically within 30&ndash;90 days. TaxAppeal does not attend or represent you at any hearing. Forward any decision to <strong>disputes@mail.taxappealusa.com</strong> and we will help you understand it.</>}</>}
              </div>
            </div>

            <div style={{ background: C.lightBlue, border: `1px solid #C5D3E8`, borderRadius: 10, padding: "16px 20px", marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 6 }}>🔐 Your Appeal Portal</div>
              <div style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.6, marginBottom: 12 }}>
                Track your appeal status, view your letter, and see your decision when it arrives — all in one place.
              </div>
              <a href="/portal" style={{ display: "inline-block", background: C.navy, color: C.white, textDecoration: "none", padding: "10px 20px", borderRadius: 8, fontSize: 14, fontWeight: 500 }}>
                Go to My Portal →
              </a>
            </div>

            <div style={{ textAlign: "center", fontSize: 13, color: C.mutedGray, lineHeight: 1.8 }}>
              Questions? Email <a href="mailto:customerservice@taxappealusa.com" style={{ color: C.navy }}>customerservice@taxappealusa.com</a>
              <br />
              <a href="/" style={{ color: C.navy }}>← Back to TaxAppeal</a>
            </div>
          </>
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
          ? <>Your petition is prepared and waiting for your county to open, so there will be a stretch with nothing in your inbox. A password lets you look in on it any time — we still email you the moment it is filed, with tracking.</>
          : <>We email you every update, so you do not need one. It just saves you a reset link the first time you come back to check on your appeal.</>}
      </div>
      {status === 'error' && message && (
        <div style={{ fontSize: 12.5, color: C.red || '#C0392B', marginBottom: 10 }}>{message}</div>
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
