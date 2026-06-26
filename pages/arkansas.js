import Head from 'next/head';
import { useRouter } from 'next/router';

const C = {
  navy: "#1B3A6B", gold: "#FFC940", darkNavy: "#0F1F3D", bg: "#F4F7FC",
  lightBlue: "#EEF3FB", bodyGray: "#5A6B82", mutedGray: "#8596AF",
  border: "#E8EDF4", white: "#FFFFFF", green: "#2E7D52",
};

const FONT_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap');";

const faqs = [
  ["What is the deadline to appeal property taxes in Arkansas?", "The deadline is the third Monday in August each year — August 17, 2026. Appeals must be filed with your county Board of Equalization by this date. Postmark by the deadline counts in Arkansas."],
  ["How does property assessment work in Arkansas?", "Arkansas assesses residential property at 20% of its fair market value. So a home worth $200,000 would have an assessed value of $40,000. Your tax bill is based on this assessed value multiplied by the local millage rate. When you appeal, you are arguing about the full market value — not the 20% figure."],
  ["How much can I save by appealing my Arkansas property taxes?", "The average Arkansas homeowner who successfully appeals saves $200–$800 per year depending on their county's millage rate. With TaxAppeal's flat $79 fee, you keep every dollar of those savings."],
  ["Do I need to attend a hearing to appeal my Arkansas property taxes?", "You can send a representative. TaxAppeal files your written protest via certified mail to your county Board of Equalization on your behalf. Many counties also accept written evidence without requiring a personal appearance."],
  ["What evidence does TaxAppeal use in my Arkansas appeal?", "We analyze comparable sales from your area, current market conditions in your county, and any property-specific defects you report. Every letter cites Arkansas Code §26-27-317 (appeal rights) and §26-26-1901 (market value standard)."],
  ["Which Arkansas counties does TaxAppeal serve?", "TaxAppeal serves all 75 Arkansas counties including Benton, Pulaski, Washington, Sebastian, Faulkner, Saline, Craighead, Garland, White, Lonoke, and every other county in the state."],
  ["Can my assessment increase if I appeal?", "Arkansas law does not have a statutory prohibition on increases, but the Board of Equalization's role is equalization — not raising values on appealing homeowners. TaxAppeal reviews all comparable data before filing to ensure your appeal is well-supported."],
  ["What is the Board of Equalization in Arkansas?", "Each of Arkansas's 75 counties has a Board of Equalization that hears property valuation appeals. The Board meets in August and is made up of three members appointed by the county judge. It is an informal process — you present your evidence and the Board decides."],
  ["How does the Arkansas 20% assessment ratio affect my appeal?", "Your appeal argues that the market value is too high. A 10% reduction in market value means a 10% reduction in your assessed value (20% of market) and a corresponding reduction in your tax bill. Even small market value reductions translate to real savings every year."],
  ["Can I appeal my Arkansas property taxes every year?", "Yes. Arkansas property owners can file a new appeal every year during the August equalization period. Rising markets mean new over-assessments every cycle — TaxAppeal can file on your behalf year after year."],
];

const counties = [
  "Benton County (Bentonville/Rogers)", "Pulaski County (Little Rock)", "Washington County (Fayetteville)",
  "Sebastian County (Fort Smith)", "Faulkner County (Conway)", "Saline County (Benton)",
  "Craighead County (Jonesboro)", "Garland County (Hot Springs)", "White County (Searcy)",
  "Lonoke County", "Boone County (Harrison)", "Carroll County (Eureka Springs)",
  "Clark County (Arkadelphia)", "Clay County", "Cleburne County (Heber Springs)",
  "Cleveland County", "Columbia County (Magnolia)", "Conway County (Morrilton)",
  "Crawford County (Van Buren)", "Crittenden County (West Memphis)", "Cross County",
  "Dallas County", "Desha County", "Drew County (Monticello)",
  "Franklin County", "Fulton County", "Grant County (Sheridan)",
  "Greene County (Paragould)", "Hempstead County (Hope)", "Hot Spring County (Malvern)",
  "Howard County", "Independence County (Batesville)", "Izard County",
  "Jackson County (Newport)", "Jefferson County (Pine Bluff)", "Johnson County (Clarksville)",
  "Lafayette County", "Lawrence County", "Lee County",
  "Lincoln County", "Little River County", "Logan County",
  "Madison County", "Marion County", "Miller County (Texarkana)",
  "Mississippi County (Blytheville)", "Monroe County", "Montgomery County",
  "Nevada County", "Newton County", "Ouachita County (Camden)",
  "Perry County", "Phillips County (Helena)", "Pike County",
  "Poinsett County", "Polk County (Mena)", "Pope County (Russellville)",
  "Prairie County", "Randolph County (Pocahontas)", "St. Francis County (Forrest City)",
  "Scott County", "Searcy County", "Sharp County",
  "Stone County", "Union County (El Dorado)", "Van Buren County",
  "Washington County (Fayetteville)", "Woodruff County", "Yell County",
];

