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
  ["When is the deadline to appeal property taxes in Florida?", "The deadline is 25 days after your TRIM notice is mailed, typically falling in mid-September. Important: Florida requires your petition to be RECEIVED by the deadline, not just postmarked. File at least 7 days early."],
  ["How much can I save by appealing my Florida property taxes?", "The average Florida homeowner who appeals saves $800–$2,800 per year. With TaxAppeal at $79 flat, you keep 100% of those savings — unlike contingency firms that take 25–40%."],
  ["What is a TRIM notice in Florida?", "TRIM stands for Truth in Millage. It is the annual notice mailed every August showing your assessed value and estimated tax bill. This is NOT your final tax bill — it is a proposal you can challenge within 25 days."],
  ["What is the Value Adjustment Board in Florida?", "The VAB is a county board that hears property tax petitions in Florida. If you disagree with your property appraiser's assessment, you file a petition with the VAB. A Special Magistrate reviews the evidence and issues a recommended decision."],
  ["What is a Special Magistrate in Florida?", "A Special Magistrate is an independent hearing officer appointed by the Value Adjustment Board. They review comparable sales evidence presented by both the property owner and the county appraiser, then issue a recommended decision to the VAB."],
  ["Does TaxAppeal serve all Florida counties?", "Yes. We serve all 67 Florida counties including Miami-Dade, Broward, Palm Beach, Hillsborough, Orange, Pinellas, Duval, Lee, and every other county in the state."],
  ["Can my assessment go up if I appeal in Florida?", "No. Florida law protects petitioners. Your assessment cannot increase as a result of filing a VAB petition — there is zero risk to filing."],
  ["How does Florida's Save Our Homes cap affect my appeal?", "The Save Our Homes cap limits assessment increases on homestead properties to 3% or CPI per year. However if you recently purchased your home, the cap resets to market value. If your assessed value exceeds market value, you can still appeal regardless of the cap."],
  ["What evidence does TaxAppeal use for Florida appeals?", "We analyze comparable sales, current market conditions, property defects, and county record errors. Every letter cites Florida Statute § 194.011 and § 193.011."],
  ["How does TaxAppeal compare to other Florida firms?", "Most Florida firms charge 25–40% of your savings. On a $2,000 reduction that is $500–$800 in fees every year. TaxAppeal charges $79 flat — one time."],
  ["Can I appeal my Florida homestead exemption denial?", "Yes. If your homestead exemption was denied, you can file a petition with the VAB to challenge the denial. TaxAppeal can prepare a formal petition citing Florida Statute § 196.011 supporting your exemption eligibility."],
  ["Which property appraisers handle Florida tax appeals?", "Each of Florida's 67 counties has its own elected Property Appraiser. Major ones include the Miami-Dade Property Appraiser, Broward County Property Appraiser, Palm Beach County Property Appraiser, Hillsborough County Property Appraiser, and Orange County Property Appraiser."],
];

const counties = [
  "Alachua County (Gainesville)", "Baker County", "Bay County (Panama City)",
  "Bradford County", "Brevard County (Melbourne/Cocoa)",
  "Broward County (Fort Lauderdale)", "Calhoun County",
  "Charlotte County (Port Charlotte)", "Citrus County", "Clay County",
  "Collier County (Naples)", "Columbia County", "DeSoto County",
  "Dixie County", "Duval County (Jacksonville)", "Escambia County (Pensacola)",
  "Flagler County (Palm Coast)", "Franklin County", "Gadsden County",
  "Gilchrist County", "Glades County", "Gulf County", "Hamilton County",
  "Hardee County", "Hendry County", "Hernando County", "Highlands County",
  "Hillsborough County (Tampa)", "Holmes County",
  "Indian River County (Vero Beach)", "Jackson County", "Jefferson County",
  "Lafayette County", "Lake County", "Lee County (Fort Myers)",
  "Leon County (Tallahassee)", "Levy County", "Liberty County",
  "Madison County", "Manatee County (Bradenton)", "Marion County (Ocala)",
  "Martin County (Stuart)", "Miami-Dade County (Miami)",
  "Monroe County (Key West)", "Nassau County", "Okaloosa County (Fort Walton Beach)",
  "Okeechobee County", "Orange County (Orlando)", "Osceola County (Kissimmee)",
  "Palm Beach County (West Palm Beach)", "Pasco County (New Port Richey)",
  "Pinellas County (St. Petersburg)", "Polk County (Lakeland)",
  "Putnam County", "St. Johns County (St. Augustine)",
  "St. Lucie County (Port St. Lucie)", "Santa Rosa County",
  "Sarasota County (Sarasota)", "Seminole County (Sanford)",
  "Sumter County (The Villages)", "Suwannee County", "Taylor County",
  "Union County", "Volusia County (Daytona Beach)", "Wakulla County",
  "Walton County", "Washington County",
];

