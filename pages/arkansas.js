import Head from 'next/head';
import SeasonNotice, { SeasonNavCta } from '../components/SeasonNotice';
import { stateSaleStatus } from '../lib/stateService';

/**
 * ARKANSAS IS NOT ON SALE, AND THE DATE ON THIS PAGE HAD ALREADY PASSED.
 *
 * Two separate untruths were live here on 25 Aug 2026:
 *
 *   1. Three "File My Appeal — $89" buttons, in a state pages/apply.js refuses on
 *      sight (SERVING_FROM.AR = 2027 — we cannot yet vouch for the destination
 *      address outside Florida). Every one of them led to a state selector that
 *      rejected Arkansas, but only after an account and a full property address.
 *
 *   2. "Deadline: August 17, 2026" — in the title, the og:description, the hero
 *      trust row, a yellow deadline banner, two step descriptions, the counties
 *      section and the footer. On 25 August that is not a deadline, it is a date
 *      eight days gone, and the page was still telling homeowners to beat it.
 *
 * THE FIX FOR (2) IS THE RULE, NOT A NEW NUMBER. Arkansas Code §26-27-317 sets
 * the deadline as the third Monday in August — a rule that is true every year.
 * The concrete date is 17 Aug in 2026 and 16 Aug in 2027, and this file has no
 * business deriving that: lib/filingWindows.js owns filing dates, its AR entry is
 * hard-coded to the current year, and inventing a second copy here is how Florida
 * ended up with one county's deadline standing in for the whole state. So while
 * we are not selling, the page states the rule and says plainly that the 2026
 * window has closed. When Arkansas opens, the year-specific line comes back — and
 * it has to come from filingWindows, not from here.
 */

const C = {
  navy: "#1B3A6B", gold: "#FFC940", darkNavy: "#0F1F3D", bg: "#F4F7FC",
  lightBlue: "#EEF3FB", bodyGray: "#5A6B82", mutedGray: "#8596AF",
  border: "#E8EDF4", white: "#FFFFFF", green: "#2E7D52",
};

const FONT_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');";

// Module scope: stateSaleStatus is pure, so the FAQ answers (which are also
// emitted as schema.org FAQPage markup and therefore have to be true), the Head
// block and the body all read one value and cannot disagree.
const SVC = stateSaleStatus('AR');

// The statutory rule, which is true every year. The concrete date is not written
// in this file on purpose — see the note at the top.
// Sourced from lib/stateService.js rather than typed here. Six Arkansas pages
// carried their own copy of this string for about an hour on 25 Aug 2026, and
// two of them had already drifted into "the the third Monday in August" — the
// same one-fact-many-places failure this whole patch exists to end.
const DEADLINE_RULE = SVC.deadlineRule;

const faqs = [
  ["What is the deadline to appeal property taxes in Arkansas?", SVC.selling
    ? "The deadline is the third Monday in August each year — August 17, 2026. Appeals must be filed with your county Board of Equalization by this date. Postmark by the deadline counts in Arkansas."
    : `Arkansas Code §26-27-317 sets the deadline at ${DEADLINE_RULE} each year. Appeals go to your county Board of Equalization, and the postmark date is what counts. The 2026 window has closed; the next one opens in August ${SVC.servingFrom}.`],
  ["How does property assessment work in Arkansas?", "Arkansas assesses residential property at 20% of its fair market value. So a home worth $200,000 would have an assessed value of $40,000. Your tax bill is based on this assessed value multiplied by the local millage rate. When you appeal, you are arguing about the full market value — not the 20% figure."],
  ["How much can I save by appealing my Arkansas property taxes?", SVC.selling
    ? "The average Arkansas homeowner who successfully appeals saves $200–$800 per year depending on their county's millage rate. With TaxAppeal's flat $89 fee, you keep every dollar of those savings."
    : `Your saving is the reduction in assessed value multiplied by your county's millage rate, so it depends on the property — typically a few hundred dollars a year, every year the lower value holds. When we open for the ${SVC.servingFrom} season our fee will be a flat $89 with no percentage of your savings, but nothing is being sold on this page today.`],
  ["Do I need to attend a hearing to appeal my Arkansas property taxes?", "You can send a representative. TaxAppeal files your written protest via certified mail to your county Board of Equalization on your behalf. Many counties also accept written evidence without requiring a personal appearance."],
  ["What evidence does TaxAppeal use in my Arkansas appeal?", "We analyze comparable sales from your area, current market conditions in your county, and any property-specific defects you report. Every letter cites Arkansas Code §26-27-317 (appeal rights) and §26-26-1901 (market value standard)."],
  ["Which Arkansas counties does TaxAppeal serve?", SVC.selling
    ? "TaxAppeal serves all 75 Arkansas counties including Benton, Pulaski, Washington, Sebastian, Faulkner, Saline, Craighead, Garland, White, Lonoke, and every other county in the state."
    : `None yet. We are not filing Arkansas appeals this season — we open for the ${SVC.servingFrom} season and will file in all 75 counties. Before we file in a state we confirm the exact office every appeal has to reach; we have done that work for Florida and are doing it for Arkansas now. Leave your email on this page and we will tell you the day it opens.`],
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
  { name: "Fort Smith", county: "Sebastian County", stats: ["Second largest city", "Industrial market", "Rolling assessment notices"], desc: "Sebastian County homeowners can appeal their assessment to the Board of Equalization every August. TaxAppeal builds the evidence and the letter; you sign it and we file it by certified mail." },
];

