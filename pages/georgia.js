import Head from 'next/head';
import { useState } from 'react';
import { useRouter } from 'next/router';
import JurisdictionOutcomes from '../components/JurisdictionOutcomes';
import { georgiaSuburbs } from '../lib/georgiaSuburbs';
import { counties as ALL_COUNTIES } from '../lib/countyData';

const C = {
  navy: "#1B3A6B", gold: "#FFC940", darkNavy: "#0F1F3D", bg: "#F4F7FC",
  lightBlue: "#EEF3FB", bodyGray: "#5A6B82", mutedGray: "#8596AF",
  border: "#E8EDF4", white: "#FFFFFF", green: "#2E7D52",
};

const FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');`;

const faqs = [
  ["What is the deadline to appeal property taxes in Georgia?", "You have 45 days from the date on your annual Notice of Assessment to file an appeal. Assessment notices are typically mailed between April and June. Missing this deadline means waiting until next year."],
  ["How much can I save by appealing my Georgia property taxes?", "The average Georgia homeowner who appeals saves $800 to $2,200 per year. With TaxAppeal at $89 flat, you keep 100% of those savings — unlike contingency firms that take 25–40%."],
  ["What is the success rate for property tax appeals in Georgia?", "There is no published Georgia success rate. The Georgia Department of Revenue publishes how many appeals are filed in each county and where they are heard, but its file contains no record of how many resulted in a reduction — so any Georgia \"approval rate\" advertised by a tax service is not coming from the state. What the record does show is that appealing is common: Fulton County homeowners filed 36,152 appeals in 2024, about one parcel in ten. TaxAppeal cannot guarantee a reduction."],
  ["How does Georgia assess property value?", "Georgia assesses property at 40% of fair market value. If the county overestimates your fair market value, your taxable value and your bill are both inflated — and you have the right to challenge it."],
  ["What is the Board of Equalization in Georgia?", "The Board of Equalization (BOE) is a county body that hears property tax appeals in Georgia. If your informal appeal to the county assessor is unsuccessful, your case goes before the BOE where you can present comparable sales evidence."],
  ["Can I appeal my Georgia property taxes every year?", "Yes. Georgia homeowners can file a new appeal every single year. Your assessment notice resets each spring, giving you a fresh 45-day window to challenge the value — even if you appealed last year."],
  ["Does TaxAppeal serve all Georgia counties?", "Yes. We serve all 159 Georgia counties including Fulton, Gwinnett, Cobb, DeKalb, Cherokee, Forsyth, Chatham, Richmond, and every other county in the state."],
  ["Can my assessment go up if I appeal in Georgia?", "In rare cases, yes. However TaxAppeal reviews all market data before filing to ensure your appeal is well-supported with comparable sales evidence, minimizing any upside risk."],
  ["What evidence does TaxAppeal use for Georgia appeals?", "We analyze comparable sales, current market conditions, property defects, and county record discrepancies. Every letter cites O.C.G.A. § 48-5-311."],
  ["How does TaxAppeal compare to other Georgia firms?", "Most Georgia firms charge 25–40% of your savings. On a $1,500 reduction that is $375–$600 in fees every year. TaxAppeal charges $89 flat — one time."],
  ["What is a Notice of Assessment in Georgia?", "Your Notice of Assessment is the annual letter from your county tax assessor stating their estimate of your property's fair market value. It arrives between April and June, and the date on the notice starts your 45-day appeal clock."],
  ["Which appraisal districts handle Georgia property tax appeals?", "Georgia uses county tax assessors rather than centralized appraisal districts. Each of the 159 counties has its own Board of Tax Assessors. Major ones include the Fulton County Board of Assessors, Gwinnett County Tax Assessor, Cobb County Board of Tax Assessors, and DeKalb County Tax Commissioner."],
];

/*
 * The 572 /counties/[slug] pages had ZERO inbound links from anywhere on the
 * site — `grep -ln "counties/" pages/*.js` returned nothing. They were reachable
 * only through the sitemap, which is the usual reason such pages never get
 * indexed. This grid used to be a hardcoded string array rendered as plain
 * <div>s, so it advertised the coverage and linked none of it.
 *
 * Now derived from lib/countyData.js — the same module pages/counties/[slug].js
 * uses in getStaticPaths — so the list cannot drift from the pages that exist.
 * Plain <a>, not next/link: prefetching 254 routes in the viewport is real
 * bandwidth for no gain, and a plain anchor is exactly as crawlable.
 */
const counties = ALL_COUNTIES.filter(c => c.code === 'GA');



