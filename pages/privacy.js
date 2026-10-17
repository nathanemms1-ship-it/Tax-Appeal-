// pages/privacy.js
import Head from 'next/head';
import Link from 'next/link';
import { C } from "../lib/theme";

export default function Privacy() {
  return (
    <>
      <Head>
        <title>Privacy Policy | TaxAppeal USA</title>
        <meta name="description" content="Privacy Policy for TaxAppeal USA, which checks your property tax bill and prepares a ready-to-sign appeal kit you mail yourself." />
        <meta name="robots" content="noindex" />
      </Head>
      <div style={{ background: '#f4f6f9', minHeight: '100vh', padding: '40px 20px', fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
        <div style={{ maxWidth: 760, margin: '0 auto', background: C.white, borderRadius: 8, padding: '48px 52px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#C9A84C', letterSpacing: '0.05em' }}>TaxAppeal USA</div>
            </Link>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1B2A4A', margin: '16px 0 8px' }}>Privacy Policy</h1>
            {/* Was "June 2025" — fourteen months stale, and the first line a Google Ads
                policy review or a regulator reads. /terms already says August 2026. */}
            <p style={{ fontSize: 13, color: '#999' }}>Last updated: October 2026</p>
          </div>

          <div style={{ fontSize: 15, color: '#444', lineHeight: 1.8 }}>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>1. Information We Collect</h2>
            <p>We collect the following information when you use our service:</p>
            <ul>
              <li><strong>Identity:</strong> First name, last name, email address</li>
              <li><strong>Property:</strong> Property address, county, state, assessed value, property characteristics</li>
              <li><strong>Payment:</strong> Payment is processed by Stripe — we never see or store your full card number</li>
              <li><strong>Appeal details:</strong> Issues selected, the contents of your kit, and any notice or county decision letter you upload</li>
              <li><strong>Usage:</strong> IP address, browser type, pages visited (via server logs)</li>
            </ul>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>2. How We Use Your Information</h2>
            <ul>
              <li>To check whether an appeal will lower your tax bill, and to prepare your appeal kit and mail it to you</li>
              <li>To send you order confirmation, your kit as a PDF, and delivery updates on your kit</li>
              <li>To send deadline reminders and to ask what the county decided</li>
              <li>To maintain records of orders and kits for legal and business purposes, including the next-year guarantee</li>
              <li>To improve our service and detect fraud</li>
            </ul>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>3. Third Parties We Share Data With</h2>
            {/* overflow-x so the table scrolls inside its own box instead of widening the page. */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 8 }}>
                <thead>
                  <tr style={{ background: '#f0f2f7' }}>
                    <th style={{ textAlign: 'left', padding: '10px 12px', border: '1px solid #e5e8ef', color: '#1B2A4A' }}>Service</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', border: '1px solid #e5e8ef', color: '#1B2A4A' }}>Purpose</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', border: '1px solid #e5e8ef', color: '#1B2A4A' }}>Data Shared</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Stripe', 'Payment processing', 'Name, email, payment amount'],
                    ['Lob.com', 'Printing your kit and mailing it to you (First Class)', 'Name, mailing address, kit contents'],
                    ['Resend', 'Email confirmation delivery', 'Name, email, order summary'],
                    ['RentCast', 'Property records and comparable sales lookup', 'Property address'],
                    ['Anthropic', 'Reading notices and county decision letters you upload (Claude AI)', 'The uploaded image, property details'],
                    ['Google', 'Address autocomplete', 'Address input (partial)'],
                    // Added 24 Aug. _app.js has loaded gtag with the Google Ads
                    // conversion ID since the campaign started on 19 Aug, and fires
                    // conversion events from apply.js and success.js. Google has been
                    // receiving this data for five days and was not disclosed as a
                    // recipient anywhere on this page.
                    ['Google Analytics', 'Site usage measurement', 'Pages visited, IP address, device type'],
                    ['Google Ads', 'Advertising and conversion measurement', 'Pages visited, whether an order completed, order value'],
                    ['Upstash', 'Temporary data caching and rate limiting', 'Check results and kit details (up to 7 days)'],
                    ['Supabase', 'Order database storage', 'Full order record'],
                    ['Vercel', 'Application hosting', 'Server logs, IP addresses'],
                  ].map(([svc, purpose, data], i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                      <td style={{ padding: '9px 12px', border: '1px solid #e5e8ef', fontWeight: 600, color: '#1B2A4A' }}>{svc}</td>
                      <td style={{ padding: '9px 12px', border: '1px solid #e5e8ef', color: '#555' }}>{purpose}</td>
                      <td style={{ padding: '9px 12px', border: '1px solid #e5e8ef', color: '#555' }}>{data}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: 12 }}>We do not sell your personal information to advertisers or third parties for marketing purposes.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>4. Data Retention</h2>
            <ul>
              <li><strong>Order records:</strong> Retained for 7 years for legal and tax purposes</li>
              <li><strong>Check results and kit details:</strong> Temporarily cached for up to 7 days while you order, then purged from Redis</li>
              <li><strong>Email logs:</strong> Retained by Resend per their data policy (90 days)</li>
              <li><strong>Waitlist entries:</strong> Retained until you unsubscribe or we email you that orders are open for you</li>
            </ul>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>5. Your Rights</h2>
            <p>You may request access to, correction of, or deletion of your personal data by contacting us at <a href="mailto:customerservice@taxappealusa.com" style={{ color: '#C9A84C' }}>customerservice@taxappealusa.com</a>. Note that we may be required to retain certain records for legal compliance.</p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>6. Security</h2>
            <p>We use industry-standard encryption (TLS/HTTPS) for all data in transit. Payment data is handled entirely by Stripe and never touches our servers. We use row-level security on our database to protect your records.</p>

            {/*
              THIS SECTION SAID "We do not use advertising or tracking cookies" WHILE
              WE DID. 24 Aug.

              _app.js:112-125 loads googletagmanager with NEXT_PUBLIC_GADS_ID and calls
              gtag('config', 'AW-...'), which sets _gcl_au; the analytics ID sets _ga
              and _ga_*. Both are advertising and analytics cookies by Google's own
              naming. apply.js and success.js additionally fire conversion events with
              send_to. The campaign has been serving since 19 Aug, so this sentence has
              been false on every page view of a paid click.

              Left as-was it is a live misstatement in the operative document, on a
              site running Google Ads — which is also a Google Ads policy exposure, not
              only a privacy one.
            */}
            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>7. Cookies and advertising</h2>
            <p>We use session cookies required for the checkout flow.</p>
            <p style={{ marginTop: 12 }}>
              We also use Google Analytics and Google Ads. When you visit any page on this site,
              Google sets cookies (including <code>_ga</code> and <code>_gcl_au</code>) that let us
              count visitors, see which pages they use, and see which of our ads led to an order.
              Google may use this data to show you our ads on other sites.
            </p>
            <p style={{ marginTop: 12 }}>
              You can opt out of Google Analytics with{' '}
              <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer">Google&rsquo;s browser add-on</a>,
              and you can turn off personalised advertising in your{' '}
              <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">Google Ad Settings</a>.
              Blocking cookies in your browser also stops these, and the checkout flow will still work.
            </p>
            <p style={{ marginTop: 12 }}>
              We do not sell your personal information, and we do not use cookies to build a profile
              of you for anyone other than ourselves.
            </p>

            <h2 style={{ color: '#1B2A4A', fontSize: 17, marginTop: 32 }}>8. Contact</h2>
            <p>
              For privacy requests or questions, contact us at:<br />
              <strong>Customer Service:</strong> <a href="mailto:customerservice@taxappealusa.com" style={{ color: '#C9A84C' }}>customerservice@taxappealusa.com</a><br />
             
            </p>

          </div>

          <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #eee', textAlign: 'center' }}>
            <Link href="/" style={{ fontSize: 14, color: '#1B2A4A', textDecoration: 'none', fontWeight: 600 }}>← Back to TaxAppeal USA</Link>
            <span style={{ margin: '0 16px', color: '#ccc' }}>|</span>
            <Link href="/terms" style={{ fontSize: 14, color: '#1B2A4A', textDecoration: 'none' }}>Terms of Service</Link>
          </div>
        </div>
      </div>
    </>
  );
}
