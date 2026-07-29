import Head from 'next/head';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { STATS, OUTCOME_DISCLAIMER } from '../lib/stats';

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

export default function Landing() {
  const router = useRouter();
  const [faqOpen, setFaqOpen] = useState(null);

  const go = () => router.push('/apply');

  const faqs = [
    ["Do I have to do anything after I pay?", "No. Once your order is complete we handle everything — drafting, printing, and mailing your protest letter via certified mail to the correct appraisal district. You'll receive the USPS tracking number by email."],
    ["What if my dispute is denied?", "Not all disputes are approved — the appraisal district makes the final decision. We give you the strongest possible case backed by real comparable sales data and legal citations, but we can't guarantee a reduction."],
    ["How is $89 different from other services?", "Three types of competitors exist -- and TaxAppeal beats all of them. Contingency firms like O'Connor and Ownwell charge 25-50% of your savings every single year. Subscription services like Abode Money charge $99/year automatically. DIY tools like AppealDesk charge $49 but you print and mail it yourself. TaxAppeal charges $89 flat -- no subscription, no auto-renewal, no percentage ever."],
    ["What states do you serve?", "Currently Texas, Georgia, Florida, Arkansas, and Alabama. More states are coming soon — enter your email during signup to be notified when your state launches."],
    ["How long does the process take?", "Filing takes about 4 minutes on your end. After we mail your protest, appraisal districts typically respond within 30–90 days depending on the county."],
    ["What is certified mail and why does it matter?", "Certified mail is a USPS service that provides legal proof your dispute was sent and received. Most counties require it — and it protects you if there's ever a question about whether you filed before the deadline."],
    ["Can I file in multiple counties?", "Yes — each property requires a separate filing. You can run the process multiple times, once for each property address."],
  ];

  return (
    <>
      <Head>
        <title>Property Tax Protest Service — File Online for $89 | TaxAppeal</title>
        <meta name="description" content="Protest your property taxes for a flat $89 fee. We draft your dispute letter with comparable sales data and file via certified mail. Flat fee, no percentage of your savings. Available in TX, GA, FL, AR, and AL." />
        <meta name="keywords" content="property tax protest, dispute property taxes, property tax appeal, lower property taxes, property tax dispute service, protest property tax assessment, Texas property tax protest, Georgia property tax appeal, Florida property tax appeal" />
        <meta property="og:title" content="Property Tax Protest Service — File for $89 | TaxAppeal" />
        <meta property="og:description" content="We fight your property tax bill. Flat $89 fee — no percentage cuts. Certified mail filing. TX, GA, FL, AR, AL." />
        <meta property="og:url" content="https://www.taxappealusa.com" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="TaxAppeal USA" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Property Tax Protest Service — File for $89 | TaxAppeal" />
        <meta name="twitter:description" content="We fight your property tax bill. Flat $89 fee. Certified mail filing. TX, GA, FL, AR, AL." />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="canonical" href="https://www.taxappealusa.com" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="TaxAppeal — We fight your property tax bill. You keep the savings." />
        <meta property="og:description" content="Flat $89 fee. No percentage cuts. We draft and file your property tax protest via certified mail. TX, GA, FL, AR, AL." />
        <meta property="og:url" content="https://www.taxappealusa.com" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            { "@type": "Question", "name": "Do I have to do anything after I pay?", "acceptedAnswer": { "@type": "Answer", "text": "No. Once your order is complete we handle everything — drafting, printing, and mailing your protest letter via certified mail to the correct appraisal district." }},
            { "@type": "Question", "name": "What if my dispute is denied?", "acceptedAnswer": { "@type": "Answer", "text": "Not all disputes are approved — the appraisal district makes the final decision. We give you the strongest possible case backed by real comparable sales data and legal citations." }},
            { "@type": "Question", "name": "How is $89 different from other services?", "acceptedAnswer": { "@type": "Answer", "text": "Most property tax services charge 25-50% of your savings. On a $2,000 win that's up to $1,000. We charge a flat $89 regardless of outcome — you keep everything you save." }},
            { "@type": "Question", "name": "What states do you serve?", "acceptedAnswer": { "@type": "Answer", "text": "Currently Texas, Georgia, Florida, Arkansas, and Alabama. More states are coming soon." }},
            { "@type": "Question", "name": "How long does the process take?", "acceptedAnswer": { "@type": "Answer", "text": "Filing takes about 4 minutes on your end. After we mail your protest, appraisal districts typically respond within 30-90 days." }}
          ]
        })}} />
        <link rel="canonical" href="https://www.taxappealusa.com" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "TaxAppeal USA",
          "url": "https://www.taxappealusa.com",
          "email": "Support: customerservice@taxappealusa.com",
          "description": "Property tax protest and appeal service for homeowners in Texas, Georgia, Florida, Arkansas, and Alabama. Flat $89 fee, certified mail filing.",
          "areaServed": ["Texas", "Georgia", "Florida", "Arkansas", "Alabama"],
          "offers": {
            "@type": "Offer",
            "price": "89",
            "priceCurrency": "USD",
            "description": "Property tax protest filing via certified mail"
          }
        }) }} />
      </Head>

      <style>{`
        ${FONT_IMPORT}
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: ${C.bg}; color: ${C.darkNavy}; }
        a { text-decoration: none; color: inherit; }
        button { font-family: 'DM Sans', sans-serif; cursor: pointer; }

        .btn-primary {
          background: ${C.navy};
          color: ${C.white};
          border: none;
          border-radius: 8px;
          padding: 15px 36px;
          font-size: 15px;
          font-weight: 500;
          transition: background 0.2s, color 0.2s;
          display: inline-block;
        }
        .btn-primary:hover { background: ${C.gold}; color: ${C.darkNavy}; }

        .btn-ghost {
          background: transparent;
          color: ${C.navy};
          border: 1.5px solid ${C.border};
          border-radius: 7px;
          padding: 9px 18px;
          font-size: 13px;
          transition: border-color 0.2s;
        }
        .btn-ghost:hover { border-color: #C5D0E0; }

        /* ANNOUNCEMENT BAR */
        .ann-bar {
          background: ${C.navy};
          color: ${C.white};
          text-align: center;
          padding: 10px 16px;
          font-size: 13px;
          line-height: 1.4;
        }
        .ann-bar strong { color: ${C.gold}; }

        /* NAV */
        .nav {
          background: ${C.white};
          border-bottom: 1.5px solid ${C.border};
          padding: 16px 40px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: sticky;
          top: 0;
          z-index: 100;
        }
        .logo { display: flex; align-items: center; gap: 10px; }
        .logo-mark {
          width: 34px; height: 34px;
          background: ${C.navy};
          border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          font-size: 18px;
        }
        .logo-name { font-family: 'DM Serif Display', serif; font-size: 18px; color: ${C.darkNavy}; }
        .logo-sub { font-size: 9px; text-transform: uppercase; letter-spacing: 1.5px; color: ${C.mutedGray}; margin-top: 1px; }
        .nav-right { display: flex; align-items: center; gap: 12px; }

        /* HERO */
        .hero {
          background: ${C.bg};
          padding: 64px 40px 48px;
          text-align: center;
          border-bottom: 1.5px solid ${C.border};
        }
        .eyebrow {
          display: inline-flex; align-items: center; gap: 7px;
          background: ${C.lightBlue};
          border: 1px solid #C5D3E8;
          border-radius: 20px;
          padding: 5px 14px;
          font-size: 12px;
          color: ${C.navy};
          margin-bottom: 22px;
        }
        .hero h1 {
          font-family: 'DM Serif Display', serif;
          font-size: 42px;
          color: ${C.darkNavy};
          line-height: 1.12;
          max-width: 620px;
          margin: 0 auto 16px;
        }
        .hero-sub {
          font-size: 16px;
          color: ${C.bodyGray};
          max-width: 500px;
          margin: 0 auto 32px;
          line-height: 1.6;
        }
        .hero-cta-wrap { margin-bottom: 20px; }
        .hero-note { font-size: 12px; color: ${C.mutedGray}; margin-top: 10px; }
        .trust-row {
          display: flex; justify-content: center; gap: 24px; flex-wrap: wrap;
          margin-top: 20px;
        }
        .trust-item { font-size: 12px; color: ${C.mutedGray}; display: flex; align-items: center; gap: 6px; }

        /* STATS ROW */
        .stats-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          max-width: 600px;
          margin: 32px auto 0;
        }
        .stat-card {
          background: ${C.white};
          border: 1.5px solid ${C.border};
          border-radius: 10px;
          padding: 16px;
          text-align: center;
        }
        .stat-num { font-family: 'DM Serif Display', serif; font-size: 26px; color: ${C.navy}; }
        .stat-label { font-size: 11px; color: ${C.mutedGray}; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }

        /* SECTIONS */
        .section { padding: 56px 40px; border-bottom: 1.5px solid ${C.border}; }
        .section-inner { max-width: 820px; margin: 0 auto; }
        .section-title { font-family: 'DM Serif Display', serif; font-size: 30px; color: ${C.darkNavy}; text-align: center; margin-bottom: 10px; }
        .section-sub { font-size: 15px; color: ${C.bodyGray}; text-align: center; margin-bottom: 36px; line-height: 1.6; }

        /* HOW IT WORKS */
        .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        .step {
          background: ${C.white};
          border: 1.5px solid ${C.border};
          border-radius: 12px;
          padding: 24px;
        }
        .step-num {
          width: 34px; height: 34px;
          background: ${C.navy};
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; font-weight: 500; color: ${C.white};
          margin-bottom: 14px;
        }
        .step h3 { font-size: 15px; font-weight: 500; color: ${C.darkNavy}; margin-bottom: 8px; }
        .step p { font-size: 13px; color: ${C.bodyGray}; line-height: 1.65; }

        /* STAT BANNER */
        .stat-banner {
          background: ${C.darkNavy};
          border-radius: 12px;
          padding: 22px 28px;
          display: flex;
          align-items: center;
          gap: 24px;
          margin-bottom: 20px;
        }
        .stat-big { font-family: 'DM Serif Display', serif; font-size: 52px; color: ${C.gold}; line-height: 1; flex-shrink: 0; }
        .stat-text h3 { font-size: 16px; font-weight: 500; color: ${C.white}; margin-bottom: 6px; }
        .stat-text p { font-size: 13px; color: ${C.mutedGray}; line-height: 1.6; }

        /* PRICE CALLOUT */
        .price-box {
          background: ${C.amber};
          border: 1.5px solid #FFD97A;
          border-radius: 12px;
          padding: 20px 24px;
          display: flex;
          align-items: center;
          gap: 24px;
        }
        .price-left { flex-shrink: 0; }
        .price-tag { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #B8860B; font-weight: 500; margin-bottom: 4px; }
        .price-amount { font-family: 'DM Serif Display', serif; font-size: 42px; color: ${C.darkNavy}; line-height: 1; }
        .price-note { font-size: 12px; color: #B8860B; margin-top: 4px; }
        .price-divider { width: 1.5px; background: #FFD97A; align-self: stretch; flex-shrink: 0; }
        .price-right p { font-size: 14px; color: ${C.bodyGray}; line-height: 1.65; }
        .price-right strong { color: ${C.darkNavy}; }

        /* CHECKLIST */
        .checklist { display: flex; flex-direction: column; gap: 14px; margin-top: 20px; }
        .check-item { display: flex; align-items: flex-start; gap: 14px; }
        .check-icon {
          width: 24px; height: 24px;
          background: ${C.lightBlue};
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; margin-top: 2px; font-size: 12px; color: ${C.navy};
        }
        .check-item h4 { font-size: 15px; font-weight: 500; color: ${C.darkNavy}; margin-bottom: 4px; }
        .check-item p { font-size: 13px; color: ${C.bodyGray}; line-height: 1.6; }

        /* STATE PILLS */
        .state-pills { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; margin-top: 20px; }
        .state-pill {
          background: ${C.lightBlue};
          border: 1px solid #C5D3E8;
          border-radius: 20px;
          padding: 8px 18px;
          font-size: 13px;
          color: ${C.navy};
          display: flex; align-items: center; gap: 7px;
        }
        .coming-soon { font-size: 12px; color: ${C.mutedGray}; margin-top: 14px; text-align: center; display: flex; align-items: center; justify-content: center; gap: 6px; }

        /* FAQ */
        .faq { display: flex; flex-direction: column; gap: 10px; }
        .faq-item {
          background: ${C.white};
          border: 1.5px solid ${C.border};
          border-radius: 10px;
          overflow: hidden;
          transition: border-color 0.2s;
        }
        .faq-item.open { border-color: ${C.navy}; }
        .faq-q {
          padding: 16px 20px;
          font-size: 15px;
          font-weight: 500;
          color: ${C.darkNavy};
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          user-select: none;
        }
        .faq-q:hover { background: ${C.bg}; }
        .faq-chevron { font-size: 16px; color: ${C.mutedGray}; flex-shrink: 0; transition: transform 0.2s; }
        .faq-item.open .faq-chevron { transform: rotate(180deg); color: ${C.navy}; }
        .faq-a {
          padding: 0 20px 16px;
          font-size: 14px;
          color: ${C.bodyGray};
          line-height: 1.7;
        }

        /* FOOTER CTA */
        .footer-cta {
          background: ${C.navy};
          padding: 64px 40px;
          text-align: center;
        }
        .footer-cta h2 { font-family: 'DM Serif Display', serif; font-size: 34px; color: ${C.white}; margin-bottom: 12px; }
        .footer-cta p { font-size: 15px; color: ${C.mutedGray}; margin-bottom: 28px; }
        .footer-cta-btn {
          background: ${C.gold};
          color: ${C.darkNavy};
          border: none;
          border-radius: 8px;
          padding: 16px 40px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          transition: opacity 0.2s;
        }
        .footer-cta-btn:hover { opacity: 0.88; }

        /* FOOTER */
        .footer {
          background: ${C.darkNavy};
          padding: 24px 40px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
        }
        .footer p { font-size: 12px; color: ${C.mutedGray}; }
        .footer a { color: ${C.mutedGray}; }
        .footer a:hover { color: ${C.gold}; }

        /* MOBILE */
        @media (max-width: 768px) {
          .nav { padding: 14px 16px; }
          .nav-right .btn-ghost { display: none; }
          .hero { padding: 40px 16px 32px; }
          .hero h1 { font-size: 28px; }
          .hero-sub { font-size: 14px; }
          .stats-row { grid-template-columns: repeat(3, 1fr); gap: 8px; }
          .stat-num { font-size: 20px; }
          .section { padding: 36px 16px; }
          .steps { grid-template-columns: 1fr; gap: 12px; }
          .stat-banner { flex-direction: column; text-align: center; gap: 12px; }
          .stat-big { font-size: 40px; }
          .price-box { flex-direction: column; gap: 16px; }
          .price-divider { width: 100%; height: 1.5px; }
          .trust-row { gap: 14px; }
          .footer { padding: 20px 16px; flex-direction: column; text-align: center; }
          .footer-cta { padding: 40px 16px; }
          .footer-cta h2 { font-size: 26px; }
          .ann-bar { font-size: 11px; padding: 8px 12px; }
        }
      `}</style>