const testimonials = [
  { name: "Michael R.", location: "Orange County", saved: "$2,200", quote: "The TRIM notice seemed way off compared to what my neighbors sold for. TaxAppeal put together the comparable sales evidence and handled everything. Got a reduction on the first try." },
  { name: "Patricia K.", location: "Broward County", saved: "$1,960", quote: "I didn't even know I could appeal. A friend told me about TaxAppeal and I figured $79 was worth a shot. Saved almost $2,000 a year — I wish I'd done this sooner." },
  { name: "David L.", location: "Palm Beach County", saved: "$3,100", quote: "Other firms wanted 35% of my savings. On a $3,100 reduction that would have been over $1,000 in fees every year. TaxAppeal charged $79 flat. Not a hard decision." },
];

const floridaGuides = [
  { href: "/blog/when-do-florida-trim-notices-arrive-2026", label: "When Do Florida TRIM Notices Arrive in 2026?" },
  { href: "/blog/how-to-read-florida-trim-notice-2026", label: "How to Read Your Florida TRIM Notice" },
  { href: "/blog/florida-homestead-exemption-vs-property-tax-appeal", label: "Homestead Exemption vs. Property Tax Appeal" },
  { href: "/blog/do-i-need-a-lawyer-to-appeal-florida-property-taxes", label: "Do I Need a Lawyer to Appeal?" },
  { href: "/blog/florida-property-tax-appeal-success-rate", label: "Florida Appeal Success Rate" },
  { href: "/blog/how-to-appeal-florida-property-tax-trim-notice-guide", label: "How to Appeal Your Florida Property Tax" },
  { href: "/blog/florida-trim-notice-deadline-2026", label: "Florida TRIM Notice Deadline 2026" },
  { href: "/blog/what-is-a-vab-petition-florida-homeowners-guide", label: "What Is a VAB Petition?" },
  { href: "/blog/florida-property-tax-appeal-letter-what-to-include-to-win", label: "Florida Appeal Letter: What to Include" },
  { href: "/blog/how-much-can-i-save-appealing-florida-property-tax", label: "How Much Can I Save Appealing Florida Taxes?" },
  { href: "/blog/non-homestead-property-tax-appeal-florida", label: "Non-Homestead Property Tax Appeal FL" },
  { href: "/blog/miami-dade-property-tax-appeal-guide-2026", label: "Miami-Dade Property Tax Appeal Guide" },
  { href: "/blog/hillsborough-county-property-tax-appeal-2026", label: "Hillsborough County Appeal Guide" },
  { href: "/blog/broward-county-property-tax-appeal-guide-2026", label: "Broward County Appeal Guide" },
  { href: "/blog/palm-beach-county-property-tax-appeal-guide-2026", label: "Palm Beach County Appeal Guide" },
  { href: "/blog/orange-county-florida-property-tax-appeal-guide-2026", label: "Orange County FL Appeal Guide" },
  { href: "/blog/pinellas-county-florida-property-tax-appeal-guide-2026", label: "Pinellas County Appeal Guide" },
  { href: "/blog/sarasota-county-florida-property-tax-appeal-guide-2026", label: "Sarasota County Appeal Guide" },
  { href: "/blog/lee-county-florida-property-tax-appeal-guide-2026", label: "Lee County Appeal Guide" },
  { href: "/blog/collier-county-florida-property-tax-appeal-guide-2026", label: "Collier County Appeal Guide" },
  { href: "/blog/duval-county-jacksonville-property-tax-appeal-guide-2026", label: "Duval County (Jacksonville) Appeal Guide" },
  { href: "/blog/okaloosa-county-florida-property-tax-appeal-guide-2026", label: "Okaloosa County Appeal Guide" },
];

