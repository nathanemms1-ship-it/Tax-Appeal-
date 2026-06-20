import Head from 'next/head';
import { useState } from 'react';
import { useRouter } from 'next/router';

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
    ["How is $79 different from other services?", "Most property tax services charge 25–50% of your savings. On a $2,000 win that's up to $1,000 gone before it reaches you. We charge a flat $79 regardless of outcome — you keep everything you save."],
    ["What states do you serve?", "Currently Texas, Georgia, and Florida. More states are coming soon — enter your email during signup to be notified when your state launches."],
    ["How long does the process take?", "Filing takes about 4 minutes on your end. After we mail your protest, appraisal districts typically respond within 30–90 days depending on the county."],
    ["What is certified mail and why does it matter?", "Certified mail is a USPS service that provides legal proof your dispute was sent and received. Most counties require it — and it protects you if there's ever a question about whether you filed before the deadline."],
    ["Can I file in multiple counties?", "Yes — each property requires a separate filing. You can run the process multiple times, once for each property address."],
  ];

  return (
    <>
      <Head>
        <title>Property Tax Protest Service — File Online for $79 | TaxAppeal</title>
        <meta name="description" content="Protest your property taxes for a flat $79 fee. We draft your dispute letter with comparable sales data and file via certified mail. 82% approval rate. Available in TX, GA, and FL." />
        <meta name="keywords" content="property tax protest, dispute property taxes, property tax appeal, lower property taxes, property tax dispute service, protest property tax assessment, Texas property tax protest, Georgia property tax appeal, Florida property tax appeal" />
        <meta property="og:title" content="Property Tax Protest Service — File for $79 | TaxAppeal" />
        <meta property="og:description" content="We fight your property tax bill. Flat $79 fee — no percentage cuts. Certified mail filing. 82% approval rate. TX, GA, FL." />
        <meta property="og:url" content="https://www.taxappealusa.com" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="TaxAppeal USA" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Property Tax Protest Service — File for $79 | TaxAppeal" />
        <meta name="twitter:description" content="We fight your property tax bill. Flat $79 fee. Certified mail filing. 82% approval rate. TX, GA, FL." />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="canonical" href="https://www.taxappealusa.com" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="TaxAppeal — We fight your property tax bill. You keep the savings." />
        <meta property="og:description" content="Flat $79 fee. No percentage cuts. We draft and file your property tax protest via certified mail. 82% approval rate. TX, GA, FL." />
        <meta property="og:url" content="https://www.taxappealusa.com" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            { "@type": "Question", "name": "Do I have to do anything after I pay?", "acceptedAnswer": { "@type": "Answer", "text": "No. Once your order is complete we handle everything — drafting, printing, and mailing your protest letter via certified mail to the correct appraisal district." }},
            { "@type": "Question", "name": "What if my dispute is denied?", "acceptedAnswer": { "@type": "Answer", "text": "Not all disputes are approved — the appraisal district makes the final decision. We give you the strongest possible case backed by real comparable sales data and legal citations." }},
            { "@type": "Question", "name": "How is $79 different from other services?", "acceptedAnswer": { "@type": "Answer", "text": "Most property tax services charge 25-50% of your savings. On a $2,000 win that's up to $1,000. We charge a flat $79 regardless of outcome — you keep everything you save." }},
            { "@type": "Question", "name": "What states do you serve?", "acceptedAnswer": { "@type": "Answer", "text": "Currently Texas, Georgia, and Florida. More states are coming soon." }},
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
          "description": "Property tax protest and appeal service for homeowners in Texas, Georgia, and Florida. Flat $79 fee, certified mail filing, 82% approval rate.",
          "areaServed": ["Texas", "Georgia", "Florida"],
          "offers": {
            "@type": "Offer",
            "price": "79",
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

      {/* Announcement bar */}
      <div className="ann-bar">
        In as little as 4 minutes, you could be saving thousands on your tax bill —{' '}
        <strong>we handle everything.</strong>
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
        <p className="hero-sub">No forms to mail. No county offices to call. Flat $79 fee — no percentage cuts. We do it all.</p>
        <div className="hero-cta-wrap">
          <button className="btn-primary" style={{ fontSize: 16, padding: "16px 40px" }} onClick={go}>
            Start my dispute — $79 →
          </button>
          <div className="hero-note">You won't be charged until your appeal is ready to file.</div>
        </div>
        <div className="trust-row">
          <div className="trust-item">🔒 256-bit encrypted</div>
          <div className="trust-item">⏱️ Takes 4 minutes</div>
          <div className="trust-item">📬 Certified mail included</div>
          <div className="trust-item">✅ TX · GA · FL</div>
        </div>
        <div className="stats-row">
          <div className="stat-card"><div className="stat-num">82%</div><div className="stat-label">Approval rate</div></div>
          <div className="stat-card"><div className="stat-num">$1,840</div><div className="stat-label">Avg. savings</div></div>
          <div className="stat-card"><div className="stat-num">$79</div><div className="stat-label">Flat fee</div></div>
        </div>
      </section>

            {/* Social proof banner */}
      <div style={{ background: "#1B3A6B", padding: "48px 32px", textAlign: "center" }}>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#FFC940", textTransform: "uppercase", letterSpacing: "3px", marginBottom: 16 }}>Real Results From Real Homeowners</div>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 40, color: "#FFFFFF", lineHeight: 1.2, marginBottom: 10 }}>
          Over 7,200 Homeowners and counting
        </div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 18, color: "#8596AF", marginBottom: 16 }}>
          with a total savings over <span style={{ color: "#FFC940", fontWeight: 700 }}>$3.2 Million!</span>
        </div>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: "#FFC940" }}>
          Don't Delay, Dispute Today!
        </div>
      </div>

      {/* Scrolling testimonials */}
      <div style={{ background: "#F4F7FC", padding: "48px 0", overflow: "hidden" }}>
        <div style={{ textAlign: "center", marginBottom: 32, padding: "0 32px" }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, color: "#0F1F3D", marginBottom: 10 }}>What homeowners are saying</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: "#5A6B82" }}>Real results from real customers across Texas, Georgia, and Florida.</div>
        </div>

        <style>{`
          @keyframes scroll-testimonials {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .t-track {
            display: flex;
            gap: 20px;
            width: max-content;
            animation: scroll-testimonials 50s linear infinite;
          }
          .t-track:hover { animation-play-state: paused; }
          .t-wrap {
            overflow: hidden;
            position: relative;
          }
          .t-wrap::before {
            content: '';
            position: absolute;
            left: 0; top: 0; bottom: 0;
            width: 80px;
            background: linear-gradient(to right, #F4F7FC, transparent);
            z-index: 2;
            pointer-events: none;
          }
          .t-wrap::after {
            content: '';
            position: absolute;
            right: 0; top: 0; bottom: 0;
            width: 80px;
            background: linear-gradient(to left, #F4F7FC, transparent);
            z-index: 2;
            pointer-events: none;
          }
          .t-card {
            background: #FFFFFF;
            border: 1.5px solid #E8EDF4;
            border-radius: 12px;
            padding: 20px 24px;
            width: 300px;
            flex-shrink: 0;
          }
        `}</style>

        <div className="t-wrap">
          <div className="t-track">
            {[
              { name: "Michael R.", location: "Tarrant County, TX", saved: "$1,840", text: "I had no idea my home was over-assessed. TaxAppeal found the discrepancy, filed everything, and I got a $1,840 reduction in my annual tax bill. Worth every penny of the $79 fee." },
              { name: "Sandra T.", location: "Fulton County, GA", saved: "$2,210", text: "The process took me about 4 minutes. A few weeks later I got a letter from the county saying my assessment had been reduced. I saved over $2,200 this year alone." },
              { name: "James & Lisa M.", location: "Hillsborough County, FL", saved: "$1,590", text: "We've lived in our home for 12 years and never thought to dispute our taxes. First time using TaxAppeal and we saved $1,590. Should have done this years ago." },
              { name: "David K.", location: "Dallas County, TX", saved: "$3,100", text: "My assessed value was way above what comparable homes were selling for. TaxAppeal's letter cited 4 recent sales in my ZIP code and the district lowered my assessment by $40,000." },
              { name: "Patricia W.", location: "Cobb County, GA", saved: "$980", text: "Super simple process. I was skeptical at first but the certified mail with return receipt gave me confidence they were doing it right. Got approved in 6 weeks." },
              { name: "Robert H.", location: "Orange County, FL", saved: "$2,450", text: "The letter they generated was incredibly detailed — comparable sales, market conditions, legal citations. The district approved my protest without even requesting a hearing." },
              { name: "Angela B.", location: "Harris County, TX", saved: "$1,720", text: "I paid $79 and saved $1,720. That's a 21x return. I've already referred three of my neighbors. This is the easiest money I've ever saved." },
              { name: "Tom & Karen S.", location: "Gwinnett County, GA", saved: "$1,340", text: "We were nervous about disputing our taxes but TaxAppeal made it completely hands-off. They handled everything and the county reduced our assessment by $18,000." },
              { name: "Maria G.", location: "Miami-Dade County, FL", saved: "$2,880", text: "Filed before the TRIM deadline and got approved. The certified mail tracking gave me peace of mind that the letter was received in time. Saved nearly $3,000 this year." },
              { name: "Chris P.", location: "Travis County, TX", saved: "$2,100", text: "Austin home values went through the roof and so did our tax bill. TaxAppeal got it reduced back to a fair level. The comparable sales data they used was spot on." },
              { name: "Michael R.", location: "Tarrant County, TX", saved: "$1,840", text: "I had no idea my home was over-assessed. TaxAppeal found the discrepancy, filed everything, and I got a $1,840 reduction in my annual tax bill. Worth every penny of the $79 fee." },
              { name: "Sandra T.", location: "Fulton County, GA", saved: "$2,210", text: "The process took me about 4 minutes. A few weeks later I got a letter from the county saying my assessment had been reduced. I saved over $2,200 this year alone." },
              { name: "James & Lisa M.", location: "Hillsborough County, FL", saved: "$1,590", text: "We've lived in our home for 12 years and never thought to dispute our taxes. First time using TaxAppeal and we saved $1,590. Should have done this years ago." },
              { name: "David K.", location: "Dallas County, TX", saved: "$3,100", text: "My assessed value was way above what comparable homes were selling for. TaxAppeal's letter cited 4 recent sales in my ZIP code and the district lowered my assessment by $40,000." },
              { name: "Patricia W.", location: "Cobb County, GA", saved: "$980", text: "Super simple process. I was skeptical at first but the certified mail with return receipt gave me confidence they were doing it right. Got approved in 6 weeks." },
              { name: "Robert H.", location: "Orange County, FL", saved: "$2,450", text: "The letter they generated was incredibly detailed — comparable sales, market conditions, legal citations. The district approved my protest without even requesting a hearing." },
              { name: "Angela B.", location: "Harris County, TX", saved: "$1,720", text: "I paid $79 and saved $1,720. That's a 21x return. I've already referred three of my neighbors. This is the easiest money I've ever saved." },
              { name: "Tom & Karen S.", location: "Gwinnett County, GA", saved: "$1,340", text: "We were nervous about disputing our taxes but TaxAppeal made it completely hands-off. They handled everything and the county reduced our assessment by $18,000." },
              { name: "Maria G.", location: "Miami-Dade County, FL", saved: "$2,880", text: "Filed before the TRIM deadline and got approved. The certified mail tracking gave me peace of mind that the letter was received in time. Saved nearly $3,000 this year." },
              { name: "Chris P.", location: "Travis County, TX", saved: "$2,100", text: "Austin home values went through the roof and so did our tax bill. TaxAppeal got it reduced back to a fair level. The comparable sales data they used was spot on." },
            ].map((t, i) => (
              <div key={i} className="t-card">
                <div style={{ display: "flex", gap: 2, marginBottom: 10 }}>
                  {[1,2,3,4,5].map(s => <span key={s} style={{ color: "#FFC940", fontSize: 16 }}>★</span>)}
                </div>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#5A6B82", lineHeight: 1.65, marginBottom: 16, fontStyle: "italic" }}>"{t.text}"</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: "#0F1F3D" }}>{t.name}</div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#8596AF", marginTop: 2 }}>📍 {t.location}</div>
                  </div>
                  <div style={{ background: "#E6F4ED", border: "1px solid #B7DEC8", borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 700, color: "#2E7D52", whiteSpace: "nowrap" }}>
                    Saved {t.saved}
                  </div>
                </div>
              </div>
            ))}
          </div>
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
            <div className="stat-big">82%</div>
            <div className="stat-text">
              <h3>of property tax disputes are approved</h3>
              <p>The odds are in your favor — don't leave money on the table. Most homeowners who file a well-prepared protest save $800–$2,500 per year. File today and start saving.</p>
            </div>
          </div>
          <div className="price-box">
            <div className="price-left">
              <div className="price-tag">One-time fee</div>
              <div className="price-amount">$79</div>
              <div className="price-note">Flat rate. No hidden cuts.</div>
            </div>
            <div className="price-divider" />
            <div className="price-right">
              <p><strong>vs. the other guys</strong><br />
              Most property tax services charge 25–50% of whatever you save. On a $2,000 win, that's up to $1,000 gone before it ever reaches you. We charge a flat $79 — your savings are yours, every dollar.</p>
            </div>
          </div>
        </div>
      </section>

      {/* What's included */}
      <section className="section" style={{ background: C.white }}>
        <div className="section-inner">
          <div className="section-title">Everything included for $79</div>
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
          <div className="section-sub">We've launched in the three largest property tax protest markets in the US.</div>
          <div className="state-pills">
            {[
              ["Texas", "Deadline: May 15 or 30 days after notice"],
              ["Georgia", "Deadline: 45 days after assessment notice"],
              ["Florida", "Deadline: ~Sept 18 (25 days after TRIM notice)"],
            ].map(([state, note]) => (
              <div key={state} className="state-pill">
                📍 <strong>{state}</strong> — <span style={{ fontSize: 12, color: C.bodyGray }}>{note}</span>
              </div>
            ))}
          </div>
          <div className="coming-soon">🕐 More states coming soon — Colorado, Arizona, Georgia, North Carolina</div>
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
        <p>Join homeowners across Texas, Georgia, and Florida saving money every year.</p>
        <button className="footer-cta-btn" onClick={go}>Start my dispute — $79 →</button>
        <div style={{ marginTop: 16, fontSize: 12, color: C.mutedGray }}>
          You won't be charged until your appeal is ready to file.
        </div>
      </div>

      {/* Footer */}
      <footer className="footer">
     <p>© 2026 TaxAppeal USA · Support: <a href="mailto:customerservice@taxappealusa.com">customerservice@taxappealusa.com</a></p>
        <p>Available in TX · GA · FL · More states coming soon</p>
        <p>
          <a href="/terms" style={{ marginRight: 16 }}>Terms of Service</a>
          <a href="/privacy">Privacy Policy</a>
        </p>
      </footer>
    </>
  );
}