const cities = [
  {
    name: "Atlanta",
    slug: "/atlanta",
    county: "Fulton County Board of Assessors",
    stats: ["36,152 appeals filed (2024)", "Fulton County BOA", "Fast-rising assessments"],
    desc: "Atlanta and Fulton County property values have surged dramatically. The county's mass-appraisal process can't keep pace with neighborhood-level changes — making appeals especially effective.",
  },
];

export default function Georgia() {
  const router = useRouter();
  const [openFaq, setOpenFaq] = useState(null);
  const go = () => router.push('/apply');

  return (
    <>
      <Head>
        <title>Georgia Property Tax Appeal Service | File for $89 | TaxAppeal</title>
        <meta name="description" content="Appeal your Georgia property taxes for a flat $89 fee. We draft your dispute letter with comparable sales data and file via USPS certified mail. All 159 Georgia counties." />
        <link rel="canonical" href="https://www.taxappealusa.com/georgia" />
        <meta property="og:title" content="Georgia Property Tax Appeal — $89 Flat Fee | TaxAppeal" />
        <meta property="og:description" content="Stop overpaying on Georgia property taxes. We file your appeal via certified mail for $89 flat. No contingency fees. Keep 100% of your savings. All 159 counties." />
        <meta property="og:url" content="https://www.taxappealusa.com/georgia" />
        <meta property="og:type" content="website" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": faqs.map(([q, a]) => ({
            "@type": "Question",
            "name": q,
            "acceptedAnswer": { "@type": "Answer", "text": a }
          }))
        })}} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          "name": "Georgia Property Tax Appeal Filing",
          "provider": { "@type": "Organization", "name": "TaxAppeal USA" },
          "areaServed": { "@type": "State", "name": "Georgia" },
          "description": "Property tax appeal letter preparation and USPS certified mail filing for Georgia homeowners. Covers all 159 counties.",
          "offers": { "@type": "Offer", "price": "89.00", "priceCurrency": "USD" }
        })}} />
      </Head>
      <style>{`
        ${FONT}
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: ${C.bg}; color: ${C.darkNavy}; }
        .btn-primary { background: ${C.navy}; color: #fff; border: none; border-radius: 8px; padding: 16px 36px; font-size: 16px; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: background 0.2s; }
        .btn-primary:hover { background: ${C.gold}; color: ${C.darkNavy}; }
        .city-card { background: ${C.white}; border: 1.5px solid ${C.border}; border-radius: 14px; padding: 24px; text-decoration: none; color: inherit; display: block; transition: box-shadow 0.2s, border-color 0.2s; }
        .city-card:hover { box-shadow: 0 6px 24px rgba(27,58,107,0.10); border-color: ${C.navy}; }
        @media (max-width: 768px) {
          .hero-stats { grid-template-columns: 1fr 1fr !important; }
          .counties-grid { grid-template-columns: 1fr 1fr !important; }
          .compare-grid { grid-template-columns: 1fr !important; }
          .hero-title { font-size: 30px !important; }
          .testimonials-grid { grid-template-columns: 1fr !important; }
          .included-grid { grid-template-columns: 1fr !important; }
        }
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
        <button className="btn-primary" style={{ padding: "10px 22px", fontSize: 14 }} onClick={go}>Start my dispute →</button>
      </div>

      {/* Hero */}
      <section style={{ background: C.navy, padding: "64px 40px", color: C.white }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ fontSize: 12, color: C.gold, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 16 }}>Georgia Property Tax Appeal Service</div>
          <h1 className="hero-title" style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, lineHeight: 1.15, marginBottom: 16 }}>
            Appeal Your Georgia Property Taxes for $89 Flat
          </h1>
          <p style={{ fontSize: 18, color: "#8596AF", lineHeight: 1.6, maxWidth: 640, marginBottom: 32 }}>
            Stop overpaying. We draft a formal appeal letter backed by comparable sales data and legal citations under O.C.G.A. § 48-5-311. You sign it, we file it via USPS certified mail — all for a flat $89. No contingency fees. Keep 100% of your savings.
          </p>
          <div className="hero-stats" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 32 }}>
            {[["$89", "Flat fee"], ["0%", "Of your savings taken"], ["Certified", "Mail with tracking"], ["159", "GA counties"]].map(([n, l]) => (
              <div key={l} style={{ background: "#0F1F3D", borderRadius: 10, padding: "16px", textAlign: "center" }}>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: C.gold }}>{n}</div>
                <div style={{ fontSize: 11, color: "#5A7A9F", marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>
          <button className="btn-primary" style={{ background: C.gold, color: C.darkNavy, fontSize: 17, padding: "18px 44px" }} onClick={go}>
            File My Georgia Appeal — $89 →
          </button>
          <div style={{ fontSize: 13, color: "#5A7A9F", marginTop: 12 }}>Takes about 4 minutes. You won't be charged until your letter is ready.</div>
        </div>
      </section>

      {/* Published outcomes - on a light background so the source links and
          the disclaimer are legible. They were rendered in body-gray on navy. */}
      <section style={{ padding: "56px 40px", background: C.bg }}>
        <JurisdictionOutcomes
          heading="What Georgia appeal records show"
          intro="Georgia’s Department of Revenue publishes how many appeals are filed but not how they turn out, so there is no official Georgia success rate to quote — and you should be sceptical of any service that quotes you one. Here is what the record does show."
          footnote="The Georgia DOR appeal file records how many appeals were filed and where they were heard. It contains no “value reduced” column, so any Georgia “approval rate” you see advertised is not coming from the state."
          cards={[
            {
              stat: "36,152",
              head: "appeals filed in Fulton County in one year",
              body: "Georgia homeowners appeal in large numbers. Fulton led the state in 2024, followed by DeKalb (18,354), Gwinnett (17,813) and Cobb (14,509).",
              source: "Georgia Department of Revenue, Property Tax Appeal Statistics, 2024",
              url: "https://dor.georgia.gov/property-tax-appeal-statistics",
            },
            {
              stat: "9.9%",
              head: "of Fulton County parcels were appealed",
              body: "36,152 appeals across 366,820 parcels. Which also means about nine in ten Fulton owners accepted their assessment without testing it.",
              source: "Georgia Department of Revenue, Property Tax Appeal Statistics, 2024",
              url: "https://dor.georgia.gov/property-tax-appeal-statistics",
            },
            {
              stat: "67%",
              head: "of appeals won a reduction — in Cook County, Illinois",
              body: "Since Georgia publishes no outcome data, the closest rigorous benchmark is a Quarterly Journal of Economics study of Cook County assessor records (2002–2015): appeals succeeded 67% of the time, with a mean reduction of 12%. A different state, and shown here only as context.",
              source: "Avenancio-León & Howard, Quarterly Journal of Economics 137(3), 2022",
              url: "https://academic.oup.com/qje/article-abstract/137/3/1383/6522186",
            },
          ]}
        />
      </section>


      {/* Price comparison */}
      <section style={{ padding: "56px 40px", background: C.white }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>TaxAppeal vs. Georgia Property Tax Appeal Companies</h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36, lineHeight: 1.7 }}>Most Georgia firms charge 25–40% of your savings. Here is how TaxAppeal compares.</p>
          <div className="compare-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "1px", color: C.mutedGray, marginBottom: 12 }}>Typical Georgia Firm</div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: "#C0392B", marginBottom: 8 }}>25–40% of savings</div>
              <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.7, marginBottom: 16 }}>On a $2,000 annual reduction, you would pay $500–$800 in fees every single year.</p>
              {["Contingency fee every year", "May cherry-pick easy cases", "You lose a large portion of savings", "Some charge upfront plus contingency"].map(item => (
                <div key={item} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 13, color: "#C0392B" }}>✗ {item}</div>
              ))}
            </div>
            <div style={{ background: C.navy, borderRadius: 12, padding: 24, color: C.white }}>
              <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "1px", color: C.gold, marginBottom: 12 }}>TaxAppeal</div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: C.gold, marginBottom: 8 }}>$89 flat. Period.</div>
              <p style={{ fontSize: 14, color: "#8596AF", lineHeight: 1.7, marginBottom: 16 }}>Same $2,000 reduction. You pay $89 once and keep $1,921. Every year after that, the savings are 100% yours.</p>
              {["One-time $89 fee", "Every property gets a full appeal", "Keep 100% of your savings", "Certified mail with return receipt"].map(item => (
                <div key={item} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 13, color: C.gold }}>✓ {item}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* All 159 Counties */}
      <section style={{ padding: "56px 40px", background: C.bg }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>All 159 Georgia Counties Served</h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36 }}>From Atlanta to Savannah, Augusta to Columbus — every Georgia homeowner can file.</p>
          <div className="counties-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
            {counties.map(c => (
              <a key={c.slug} href={`/counties/${c.slug}`} style={{ fontSize: 12, color: C.bodyGray, padding: "6px 4px", display: "flex", alignItems: "center", gap: 5, textDecoration: "none" }}>
                <span style={{ color: C.green, fontSize: 11, flexShrink: 0 }}>✓</span> {`${c.name} County (${c.city})`}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* City directory.
          The 52 /georgia/[city] pages had the same defect the Florida city pages
          had before round 6: they existed, they were in the sitemap, and nothing on
          the site linked to one. Grouped by county because county is what determines
          the board and the deadline, and the county heading links to that county's
          page — which is how the /counties/* set finally gets inbound links from
          more than one place. */}
      <section style={{ padding: "56px 40px", background: C.white }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>Georgia cities we file in</h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36, lineHeight: 1.6 }}>Your board of assessors, appeal deadline and local market data are all set by your county — find your city below.</p>
          {Object.entries(
            georgiaSuburbs.reduce((acc, c) => {
              (acc[c.county] = acc[c.county] || []).push(c);
              return acc;
            }, {})
          )
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([county, list]) => (
              <div key={county} style={{ marginBottom: 26 }}>
                <a
                  href={`/counties/${list[0].countySlug}`}
                  style={{ display: "block", fontSize: 12, textTransform: "uppercase", letterSpacing: "1.5px", color: C.navy, fontWeight: 700, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${C.border}`, textDecoration: "none" }}
                >
                  {`${county} County`}
                </a>
                <div className="counties-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "6px 16px" }}>
                  {list
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((c) => (
                      <a key={c.slug} href={`/georgia/${c.slug}`} style={{ fontSize: 13, color: C.bodyGray, padding: "4px 0", textDecoration: "none" }}>
                        {c.name}
                      </a>
                    ))}
                </div>
              </div>
            ))}
        </div>
      </section>

      {/* ── CITY PAGES SECTION ── */}
      <section style={{ padding: "56px 40px", background: C.white }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>
            Georgia City-Specific Appeal Guides
          </h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36, lineHeight: 1.7 }}>
            Different Georgia metros have different appraisal boards, market trends, and local nuances. Select your city for a tailored guide.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20, maxWidth: 540, margin: "0 auto" }}>
            {cities.map(city => (
              <a key={city.slug} href={city.slug} className="city-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1.5px", color: C.gold, fontWeight: 600, marginBottom: 4 }}>
                      {city.county}
                    </div>
                    <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: C.darkNavy }}>
                      {city.name} Property Tax Appeal
                    </h3>
                  </div>
                  <span style={{ fontSize: 20, flexShrink: 0, marginLeft: 8 }}>→</span>
                </div>
                <p style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.6, marginBottom: 14 }}>{city.desc}</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {city.stats.map(s => (
                    <span key={s} style={{ fontSize: 11, background: C.lightBlue, color: C.navy, borderRadius: 6, padding: "4px 10px", fontWeight: 500 }}>{s}</span>
                  ))}
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: "56px 40px", background: C.bg }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 36 }}>Georgia Property Tax Appeal FAQ</h2>
          {faqs.map(([q, a], i) => (
            <div key={i} style={{ background: C.white, border: `1.5px solid ${openFaq === i ? C.navy : C.border}`, borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
              <div onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ padding: "16px 20px", fontSize: 15, fontWeight: 500, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {q} <span style={{ color: C.mutedGray, transform: openFaq === i ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
              </div>
              {openFaq === i && <div style={{ padding: "0 20px 16px", fontSize: 14, color: C.bodyGray, lineHeight: 1.7 }}>{a}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: C.navy, padding: "64px 40px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 34, color: C.white, marginBottom: 12 }}>Ready to appeal your Georgia property taxes?</h2>
        <p style={{ fontSize: 16, color: "#8596AF", marginBottom: 28 }}>Georgia gives you 45 days from your assessment notice to appeal. $89 flat — no hidden fees, no percentage cuts.</p>
        <button className="btn-primary" style={{ background: C.gold, color: C.darkNavy, fontSize: 17, padding: "18px 44px" }} onClick={go}>
          Start My Georgia Appeal — $89 →
        </button>
      </section>

      {/* Footer */}
      <footer style={{ background: C.darkNavy, padding: "24px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
          <p style={{ color: C.mutedGray, fontSize: 12 }}>© 2026 TaxAppeal USA · customerservice@taxappealusa.com</p>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <a href="/texas" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Texas</a>
            <a href="/georgia" style={{ color: C.gold, fontSize: 12, textDecoration: "none" }}>Georgia</a>
            <a href="/florida" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Florida</a>
            <a href="/terms" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Terms</a>
            <a href="/privacy" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Privacy</a>
          </div>
        </div>
        <div style={{ borderTop: `1px solid rgba(255,255,255,0.06)`, paddingTop: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <span style={{ color: "#3A4F6A", fontSize: 11 }}>Georgia cities:</span>
          <a href="/atlanta" style={{ color: "#3A4F6A", fontSize: 11, textDecoration: "none" }}>Atlanta</a>
        </div>
      </footer>
    </>
  );
}
