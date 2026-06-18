import Head from 'next/head';
import { useRouter } from 'next/router';

const C = {
  navy: "#1B3A6B", gold: "#FFC940", darkNavy: "#0F1F3D", bg: "#F4F7FC",
  lightBlue: "#EEF3FB", bodyGray: "#5A6B82", mutedGray: "#8596AF",
  border: "#E8EDF4", white: "#FFFFFF", green: "#2E7D52",
};

const FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap');`;

const sections = [
  {
    title: "1. Acceptance of Terms",
    body: `By accessing or using TaxAppeal USA ("TaxAppeal," "we," "us," or "our") at taxappealusa.com, you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use our services.

These Terms constitute a legally binding agreement between you and TaxAppeal USA. We reserve the right to update these Terms at any time. Continued use of our services after any changes constitutes acceptance of the updated Terms.`,
  },
  {
    title: "2. Description of Services",
    body: `TaxAppeal USA provides property tax dispute assistance services, including:

• Preparation of property tax protest or appeal letters based on information you provide and publicly available comparable sales data.
• Filing of your protest or appeal letter via USPS certified mail with return receipt to the appropriate county appraisal district or tax assessor.
• Email delivery of your letter and USPS tracking confirmation.

TaxAppeal USA is a document preparation service. We are not a law firm, and our services do not constitute legal advice. We do not represent you in any legal proceeding, hearing, or appraisal review board appearance.`,
  },
  {
    title: "3. Eligibility",
    body: `You must be at least 18 years of age and a legal owner or authorized representative of the property for which you are filing a protest or appeal. By using our services, you represent and warrant that you have the legal authority to file a property tax protest or appeal for the subject property.

Our services are currently available for residential properties in Texas, Georgia, and Florida only.`,
  },
  {
    title: "4. Fees and Payment",
    body: `The current fee for our service is $79.00 USD per property filing. Payment is processed securely through Stripe. You will not be charged until your dispute letter has been generated and you have reviewed it.

All fees are non-refundable once your letter has been filed via USPS certified mail. If a filing error is caused by TaxAppeal USA (for example, filing to the wrong county or missing your deadline due to our error), we will refile at no additional cost or issue a full refund at our discretion.

Fees do not include any contingency, percentage of savings, or recurring charges. You pay once per filing.`,
  },
  {
    title: "5. Deadlines and Filing Windows",
    body: `Property tax protest and appeal deadlines are set by state law and vary by state and county:

• Texas: May 15 or 30 days after your Notice of Appraised Value is mailed, whichever is later.
• Georgia: 45 days from the date on your Notice of Assessment.
• Florida: 25 days from the date your TRIM notice is mailed. Florida requires RECEIPT by the deadline, not just postmark.

You are solely responsible for knowing your applicable deadline and initiating your filing with sufficient time for processing. TaxAppeal USA will use commercially reasonable efforts to file your letter promptly after payment, but we cannot guarantee same-day or next-day filing. Do not initiate a filing if your deadline is fewer than 5 business days away.

TaxAppeal USA is not liable for any missed deadlines caused by inaccurate information you provide, technical issues beyond our control, USPS delivery delays, or submission with insufficient time before the deadline.`,
  },
  {
    title: "6. Accuracy of Information",
    body: `You are responsible for providing accurate and complete information, including your property address, contact information, and any other details requested during the filing process. TaxAppeal USA relies on the information you provide to prepare your dispute letter.

Inaccurate information may result in an ineffective protest or appeal. TaxAppeal USA is not liable for outcomes resulting from inaccurate information you provide.`,
  },
  {
    title: "7. No Guarantee of Outcome",
    body: `TaxAppeal USA does not guarantee any specific outcome, reduction in assessed value, or tax savings. Property tax appeal outcomes are determined by county appraisal districts, boards of equalization, value adjustment boards, and other governmental bodies outside our control.

Historical success rates cited on our website reflect industry-wide data and are not a guarantee of your individual result. Results vary based on property type, county, market conditions, and the strength of available comparable sales evidence.`,
  },
  {
    title: "8. Not Legal Advice",
    body: `TaxAppeal USA is a document preparation and filing service. Nothing on our website or in our communications constitutes legal advice. We are not attorneys and do not provide legal representation.

If your protest or appeal proceeds to a formal hearing before an Appraisal Review Board, Board of Equalization, Value Adjustment Board, or any court, you may wish to consult a licensed attorney or property tax consultant in your state.`,
  },
  {
    title: "9. Intellectual Property",
    body: `All content on taxappealusa.com, including text, graphics, logos, and software, is the property of TaxAppeal USA and is protected by applicable intellectual property laws. You may not reproduce, distribute, or create derivative works from our content without our prior written consent.

The dispute letters we generate for you are provided for your personal use in connection with your property tax protest or appeal. You may share them with county officials as part of your filing. You may not resell or redistribute them.`,
  },
  {
    title: "10. Privacy",
    body: `Your use of TaxAppeal USA is also governed by our Privacy Policy, available at taxappealusa.com/privacy. By using our services, you consent to our collection and use of your information as described in the Privacy Policy.

We do not sell your personal information to third parties. We share your information only with service providers necessary to deliver our services (including Stripe for payment processing, Lob for certified mail, and Resend for email delivery).`,
  },
  {
    title: "11. Limitation of Liability",
    body: `To the fullest extent permitted by applicable law, TaxAppeal USA and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of savings, revenue, or data, arising from your use of our services.

Our total liability to you for any claim arising from your use of our services shall not exceed the amount you paid for the specific filing giving rise to the claim.`,
  },
  {
    title: "12. Disclaimer of Warranties",
    body: `Our services are provided "as is" and "as available" without warranties of any kind, either express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, or non-infringement.

We do not warrant that our services will be uninterrupted, error-free, or that any defects will be corrected.`,
  },
  {
    title: "13. Governing Law",
    body: `These Terms shall be governed by and construed in accordance with the laws of the State of Texas, without regard to its conflict of law provisions. Any disputes arising under these Terms shall be resolved in the state or federal courts located in Texas.`,
  },
  {
    title: "14. Dispute Resolution",
    body: `Any dispute, claim, or controversy arising out of or relating to these Terms or our services shall first be submitted to good-faith negotiation. If negotiation fails, disputes shall be resolved by binding arbitration under the rules of the American Arbitration Association, except that either party may seek injunctive relief in a court of competent jurisdiction.

You agree to resolve disputes with TaxAppeal USA on an individual basis and waive any right to participate in a class action lawsuit or class-wide arbitration.`,
  },
  {
    title: "15. Contact Information",
    body: `If you have questions about these Terms of Service, please contact us at:

TaxAppeal USA
Email: disputes@taxappealusa.com
Website: taxappealusa.com`,
  },
];

