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

export default function Privacy() {
  return (
    <>
      <Head>
        <title>Privacy Policy — TaxAppeal</title>
        <meta name="description" content="TaxAppeal Privacy Policy" />
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
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #F4F7FC; padding: 10px 14px; font-size: 13px; font-weight: 500; color: ${C.darkNavy}; text-align: left; border: 1px solid ${C.border}; }
        td { padding: 10px 14px; font-size: 13px; color: ${C.bodyGray}; border: 1px solid ${C.border}; vertical-align: top; line-height: 1.6; }
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
          <h1 style={{ fontSize: 38, color: C.darkNavy, marginBottom: 12 }}>Privacy Policy</h1>
          <p style={{ fontSize: 13, color: C.mutedGray }}>Last updated: June 15, 2026</p>
        </div>

        <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "20px 24px", marginBottom: 36 }}>
          <p style={{ margin: 0, fontSize: 14, color: C.bodyGray, lineHeight: 1.7 }}>
            TaxAppeal USA ("TaxAppeal," "we," "us," or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our service at taxappealusa.com.
          </p>
        </div>

        <h2>1. Information We Collect</h2>
        <h3>Information you provide directly:</h3>
        <ul>
          <li>Name and email address (account creation)</li>
          <li>Property address (for dispute filing)</li>
          <li>Payment information (processed securely by Stripe — we never store card numbers)</li>
          <li>Property details you manually enter (assessed value, square footage, etc.)</li>
          <li>Property issues and notes you select during the dispute process</li>
        </ul>

        <h3>Information we collect automatically:</h3>
        <ul>
          <li>Property data from public records via BatchData and county assessor databases</li>
          <li>Comparable sales data from public real estate records</li>
          <li>County and appraisal district information from public government sources</li>
          <li>Basic usage data (pages visited, time on site) via analytics</li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <table>
          <thead>
            <tr><th>Purpose</th><th>Data Used</th></tr>
          </thead>
          <tbody>
            <tr><td>Generate your dispute letter</td><td>Name, property address, assessed value, property details, issues selected</td></tr>
            <tr><td>File your dispute via certified mail</td><td>Name, property address, appraisal district address</td></tr>
            <tr><td>Process your payment</td><td>Email address (passed to Stripe)</td></tr>
            <tr><td>Send confirmation emails</td><td>Email address, order details, dispute letter</td></tr>
            <tr><td>Improve our service</td><td>Aggregated, anonymized usage data</td></tr>
            <tr><td>Customer support</td><td>Email address, order details</td></tr>
          </tbody>
        </table>

        <h2>3. Information We Share</h2>
        <p>We do not sell, trade, or rent your personal information to third parties. We share your information only as necessary to provide our service:</p>

        <table>
          <thead>
            <tr><th>Third Party</th><th>Purpose</th><th>Data Shared</th></tr>
          </thead>
          <tbody>
            <tr><td><strong>Stripe</strong></td><td>Payment processing</td><td>Email address, payment amount</td></tr>
            <tr><td><strong>Lob.com</strong></td><td>Certified mail dispatch</td><td>Your name and address, district address, letter content</td></tr>
            <tr><td><strong>Resend</strong></td><td>Email delivery</td><td>Email address, letter content</td></tr>
            <tr><td><strong>BatchData</strong></td><td>Property data lookup</td><td>Property address</td></tr>
            <tr><td><strong>Anthropic</strong></td><td>Letter generation (Claude AI)</td><td>Property details, issues selected, prompt data</td></tr>
            <tr><td><strong>Google</strong></td><td>Address autocomplete</td><td>Address search queries</td></tr>
            <tr><td><strong>Upstash</strong></td><td>Data caching</td><td>County and district lookup results</td></tr>
            <tr><td><strong>County Appraisal Districts</strong></td><td>Filing your protest</td><td>Your name, address, dispute letter</td></tr>
          </tbody>
        </table>

        <p>We may also disclose your information if required by law, court order, or government authority, or to protect the rights, property, or safety of TaxAppeal, our users, or others.</p>

        <h2>4. Data Retention</h2>
        <p>We retain your personal information for as long as necessary to provide our service and comply with legal obligations:</p>
        <ul>
          <li><strong>Account data:</strong> Retained while your account is active and for 3 years after</li>
          <li><strong>Payment records:</strong> Retained for 7 years for tax and accounting purposes</li>
          <li><strong>Dispute letters:</strong> Retained for 3 years as proof of filing</li>
          <li><strong>Cached lookup data:</strong> Automatically expires after 180 days</li>
          <li><strong>Temporary letter storage:</strong> Automatically expires after 2 hours (Redis)</li>
        </ul>

        <h2>5. Data Security</h2>
        <p>We implement industry-standard security measures to protect your information:</p>
        <ul>
          <li>All data transmitted via HTTPS/TLS encryption</li>
          <li>Payment processing handled entirely by Stripe — we never store card numbers</li>
          <li>API keys and credentials stored as encrypted environment variables</li>
          <li>Access to customer data restricted to authorized personnel only</li>
        </ul>
        <p>No method of transmission over the internet is 100% secure. While we strive to protect your information, we cannot guarantee absolute security.</p>

        <h2>6. Your Rights</h2>
        <p>Depending on your location, you may have the following rights regarding your personal data:</p>
        <ul>
          <li><strong>Access:</strong> Request a copy of the personal data we hold about you</li>
          <li><strong>Correction:</strong> Request correction of inaccurate or incomplete data</li>
          <li><strong>Deletion:</strong> Request deletion of your personal data (subject to legal retention requirements)</li>
          <li><strong>Portability:</strong> Request your data in a portable format</li>
          <li><strong>Opt-out:</strong> Opt out of any marketing communications</li>
        </ul>
        <p>To exercise any of these rights, contact us at <a href="mailto:disputes@taxappealusa.com">disputes@taxappealusa.com</a>.</p>

        <h2>7. Cookies</h2>
        <p>TaxAppeal uses minimal cookies necessary for the service to function, including session management and security tokens. We do not use advertising or tracking cookies. We do not display ads and do not share data with advertisers.</p>

        <h2>8. Children's Privacy</h2>
        <p>TaxAppeal is not directed at children under 13 years of age. We do not knowingly collect personal information from children under 13. If you believe we have inadvertently collected such information, please contact us immediately.</p>

        <h2>9. Third-Party Links</h2>
        <p>Our service may contain links to third-party websites (such as your county appraisal district). We are not responsible for the privacy practices of those sites and encourage you to review their privacy policies.</p>

        <h2>10. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. We will notify you of material changes by updating the "Last updated" date at the top of this page. Your continued use of our service after changes constitutes acceptance of the updated policy.</p>

        <h2>11. Contact Us</h2>
        <p>If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:</p>
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
