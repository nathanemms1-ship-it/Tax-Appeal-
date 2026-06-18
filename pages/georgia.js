import Head from 'next/head';
import { useState } from 'react';
import { useRouter } from 'next/router';

const C = {
  navy: "#1B3A6B", gold: "#FFC940", darkNavy: "#0F1F3D", bg: "#F4F7FC",
  lightBlue: "#EEF3FB", bodyGray: "#5A6B82", mutedGray: "#8596AF",
  border: "#E8EDF4", white: "#FFFFFF", green: "#2E7D52",
};

const FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap');`;

const faqs = [
  ["What is the deadline to appeal property taxes in Georgia?", "You have 45 days from the date on your annual Notice of Assessment to file an appeal. Assessment notices are typically mailed between April and June. Missing this deadline means waiting until next year."],
  ["How much can I save by appealing my Georgia property taxes?", "The average Georgia homeowner who appeals saves $800 to $2,200 per year. With TaxAppeal at $79 flat, you keep 100% of those savings — unlike contingency firms that take 25–40%."],
  ["What is the success rate for property tax appeals in Georgia?", "Approximately 82% of property tax appeals backed by comparable sales evidence result in a reduction. The odds are strongly in your favor with a well-documented appeal."],
  ["How does Georgia assess property value?", "Georgia assesses property at 40% of fair market value. If the county overestimates your fair market value, your taxable value and your bill are both inflated — and you have the right to challenge it."],
  ["What is the Board of Equalization in Georgia?", "The Board of Equalization (BOE) is a county body that hears property tax appeals in Georgia. If your informal appeal to the county assessor is unsuccessful, your case goes before the BOE where you can present comparable sales evidence."],
  ["Can I appeal my Georgia property taxes every year?", "Yes. Georgia homeowners can file a new appeal every single year. Your assessment notice resets each spring, giving you a fresh 45-day window to challenge the value — even if you appealed last year."],
  ["Does TaxAppeal serve all Georgia counties?", "Yes. We serve all 159 Georgia counties including Fulton, Gwinnett, Cobb, DeKalb, Cherokee, Forsyth, Chatham, Richmond, and every other county in the state."],
  ["Can my assessment go up if I appeal in Georgia?", "In rare cases, yes. However TaxAppeal reviews all market data before filing to ensure your appeal is well-supported with comparable sales evidence, minimizing any upside risk."],
  ["What evidence does TaxAppeal use for Georgia appeals?", "We analyze comparable sales, current market conditions, property defects, and county record discrepancies. Every letter cites O.C.G.A. § 48-5-311."],
  ["How does TaxAppeal compare to other Georgia firms?", "Most Georgia firms charge 25–40% of your savings. On a $1,500 reduction that is $375–$600 in fees every year. TaxAppeal charges $79 flat — one time."],
  ["What is a Notice of Assessment in Georgia?", "Your Notice of Assessment is the annual letter from your county tax assessor stating their estimate of your property's fair market value. It arrives between April and June, and the date on the notice starts your 45-day appeal clock."],
  ["Which appraisal districts handle Georgia property tax appeals?", "Georgia uses county tax assessors rather than centralized appraisal districts. Each of the 159 counties has its own Board of Tax Assessors. Major ones include the Fulton County Board of Assessors, Gwinnett County Tax Assessor, Cobb County Board of Tax Assessors, and DeKalb County Tax Commissioner."],
];

