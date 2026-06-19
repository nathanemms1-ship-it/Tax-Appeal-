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

function buildConfirmationEmail({ customerName, address, county, districtName, assessedValue, targetReduction, savings, trackingNumber, letter }) {
  const firstName = customerName ? customerName.split(' ')[0] : 'there';
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F4F7FC;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FC;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:#1B3A6B;border-radius:12px 12px 0 0;padding:28px 36px;text-align:center;">
          <div style="font-family:Georgia,serif;font-size:24px;color:#FFFFFF;margin-bottom:4px;">🏠 TaxAppeal</div>
          <div style="font-size:11px;color:#8596AF;letter-spacing:2px;text-transform:uppercase;">Property Tax Dispute</div>
        </td></tr>
        <tr><td style="background:#2E7D52;padding:16px 36px;text-align:center;">
          <div style="font-size:15px;font-weight:600;color:#FFFFFF;">✓ Your dispute has been filed!</div>
        </td></tr>
        <tr><td style="background:#FFFFFF;padding:36px;">
          <p style="font-size:16px;color:#0F1F3D;margin:0 0 16px;">Hi ${firstName},</p>
          <p style="font-size:14px;color:#5A6B82;line-height:1.7;margin:0 0 24px;">
            Your property tax protest has been filed and your certified dispute letter ${trackingNumber ? 'has been dispatched' : 'is being sent'} via <strong>USPS certified mail with return receipt</strong> to the ${districtName || county + ' Appraisal District'}.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FC;border-radius:8px;padding:20px;margin-bottom:24px;">
            <tr><td>
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8596AF;font-weight:600;margin-bottom:14px;">DISPUTE SUMMARY</div>
              <table width="100%"><tr><td style="font-size:13px;color:#8596AF;">Property</td><td style="font-size:13px;color:#0F1F3D;font-weight:500;text-align:right;">${address}</td></tr></table>
              <table width="100%"><tr><td style="font-size:13px;color:#8596AF;">Filed with</td><td style="font-size:13px;color:#0F1F3D;font-weight:500;text-align:right;">${districtName || county + ' Appraisal District'}</td></tr></table>
              ${assessedValue ? `<table width="100%"><tr><td style="font-size:13px;color:#8596AF;">Current assessed value</td><td style="font-size:13px;color:#0F1F3D;font-weight:500;text-align:right;">$${Number(assessedValue).toLocaleString()}</td></tr></table>` : ''}
              ${targetReduction ? `<table width="100%"><tr><td style="font-size:13px;color:#8596AF;">Reduction requested</td><td style="font-size:13px;color:#2E7D52;font-weight:500;text-align:right;">Down to $${Number(targetReduction).toLocaleString()}</td></tr></table>` : ''}
              ${savings ? `<table width="100%"><tr><td style="font-size:13px;color:#8596AF;">Potential annual savings</td><td style="font-size:13px;color:#2E7D52;font-weight:700;text-align:right;">$${Number(savings).toLocaleString()}</td></tr></table>` : ''}
              ${trackingNumber ? `<table width="100%"><tr><td style="font-size:13px;color:#8596AF;">USPS Tracking</td><td style="font-size:13px;color:#1B3A6B;font-weight:700;text-align:right;">${trackingNumber}</td></tr></table>` : ''}
              <table width="100%" style="border-top:1px solid #E8EDF4;padding-top:12px;margin-top:8px;"><tr><td style="font-size:14px;color:#0F1F3D;font-weight:600;">Amount paid</td><td style="font-size:14px;color:#0F1F3D;font-weight:700;text-align:right;">$79.00</td></tr></table>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8E6;border:1px solid #FFD97A;border-radius:8px;padding:16px;margin-bottom:24px;">
            <tr><td>
              <div style="font-size:13px;font-weight:700;color:#7A5C10;margin-bottom:6px;">⚖️ What happens next</div>
              <div style="font-size:13px;color:#7A5C10;line-height:1.6;">The appraisal district will review your protest and respond within 30–90 days. All correspondence will be copied to <strong>disputes@taxappealusa.com</strong> as your filing agent.</div>
            </td></tr>
          </table>
          ${letter ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E8EDF4;border-radius:8px;overflow:hidden;margin-bottom:8px;">
            <tr><td style="background:#F4F7FC;padding:12px 20px;border-bottom:1px solid #E8EDF4;">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8596AF;font-weight:600;">YOUR DISPUTE LETTER — FOR YOUR RECORDS</div>
            </td></tr>
            <tr><td style="background:#FFFFFF;padding:28px 32px;font-family:Georgia,serif;font-size:12px;line-height:1.85;color:#111;white-space:pre-wrap;">${letter}</td></tr>
          </table>
          <div style="font-size:11px;color:#8596AF;text-align:center;margin-bottom:8px;">Keep this email as your official record of the dispute letter filed on your behalf.</div>
          ` : ''}
        </td></tr>
        <tr><td style="background:#0F1F3D;border-radius:0 0 12px 12px;padding:24px 36px;text-align:center;">
          <div style="font-size:13px;color:#8596AF;margin-bottom:8px;">Questions? Reply to this email or contact us at</div>
          <a href="mailto:disputes@taxappealusa.com" style="font-size:13px;color:#FFC940;text-decoration:none;">disputes@taxappealusa.com</a>
          <div style="font-size:11px;color:#3A4E6A;margin-top:16px;">© 2026 TaxAppeal USA · taxappealusa.com</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export default function Success() {
  const router = useRouter();
  const { session_id } = router.query;
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [mailStatus, setMailStatus] = useState(null);
  const [trackingNumber, setTrackingNumber] = useState(null);
  const [lobPreviewUrl, setLobPreviewUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!session_id) return;

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

            // Always save the order regardless of mail status
            try {
              await fetch('/api/save-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  customerName: data.customerName,
                  customerEmail: data.email,
                  passwordHash: data.passwordHash,
                  propertyAddress: data.address,
                  county: data.county,
                  state: data.ownerState,
                  assessedValue: data.assessedValue,
                  targetReduction: data.targetReduction,
                  estimatedSavings: data.savings,
                  stripeSessionId: session_id,
                  amountPaid: 7900,
                  lobLetterId: mailData.letterId || null,
                  lobTrackingNumber: mailData.trackingNumber || null,
                  districtName: data.districtName,
                  districtAddress: data.districtAddress,
                  districtCity: data.districtCity,
                  districtState: data.districtState,
                  districtZip: data.districtZip,
                }),
              });
              console.log('Order saved to database');
            } catch (dbErr) {
              console.error('Database save failed:', dbErr);
            }

            if (mailData.success) {
              setMailStatus('sent');
              setTrackingNumber(mailData.trackingNumber);
              setLobPreviewUrl(mailData.url);

              // Send confirmation email
              try {
                await fetch('/api/send-email', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    to: data.email,
                    subject: `Your property tax dispute has been filed — ${data.address}`,
                    html: buildConfirmationEmail({
                      customerName: data.customerName,
                      address: data.address,
                      county: data.county,
                      districtName: data.districtName,
                      assessedValue: data.assessedValue,
                      targetReduction: data.targetReduction,
                      savings: data.savings,
                      trackingNumber: mailData.trackingNumber,
                      letter: data.letter,
                    }),
                    text: `Your property tax dispute for ${data.address} has been filed. Tracking: ${mailData.trackingNumber || 'Pending'}`,
                  }),
                });
                console.log('Confirmation email sent to:', data.email);
              } catch (emailErr) {
                console.error('Email send failed:', emailErr);
              }

            } else {
              console.error('Mail send failed:', mailData.error);
              setMailStatus('error');
            }
          } catch (e) {
            console.error('Mail send error:', e);
            setMailStatus('error');
          }
        } else {
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
      case 'sending': return { icon: '⏳', text: 'Dispatching certified letter...', color: C.bodyGray, bg: C.bg };
      case 'sent':    return { icon: '📬', text: 'Certified letter dispatched!', color: C.green, bg: '#E6F4ED' };
      case 'error':   return { icon: '⚠️', text: 'Letter will be dispatched manually within 1 business day', color: '#7A5C10', bg: C.amber };
      case 'manual':  return { icon: '📋', text: 'Letter queued for manual dispatch within 1 business day', color: '#7A5C10', bg: C.amber };
      default: return null;
    }
  };

  const badge = getMailStatusBadge();

  const steps = [
    { icon: '✓', title: 'Payment confirmed', desc: 'Your $79 payment has been processed successfully.', done: true },
    { icon: '📄', title: 'Dispute letter prepared', desc: 'Your formal property tax protest letter has been finalized.', done: true },
    { icon: '📬', title: 'Certified mail dispatch', desc: mailStatus === 'sent' ? `Your letter has been dispatched via USPS certified mail with return receipt.${trackingNumber ? ' Tracking: ' + trackingNumber : ''}` : 'Your letter will be mailed via USPS certified mail with return receipt within 1 business day.', done: mailStatus === 'sent', active: mailStatus === 'sending' },
    { icon: '🧾', title: 'Tracking receipt', desc: trackingNumber ? `USPS tracking number: ${trackingNumber}` : 'Your USPS certified mail tracking number will be emailed to you once dispatched.', done: !!trackingNumber },
    { icon: '⏳', title: 'Await district response', desc: 'Appraisal districts typically respond within 30–90 days.', done: false },
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
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ width: 72, height: 72, background: "#E6F4ED", border: `2px solid ${C.green}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto 20px" }}>✓</div>
              <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 34, color: C.darkNavy, marginBottom: 10 }}>Your dispute is filed!</h1>
              <p style={{ fontSize: 16, color: C.bodyGray, lineHeight: 1.6 }}>
                Thank you{session?.customerName ? `, ${session.customerName.split(' ')[0]}` : ''}. Your property tax protest letter is being sent via USPS certified mail with return receipt.
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
                <span style={{ fontWeight: 700, color: C.darkNavy }}>$79.00</span>
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
                A confirmation has been sent to <strong>{session?.email}</strong>. Your USPS certified mail tracking number will follow once your letter has been dispatched.
              </div>
            </div>

            <div style={{ background: C.lightBlue, border: `1px solid #C5D3E8`, borderRadius: 10, padding: "16px 20px", marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 6 }}>⚖️ Important</div>
              <div style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.6 }}>
                Your appraisal district will contact you directly with their decision — typically within 30–90 days. A copy of all correspondence will also be sent to <strong>disputes@taxappealusa.com</strong> as your filing agent.
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
