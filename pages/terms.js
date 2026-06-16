import Head from 'next/head';

const C = {
  navy:     "#1B3A6B",
  darkNavy: "#0F1F3D",
  bg:       "#F4F7FC",
  bodyGray: "#5A6B82",
  mutedGray:"#8596AF",
  border:   "#E8EDF4",
  white:    "#FFFFFF",
  gold:     "#FFC940",
};

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap');`;

export default function Terms() {
  return (
    <>
      <Head>
        <title>Terms of Service — TaxAppeal</title>
        <meta name="description" content="TaxAppeal Terms of Service" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <style>{`
        ${FONT_IMPORT}
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: ${C.bg}; color: ${C.darkNavy}; }
        h1 { font-family: 'DM Serif Display', serif; }
        h2 { font-family: 'DM Serif Display', serif; font-size: 22px; color: ${C.darkNavy}; margin: 36px 0 12px; }
        h3 { font-size: 16px; font-weight: 500; color: ${C.darkNavy}; margin: 20px 0 8px; }
        p { font-size: 14px; color: ${C.bodyGray}; line-height: 1.8; margin-bottom: 14px; }
        ul { margin: 0 0 14px 20px; }
        ul li { font-size: 14px; color: ${C.bodyGray}; line-height: 1.8; margin-bottom: 6px; }
        a { color: ${C.navy}; text-decoration: none; }
        a:hover { text-decoration: underline; }
      `}</style>

      {/* Nav */}
      <div style={{ background: C.white, borderBottom: `1.5px solid ${C.border}`, padding: "16px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{ width: 34, height: 34, background: C.navy, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🏠</div>
          <div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: C.darkNavy }}>TaxAppeal</div>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "1.5px", color: C.mutedGray }}>Property Tax Dispute</div>
          </div>
        </a>
        <a href="/apply" style={{ background: C.navy, color: C.white, padding: "9px 18px", borderRadius: 7, fontSize: 13, fontWeight: 500 }}>Start my dispute →</a>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "56px 24px 80px" }}>
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: 38, color: C.darkNavy, marginBottom: 12 }}>Terms of Service</h1>
          <p style={{ fontSize: 13, color: C.mutedGray }}>Last updated: June 15, 2026</p>
        </div>

        <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "20px 24px", marginBottom: 36 }}>
          <p style={{ margin: 0, fontSize: 14, color: C.bodyGray, lineHeight: 1.7 }}>
            Please read these Terms of Service carefully before using TaxAppeal. By accessing or using our service, you agree to be bound by these terms. If you do not agree with any part of these terms, you may not use our service.
          </p>
        </div>

        <h2>1. About TaxAppeal</h2>
        <p>TaxAppeal USA ("TaxAppeal," "we," "us," or "our") is a document preparation service that helps homeowners prepare and file property tax protest letters with their county appraisal district. TaxAppeal operates at taxappealusa.com and can be reached at disputes@taxappealusa.com.</p>
        <p>TaxAppeal currently serves homeowners in Texas, Georgia, and Florida.</p>

        <h2>2. Nature of Service</h2>
        <p>TaxAppeal is a <strong>document preparation service only</strong>, not a law firm. We do not provide legal advice, and our service does not constitute legal representation. By using TaxAppeal you acknowledge that:</p>
        <ul>
          <li>We prepare and mail your property tax protest letter on your behalf</li>
          <li>We are not attorneys and do not provide legal counsel</li>
          <li>For complex disputes, you should consult a licensed property tax consultant or attorney</li>
          <li>The information we provide is for general informational purposes only</li>
        </ul>

        <h2>3. Service Fee</h2>
        <p>TaxAppeal charges a flat fee of <strong>$79 per property dispute filing</strong>. This fee covers:</p>
        <ul>
          <li>AI-powered dispute letter generation using your property data and comparable sales</li>
          <li>USPS certified mail dispatch with return receipt to the correct appraisal district</li>
          <li>Filing agent representation at disputes@taxappealusa.com</li>
          <li>Email confirmation with your dispute letter and tracking information</li>
        </ul>

        <h2>4. No Guarantee of Outcome</h2>
        <p>TaxAppeal <strong>does not guarantee</strong> that your property tax assessment will be reduced. The final determination rests solely with your county appraisal district or board of equalization. We make no representations or warranties regarding the likelihood of a successful outcome.</p>
        <p>By using our service you acknowledge that your appraisal district may deny your protest, and that TaxAppeal has no control over or responsibility for the district's decision.</p>

        <h2>5. Refund Policy</h2>
        <p>All fees are <strong>non-refundable</strong> once your certified mail has been dispatched by Lob.com on your behalf. This is because the primary costs of our service (postage, printing, certified mail) are incurred at the time of dispatch.</p>
        <p>If TaxAppeal made a material error in your dispute letter (incorrect property address, incorrect assessed value based on information you provided, etc.), we will correct and refile the letter at no additional charge within the filing deadline window.</p>
        <p>Refund requests must be submitted to disputes@taxappealusa.com within 24 hours of payment and before certified mail dispatch.</p>

        <h2>6. Accuracy of Information</h2>
        <p>You are responsible for ensuring the accuracy of all information you provide to TaxAppeal, including your property address, contact information, and any manually entered property values. TaxAppeal uses third-party data sources (including BatchData, public records, and web search) to populate property information, and we do not guarantee the accuracy of this data.</p>
        <p>You agree to review your dispute letter before authorizing filing and to notify us of any inaccuracies before payment.</p>

        <h2>7. Filing Deadlines</h2>
        <p>Property tax protest deadlines vary by state and county. You are responsible for verifying that your county's protest window is open before filing. TaxAppeal provides deadline information as a general guide but does not guarantee its accuracy.</p>
        <ul>
          <li><strong>Texas:</strong> May 15 or 30 days after appraisal notice, whichever is later</li>
          <li><strong>Georgia:</strong> 45 days after assessment notice</li>
          <li><strong>Florida:</strong> 25 days after TRIM notice (typically mid-September). Note: Florida requires <em>receipt</em> by deadline, not just postmark — file at least 7 days early.</li>
        </ul>

        <h2>8. Certified Mail</h2>
        <p>TaxAppeal uses Lob.com to dispatch certified mail via USPS. Once your letter is dispatched, it cannot be recalled. Certified mail with return receipt provides legal proof that your protest was sent and received by the appraisal district.</p>

        <h2>9. Privacy</h2>
        <p>Your use of TaxAppeal is also governed by our <a href="/privacy">Privacy Policy</a>, which is incorporated into these Terms by reference.</p>

        <h2>10. Intellectual Property</h2>
        <p>All content, features, and functionality of TaxAppeal — including but not limited to text, graphics, logos, and software — are owned by TaxAppeal USA and protected by applicable intellectual property laws.</p>

        <h2>11. Limitation of Liability</h2>
        <p>To the fullest extent permitted by law, TaxAppeal shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of revenue, loss of tax savings, or costs of alternative filing services, arising from your use of our service.</p>
        <p>TaxAppeal's total liability to you for any claim arising from or related to these Terms or our service shall not exceed the amount you paid for the service giving rise to the claim.</p>

        <h2>12. Indemnification</h2>
        <p>You agree to indemnify and hold harmless TaxAppeal USA, its officers, directors, employees, and agents from any claims, damages, losses, or expenses (including reasonable attorneys' fees) arising from your use of the service, your violation of these Terms, or your violation of any third-party rights.</p>

        <h2>13. Governing Law</h2>
        <p>These Terms shall be governed by and construed in accordance with the laws of the State of Texas, without regard to its conflict of law provisions. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts located in Tarrant County, Texas.</p>

        <h2>14. Changes to Terms</h2>
        <p>TaxAppeal reserves the right to modify these Terms at any time. We will notify users of material changes by updating the "Last updated" date at the top of this page. Your continued use of the service after any changes constitutes your acceptance of the new Terms.</p>

        <h2>15. Contact Us</h2>
        <p>If you have questions about these Terms of Service, please contact us at:</p>
        <p>
          <strong>TaxAppeal USA</strong><br />
          Email: <a href="mailto:disputes@taxappealusa.com">disputes@taxappealusa.com</a><br />
          Website: <a href="https://taxappealusa.com">taxappealusa.com</a>
        </p>
      </div>

      {/* Footer */}
      <div style={{ background: C.darkNavy, padding: "24px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <p style={{ color: C.mutedGray, fontSize: 12, margin: 0 }}>© 2026 TaxAppeal USA · disputes@taxappealusa.com</p>
        <div style={{ display: "flex", gap: 20 }}>
          <a href="/terms" style={{ color: C.mutedGray, fontSize: 12 }}>Terms of Service</a>
          <a href="/privacy" style={{ color: C.mutedGray, fontSize: 12 }}>Privacy Policy</a>
        </div>
      </div>
    </>
  );
}