const counties = [
  "Appling County", "Atkinson County", "Bacon County", "Baker County",
  "Baldwin County", "Banks County", "Barrow County", "Bartow County",
  "Ben Hill County", "Berrien County", "Bibb County (Macon)",
  "Bleckley County", "Brantley County", "Brooks County", "Bryan County",
  "Bulloch County (Statesboro)", "Burke County", "Butts County",
  "Calhoun County", "Camden County", "Candler County", "Carroll County",
  "Catoosa County (Ringgold)", "Charlton County", "Chatham County (Savannah)",
  "Chattahoochee County", "Chattooga County", "Cherokee County",
  "Clarke County (Athens)", "Clay County", "Clayton County",
  "Clinch County", "Cobb County (Marietta)", "Coffee County",
  "Colquitt County", "Columbia County", "Cook County", "Coweta County",
  "Crawford County", "Crisp County", "Dade County", "Dawson County",
  "Decatur County", "DeKalb County (Decatur)", "Dodge County",
  "Dooly County", "Dougherty County (Albany)", "Douglas County",
  "Early County", "Echols County", "Effingham County", "Elbert County",
  "Emanuel County", "Evans County", "Fannin County", "Fayette County",
  "Floyd County (Rome)", "Forsyth County", "Franklin County",
  "Fulton County (Atlanta)", "Gilmer County", "Glascock County",
  "Glynn County (Brunswick)", "Gordon County", "Grady County",
  "Greene County", "Gwinnett County", "Habersham County",
  "Hall County (Gainesville)", "Hancock County", "Haralson County",
  "Harris County", "Hart County", "Heard County", "Henry County",
  "Houston County", "Irwin County", "Jackson County", "Jasper County",
  "Jeff Davis County", "Jefferson County", "Jenkins County",
  "Johnson County", "Jones County", "Lamar County", "Lanier County",
  "Laurens County", "Lee County", "Liberty County", "Lincoln County",
  "Long County", "Lowndes County (Valdosta)", "Lumpkin County",
  "McDuffie County", "McIntosh County", "Macon County", "Madison County",
  "Marion County", "Meriwether County", "Miller County", "Mitchell County",
  "Monroe County", "Montgomery County", "Morgan County", "Murray County",
  "Muscogee County (Columbus)", "Newton County", "Oconee County",
  "Oglethorpe County", "Paulding County", "Peach County", "Pickens County",
  "Pierce County", "Pike County", "Polk County", "Pulaski County",
  "Putnam County", "Quitman County", "Rabun County", "Randolph County",
  "Richmond County (Augusta)", "Rockdale County", "Schley County",
  "Screven County", "Seminole County", "Spalding County",
  "Stephens County", "Stewart County", "Sumter County", "Talbot County",
  "Taliaferro County", "Tattnall County", "Taylor County", "Telfair County",
  "Terrell County", "Thomas County", "Tift County", "Toombs County",
  "Towns County", "Treutlen County", "Troup County (LaGrange)",
  "Turner County", "Twiggs County", "Union County", "Upson County",
  "Walker County", "Walton County", "Ware County", "Warren County",
  "Washington County", "Wayne County", "Webster County", "Wheeler County",
  "White County", "Whitfield County (Dalton)", "Wilcox County",
  "Wilkes County", "Wilkinson County", "Worth County",
];

const testimonials = [
  { name: "Sarah M.", location: "Fulton County", saved: "$1,840", quote: "I had no idea how easy this was. TaxAppeal handled everything — I got a letter in the mail saying my assessment was reduced. Best $79 I ever spent." },
  { name: "James T.", location: "Gwinnett County", saved: "$2,100", quote: "I'd been meaning to appeal for years but never got around to it. TaxAppeal made it a 5-minute process. The certified mail gave me confidence it was actually filed." },
  { name: "Linda R.", location: "Cobb County", saved: "$1,560", quote: "Other companies wanted 30% of my savings. TaxAppeal charged $79 flat and I kept every dollar. I'll be filing again next year for sure." },
];

