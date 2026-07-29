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
            <p style={{ fontSize: 13, color: '#999' }}>Last updated: July 2026</p>
          </div>

          <div style={{ fontSize: 15, color: '#444', lineHeight: 1.8 }}>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>1. Service Description</h2>
            <p>TaxAppeal USA ("we," "our," "us") provides a document preparation service that helps homeowners prepare their own property tax protest letters. We are not a law firm, and our service does not constitute legal advice. You review and sign each protest or petition yourself; we then mail it in your name to the correct county authority — the appraisal district or board of equalization in Texas, Georgia, Arkansas and Alabama, and the Clerk of the Value Adjustment Board in Florida. We are not your agent or representative in any of those proceedings and do not appear before any board on your behalf. See section 7A for Florida specifically.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>2. Flat Fee &amp; Payment</h2>
            <p>Our service fee is <strong>$89 per property per filing season</strong>. This covers preparation of your protest or petition, mail dispatch, and confirmation email delivery. Payment is processed securely via Stripe.</p>
            <p style={{ marginTop: 10 }}><strong>Florida — county filing fee.</strong> Florida counties charge a Value Adjustment Board petition filing fee, currently <strong>$15 to $50 per parcel</strong> depending on the county (Fla. Stat. § 194.013). That fee is set by your county, not by us. We collect it at checkout as a separate line item and pay it to your county's Clerk of the Value Adjustment Board on your behalf, so your total in Florida is <strong>$104 to $139</strong>. The exact amount for your county is shown before you pay.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>3. No Outcome Guarantee</h2>
            <p>We do not guarantee any particular outcome, reduction in assessed value, or tax savings. Property tax protest results depend entirely on the decisions of the applicable county appraisal district. Our service guarantees only that your protest letter will be professionally prepared and dispatched via certified mail within the applicable filing window.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>4. Refund Policy</h2>
            <p>TaxAppeal USA is a document preparation and mailing service. Your protest or petition is prepared in our system within 24 hours of purchase, and that preparation is the substance of what you are paying for.</p>
            <p><strong>Service fee.</strong> Our $89 service fee is refunded in full if you request a refund within 24 hours of payment by emailing <a href="mailto:customerservice@taxappealusa.com" style={{ color: '#C9A84C' }}>customerservice@taxappealusa.com</a>. After 24 hours the service fee is non-refundable, because your document has been prepared.</p>
            <p><strong>County filing fees.</strong> Where we collect a county filing fee on your behalf — currently Florida, where the fee is set by each county and is payable to that county — we hold that money until we mail your petition. If you cancel, or if we are unable to file for any reason, at any time before your petition is mailed, the county filing fee is refunded to you in full. We do not keep filing fees we have not remitted to a county.</p>
            <p><strong>Orders placed before your filing window opens.</strong> Most states accept protests and petitions only during a defined window each year. We accept orders up to 60 days before that window opens: we prepare your document immediately, hold it, and mail it once the window opens and in time for your county's deadline. The 24-hour refund period for the service fee runs from the date of your payment, not from the date we mail. Your county filing fee remains fully refundable for the entire period we are holding your order, up until it is mailed.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>5. Filing Deadlines</h2>
            <p>Property tax protest deadlines vary by state and county. We make reasonable efforts to file within active protest windows. It is your responsibility to verify that your jurisdiction's protest window is open before purchasing our service. We will notify you if we detect that your deadline has passed.</p>
            <p>We accept orders up to 60 days prior to your county's filing window opening. Orders placed during this early period are prepared and held, then submitted via USPS Certified Mail as soon as your county's filing window opens — placing you at the front of the line, ahead of the opening-day rush. You will receive a confirmation email once your protest has been filed.</p>
            <ul>
              <li><strong>Texas:</strong> Generally May 15 or 30 days after notice (whichever is later)</li>
              <li><strong>Georgia:</strong> 45 days from assessment notice date</li>
              <li><strong>Florida:</strong> 25 days from TRIM notice (letter must be RECEIVED, not postmarked)</li>
            </ul>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>6. Supported States</h2>
            <p>Our service currently supports properties in Texas, Georgia, and Florida. In Florida we file only in counties where we have verified the Value Adjustment Board's filing address and fee directly with the county; if we cannot file in your county we will tell you before taking payment. We reserve the right to expand or restrict supported states and counties at any time.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>7. User Responsibilities</h2>
            <p>You agree to provide accurate property and contact information. Inaccurate information that results in a failed or improper filing does not entitle you to a refund. You are responsible for monitoring your mail and email for any response from the appraisal district.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>8. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, TaxAppeal USA's liability is limited to the amount paid for the service ($89). We are not liable for any indirect, incidental, or consequential damages arising from use of our service.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>9. Governing Law</h2>
            <p>These Terms are governed by the laws of the State of Texas, except that nothing in these Terms limits any right or remedy you may have under the consumer-protection laws of the state in which your property is located, including Florida. Disputes will be resolved in Tarrant County, Texas, unless applicable law in your state requires otherwise.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>10. Contact</h2>
            <p>
              For questions about these Terms or your filing, contact us at:<br />
              <strong>Customer Service:</strong> <a href="mailto:customerservice@taxappealusa.com" style={{ color: '#C9A84C' }}>customerservice@taxappealusa.com</a><br />
      
            </p>

          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 14, color: "#5A6B82", lineHeight: 1.75, fontFamily: "'DM Sans', sans-serif" }}>
              <strong>7. Two-Way Review Risk (Georgia and Alabama).</strong> In Georgia (O.C.G.A. §48-5-311) and Alabama (Code of Alabama §40-3-20), the Board of Equalization or Board of Tax Assessors has authority to <strong>increase, decrease, or maintain</strong> your property's assessed value during the appeal process. Unlike Texas, Florida, or Arkansas, filing an appeal in Georgia or Alabama does not guarantee that your assessed value will remain the same or decrease. TaxAppeal USA reviews comparable sales data before filing any Georgia or Alabama appeal and only proceeds when the evidence clearly supports a reduction in assessed value. By authorizing TaxAppeal USA to file a Georgia or Alabama property tax appeal for you, you acknowledge this two-way review risk and confirm that you have reviewed and agreed with the comparable sales evidence supporting your appeal.
            </p>
          </div>

          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 14, color: "#5A6B82", lineHeight: 1.75, fontFamily: "'DM Sans', sans-serif" }}>
              <strong>7A. Florida &mdash; Value Adjustment Board Petitions.</strong>{' '}
              <strong>You sign your own petition.</strong> Fla. Stat. &sect; 194.011(3) requires a petition to the
              Value Adjustment Board to be signed by the taxpayer, or else to be accompanied by the taxpayer&rsquo;s
              written authorization or power of attorney. We rely on the first of those: we prepare your Form DR-486,
              show it to you to read, and you sign Part 3 yourself before you pay. We do not file Form DR-486A or Form
              DR-486POA on your behalf and no such authorization is required, because you are the signatory.
              {' '}<strong>We are not your representative.</strong> TaxAppeal USA does not sign your petition as a
              representative, is not listed as your representative on it, does not appear before the Value Adjustment
              Board or any special magistrate, does not present evidence or argument at a hearing, and does not
              negotiate or settle with the Property Appraiser. Parts 4 and 5 of your DR-486 are left not applicable.
              If a hearing is scheduled, whether to attend is your decision and your responsibility; we notify you when
              we receive notice, and the evidence filed with your petition remains on the record whether or not you
              attend.
              {' '}<strong>What we do.</strong> We prepare the petition and its evidence package, pay your county&rsquo;s
              Value Adjustment Board filing fee on your behalf, and mail the petition to your county&rsquo;s Clerk of
              the Value Adjustment Board so that it is received before your deadline. Florida requires receipt by the
              deadline, not merely a postmark.
              {' '}<strong>Not legal or tax advice.</strong> TaxAppeal USA is not a law firm, is not a certified public
              accountant, and is not a licensed real estate appraiser or broker. Nothing we prepare or send you is legal
              or tax advice, and no attorney-client relationship is created.
            </p>
          </div>

          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 14, color: "#5A6B82", lineHeight: 1.75, fontFamily: "'DM Sans', sans-serif" }}>
              <strong>8. Alabama Filing Authorization.</strong> By completing checkout, you authorize TaxAppeal USA to prepare and file your property tax appeal with your county Board of Equalization on your behalf. Your appeal is signed by you and filed in your name; TaxAppeal USA does not act as your agent or representative and will not represent you before the Board of Equalization or in any hearing. This electronic authorization is recorded with your full name, email address, property address, and the date and time of authorization, and is included as a separate page in your USPS certified mail filing. This authorization is limited to the specific property and tax year identified in your order and does not constitute a general power of attorney. Note: Mobile County, Alabama maintains its own filing requirements. If your property is in Mobile County, TaxAppeal USA will contact you regarding any additional requirements.