{/* Announcement bar — TRIM countdown for Florida */}
      <div className="ann-bar">
        {(() => {
          const trimDate = new Date('2026-08-15');
          const today = new Date();
          const days = Math.ceil((trimDate - today) / (1000 * 60 * 60 * 24));
          if (days > 0) {
            return <>🚨 Florida TRIM notices arrive in <strong>{days} days</strong> — file your VAB petition before the 25-day deadline or wait a full year.</>;
          }
          return <>🚨 Florida TRIM notices are arriving now — you have <strong>25 days</strong> to file your VAB petition. Don&apos;t miss your window.</>;
        })()}
      </div>

      {/* Nav */}
      <nav className="nav">
        <div className="logo">
          <div className="logo-mark">🏠</div>
          <div>
            <div className="logo-name">TaxAppeal</div>
            <div className="logo-sub">Property Tax Dispute</div>
          </div>
        </div>
        <div className="nav-right">
          <button className="btn-ghost" onClick={go}>Sign in</button>
          <button className="btn-primary" onClick={go}>Get started →</button>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="eyebrow">🛡️ We file on your behalf</div>
        <h1>We fight your property tax bill. You keep the savings.</h1>
        <p className="hero-sub">No forms to mail. No county offices to call. Flat $89 fee — no percentage cuts. We do it all.</p>
        <div className="hero-cta-wrap">
          <button className="btn-primary" style={{ fontSize: 16, padding: "16px 40px" }} onClick={go}>
            Start my dispute — $89 →
          </button>
          <div className="hero-note">You won't be charged until your appeal is ready to file.</div>
        </div>
        <div className="trust-row">
          <div className="trust-item">🔒 256-bit encrypted</div>
          <div className="trust-item">⏱️ Takes 4 minutes</div>
          <div className="trust-item">📬 Certified mail included</div>
          <div className="trust-item">✅ TX · GA · FL · AR · AL</div>
        </div>
        <div className="stats-row">
          <div className="stat-card"><div className="stat-num">$89</div><div className="stat-label">Flat fee</div></div>
          <div className="stat-card"><div className="stat-num">0%</div><div className="stat-label">Of your savings taken</div></div>
          <div className="stat-card"><div className="stat-num">4 min</div><div className="stat-label">To complete</div></div>
        </div>
      </section>

            {/* Why homeowners appeal — third-party data only.
                This block previously read "Over 7,200 Homeowners and counting / with a
                total savings over $3.2 Million!" TaxAppeal USA has not yet filed its
                first petition. See lib/stats.js for why that mattered. */}
      <div style={{ background: "#1B3A6B", padding: "48px 32px", textAlign: "center" }}>
        <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#FFC940", textTransform: "uppercase", letterSpacing: "3px", marginBottom: 16 }}>Why homeowners appeal</div>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 40, color: "#FFFFFF", lineHeight: 1.2, marginBottom: 10 }}>
          Most over-assessed homeowners never say anything
        </div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 18, color: "#8596AF", marginBottom: 16, maxWidth: 720, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
          The National Taxpayers Union Foundation estimates that{" "}
          <span style={{ color: "#FFC940", fontWeight: 700 }}>{STATS.US_OVERASSESSED.value}</span>{" "}
          of taxable property in the United States is over-assessed — and that{" "}
          <span style={{ color: "#FFC940", fontWeight: 700 }}>fewer than 5%</span>{" "}
          of taxpayers ever challenge it.
        </div>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: "#FFC940" }}>
          Don&apos;t Delay, Dispute Today!
        </div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#6B84A6", marginTop: 18 }}>
          Source: <a href={STATS.US_OVERASSESSED.url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: "#8596AF", textDecoration: "underline" }}>National Taxpayers Union Foundation</a>. Estimate by an advocacy organization, not a peer-reviewed study.
        </div>
      </div>

      {/* Published county outcomes.
          This block previously held 20 fabricated customer testimonials with named
          "customers", star ratings and "Saved $1,840" badges, under the heading
          "Real results from real customers". TaxAppeal USA has never had a customer.
          Fake testimonials are prohibited by 16 C.F.R. Part 465 (FTC Rule on the Use
          of Consumer Reviews and Testimonials), which carries per-violation civil
          penalties. Do not reintroduce testimonials until they are real, verifiable,
          and given with the customer's permission. See lib/stats.js. */}
      <div style={{ background: "#F4F7FC", padding: "56px 0" }}>
        <div style={{ textAlign: "center", marginBottom: 36, padding: "0 32px" }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, color: "#0F1F3D", marginBottom: 10 }}>What the county records actually show</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: "#5A6B82", maxWidth: 640, margin: "0 auto", lineHeight: 1.6 }}>
            We are a new company, so we do not have our own results to show you yet. Instead, here is what the public record says about appeals in the places we file.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, maxWidth: 1080, margin: "0 auto", padding: "0 32px" }}>
          {[
            {
              stat: STATS.TX_DALLAS_SUCCESS.value,
              head: "of homeowner-filed Dallas County protests won a reduction",
              body: "A peer-reviewed study of Dallas Central Appraisal District records found that homeowners who filed their own protest in 2020 succeeded 69.7% of the time, with average first-year savings of $485 on a successful protest.",
              src: "Nathan, Perez-Truglia & Zentner, American Economic Journal: Economic Policy (2025), tax year 2020",
              url: STATS.TX_DALLAS_SUCCESS.url,
            },
            {
              stat: STATS.FL_MIAMIDADE_SUCCESS.value,
              head: "of residential Miami-Dade VAB petitions won a reduction",
              body: "Miami-Dade's Value Adjustment Board reduced 14,856 of the 41,942 residential petitions filed for tax year 2024 — removing $1.34 billion in taxable value. Counting only petitions the Board actually decided, the rate was 57%.",
              src: "Miami-Dade County VAB, Form DR-529 Tax Impact Notice, Tax Year 2024",
              url: STATS.FL_MIAMIDADE_SUCCESS.url,
            },
            {
              stat: STATS.COOK_SUCCESS.value,
              head: "of Cook County, Illinois appeals won a reduction",
              body: "Across 2002\u20132015, a Quarterly Journal of Economics study of assessor records found appeals succeeded 67% of the time on average, with a mean reduction of 12% of assessed value.",
              src: "Avenancio-Le\u00f3n & Howard, Quarterly Journal of Economics 137(3) (2022)",
              url: STATS.COOK_SUCCESS.url,
            },
          ].map((c, i) => (
            <div key={i} style={{ background: "#FFFFFF", border: "1.5px solid #E8EDF4", borderRadius: 12, padding: "24px 24px 20px" }}>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 40, color: "#1B3A6B", lineHeight: 1 }}>{c.stat}</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: "#0F1F3D", marginTop: 8, lineHeight: 1.45 }}>{c.head}</div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#5A6B82", lineHeight: 1.65, marginTop: 12 }}>{c.body}</p>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, color: "#8596AF", marginTop: 14, lineHeight: 1.5 }}>
                Source: <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: "#5A6B82" }}>{c.src}</a>
              </div>
            </div>
          ))}
        </div>

        <div style={{ maxWidth: 900, margin: "28px auto 0", padding: "0 32px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#8596AF", lineHeight: 1.65, textAlign: "center" }}>
          {OUTCOME_DISCLAIMER} Outcomes differ sharply between counties: Marion County, Florida reduced 0 of 310 requested assessments in tax year 2022.
        </div>
      </div>

      {/* How it works */}
      <section className="section" style={{ background: C.white }}>
        <div className="section-inner">
          <div className="section-title">How it works</div>
          <div className="section-sub">Three steps. Four minutes. We handle the rest.</div>
          <div className="steps">
            {[
              ["1", "Enter your address", "We automatically pull your county appraisal value, property details, and 2.1M+ comparable sales from public records — no manual data entry needed."],
              ["2", "We build your case", "Our system drafts a formal protest letter with real comparable sales, market condition analysis, and state-specific legal citations tailored to your county."],
              ["3", "We file for you", "We send your dispute via USPS certified mail to the correct appraisal district. You receive the tracking number as official proof of submission."],
            ].map(([num, title, desc]) => (
              <div key={num} className="step">
                <div className="step-num">{num}</div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats + Price */}
      <section className="section">
        <div className="section-inner">
          <div className="stat-banner">
            <div className="stat-big">&lt;5%</div>
            <div className="stat-text">
              <h3>of taxpayers ever challenge their assessment</h3>
              <p>
                The National Taxpayers Union Foundation estimates that fewer than 5% of taxpayers
                dispute their assessment, while {STATS.US_OVERASSESSED.value} of taxable U.S.
                property is over-assessed. Filing costs you $89 and about four minutes. Whether
                your county grants a reduction is up to your county — we make sure your case is
                in front of them, on time, with the evidence attached.
              </p>
              <p style={{ fontSize: 11, opacity: 0.75, marginTop: 10 }}>
                Source: <a href={STATS.US_OVERASSESSED.url} target="_blank" rel="noopener noreferrer nofollow" style={{ textDecoration: 'underline' }}>National Taxpayers Union Foundation</a>. Advocacy-organization estimate, not a peer-reviewed study.
              </p>
            </div>
          </div>
          <div className="price-box">
            <div className="price-left">
              <div className="price-tag">One-time fee</div>
              <div className="price-amount">$89</div>
              <div className="price-note">Flat rate. No hidden cuts.</div>
            </div>
            <div className="price-divider" />
            <div className="price-right">
              <p><strong>vs. the other guys</strong><br />
              Most property tax services charge 25–50% of whatever you save. On a $2,000 win, that's up to $1,000 gone before it ever reaches you. We charge a flat $89 — your savings are yours, every dollar.</p>
            </div>
          </div>
        </div>
      </section>

      {/* What's included */}
      <section className="section" style={{ background: C.white }}>
        <div className="section-inner">
          <div className="section-title">Everything included for $89</div>
          <div className="checklist">
            {[
              ["We file the appeal for you", "Your dispute is submitted via certified letter to the correct appraisal district — no action needed on your end after checkout."],
              ["Certified mail receipt delivered to you", "Official USPS proof of submission emailed directly to you. Keep it as your legal record."],
              ["Real comparable sales evidence", "We search 2.1M+ recent transactions in your ZIP code to build a data-backed argument for a lower valuation."],
              ["State-specific legal citations", "Every letter references the exact statute for your state — Texas Tax Code §41.43, O.C.G.A. §48-5-311, or Florida Statute §194.011."],
              ["20% reduction requested on your behalf", "We argue for a 20% reduction from your current assessed value — the strongest defensible position supported by market data."],
            ].map(([title, desc]) => (
              <div key={title} className="check-item">
                <div className="check-icon">✓</div>
                <div><h4>{title}</h4><p>{desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* State availability */}
      <section className="section" style={{ textAlign: "center" }}>
        <div className="section-inner">
          <div className="section-title">Currently available in</div>
          <div className="section-sub">We've launched in five states — Texas, Georgia, Florida, Arkansas, and Alabama.</div>
          <div className="state-pills">
            {[
              ["Texas", "Deadline: May 15 or 30 days after notice"],
              ["Georgia", "Deadline: 45 days after assessment notice"],
              ["Florida", "Deadline: ~Sept 18 (25 days after TRIM notice)"],
              ["Arkansas", "Deadline: Aug 17 (third Monday in August)"],
              ["Alabama", "Deadline: 30 days from Notice of Valuation"],
            ].map(([state, note]) => (
              <div key={state} className="state-pill">
                📍 <strong>{state}</strong> — <span style={{ fontSize: 12, color: C.bodyGray }}>{note}</span>
              </div>
            ))}
          </div>
          <div className="coming-soon">🕐 More states coming soon — Oklahoma, Arizona, Nevada, New Mexico</div>
        </div>
      </section>

      {/* Competitor comparison section */}
      <section className="section" style={{ background: C.white }}>
        <div className="section-inner">
          <div className="section-title">Why TaxAppeal beats the alternatives</div>
          <div className="section-sub">Not all property tax services are created equal. Here's how we compare.</div>
          <div style={{ overflowX: 'auto', marginTop: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>
              <thead>
                <tr style={{ background: C.navy, color: C.white }}>
                  <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 500 }}></th>
                  <th style={{ padding: '14px 20px', textAlign: 'center', fontWeight: 500, color: '#FFC940' }}>✓ TaxAppeal USA</th>
                  <th style={{ padding: '14px 20px', textAlign: 'center', fontWeight: 500 }}>AppealDesk ($49)</th>
                  <th style={{ padding: '14px 20px', textAlign: 'center', fontWeight: 500 }}>Abode Money</th>
                  <th style={{ padding: '14px 20px', textAlign: 'center', fontWeight: 500 }}>Contingency Firms</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Price', '✅ $89 one-time flat fee', '⚠️ $49 + print/mail costs', '❌ $99/yr subscription', '❌ 25-50% of your savings'],
                  ['Auto-renewal / subscription', '✅ Never. You decide each year.', '✅ No subscription', '❌ $99 auto-billed every year', '❌ Auto-enrolled -- % taken every year'],
                  ['Comparable sales analysis', '✅ Included', '✅ Included', '✅ Included', '✅ Included'],
                  ['Protest/dispute letter', '✅ Professionally drafted', '✅ Generated', '✅ Generated', '✅ Drafted by their team'],
                  ['Filing -- we mail it for you', '✅ USPS Certified Mail', '❌ You print, buy postage & mail it', '✅ They handle mailing', '✅ They handle mailing'],
                  ['Legal proof of timely filing', '✅ Return Receipt -- documented', '❌ You manage it yourself', '✅ Yes', '✅ Yes'],
                  ['Deadline risk', '✅ We handle it', '❌ All on you', '✅ They handle it', '✅ They handle it'],
                  ['States covered', '✅ TX, FL, GA, AR, AL (5 states)', '⚠️ 50 states (DIY only)', '❌ TX + FL only', '⚠️ Varies by firm'],
                  ['Cost on $2,000 savings', '✅ $89 once -- keep $1,911', '⚠️ $49 + your time + risk', '❌ $99/yr ongoing forever', '❌ $400-$1,000 taken per year'],
                  ['Pay again next year?', '✅ Only if you choose to', '✅ Only if you choose to', '❌ Automatic -- no choice', '❌ Auto-enrolled if savings continue']
                ].map(([label, ta, ad, abode, cont], i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? C.bg : C.white }}>
                    <td style={{ padding: '12px 20px', color: C.bodyGray, fontWeight: 500 }}>{label}</td>
                    <td style={{ padding: '12px 20px', textAlign: 'center', color: C.navy, fontWeight: 500 }}>{ta}</td>
                    <td style={{ padding: '12px 20px', textAlign: 'center', color: C.bodyGray }}>{ad}</td>
                    <td style={{ padding: '12px 20px', textAlign: 'center', color: C.bodyGray }}>{abode}</td>
                    <td style={{ padding: '12px 20px', textAlign: 'center', color: C.bodyGray }}>{cont}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 20, padding: '16px 20px', background: C.lightBlue, borderRadius: 10, fontSize: 14, color: C.bodyGray, lineHeight: 1.7 }}>
            <strong style={{ color: C.darkNavy }}>No subscription. No percentage. No auto-renewal.</strong> AppealDesk makes you print and mail it yourself. Abode Money auto-bills you every year. TaxAppeal is $89 once.
          </div>
        </div>
      </section>


      {/* FAQ */}
      <section className="section" style={{ background: C.white }}>
        <div className="section-inner">

          <div className="section-title">Common questions</div>
          <div className="section-sub">Everything you need to know before filing.</div>
          <div className="faq">
            {faqs.map(([q, a], i) => (
              <div key={i} className={`faq-item${faqOpen === i ? " open" : ""}`}>
                <div className="faq-q" onClick={() => setFaqOpen(faqOpen === i ? null : i)}>
                  {q}
                  <span className="faq-chevron">▾</span>
                </div>
                {faqOpen === i && <div className="faq-a">{a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <div className="footer-cta">
        <h2>Ready to fight your tax bill?</h2>
        <p>Join homeowners across Texas, Georgia, Florida, Arkansas, and Alabama saving money every year.</p>
        <button className="footer-cta-btn" onClick={go}>Start my dispute — $89 →</button>
        <div style={{ marginTop: 16, fontSize: 12, color: C.mutedGray }}>
          You won't be charged until your appeal is ready to file.
        </div>
      </div>

      {/* Footer */}
      <footer className="footer">
     <p>© 2026 TaxAppeal USA · Support: <a href="mailto:customerservice@taxappealusa.com">customerservice@taxappealusa.com</a></p>
        <p>Available in TX · GA · FL · AR · AL · More states coming soon</p>
        <p>
          <a href="/terms" style={{ marginRight: 16 }}>Terms of Service</a>
          <a href="/privacy">Privacy Policy</a>
        </p>
      </footer>
    </>
  );
}