export default function Georgia() {
  const router = useRouter();
  const [openFaq, setOpenFaq] = useState(null);
  const go = () => router.push('/apply');

  return (
    <>
      <Head>
        <title>Georgia Property Tax Appeal Service | File for $79 | TaxAppeal</title>
        <meta name="description" content="Appeal your Georgia property taxes for a flat $79 fee. We draft your dispute letter with comparable sales data and file via USPS certified mail. 82% approval rate. All 159 Georgia counties." />
        <link rel="canonical" href="https://www.taxappealusa.com/georgia" />
        <meta property="og:title" content="Georgia Property Tax Appeal — $79 Flat Fee | TaxAppeal" />
        <meta property="og:description" content="Stop overpaying on Georgia property taxes. We file your appeal via certified mail for $79 flat. No contingency fees. Keep 100% of your savings. All 159 counties." />
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
          "offers": { "@type": "Offer", "price": "79.00", "priceCurrency": "USD" }
        })}} />
      </Head>
      <style>{`
        ${FONT}
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: ${C.bg}; color: ${C.darkNavy}; }
        .btn-primary { background: ${C.navy}; color: #fff; border: none; border-radius: 8px; padding: 16px 36px; font-size: 16px; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: background 0.2s; }
        .btn-primary:hover { background: ${C.gold}; color: ${C.darkNavy}; }
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
            Appeal Your Georgia Property Taxes for $79 Flat
          </h1>
          <p style={{ fontSize: 18, color: "#8596AF", lineHeight: 1.6, maxWidth: 640, marginBottom: 32 }}>
            Stop overpaying. We draft a formal appeal letter backed by comparable sales data, legal citations under O.C.G.A. § 48-5-311, and file it via USPS certified mail — all for a flat $79. No contingency fees. Keep 100% of your savings.
          </p>
          <div className="hero-stats" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 32 }}>
            {[["82%", "Approval rate"], ["$1,840", "Avg. savings"], ["$79", "Flat fee"], ["159", "GA counties"]].map(([n, l]) => (
              <div key={l} style={{ background: "#0F1F3D", borderRadius: 10, padding: "16px", textAlign: "center" }}>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: C.gold }}>{n}</div>
                <div style={{ fontSize: 11, color: "#5A7A9F", marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>
          <button className="btn-primary" style={{ background: C.gold, color: C.darkNavy, fontSize: 17, padding: "18px 44px" }} onClick={go}>
            File My Georgia Appeal — $79 →
          </button>
          <div style={{ fontSize: 13, color: "#5A7A9F", marginTop: 12 }}>Takes about 4 minutes. You won't be charged until your letter is ready.</div>
        </div>
      </section>

      {/* What's Included */}
      <section style={{ padding: "56px 40px", background: C.lightBlue }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>Everything Included for $79</h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36, lineHeight: 1.7 }}>One flat fee covers the entire process — no surprises, no percentage cuts.</p>
          <div className="included-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {[
              ["📊", "Comparable Sales Analysis", "We pull recent sales of similar homes in your area to build evidence that your assessed value is too high."],
              ["✍️", "Formal Appeal Letter", "A professionally drafted appeal letter citing O.C.G.A. § 48-5-311 with your property-specific data and comparable sales."],
              ["📬", "USPS Certified Mail Filing", "We file via certified mail with return receipt — providing legal proof your appeal was received within the 45-day window."],
              ["🔍", "Property Data Review", "We review your county records for errors in square footage, bedroom count, lot size, or condition that could lower your value."],
              ["📧", "Email Confirmation", "You receive a copy of your complete appeal letter and USPS tracking number immediately after filing."],
              ["🏛️", "Board of Equalization Ready", "Your letter is drafted to be effective at both the informal level and before the Board of Equalization if needed."],
            ].map(([icon, title, desc]) => (
              <div key={title} style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: 20, display: "flex", gap: 14 }}>
                <div style={{ fontSize: 24, flexShrink: 0 }}>{icon}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.6 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: "56px 40px", background: C.white }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>How Georgia Property Tax Appeals Work</h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36, lineHeight: 1.7 }}>Georgia homeowners have the right to appeal their property tax assessment every year. Here is how the process works.</p>
          <div style={{ display: "grid", gap: 24 }}>
            {[
              ["📋", "Your County Sends an Assessment Notice", "Georgia county tax assessors send annual Notices of Assessment between April and June. Georgia assesses property at 40% of fair market value. If this ratio is applied to an inflated value, you are overpaying."],
              ["⚖️", "You Have 45 Days to Appeal Under Georgia Law", "Under O.C.G.A. § 48-5-311, you have 45 days from the date on your Notice of Assessment to file an appeal. You can dispute the fair market value, the assessment ratio, or a denied exemption."],
              ["📊", "Comparable Sales Are Your Strongest Evidence", "Georgia law allows you to present comparable sales evidence proving your fair market value is lower than assessed. TaxAppeal analyzes 2.1 million recent transactions to build your case."],
              ["📬", "TaxAppeal Files Via Certified Mail", "Your appeal must be postmarked within 45 days of your assessment notice date. TaxAppeal files via USPS certified mail with return receipt, providing legal proof your appeal was received before the deadline."],
              ["✅", "Most Georgia Appeals Result in a Reduction", "Georgia county assessors use mass-appraisal methods that inevitably contain errors. A well-documented appeal with comparable sales evidence is hard for the Board of Equalization to deny."],
            ].map(([icon, title, desc]) => (
              <div key={title} style={{ display: "flex", gap: 16 }}>
                <div style={{ width: 44, height: 44, background: C.lightBlue, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{icon}</div>
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 500, marginBottom: 6 }}>{title}</h3>
                  <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.7 }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ padding: "56px 40px", background: C.bg }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>Georgia Homeowners Who Saved</h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36 }}>Real results from Georgia homeowners who filed with TaxAppeal.</p>
          <div className="testimonials-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
            {testimonials.map((t, i) => (
              <div key={i} style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
                <div style={{ fontSize: 22, marginBottom: 12 }}>⭐⭐⭐⭐⭐</div>
                <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.7, marginBottom: 16, fontStyle: "italic" }}>"{t.quote}"</p>
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: C.mutedGray }}>{t.location}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: C.mutedGray }}>Saved</div>
                    <div style={{ fontWeight: 700, fontSize: 18, color: C.green }}>{t.saved}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
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
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: C.gold, marginBottom: 8 }}>$79 flat. Period.</div>
              <p style={{ fontSize: 14, color: "#8596AF", lineHeight: 1.7, marginBottom: 16 }}>Same $2,000 reduction. You pay $79 once and keep $1,921. Every year after that, the savings are 100% yours.</p>
              {["One-time $79 fee", "Every property gets a full appeal", "Keep 100% of your savings", "Certified mail with return receipt"].map(item => (
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
              <div key={c} style={{ fontSize: 12, color: C.bodyGray, padding: "6px 4px", display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ color: C.green, fontSize: 11, flexShrink: 0 }}>✓</span> {c}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: "56px 40px", background: C.white }}>
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
        <p style={{ fontSize: 16, color: "#8596AF", marginBottom: 28 }}>Join thousands of Georgia homeowners saving money every year. $79 flat — no hidden fees, no percentage cuts.</p>
        <button className="btn-primary" style={{ background: C.gold, color: C.darkNavy, fontSize: 17, padding: "18px 44px" }} onClick={go}>
          Start My Georgia Appeal — $79 →
        </button>
      </section>

      {/* Footer */}
      <footer style={{ background: C.darkNavy, padding: "24px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <p style={{ color: C.mutedGray, fontSize: 12 }}>© 2026 TaxAppeal USA · disputes@taxappealusa.com</p>
        <div style={{ display: "flex", gap: 20 }}>
          <a href="/texas" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Texas</a>
          <a href="/georgia" style={{ color: C.gold, fontSize: 12, textDecoration: "none" }}>Georgia</a>
          <a href="/florida" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Florida</a>
          <a href="/terms" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Terms</a>
          <a href="/privacy" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Privacy</a>
        </div>
      </footer>
    </>
  );
}