</p>
          </div>

          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 14, color: "#5A6B82", lineHeight: 1.75, fontFamily: "'DM Sans', sans-serif" }}>
              <strong>9. Alabama Circuit Court Appeals.</strong> If you are dissatisfied with the Alabama Board of Equalization's decision and wish to pursue further appeal, you may file a petition with the Circuit Court of your county. This second level of appeal is not covered by TaxAppeal USA's service. To preserve your Circuit Court appeal rights, Alabama law requires that you pay your assessed property taxes by December 31 of the tax year, or post a bond in double the amount of the taxes due. TaxAppeal USA is not responsible for advising you on or facilitating Circuit Court appeals. If you wish to pursue a Circuit Court appeal, we strongly recommend consulting a licensed Alabama attorney.
            </p>
          </div>

          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 14, color: "#5A6B82", lineHeight: 1.75, fontFamily: "'DM Sans', sans-serif" }}>
              <strong>10. Arkansas and Alabama Deadline.</strong> Arkansas and Alabama use postmark deadlines for property tax appeals. Your appeal must be postmarked by the applicable deadline date. TaxAppeal USA files via USPS certified mail 7–10 days before the posted deadline to ensure timely delivery with tracked, documented proof of mailing. However, TaxAppeal USA is not responsible for postal delays, incorrect addresses provided by the customer, or county office closures that may affect receipt.
            </p>
          </div>

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