export default function Florida() {
  const router = useRouter();
  const [openFaq, setOpenFaq] = useState(null);
  const go = () => router.push('/apply');

  return (
    <>
      <Head>
        <title>Florida Property Tax Appeal Service | File for $79 | TaxAppeal</title>
        <meta name="description" content="Appeal your Florida TRIM notice for a flat $79 fee. We draft your VAB petition with comparable sales data and file via USPS certified mail. 82% approval rate. All 67 Florida counties." />
        <link rel="canonical" href="https://www.taxappealusa.com/florida" />
        <meta property="og:title" content="Florida Property Tax Appeal — $79 Flat Fee | TaxAppeal" />
        <meta property="og:description" content="Stop overpaying on Florida property taxes. We file your VAB petition via certified mail for $79 flat. No contingency fees. Keep 100% of your savings. All 67 counties." />
        <meta property="og:url" content="https://www.taxappealusa.com/florida" />
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
          "name": "Florida Property Tax Appeal Filing",
          "provider": { "@type": "Organization", "name": "TaxAppeal USA" },
          "areaServed": { "@type": "State", "name": "Florida" },
          "description": "Property tax appeal petition preparation and USPS certified mail filing for Florida homeowners. Covers all 67 counties.",
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
          <div style={{ fontSize: 12, color: C.gold, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 16 }}>Florida Property Tax Appeal Service</div>
          <h1 className="hero-title" style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, lineHeight: 1.15, marginBottom: 16 }}>
            Appeal Your Florida Property Taxes for $79 Flat
          </h1>
          <p style={{ fontSize: 18, color: "#8596AF", lineHeight: 1.6, maxWidth: 640, marginBottom: 12 }}>
            Stop overpaying. We draft a formal VAB petition backed by comparable sales data, legal citations under Florida Statute § 194.011, and file via USPS certified mail. Flat $79. No contingency fees. Keep 100% of your savings.
          </p>
          <div style={{ background: "#C0392B", display: "inline-block", borderRadius: 6, padding: "8px 14px", fontSize: 13, color: C.white, fontWeight: 500, marginBottom: 24 }}>
            ⚠️ Florida requires RECEIPT by deadline — not just postmark. We file 7+ days early.
          </div>
          <div className="hero-stats" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 32 }}>
            {[["82%", "Approval rate"], ["$2,100", "Avg. savings"], ["$79", "Flat fee"], ["67", "FL counties"]].map(([n, l]) => (
              <div key={l} style={{ background: "#0F1F3D", borderRadius: 10, padding: "16px", textAlign: "center" }}>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: C.gold }}>{n}</div>
                <div style={{ fontSize: 11, color: "#5A7A9F", marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>
          <button className="btn-primary" style={{ background: C.gold, color: C.darkNavy, fontSize: 17, padding: "18px 44px" }} onClick={go}>
            File My Florida Appeal — $79 →
          </button>
          <div style={{ fontSize: 13, color: "#5A7A9F", marginTop: 12 }}>Takes about 4 minutes. You won&apos;t be charged until your petition is ready.</div>
        </div>
      </section>

      {/* What's Included */}
      <section style={{ padding: "56px 40px", background: C.lightBlue }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>Everything Included for $79</h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36, lineHeight: 1.7 }}>One flat fee covers the entire VAB petition process — no surprises, no percentage cuts.</p>
          <div className="included-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {[
              ["📊", "Comparable Sales Analysis", "We pull recent sales of similar homes in your area to prove your assessed value exceeds fair market value under Florida Statute § 193.011."],
              ["✍️", "Formal VAB Petition", "A professionally drafted Value Adjustment Board petition citing Florida Statute § 194.011 with your property-specific data and comparable sales evidence."],
              ["📬", "USPS Certified Mail Filing", "We file 7+ days before the 25-day deadline — Florida requires RECEIPT, not just postmark. Certified mail with return receipt provides legal proof."],
              ["🔍", "Property Record Review", "We check your county appraiser records for errors in square footage, bedroom count, condition, or classification that could support a lower value."],
              ["📧", "Email Confirmation & Tracking", "You receive a copy of your complete VAB petition and USPS tracking number immediately after filing."],
              ["🏛️", "Special Magistrate Ready", "Your petition is drafted to be effective before a Special Magistrate with clear comparable sales evidence and legal citations."],
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
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>How Florida Property Tax Appeals Work</h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36, lineHeight: 1.7 }}>Florida homeowners receive TRIM notices every August. You have 25 days to petition the Value Adjustment Board if your assessment is too high.</p>
          <div style={{ display: "grid", gap: 24 }}>
            {[
              ["📋", "Every August You Receive Your TRIM Notice", "Florida property appraisers mail Truth in Millage notices every August. This shows your assessed value as of January 1st and your estimated tax bill. Under Florida Statute § 194.011, you have the right to challenge this value."],
              ["⚖️", "You Have 25 Days to Petition the VAB", "Under Florida Statute § 194.011, you have 25 days from your TRIM notice to file a petition with the Value Adjustment Board. Florida requires RECEIPT by the deadline — not just postmark. TaxAppeal files 7+ days early."],
              ["📊", "Comparable Sales Build Your Case", "Florida law allows you to present comparable sales evidence proving the property appraiser overvalued your property. TaxAppeal analyzes 2.1 million recent transactions to build a data-backed case."],
              ["📬", "TaxAppeal Files 7+ Days Before Deadline", "Florida VAB petition deadlines fall in mid-September. We file at least 7 days early via USPS certified mail with return receipt to ensure timely receipt and legal proof of filing."],
              ["✅", "Strong Cases Win Before the VAB", "A well-documented petition with comparable sales evidence gives you a strong position. The property appraiser must prove their assessment methodology is correct under Florida Statute § 193.011."],
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
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>Florida Homeowners Who Saved</h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36 }}>Real results from Florida homeowners who filed with TaxAppeal.</p>
          <div className="testimonials-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
            {testimonials.map((t, i) => (
              <div key={i} style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
                <div style={{ fontSize: 22, marginBottom: 12 }}>⭐⭐⭐⭐⭐</div>
                <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.7, marginBottom: 16, fontStyle: "italic" }}>&ldquo;{t.quote}&rdquo;</p>
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
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>TaxAppeal vs. Florida Property Tax Appeal Firms</h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36, lineHeight: 1.7 }}>Most Florida firms charge 25–40% of your savings. Here is how TaxAppeal compares.</p>
          <div className="compare-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "1px", color: C.mutedGray, marginBottom: 12 }}>Typical Florida Firm</div>
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

      {/* All 67 Counties */}
      <section style={{ padding: "56px 40px", background: C.bg }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>All 67 Florida Counties Served</h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36 }}>From Miami to Jacksonville, Tampa to Orlando — every Florida homeowner can file.</p>
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
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 36 }}>Florida Property Tax Appeal FAQ</h2>
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

      {/* ── FLORIDA GUIDES SECTION ── */}
      <section style={{ padding: "56px 40px", background: C.bg }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>Florida Property Tax Guides</h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36 }}>Everything you need to know about Florida VAB petitions, TRIM notices, and county-specific deadlines.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            {floridaGuides.map(({ href, label }) => (
              <a key={href} href={href} style={{ display: "block", padding: "12px 16px", background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 8, textDecoration: "none", color: C.navy, fontSize: 13, fontWeight: 500, lineHeight: 1.4, transition: "border-color 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.navy}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                → {label}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── TOP NEIGHBORHOODS SECTION ── */}
      <section style={{ padding: "56px 40px", background: C.white }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>Appeal by Florida Neighborhood</h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36 }}>We serve all 110+ Florida communities. Here are the most popular.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
            {[
              ["Palm Beach", "/florida/palm-beach-fl"],
              ["30A", "/florida/30a-fl"],
              ["Bal Harbour", "/florida/bal-harbour"],
              ["Key Biscayne", "/florida/key-biscayne"],
              ["Surfside", "/florida/surfside-fl"],
              ["Longboat Key", "/florida/longboat-key-fl"],
              ["Siesta Key", "/florida/siesta-key-fl"],
              ["Windermere", "/florida/windermere-fl"],
              ["Coral Gables", "/florida/coral-gables"],
              ["Naples", "/florida/naples-fl"],
              ["Marco Island", "/florida/marco-island"],
              ["Ponte Vedra Beach", "/florida/ponte-vedra-beach"],
              ["Boca Raton", "/florida/boca-raton"],
              ["Jupiter", "/florida/jupiter-fl"],
              ["Palm Beach Gardens", "/florida/palm-beach-gardens"],
              ["Parkland", "/florida/parkland-fl"],
              ["Weston", "/florida/weston"],
              ["Pinecrest", "/florida/pinecrest-fl"],
              ["South Tampa", "/florida/south-tampa-fl"],
              ["Westchase", "/florida/westchase-fl"],
              ["Coconut Grove", "/florida/coconut-grove"],
              ["Aventura", "/florida/aventura"],
              ["Miami Beach", "/florida/miami-beach"],
              ["Sunny Isles Beach", "/florida/sunny-isles-beach"],
              ["Winter Park", "/florida/winter-park-fl"],
              ["Lake Nona", "/florida/lake-nona"],
              ["Nocatee", "/florida/nocatee-fl"],
              ["Sarasota", "/florida/sarasota-fl"],
              ["Fort Lauderdale", "/florida/fort-lauderdale"],
              ["Clearwater", "/florida/clearwater-fl"],
            ].map(([name, href]) => (
              <a key={href} href={href} style={{ display: "block", padding: "10px 14px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, textDecoration: "none", color: C.navy, fontSize: 13, fontWeight: 500, textAlign: "center" }}>
                {name}
              </a>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <a href="/florida" style={{ fontSize: 13, color: C.bodyGray, textDecoration: "underline" }}>View all 110 Florida neighborhoods →</a>
          </div>
        </div>
      </section>

      {/* ── COUNTIES SECTION ── */}
      <section style={{ padding: "40px 40px", background: C.bg }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, textAlign: "center", marginBottom: 28 }}>Appeal by Florida County</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
            {[
              ["Miami-Dade County", "/counties/miami-dade-county-fl"],
              ["Broward County", "/counties/broward-county-fl"],
              ["Palm Beach County", "/counties/palm-beach-county-fl"],
              ["Hillsborough County", "/counties/hillsborough-county-fl"],
              ["Orange County", "/counties/orange-county-fl"],
              ["Pinellas County", "/counties/pinellas-county-fl"],
              ["Duval County", "/counties/duval-county-fl"],
              ["Brevard County", "/counties/brevard-county-fl"],
              ["Lee County", "/counties/lee-county-fl"],
              ["Polk County", "/counties/polk-county-fl"],
              ["Sarasota County", "/counties/sarasota-county-fl"],
              ["Collier County", "/counties/collier-county-fl"],
            ].map(([name, href]) => (
              <a key={href} href={href} style={{ display: "block", padding: "10px 14px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, textDecoration: "none", color: C.navy, fontSize: 13, fontWeight: 500 }}>
                → {name}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: C.navy, padding: "64px 40px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 34, color: C.white, marginBottom: 12 }}>Ready to appeal your Florida property taxes?</h2>
        <p style={{ fontSize: 16, color: "#8596AF", marginBottom: 28 }}>Join thousands of Florida homeowners saving money every year. $79 flat — no hidden fees, no percentage cuts.</p>
        <button className="btn-primary" style={{ background: C.gold, color: C.darkNavy, fontSize: 17, padding: "18px 44px" }} onClick={go}>
          Start My Florida Appeal — $79 →
        </button>
      </section>

      {/* Footer */}
      <footer style={{ background: C.darkNavy, padding: "24px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <p style={{ color: C.mutedGray, fontSize: 12 }}>© 2026 TaxAppeal USA · disputes@taxappealusa.com</p>
        <div style={{ display: "flex", gap: 20 }}>
          <a href="/texas" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Texas</a>
          <a href="/georgia" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Georgia</a>
          <a href="/florida" style={{ color: C.gold, fontSize: 12, textDecoration: "none" }}>Florida</a>
          <a href="/terms" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Terms</a>
          <a href="/privacy" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Privacy</a>
        </div>
      </footer>
    </>
  );
}
