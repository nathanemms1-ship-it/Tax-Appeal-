import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

const C = {
  navy: "#1B3A6B",
  gold: "#FFC940",
  darkNavy: "#0F1F3D",
  bg: "#F4F7FC",
  lightBlue: "#EEF3FB",
  bodyGray: "#5A6B82",
  mutedGray: "#8596AF",
  border: "#E8EDF4",
  white: "#FFFFFF",
  green: "#2E7D52",
};

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap');`;

export default function Success() {
  const router = useRouter();
  const { session_id } = router.query;
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!session_id) return;
    fetch(`/api/verify-payment?session_id=${session_id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setSession(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not verify payment. Please contact disputes@taxappealusa.com');
        setLoading(false);
      });
  }, [session_id]);

  const steps = [
    { icon: "✓", title: "Payment confirmed", desc: "Your $79 payment has been processed successfully.", done: true },
    { icon: "📄", title: "Letter being prepared", desc: "Your certified dispute letter is being finalized.", done: true },
    { icon: "📬", title: "Certified mail dispatch", desc: "Your letter will be mailed via USPS certified mail with return receipt within 1 business day.", done: false },
    { icon: "🧾", title: "Tracking receipt", desc: "Your USPS certified mail tracking number will be emailed to you once dispatched.", done: false },
    { icon: "⏳", title: "Await district response", desc: "Appraisal districts typically respond within 30–90 days.", done: false },
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
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", border: `3px solid ${C.navy}`, borderTopColor: "transparent", animation: "spin 1s linear infinite", margin: "0 auto 20px" }} />
            <p style={{ color: C.bodyGray, fontSize: 15 }}>Verifying your payment...</p>
          </div>
        ) : error ? (
          <div style={{ background: "#FEE8E7", border: "1px solid #F5C6C0", borderRadius: 10, padding: "24px", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: C.darkNavy, marginBottom: 8 }}>Payment issue</h2>
            <p style={{ fontSize: 14, color: C.bodyGray }}>{error}</p>
          </div>
        ) : (
          <>
            {/* Success header */}
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <div style={{ width: 72, height: 72, background: "#E6F4ED", border: `2px solid ${C.green}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto 20px" }}>✓</div>
              <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 34, color: C.darkNavy, marginBottom: 10 }}>Your dispute is filed!</h1>
              <p style={{ fontSize: 16, color: C.bodyGray, lineHeight: 1.6 }}>
                Thank you{session?.customerName ? `, ${session.customerName.split(" ")[0]}` : ""}. Your property tax protest has been submitted and your certified letter will be mailed within 1 business day.
              </p>
            </div>

            {/* Order summary */}
            {session && (
              <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "20px 24px", marginBottom: 24 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", color: C.mutedGray, marginBottom: 14, fontWeight: 500 }}>Order Summary</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 14 }}>
                  <span style={{ color: C.bodyGray }}>Property</span>
                  <span style={{ color: C.darkNavy, fontWeight: 500, textAlign: "right", maxWidth: 300 }}>{session.address}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 14 }}>
                  <span style={{ color: C.bodyGray }}>County</span>
                  <span style={{ color: C.darkNavy, fontWeight: 500 }}>{session.county}</span>
                </div>
                {session.assessedValue && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 14 }}>
                    <span style={{ color: C.bodyGray }}>Current assessed value</span>
                    <span style={{ color: C.darkNavy, fontWeight: 500 }}>${Number(session.assessedValue).toLocaleString()}</span>
                  </div>
                )}
                {session.targetReduction && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 14 }}>
                    <span style={{ color: C.bodyGray }}>Reduction requested</span>
                    <span style={{ color: C.green, fontWeight: 500 }}>Down to ${Number(session.targetReduction).toLocaleString()}</span>
                  </div>
                )}
                {session.savings && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 14 }}>
                    <span style={{ color: C.bodyGray }}>Potential annual savings</span>
                    <span style={{ color: C.green, fontWeight: 700 }}>${Number(session.savings).toLocaleString()}</span>
                  </div>
                )}
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 15 }}>
                  <span style={{ fontWeight: 500, color: C.darkNavy }}>Amount paid</span>
                  <span style={{ fontWeight: 700, color: C.darkNavy }}>$79.00</span>
                </div>
              </div>
            )}

            {/* What happens next */}
            <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "20px 24px", marginBottom: 24 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", color: C.mutedGray, marginBottom: 16, fontWeight: 500 }}>What Happens Next</div>
              {steps.map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: i < steps.length - 1 ? 16 : 0, paddingBottom: i < steps.length - 1 ? 16 : 0, borderBottom: i < steps.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: step.done ? C.navy : C.bg, border: `1.5px solid ${step.done ? C.navy : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                    {step.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: C.darkNavy, marginBottom: 3 }}>{step.title}</div>
                    <div style={{ fontSize: 12, color: C.bodyGray, lineHeight: 1.5 }}>{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Important notice */}
            <div style={{ background: "#FFF8E6", border: "1px solid #FFD97A", borderRadius: 10, padding: "16px 20px", marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#7A5C10", marginBottom: 6 }}>📬 Check your email</div>
              <div style={{ fontSize: 13, color: "#7A5C10", lineHeight: 1.6 }}>
                A confirmation has been sent to {session?.email || "your email address"}. Your USPS certified mail tracking number will follow within 1 business day once your letter has been dispatched.
              </div>
            </div>

            {/* Contact */}
            <div style={{ textAlign: "center", fontSize: 13, color: C.mutedGray, lineHeight: 1.7 }}>
              Questions? Email us at{" "}
              <a href="mailto:disputes@taxappealusa.com" style={{ color: C.navy }}>disputes@taxappealusa.com</a>
              <br />
              <a href="/" style={{ color: C.navy, marginTop: 8, display: "inline-block" }}>← Back to TaxAppeal</a>
            </div>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