export default function Terms() {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>Terms of Service | TaxAppeal USA</title>
        <meta name="description" content="Terms of Service for TaxAppeal USA — property tax protest and appeal filing service for Texas, Georgia, and Florida homeowners." />
        <link rel="canonical" href="https://www.taxappealusa.com/terms" />
        <meta name="robots" content="noindex" />
      </Head>
      <style>{`
        ${FONT}
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: ${C.bg}; color: ${C.darkNavy}; }
        .btn-primary { background: ${C.navy}; color: #fff; border: none; border-radius: 8px; padding: 16px 36px; font-size: 16px; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: background 0.2s; }
        .btn-primary:hover { background: ${C.gold}; color: ${C.darkNavy}; }
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
        <button className="btn-primary" style={{ padding: "10px 22px", fontSize: 14 }} onClick={() => router.push('/apply')}>Start my dispute →</button>
      </div>

      {/* Header */}
      <section style={{ background: C.navy, padding: "48px 40px", color: C.white }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ fontSize: 12, color: C.gold, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 12 }}>Legal</div>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, lineHeight: 1.2, marginBottom: 12 }}>Terms of Service</h1>
          <p style={{ color: "#8596AF", fontSize: 14 }}>Last updated: June 1, 2026</p>
        </div>
      </section>

      {/* Content */}
      <section style={{ padding: "56px 40px", background: C.white }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>

          <div style={{ background: C.lightBlue, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "20px 24px", marginBottom: 40, fontSize: 14, color: C.bodyGray, lineHeight: 1.7 }}>
            Please read these Terms of Service carefully before using TaxAppeal USA. These Terms govern your use of our property tax protest and appeal filing service. By using our service, you agree to these Terms.
          </div>

          {sections.map((section, i) => (
            <div key={i} style={{ marginBottom: 40 }}>
              <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: C.darkNavy, marginBottom: 14, paddingBottom: 10, borderBottom: `1.5px solid ${C.border}` }}>
                {section.title}
              </h2>
              <div style={{ fontSize: 15, color: C.bodyGray, lineHeight: 1.8, whiteSpace: "pre-line" }}>
                {section.body}
              </div>
            </div>
          ))}

        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: C.darkNavy, padding: "24px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <p style={{ color: C.mutedGray, fontSize: 12 }}>© 2026 TaxAppeal USA · disputes@taxappealusa.com</p>
        <div style={{ display: "flex", gap: 20 }}>
          <a href="/texas" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Texas</a>
          <a href="/georgia" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Georgia</a>
          <a href="/florida" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Florida</a>
          <a href="/terms" style={{ color: C.gold, fontSize: 12, textDecoration: "none" }}>Terms</a>
          <a href="/privacy" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Privacy</a>
        </div>
      </footer>
    </>
  );
}