const cities = [
  { name: "Bentonville / Rogers", county: "Benton County", stats: ["Fastest growing market", "High assessed values", "Strong comparable sales evidence"], desc: "Northwest Arkansas is the fastest-growing region in the state. Benton County home values have surged — making the Board of Equalization hearing one of the most valuable financial moves a homeowner can make." },
  { name: "Little Rock", county: "Pulaski County", stats: ["Most populous county", "BOE meets every August", "Written letter accepted"], desc: "Pulaski County homeowners file with the Board of Equalization every August. TaxAppeal files your protest letter via certified mail directly to the BOE secretary with comparable sales data." },
  { name: "Fayetteville", county: "Washington County", stats: ["University market", "Rising assessments", "Strong comp sales data"], desc: "Washington County is home to the University of Arkansas, driving consistent real estate demand and rising assessments that frequently outpace actual market values." },
  { name: "Fort Smith", county: "Sebastian County", stats: ["Second largest city", "Industrial market", "Rolling assessment notices"], desc: "Sebastian County homeowners can appeal their assessment to the Board of Equalization every August. TaxAppeal handles everything — evidence, letter, and certified mail filing." },
];

export default function Arkansas() {
  const router = useRouter();
  const go = () => router.push('/apply');

  return (
    <>
      <Head>
        <title>Arkansas Property Tax Appeal Service | File for $79 — TaxAppeal</title>
        <meta name="description" content="Appeal your Arkansas property taxes for a flat $79 fee. We draft your protest letter with comparable sales data and file via certified mail before the August 17 deadline. All 75 Arkansas counties." />
        <link rel="canonical" href="https://www.taxappealusa.com/arkansas" />
        <meta property="og:title" content="Arkansas Property Tax Appeal — $79 Flat Fee | TaxAppeal" />
        <meta property="og:description" content="Stop overpaying on Arkansas property taxes. We file your Board of Equalization appeal via certified mail for $79 flat. Deadline: August 17, 2026." />
        <meta property="og:url" content="https://www.taxappealusa.com/arkansas" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": faqs.map(([q, a]) => ({
            "@type": "Question",
            "name": q,
            "acceptedAnswer": { "@type": "Answer", "text": a }
          }))
        })}} />
      </Head>

      <style>{`
        ${FONT_IMPORT}
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: ${C.bg}; color: ${C.darkNavy}; }
        a { text-decoration: none; color: inherit; }
        .nav { background: ${C.white}; border-bottom: 1.5px solid ${C.border}; padding: 16px 40px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 100; }
        .logo-name { font-family: 'DM Serif Display', serif; font-size: 18px; color: ${C.darkNavy}; }
        .hero { background: ${C.navy}; padding: 64px 40px 56px; text-align: center; }
        .hero-eyebrow { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.12); border-radius: 20px; padding: 5px 14px; font-size: 12px; color: rgba(255,255,255,0.8); margin-bottom: 20px; }
        .hero h1 { font-family: 'DM Serif Display', serif; font-size: 40px; color: ${C.white}; line-height: 1.12; max-width: 640px; margin: 0 auto 16px; }
        .hero-sub { font-size: 16px; color: rgba(255,255,255,0.7); max-width: 520px; margin: 0 auto 32px; line-height: 1.6; }
        .btn-gold { background: ${C.gold}; color: ${C.darkNavy}; border: none; border-radius: 8px; padding: 16px 40px; font-size: 16px; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; }
        .trust-row { display: flex; justify-content: center; gap: 24px; flex-wrap: wrap; margin-top: 20px; }
        .trust-item { font-size: 12px; color: rgba(255,255,255,0.6); display: flex; align-items: center; gap: 6px; }
        .section { padding: 56px 40px; border-bottom: 1.5px solid ${C.border}; }
        .section-inner { max-width: 820px; margin: 0 auto; }
        .section-title { font-family: 'DM Serif Display', serif; font-size: 30px; color: ${C.darkNavy}; text-align: center; margin-bottom: 10px; }
        .section-sub { font-size: 15px; color: ${C.bodyGray}; text-align: center; margin-bottom: 36px; line-height: 1.6; }
        .deadline-banner { background: #FFF8E6; border: 1.5px solid #FFD97A; border-radius: 12px; padding: 20px 24px; margin-bottom: 28px; display: flex; align-items: center; gap: 16px; }
        .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        .step { background: ${C.white}; border: 1.5px solid ${C.border}; border-radius: 12px; padding: 24px; }
        .step-num { width: 34px; height: 34px; background: ${C.navy}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 500; color: ${C.white}; margin-bottom: 14px; }
        .step h3 { font-size: 15px; font-weight: 500; color: ${C.darkNavy}; margin-bottom: 8px; }
        .step p { font-size: 13px; color: ${C.bodyGray}; line-height: 1.65; }
        .cities { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
        .city-card { background: ${C.white}; border: 1.5px solid ${C.border}; border-radius: 12px; padding: 20px; }
        .city-card h3 { font-size: 16px; font-weight: 500; color: ${C.darkNavy}; margin-bottom: 4px; }
        .city-card .county { font-size: 12px; color: ${C.mutedGray}; margin-bottom: 10px; }
        .city-stats { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
        .city-stat { background: ${C.lightBlue}; border-radius: 20px; padding: 4px 10px; font-size: 11px; color: ${C.navy}; }
        .city-card p { font-size: 13px; color: ${C.bodyGray}; line-height: 1.6; }
        .county-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .county-item { background: ${C.white}; border: 1px solid ${C.border}; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: ${C.bodyGray}; }
        .faq { display: flex; flex-direction: column; gap: 10px; }
        .faq-item { background: ${C.white}; border: 1.5px solid ${C.border}; border-radius: 10px; overflow: hidden; }
        .faq-q { padding: 16px 20px; font-size: 15px; font-weight: 500; color: ${C.darkNavy}; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .faq-a { padding: 0 20px 16px; font-size: 14px; color: ${C.bodyGray}; line-height: 1.7; }
        .footer-cta { background: ${C.navy}; padding: 64px 40px; text-align: center; }
        .footer-cta h2 { font-family: 'DM Serif Display', serif; font-size: 34px; color: ${C.white}; margin-bottom: 12px; }
        .footer-cta p { font-size: 15px; color: ${C.mutedGray}; margin-bottom: 28px; }
        .footer { background: ${C.darkNavy}; padding: 24px 40px; text-align: center; }
        .footer p { font-size: 13px; color: ${C.mutedGray}; line-height: 1.8; }
        .footer a { color: ${C.mutedGray}; }
        .footer a:hover { color: ${C.white}; }
        @media (max-width: 640px) {
          .hero h1 { font-size: 28px; } .steps { grid-template-columns: 1fr; } .cities { grid-template-columns: 1fr; } .county-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>

      {/* Nav */}
      <nav className="nav">
        <a href="/" className="logo-name">TaxAppeal USA</a>
        <button className="btn-gold" onClick={go} style={{ padding: '10px 20px', fontSize: 14 }}>File My Appeal — $79</button>
      </nav>

      {/* Hero */}
      <div className="hero">
        <div className="hero-eyebrow">🏠 Arkansas Property Tax Appeal Service</div>
        <h1>Stop overpaying on Arkansas property taxes</h1>
        <p className="hero-sub">We draft your Board of Equalization appeal letter with comparable sales data and file via USPS certified mail. Flat $79 fee — you keep every dollar you save.</p>
        <button className="btn-gold" onClick={go}>File My Appeal — $79 →</button>
        <div className="trust-row">
          <span className="trust-item">✓ All 75 Arkansas counties</span>
          <span className="trust-item">✓ Deadline: August 17, 2026</span>
          <span className="trust-item">✓ Postmark counts</span>
          <span className="trust-item">✓ No percentage fees</span>
        </div>
      </div>

      {/* Deadline Banner */}
      <section className="section" style={{ background: C.white }}>
        <div className="section-inner">
          <div className="deadline-banner">
            <div style={{ fontSize: 32 }}>📅</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: C.darkNavy, marginBottom: 4 }}>2026 Arkansas Appeal Deadline: August 17, 2026</div>
              <div style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.6 }}>Per Arkansas Code §26-27-317, the deadline to file with your county Board of Equalization is the third Monday in August. Postmark by this date counts — file early to ensure delivery. Missing this deadline means waiting until next year.</div>
            </div>
          </div>

          {/* How it works */}
          <div className="section-title" style={{ marginTop: 8 }}>How TaxAppeal works in Arkansas</div>
          <div className="steps">
            <div className="step"><div className="step-num">1</div><h3>Enter your address</h3><p>We pull your property data from county records — assessed value, square footage, year built, and more.</p></div>
            <div className="step"><div className="step-num">2</div><h3>We build your case</h3><p>Our system generates a professional protest letter using comparable sales data and cites Arkansas Code §26-27-317 and §26-26-1901.</p></div>
            <div className="step"><div className="step-num">3</div><h3>We file via certified mail</h3><p>Your protest is mailed via USPS certified mail to your county Board of Equalization secretary before the August 17 deadline.</p></div>
          </div>
        </div>
      </section>

      {/* Arkansas-specific rules */}
      <section className="section">
        <div className="section-inner">
          <div className="section-title">What makes Arkansas different</div>
          <div className="section-sub">Arkansas has unique assessment rules every homeowner should understand before filing.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {[
              ['20% Assessment Ratio', 'Arkansas assesses property at 20% of fair market value. Your appeal targets the full market value — a 10% market value reduction means 10% less in your tax bill.'],
              ['Third Monday in August', 'The statewide deadline is the third Monday in August every year (August 17, 2026). This is one of the earliest deadlines in the country — don\'t wait.'],
              ['Postmark Counts', 'Unlike Florida, Arkansas only requires your appeal be postmarked by the deadline — not physically received. TaxAppeal files via certified mail to document your postmark.'],
              ['Amendment 79 Protection', 'Even if your appeal is denied, Arkansas Amendment 79 caps homestead assessment increases at 5% per year. For seniors 65+, the assessed value is frozen entirely.'],
            ].map(([title, desc]) => (
              <div key={title} style={{ background: C.white, border: '1.5px solid ' + C.border, borderRadius: 12, padding: 20 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: C.darkNavy, marginBottom: 8 }}>{title}</div>
                <div style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.65 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cities */}
      <section className="section" style={{ background: C.white }}>
        <div className="section-inner">
          <div className="section-title">Major Arkansas markets we serve</div>
          <div className="cities">
            {cities.map(c => (
              <div key={c.name} className="city-card">
                <h3>{c.name}</h3>
                <div className="county">{c.county}</div>
                <div className="city-stats">{c.stats.map(s => <span key={s} className="city-stat">{s}</span>)}</div>
                <p>{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Price comparison */}
      <section className="section">
        <div className="section-inner">
          <div className="section-title">$79 flat vs. percentage-based firms</div>
          <div className="section-sub">Most Arkansas tax agents charge 25–40% of your first-year savings. Here\'s the math.</div>
          <div style={{ background: C.white, border: '1.5px solid ' + C.border, borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr style={{ background: C.bg }}><th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Savings</th><th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: C.navy }}>TaxAppeal ($79 flat)</th><th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#888' }}>Contingency firm (33%)</th></tr></thead>
              <tbody>
                {[['$500 reduction', '$79 fee — you keep $421', '$165 fee — you keep $335'], ['$1,000 reduction', '$79 fee — you keep $921', '$330 fee — you keep $670'], ['$2,000 reduction', '$79 fee — you keep $1,921', '$660 fee — you keep $1,340'], ['$3,000 reduction', '$79 fee — you keep $2,921', '$990 fee — you keep $2,010']].map(([savings, ours, theirs]) => (
                  <tr key={savings} style={{ borderTop: '1px solid ' + C.border }}>
                    <td style={{ padding: '12px 16px', fontWeight: 500 }}>{savings}/yr</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: C.green, fontWeight: 600 }}>{ours}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: C.bodyGray }}>{theirs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* All counties */}
      <section className="section" style={{ background: C.white }}>
        <div className="section-inner">
          <div className="section-title">All 75 Arkansas counties</div>
          <div className="section-sub">TaxAppeal files appeals in every Arkansas county before the August 17 deadline.</div>
          <div className="county-grid">
            {counties.map(c => <div key={c} className="county-item">📍 {c}</div>)}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section">
        <div className="section-inner">
          <div className="section-title">Common questions about Arkansas property tax appeals</div>
          <div className="faq">
            {faqs.map(([q, a], i) => (
              <div key={i} className="faq-item">
                <div className="faq-q">{q}</div>
                <div className="faq-a">{a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <div className="footer-cta">
        <h2>File before August 17, 2026</h2>
        <p>Don\'t miss the Arkansas Board of Equalization deadline. We handle everything for $79.</p>
        <button className="btn-gold" onClick={go}>Start my Arkansas appeal — $79 →</button>
      </div>

      <footer className="footer">
        <p>© 2026 TaxAppeal USA · <a href="mailto:customerservice@taxappealusa.com">customerservice@taxappealusa.com</a></p>
        <p>Serving all 75 Arkansas counties · Deadline: August 17, 2026 · Arkansas Code §26-27-317</p>
        <p style={{ marginTop: 8 }}><a href="/" style={{ marginRight: 16 }}>Home</a><a href="/texas" style={{ marginRight: 16 }}>Texas</a><a href="/georgia" style={{ marginRight: 16 }}>Georgia</a><a href="/florida" style={{ marginRight: 16 }}>Florida</a><a href="/terms" style={{ marginRight: 16 }}>Terms</a><a href="/privacy">Privacy</a></p>
      </footer>
    </>
  );
}