export default function Arkansas() {
  return (
    <>
      <Head>
        <title>{SVC.selling ? "Arkansas Property Tax Appeal Service | File for $89 — TaxAppeal" : `Arkansas Property Tax Appeals | Opening for the ${SVC.servingFrom} season — TaxAppeal`}</title>
        <meta name="description" content={SVC.selling ? "Appeal your Arkansas property taxes for a flat $89 fee. We draft your protest letter with comparable sales data and file via certified mail before the August 17 deadline. All 75 Arkansas counties." : `How Arkansas property tax appeals work: ${DEADLINE_RULE} deadline under Ark. Code §26-27-317, the 20% assessment ratio and Amendment 79. TaxAppeal USA is not filing Arkansas appeals this season — we open for the ${SVC.servingFrom} season and will email you the day it does.`} />
        <link rel="canonical" href="https://www.taxappealusa.com/arkansas" key="canonical" />
        <meta property="og:title" content={SVC.selling ? "Arkansas Property Tax Appeal — $89 Flat Fee | TaxAppeal" : `Arkansas Property Tax Appeals — opening ${SVC.servingFrom} | TaxAppeal`} key="og:title" />
        <meta property="og:description" content={SVC.selling ? "Stop overpaying on Arkansas property taxes. We file your Board of Equalization appeal via certified mail for $89 flat. Deadline: August 17, 2026." : `Arkansas appeals are due ${DEADLINE_RULE} each year. The 2026 window has closed. TaxAppeal USA opens for Arkansas in ${SVC.servingFrom} — leave your email and we will tell you the day filing opens.`} key="og:description" />
        <meta property="og:url" content="https://www.taxappealusa.com/arkansas" key="og:url" />
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
        {SVC.selling
          ? <button className="btn-gold" style={{ padding: '10px 20px', fontSize: 14 }}>File My Appeal — $89</button>
          : <SeasonNavCta stateCode="AR" />}
      </nav>

      {/* Hero */}
      <div className="hero">
        <div className="hero-eyebrow">🏠 Arkansas Property Tax Appeal Service</div>
        <h1>{SVC.selling ? "Stop overpaying on Arkansas property taxes" : "How to appeal your Arkansas property taxes"}</h1>
        <p className="hero-sub">
          {SVC.selling
            ? "We draft your Board of Equalization appeal letter with comparable sales data and file via USPS certified mail. Flat $89 fee — you keep every dollar you save."
            : `Arkansas appeals are due ${DEADLINE_RULE} each year, under Ark. Code §26-27-317. Everything below explains how that works. We are not filing Arkansas appeals ourselves this season — we open for ${SVC.servingFrom}.`}
        </p>
        {SVC.selling
          ? <button className="btn-gold">File My Appeal — $89 →</button>
          : <SeasonNotice stateCode="AR" variant="dark" />}
        <div className="trust-row">
          <span className="trust-item">✓ All 75 Arkansas counties</span>
          <span className="trust-item">{SVC.selling ? "✓ Deadline: August 17, 2026" : `✓ Deadline: ${DEADLINE_RULE}`}</span>
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
              <div style={{ fontWeight: 700, fontSize: 16, color: C.darkNavy, marginBottom: 4 }}>{SVC.selling ? "2026 Arkansas Appeal Deadline: August 17, 2026" : "The 2026 Arkansas appeal window has closed"}</div>
              <div style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.6 }}>{SVC.selling ? "Per Arkansas Code §26-27-317, the deadline to file with your county Board of Equalization is the third Monday in August. Postmark by this date counts — file early to ensure delivery. Missing this deadline means waiting until next year." : `Per Arkansas Code §26-27-317, appeals to your county Board of Equalization are due ${DEADLINE_RULE} — that date has passed for 2026, and the next window opens in August ${SVC.servingFrom}. Postmark counts in Arkansas, so file with a few days in hand. Check your own county's Board of Equalization for its exact meeting dates; some hear appeals earlier than the statutory cut-off.`}</div>
            </div>
          </div>

          {/* How it works */}
          <div className="section-title" style={{ marginTop: 8 }}>How TaxAppeal works in Arkansas</div>
          <div className="steps">
            <div className="step"><div className="step-num">1</div><h3>Enter your address</h3><p>We pull your property data from county records — assessed value, square footage, year built, and more.</p></div>
            <div className="step"><div className="step-num">2</div><h3>We build your case</h3><p>Our system generates a professional protest letter using comparable sales data and cites Arkansas Code §26-27-317 and §26-26-1901.</p></div>
            <div className="step"><div className="step-num">3</div><h3>We file via certified mail</h3><p>Your protest is mailed via USPS certified mail to your county Board of Equalization secretary, well before the {SVC.selling ? "August 17 deadline" : `${DEADLINE_RULE} deadline`}.</p></div>
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
              ['Third Monday in August', SVC.selling ? 'The statewide deadline is the third Monday in August every year (August 17, 2026). This is one of the earliest deadlines in the country — don\'t wait.' : 'The statewide deadline is the third Monday in August every year — one of the earliest in the country, and early enough that many homeowners find out about it after it has gone. The 2026 date has passed.'],
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
          <div className="section-title">{SVC.selling ? "Major Arkansas markets we serve" : "Major Arkansas markets"}</div>
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
          <div className="section-title">{SVC.selling ? "$89 flat vs. percentage-based firms" : `$89 flat vs. percentage-based firms, from ${SVC.servingFrom}`}</div>
          <div className="section-sub">Most Arkansas tax agents charge 25–40% of your first-year savings. Here\'s the math{SVC.selling ? "" : " — for when we open. Nothing is being sold on this page today"}.</div>
          <div style={{ background: C.white, border: '1.5px solid ' + C.border, borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr style={{ background: C.bg }}><th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Savings</th><th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: C.navy }}>TaxAppeal ($89 flat)</th><th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#888' }}>Contingency firm (33%)</th></tr></thead>
              <tbody>
                {[['$500 reduction', '$89 fee — you keep $421', '$165 fee — you keep $335'], ['$1,000 reduction', '$89 fee — you keep $921', '$330 fee — you keep $670'], ['$2,000 reduction', '$89 fee — you keep $1,921', '$660 fee — you keep $1,340'], ['$3,000 reduction', '$89 fee — you keep $2,921', '$990 fee — you keep $2,010']].map(([savings, ours, theirs]) => (
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
          <div className="section-sub">{SVC.selling ? "TaxAppeal files appeals in every Arkansas county before the August 17 deadline." : `Every Arkansas county has its own Board of Equalization, and all 75 work to the same ${DEADLINE_RULE} deadline. When we open for ${SVC.servingFrom} we will file in all of them.`}</div>
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
        <h2>{SVC.selling ? "File before August 17, 2026" : `We open for Arkansas in ${SVC.servingFrom}`}</h2>
        <p>{SVC.selling ? "Don\'t miss the Arkansas Board of Equalization deadline. You sign it, we file it — $89 flat." : `Arkansas's deadline is ${DEADLINE_RULE} and it goes by quietly. Leave your email and we will tell you the day filing opens, with time to spare.`}</p>
        {SVC.selling
          ? <button className="btn-gold">Start my Arkansas appeal — $89 →</button>
          : <SeasonNotice stateCode="AR" id="notify-foot" variant="dark" compact />}
      </div>

      <footer className="footer">
        <p>© 2026 TaxAppeal USA · <a href="mailto:customerservice@taxappealusa.com">customerservice@taxappealusa.com</a></p>
        <p>{SVC.selling ? "Serving all 75 Arkansas counties · Deadline: August 17, 2026 · Arkansas Code §26-27-317" : `All 75 Arkansas counties from the ${SVC.servingFrom} season · Deadline: ${DEADLINE_RULE} · Arkansas Code §26-27-317`}</p>
        <p style={{ marginTop: 8 }}><a href="/" style={{ marginRight: 16 }}>Home</a><a href="/texas" style={{ marginRight: 16 }}>Texas</a><a href="/georgia" style={{ marginRight: 16 }}>Georgia</a><a href="/florida" style={{ marginRight: 16 }}>Florida</a><a href="/terms" style={{ marginRight: 16 }}>Terms</a><a href="/privacy">Privacy</a></p>
      </footer>
    </>
  );
}
