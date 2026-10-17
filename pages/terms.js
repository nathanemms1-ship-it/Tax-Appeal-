// pages/terms.js
import Head from 'next/head';
import Link from 'next/link';
import { BUSINESS_NAME, LEGAL_ENTITY, LEGAL_ENTITY_STATE, LEGAL_ENTITY_FILE_NUMBER, BUSINESS_ADDRESS_LINES, SUPPORT_EMAIL } from '../lib/businessInfo';
import { C, FONTS } from "../lib/theme";

export default function Terms() {
  return (
    <>
      <Head>
        <title>Terms of Service | TaxAppeal USA</title>
        <meta name="description" content="Terms of Service for TaxAppeal USA property tax appeal, protest and petition kits." />
        <meta name="robots" content="noindex" />
      </Head>
      <div style={{ background: '#f4f6f9', minHeight: '100vh', padding: '40px 20px', fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
        <div style={{ maxWidth: 760, margin: '0 auto', background: C.white, borderRadius: 8, padding: '48px 52px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#C9A84C', letterSpacing: '0.05em' }}>TaxAppeal USA</div>
            </Link>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1B2A4A', margin: '16px 0 8px' }}>Terms of Service</h1>
            <p style={{ fontSize: 13, color: '#999' }}>Last updated: October 2026</p>
          </div>

          <div style={{ fontSize: 15, color: '#444', lineHeight: 1.8 }}>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>1. Service Description</h2>
            <p><strong>{LEGAL_ENTITY}</strong>, a {LEGAL_ENTITY_STATE} limited liability company (Texas Secretary of State file no. {LEGAL_ENTITY_FILE_NUMBER}), trading as {BUSINESS_NAME} (&ldquo;we,&rdquo; &ldquo;our,&rdquo; &ldquo;us&rdquo;), provides a document preparation service. We prepare a ready-to-sign property tax appeal kit &mdash; an appeal in Georgia, a protest in Texas, a petition in Florida &mdash; and mail it to you. The kit contains the official form filled in for your property (Georgia: Form PT-311A or the county&rsquo;s own appeal form; Texas: Comptroller Form 50-132; Florida: Form DR-486), the evidence supporting a lower value, a one-page checklist, and a return envelope addressed to the county authority (the county board of assessors in Georgia, the appraisal district in Texas, the Value Adjustment Board in Florida). We also email you a PDF copy of the full kit on the day you order.</p>
            <p><strong>You sign and mail it yourself.</strong> You review the kit, sign it in ink, add postage, and mail it (or deliver it, or file it online where your county allows, using the PDF). We do not file, submit or mail your appeal to the county, we do not represent you, we do not appear at any hearing or informal conference, and we do not contact the county for you. The county writes to you directly. If you forward us anything the county sends, we will help you understand it. We are not a law firm, and our service does not constitute legal or tax advice. See section 12 for Florida specifically.</p>
            <p><strong>We check first.</strong> We check whether an appeal will actually lower your tax bill, after caps and exemptions, before you pay. If it won&rsquo;t, we&rsquo;ll tell you, and we won&rsquo;t sell you one.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>2. Flat Fee &amp; Payment</h2>
            <p>Our fee is <strong>$89 per property per tax year</strong>. This covers our check, the preparation of your kit, mailing the printed kit to you, and the PDF copy by email. Payment is processed securely via Stripe.</p>
            <p><strong>Last days before a deadline.</strong> In the last days before a deadline there isn&rsquo;t time to mail a printed kit, so we email it to you as a PDF to print, sign and mail. The fee is the same $89. We tell you before you pay when your order will be PDF-only.</p>
            <p style={{ marginTop: 10 }}><strong>Florida &mdash; county filing fee.</strong> Florida counties charge a Value Adjustment Board petition filing fee, currently <strong>$15 to $50 per parcel</strong> depending on the county (Fla. Stat. &sect; 194.013). That fee is set by your county and paid by you, to the county, with a cheque you put in the envelope with your petition. It is not part of our $89, we do not collect it, and we do not pay it. Your kit tells you the amount for your county and who to make the cheque payable to.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>3. Our Guarantee, and No Outcome Guarantee</h2>
            <p><strong>Our guarantee.</strong> If our check stops your order before anything is mailed, you get a full refund. If the county doesn&rsquo;t lower your value, next year&rsquo;s kit is free.</p>
            <p>Beyond that, we do not promise any particular outcome, reduction in assessed value, or tax savings. Results depend entirely on the decisions of the county authority that reviews your appeal &mdash; the county board of assessors or board of equalization in Georgia, the appraisal district and appraisal review board in Texas, and the Value Adjustment Board in Florida. Any estimate of savings we show you is an estimate, not a promise.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>4. Refund Policy</h2>
            <p>TaxAppeal USA is a document preparation service. Your kit is prepared after you order, and that preparation is the substance of what you are paying for.</p>
            <p><strong>If our check stops your order.</strong> If, after you pay, our check finds that an appeal will not lower your tax bill, we stop the order before anything is mailed and refund the full $89.</p>
            <p><strong>Cancelling.</strong> Our $89 fee is refunded in full if you request a refund within 24 hours of payment by emailing <a href="mailto:customerservice@taxappealusa.com" style={{ color: '#C9A84C' }}>customerservice@taxappealusa.com</a>. After 24 hours it is non-refundable, because your kit has been prepared, except as set out in our guarantee (section 3) and for reservations (below).</p>
            <p><strong>Reservations.</strong> Before assessment notices go out (in Georgia and Texas, from late January) you can reserve your kit. We check again when your values are published, and if the case is gone &mdash; for example, your value did not rise or a cap or exemption means an appeal would not lower your bill &mdash; we refund you in full.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>5. Deadlines and Mailing</h2>
            <p>Property tax appeal deadlines vary by state and county. Mailing your signed appeal on time is your responsibility; we tell you the deadline for your county in your kit and on the checklist. We recommend mailing it the day your kit arrives, and keeping proof of mailing (a postmark receipt from a post office counter, or a USPS Certificate of Mailing, PS Form 3817).</p>
            <ul>
              <li><strong>Texas:</strong> Generally May 15 or 30 days after your notice was delivered (whichever is later); the postmark counts</li>
              <li><strong>Georgia:</strong> 45 days from the date on your assessment notice; the postmark counts</li>
              <li><strong>Florida:</strong> 25 days from the mailing of your TRIM notice; the petition must be RECEIVED by the deadline, not merely postmarked</li>
            </ul>
            <p style={{ marginTop: 14 }}><strong>Florida &mdash; when we stop accepting orders.</strong> Because Florida is satisfied by physical receipt rather than by postmark, close to the deadline we email Florida kits as a PDF only, and we stop accepting Florida orders once there is no longer enough time for you to sign your petition and get it to the Value Adjustment Board before your county&rsquo;s deadline. That cut-off is earlier than the deadline itself and is enforced automatically at checkout: if it has passed for your county, we will not take your money. A Florida petition received after the deadline is dismissed with no recourse, so we would rather decline the sale. Hand-delivering your petition to the Clerk of the Value Adjustment Board is the surest way to meet a close deadline.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>6. Supported States</h2>
            <p>Our service currently supports properties in Texas, Georgia and Florida. Arkansas and Alabama are not served; if you enter a property in either state we tell you so and take no payment.</p>
            <p>In Florida we hold the current Department of Revenue assessment roll for all 67 counties, and we prepare kits for every county that has published &mdash; or confirmed to us directly &mdash; the Value Adjustment Board mailing address and filing fee a petition requires in order to be accepted. Where a county has not done so, <strong>we decline the order rather than take your money</strong>. Nothing is charged, and we ask for your email so we can write to you if that county is confirmed while there is still time. Florida counts a petition as filed only when it is physically received with the correct fee, so a wrong address or a short cheque is not a late filing &mdash; it is no filing, and it cannot be fixed after the deadline. We reserve the right to expand or restrict supported states and counties at any time.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>7. User Responsibilities</h2>
            <p>You agree to provide accurate property and contact information, to review your kit before you sign it, and to sign and mail it before your deadline. Inaccurate information, or an appeal mailed late or not at all, does not entitle you to a refund. The county writes to you directly: you are responsible for monitoring your mail and email for any response from the county authority &mdash; including any notice of hearing &mdash; and for deciding whether to attend.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>8. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, TaxAppeal USA's liability is limited to the total amount you actually paid us in connection with the order in question. County filing fees are paid by you directly to the county and are not paid to us. We are not liable for any indirect, incidental, or consequential damages arising from use of our service.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>9. Governing Law</h2>
            <p>These Terms are governed by the laws of the State of Texas, except that nothing in these Terms limits any right or remedy you may have under the consumer-protection laws of the state in which your property is located, including Florida. Disputes will be resolved in Tarrant County, Texas, unless applicable law in your state requires otherwise.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>10. Contact</h2>
            <p>
              For questions about these Terms or your kit, contact us at:<br />
              <strong>Customer Service:</strong> <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#C9A84C' }}>{SUPPORT_EMAIL}</a><br />
              <strong>Mailing address:</strong> {LEGAL_ENTITY}, {BUSINESS_ADDRESS_LINES[0]}, {BUSINESS_ADDRESS_LINES[1]}
            </p>

          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.75, fontFamily: FONTS.body }}>
              <strong>11. Two-Way Review Risk (Georgia and Alabama).</strong> In Georgia (O.C.G.A. §48-5-311) and Alabama (Code of Alabama §40-3-20), the Board of Equalization or Board of Tax Assessors has authority to <strong>increase, decrease, or maintain</strong> your property's assessed value during the appeal process. Unlike Texas, Florida, or Arkansas, filing an appeal in Georgia or Alabama does not guarantee that your assessed value will remain the same or decrease. TaxAppeal USA reviews comparable sales data before selling a Georgia or Alabama kit and only sells one when the evidence supports a reduction in assessed value. By signing and mailing a Georgia or Alabama property tax appeal prepared by TaxAppeal USA, you acknowledge this two-way review risk and confirm that you have reviewed and agreed with the comparable sales evidence supporting your appeal.
            </p>
          </div>

          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.75, fontFamily: FONTS.body }}>
              <strong>12. Florida &mdash; Value Adjustment Board Petitions.</strong>{' '}
              <strong>You sign your own petition.</strong> Fla. Stat. &sect; 194.011(3) requires a petition to the
              Value Adjustment Board to be signed by the taxpayer, or else to be accompanied by the taxpayer&rsquo;s
              written authorization or power of attorney. We rely on the first of those: we prepare your Form DR-486,
              mail it to you, and you sign it yourself. We do not prepare or file Form DR-486A or Form
              DR-486POA and no such authorization is required, because you are the signatory.
              {' '}<strong>We are not your representative.</strong> TaxAppeal USA does not sign your petition as a
              representative, is not listed as your representative on it, does not appear before the Value Adjustment
              Board or any special magistrate, does not present evidence or argument at a hearing, and does not
              negotiate or settle with the Property Appraiser. Parts 4 and 5 of your DR-486 are left not applicable.
              The Value Adjustment Board writes to you directly. If a hearing is scheduled, whether to attend is your
              decision and your responsibility; forward us anything the Board sends and we&rsquo;ll help you understand
              it. The evidence you send with your petition remains on the record whether or not you attend.
              {' '}<strong>What we do.</strong> We prepare the petition and its evidence, and mail you the kit with a
              return envelope addressed to your county&rsquo;s Value Adjustment Board. You sign it, enclose your own
              cheque for the county&rsquo;s filing fee, and mail or hand-deliver it so that it is received before your
              deadline. Florida requires receipt by the deadline, not merely a postmark. We do not file your petition
              and we do not pay the county&rsquo;s fee.
              {' '}<strong>Not legal or tax advice.</strong> TaxAppeal USA is not a law firm, is not a certified public
              accountant, and is not a licensed real estate appraiser or broker. Nothing we prepare or send you is legal
              or tax advice, and no attorney-client relationship is created.
            </p>
          </div>

          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.75, fontFamily: FONTS.body }}>
              <strong>13. Alabama Appeals.</strong> Alabama is not currently served. When it is, an Alabama kit will be prepared for you to sign and mail to your county Board of Equalization yourself. Your appeal is signed by you and filed in your name; TaxAppeal USA does not file it, does not act as your agent or representative, and will not appear before the Board of Equalization or in any hearing. No authorization or power of attorney is given to TaxAppeal USA. Note: Mobile County, Alabama maintains its own filing requirements, which your kit will reflect.
</p>
          </div>

          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.75, fontFamily: FONTS.body }}>
              <strong>14. Alabama Circuit Court Appeals.</strong> If you are dissatisfied with the Alabama Board of Equalization's decision and wish to pursue further appeal, you may file a petition with the Circuit Court of your county. This second level of appeal is not covered by TaxAppeal USA's service. To preserve your Circuit Court appeal rights, Alabama law requires that you pay your assessed property taxes by December 31 of the tax year, or post a bond in double the amount of the taxes due. TaxAppeal USA is not responsible for advising you on or facilitating Circuit Court appeals. If you wish to pursue a Circuit Court appeal, we strongly recommend consulting a licensed Alabama attorney.
            </p>
          </div>

          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.75, fontFamily: FONTS.body }}>
              <strong>15. Arkansas and Alabama Deadline.</strong> Arkansas and Alabama use postmark deadlines for property tax appeals. Your appeal must be postmarked by the applicable deadline date. You mail your own appeal: we recommend mailing it the day your kit arrives and getting proof of mailing at a post office counter (a postmark receipt, or a Certificate of Mailing, PS Form 3817). TaxAppeal USA is not responsible for postal delays, incorrect addresses provided by the customer, or county office closures that may affect receipt.
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
