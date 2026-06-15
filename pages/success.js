import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

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

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap');`;

export default function Success() {
  const router = useRouter();
  const { session_id } = router.query;
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [mailStatus, setMailStatus] = useState(null); // 'sending' | 'sent' | 'error'
  const [trackingNumber, setTrackingNumber] = useState(null);
  const [lobPreviewUrl, setLobPreviewUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!session_id) return;

    // Step 1: Verify payment
    fetch(`/api/verify-payment?session_id=${session_id}`)
      .then(r => r.json())
      .then(async data => {
        if (data.error) {
          setError(data.error);
          setLoading(false);
          return;
        }

        setSession(data);
        setLoading(false);

        // Step 2: Trigger certified mail if we have district info and letter
        if (data.districtName && data.districtAddress && data.letter && data.ownerStreet) {
          setMailStatus('sending');
          try {
            const mailRes = await fetch('/api/send-letter', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                districtName: data.districtName,
                districtAddress: data.districtAddress,
                districtCity: data.districtCity,
                districtState: data.districtState,
                districtZip: data.districtZip,
                ownerName: data.customerName,
                ownerStreet: data.ownerStreet,
                ownerCity: data.ownerCity,
                ownerState: data.ownerState,
                ownerZip: data.ownerZip,
                ownerEmail: data.email,
                letterContent: data.letter,
                propertyAddress: data.address,
                county: data.county,
                sessionId: session_id,
              }),
            });

            const mailData = await mailRes.json();
            if (mailData.success) {
              setMailStatus('sent');
              setTrackingNumber(mailData.trackingNumber);
              setLobPreviewUrl(mailData.url);
            } else {
              console.error('Mail send failed:', mailData.error);
              setMailStatus('error');
            }
          } catch (e) {
            console.error('Mail send error:', e);
            setMailStatus('error');
          }
        } else {
          // Missing some data — flag for manual dispatch
          setMailStatus('manual');
          console.log('Missing data for auto-mail:', {
            hasDistrict: !!data.districtName,
            hasAddress: !!data.districtAddress,
            hasLetter: !!data.letter,
            hasOwnerStreet: !!data.ownerStreet,
          });
        }
      })
      .catch(() => {
        setError('Could not verify payment. Please contact disputes@taxappealusa.com');
        setLoading(false);
      });
  }, [session_id]);

  const getMailStatusBadge = () => {
    switch (mailStatus) {
      case 'sending':
        return { icon: '⏳', text: 'Dispatching certified letter...', color: C.bodyGray, bg: C.bg };
      case 'sent':
        return { icon: '📬', text: 'Certified letter dispatched!', color: C.green, bg: '#E6F4ED' };
      case 'error':
        return { icon: '⚠️', text: 'Letter will be dispatched manually within 1 business day', color: '#7A5C10', bg: C.amber };
      case 'manual':
        return { icon: '📋', text: 'Letter queued for manual dispatch within 1 business day', color: '#7A5C10', bg: C.amber };
      default:
        return null;
    }
  };

  const badge = getMailStatusBadge();

  const steps = [
    {
      icon: '✓',
      title: 'Payment confirmed',
      desc: 'Your $79 payment has been processed successfully.',
      done: true,
    },
    {
      icon: '📄',
      title: 'Dispute letter prepared',
      desc: 'Your formal property tax protest letter has been finalized.',
      done: true,
    },
    {
      icon: '📬',
      title: 'Certified mail dispatch',
      desc: mailStatus === 'sent'
        ? `Your letter has been dispatched via USPS certified mail with return receipt.${trackingNumber ? ' Tracking: ' + trackingNumber : ''}`
        : 'Your letter will be mailed via USPS certified mail with return receipt within 1 business day.',
      done: mailStatus === 'sent',
      active: mailStatus === 'sending',
    },
    {
      icon: '🧾',
      title: 'Tracking receipt',
      desc: trackingNumber
        ? `USPS tracking number: ${trackingNumber}`
        : 'Your USPS certified mail tracking number will be emailed to you once dispatched.',
      done: !!trackingNumber,
    },
    {
      icon: '⏳',
      title: 'Await district response',
      desc: 'Appraisal districts typically respond within 30–90 days.',
      done: false,
    },
  ];

  return (
    <>
      <Head>
        <title>TaxAppeal — Your dispute has been filed!</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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
        <a href="mailto:disputes@taxappealusa.com" style={{ fontSize: 13, color: C.navy, textDecoration: "none" }}>disputes@taxappealusa.com</a>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px" }}>
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
            <a href="mailto:disputes@taxappealusa.com" style={{ color: C.navy, fontSize: 14 }}>Contact us at disputes@taxappealusa.com</a>
          </div>
        ) : (
          <>
            {/* Success header */}
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ width: 72, height: 72, background: "#E6F4ED", border: `2px solid ${C.green}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto 20px" }}>✓</div>
              <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 34, color: C.darkNavy, marginBottom: 10 }}>
                Your dispute is filed!
              </h1>
              <p style={{ fontSize: 16, color: C.bodyGray, lineHeight: 1.6 }}>
                Thank you{session?.customerName ? `, ${session.customerName.split(' ')[0]}` : ''}. Your property tax protest letter is being sent via USPS certified mail with return receipt.
              </p>
            </div>

            {/* Mail status badge */}
            {badge && (
              <div style={{ background: badge.bg, border: `1px solid ${badge.color}30`, borderRadius: 8, padding: "12px 16px", marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20, flexShrink: 0, animation: mailStatus === 'sending' ? 'pulse 1.5s ease-in-out infinite' : 'none' }}>{badge.icon}</span>
                <div style={{ fontSize: 14, fontWeight: 500, color: badge.color, fontFamily: "'DM Sans', sans-serif" }}>{badge.text}</div>
              </div>
            )}

            {/* Lob preview link (test mode only) */}
            {lobPreviewUrl && (
              <div style={{ background: C.lightBlue, border: `1px solid #C5D3E8`, borderRadius: 8, padding: "12px 16px", marginBottom: 24, fontSize: 13, color: C.navy }}>
                🔍 <strong>Test mode:</strong> <a href={lobPreviewUrl} target="_blank" rel="noopener noreferrer" style={{ color: C.navy }}>Preview your letter as it will appear when printed →</a>
              </div>
            )}

            {/* Order summary */}
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
                <span style={{ fontWeight: 700, color: C.darkNavy }}>$79.00</span>
              </div>
            </div>

            {/* What happens next */}
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

            {/* Email notice */}
            <div style={{ background: C.amber, border: "1px solid #FFD97A", borderRadius: 10, padding: "16px 20px", marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#7A5C10", marginBottom: 6 }}>📧 Confirmation email sent</div>
              <div style={{ fontSize: 13, color: "#7A5C10", lineHeight: 1.6 }}>
                A confirmation has been sent to <strong>{session?.email}</strong>. Your USPS certified mail tracking number will follow once your letter has been dispatched.
              </div>
            </div>

            {/* Important note */}
            <div style={{ background: C.lightBlue, border: `1px solid #C5D3E8`, borderRadius: 10, padding: "16px 20px", marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 6 }}>⚖️ Important</div>
              <div style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.6 }}>
                Your appraisal district will contact you directly with their decision — typically within 30–90 days. A copy of all correspondence will also be sent to <strong>disputes@taxappealusa.com</strong> as your filing agent.
              </div>
            </div>

            {/* Contact */}
            <div style={{ textAlign: "center", fontSize: 13, color: C.mutedGray, lineHeight: 1.8 }}>
              Questions? Email <a href="mailto:disputes@taxappealusa.com" style={{ color: C.navy }}>disputes@taxappealusa.com</a>
              <br />
              <a href="/" style={{ color: C.navy }}>← Back to TaxAppeal</a>
            </div>
          </>
        )}
      </div>
    </>
  );
}
