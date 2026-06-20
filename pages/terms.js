// pages/terms.js
import Head from 'next/head';
import Link from 'next/link';

export default function Terms() {
  return (
    <>
      <Head>
        <title>Terms of Service | TaxAppeal USA</title>
        <meta name="description" content="Terms of Service for TaxAppeal USA property tax protest service." />
        <meta name="robots" content="noindex" />
      </Head>
      <div style={{ background: '#f4f6f9', minHeight: '100vh', padding: '40px 20px', fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
        <div style={{ maxWidth: 760, margin: '0 auto', background: '#fff', borderRadius: 8, padding: '48px 52px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#C9A84C', letterSpacing: '0.05em' }}>TaxAppeal USA</div>
            </Link>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1B2A4A', margin: '16px 0 8px' }}>Terms of Service</h1>
            <p style={{ fontSize: 13, color: '#999' }}>Last updated: June 2025</p>
          </div>

          <div style={{ fontSize: 15, color: '#444', lineHeight: 1.8 }}>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>1. Service Description</h2>
            <p>TaxAppeal USA ("we," "our," "us") provides a document preparation service that generates property tax protest letters on behalf of homeowners. We are not a law firm, and our service does not constitute legal advice. We prepare and mail protest letters via USPS Certified Mail to county appraisal districts on your behalf.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>2. Flat Fee &amp; Payment</h2>
            <p>Our service is provided at a flat fee of $79 per property per filing season. This fee covers AI-generated letter preparation, USPS Certified Mail dispatch, and confirmation email delivery. Payment is processed securely via Stripe.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>3. No Outcome Guarantee</h2>
            <p>We do not guarantee any particular outcome, reduction in assessed value, or tax savings. Property tax protest results depend entirely on the decisions of the applicable county appraisal district. Our service guarantees only that your protest letter will be professionally prepared and dispatched via certified mail within the applicable filing window.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>4. Refund Policy</h2>
            <p>Due to the nature of document preparation and certified mail dispatch, all fees are non-refundable once your letter has been generated and dispatched. If your letter has not yet been dispatched and you contact us at <a href="mailto:customerservice@taxappealusa.com" style={{ color: '#C9A84C' }}>customerservice@taxappealusa.com</a> within 24 hours of payment, we will review refund requests on a case-by-case basis.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>5. Filing Deadlines</h2>
            <p>Property tax protest deadlines vary by state and county. We make reasonable efforts to file within active protest windows. It is your responsibility to verify that your jurisdiction's protest window is open before purchasing our service. We will notify you if we detect that your deadline has passed.</p>
            <ul>
              <li><strong>Texas:</strong> Generally May 15 or 30 days after notice (whichever is later)</li>
              <li><strong>Georgia:</strong> 45 days from assessment notice date</li>
              <li><strong>Florida:</strong> 25 days from TRIM notice (letter must be RECEIVED, not postmarked)</li>
            </ul>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>6. Supported States</h2>
            <p>Our service currently supports properties in Texas, Georgia, and Florida only. We reserve the right to expand or restrict supported states at any time.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>7. User Responsibilities</h2>
            <p>You agree to provide accurate property and contact information. Inaccurate information that results in a failed or improper filing does not entitle you to a refund. You are responsible for monitoring your mail and email for any response from the appraisal district.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>8. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, TaxAppeal USA's liability is limited to the amount paid for the service ($79). We are not liable for any indirect, incidental, or consequential damages arising from use of our service.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>9. Governing Law</h2>
            <p>These Terms are governed by the laws of the State of Texas. Any disputes shall be resolved in Tarrant County, Texas.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>10. Contact</h2>
            <p>
              For questions about these Terms or your filing, contact us at:<br />
              <strong>Customer Service:</strong> <a href="mailto:customerservice@taxappealusa.com" style={{ color: '#C9A84C' }}>customerservice@taxappealusa.com</a><br />
              <strong>Dispute Filings:</strong> <a href="mailto:disputes@taxappealusa.com" style={{ color: '#C9A84C' }}>disputes@taxappealusa.com</a>
            </p>

          </div>

          <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #eee', textAlign: 'center' }}>
            <Link href="/" style={{ fontSize: 14, color: '#1B2A4A', textDecoration: 'none', fontWeight: 600 }}>← Back to TaxAppeal USA</Link>
            <span style={{ margin: '0 16px', color: '#ccc' }}>|</span>
            <Link href="/privacy" style={{ fontSize: 14, color: '#1B2A4A', textDecoration: 'none' }}>Privacy Policy</Link>
          </div>
        </div>
      </div>
    </>
  );
}
