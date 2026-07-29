import Head from 'next/head';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import JurisdictionOutcomes from '../components/JurisdictionOutcomes';
import { floridaCities } from '../lib/floridaCities';

const C = {
navy: "#1B3A6B", gold: "#FFC940", darkNavy: "#0F1F3D", bg: "#F4F7FC",
lightBlue: "#EEF3FB", bodyGray: "#5A6B82", mutedGray: "#8596AF",
border: "#E8EDF4", white: "#FFFFFF", green: "#2E7D52",
};

const FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap');`;

const faqs = [
["When is the deadline to appeal property taxes in Florida?", "The deadline is 25 days after your TRIM notice is mailed, typically falling in mid-September. Important: Florida requires your petition to be RECEIVED by the deadline, not just postmarked. File at least 7 days early."],
["What is the county filing fee?", "Florida House Bill 7031 (effective July 2025) allows counties to charge up to $50 per petition when filing with the Value Adjustment Board. The exact amount is set by each county individually and ranges from about $15 to $50. This fee goes directly to the county — not to TaxAppeal USA. We pay it to the VAB on your behalf so you don't have to make a separate payment or trip to the county."],
["Why does Florida charge a filing fee when Texas and Georgia don't?", "Each state handles property tax appeals differently. Florida's VAB system requires a statutory filing fee under Florida Statute § 194.013, set individually by each county's Value Adjustment Board. Texas and Georgia do not charge a petition fee. TaxAppeal USA passes this fee through at cost — we don't mark it up."],
["How much can I save by appealing my Florida property taxes?", "It depends on the gap between your assessed value and your property's market value, and the Value Adjustment Board makes the final decision — no one can promise you a number. For scale: for tax year 2024 the Miami-Dade VAB reduced 14,856 residential parcels, shifting about $589 in tax per reduced parcel (Miami-Dade VAB, Form DR-529). Results differ sharply between counties — Marion County reduced 0 of 310 requested assessments in tax year 2022."],
["What is a TRIM notice in Florida?", "TRIM stands for Truth in Millage. It is the annual notice mailed every August showing your assessed value and estimated tax bill. This is NOT your final tax bill — it is a proposal you can challenge within 25 days."],
["What is the Value Adjustment Board in Florida?", "The VAB is a county board that hears property tax petitions in Florida. If you disagree with your property appraiser's assessment, you file a petition with the VAB. A Special Magistrate reviews the evidence and issues a recommended decision."],
["What is a Special Magistrate in Florida?", "A Special Magistrate is an independent hearing officer appointed by the Value Adjustment Board. They review comparable sales evidence presented by both the property owner and the county appraiser, then issue a recommended decision to the VAB."],
["Does TaxAppeal serve all Florida counties?", "We prepare petitions for Florida counties whose Value Adjustment Board mailing address and filing fee we have verified directly with the county — currently 52 of the 67. If your county is not yet verified we will tell you before you pay rather than mail a petition to an address we are not certain of."],
["Who signs the petition — me or TaxAppeal?", "You do. Florida Statute § 194.011(3) requires a VAB petition to be signed by the taxpayer, so we prepare your DR-486, show it to you to read, and you sign Part 3 yourself before you pay. TaxAppeal USA is not your representative or agent: we do not sign as a representative, we do not appear before the Board, and we file no power of attorney. We prepare the document, pay your county filing fee, and mail it."],
["Will TaxAppeal attend my VAB hearing?", "No. TaxAppeal USA is a document preparation and mailing service, not your representative, and cannot appear before the Board on your behalf. Many petitions are decided on the written evidence without anyone appearing. If a hearing is scheduled, attending is your decision — we notify you when we receive the notice, and your evidence package remains on the record either way."],
["Can my assessment go up if I appeal in Florida?", "No. Florida law protects petitioners. Your assessment cannot increase as a result of filing a VAB petition — there is zero risk to filing."],
["How does Florida's Save Our Homes cap affect my appeal?", "The Save Our Homes cap limits assessment increases on homestead properties to 3% or CPI per year. However if you recently purchased your home, the cap resets to market value. If your assessed value exceeds market value, you can still appeal regardless of the cap."],
["What evidence does TaxAppeal use for Florida appeals?", "We analyze comparable sales, current market conditions, property defects, and county record errors. Every letter cites Florida Statute § 194.011 and § 193.011."],
["How does TaxAppeal compare to other Florida firms?", "Most Florida firms charge 25–40% of your savings. On a $2,000 reduction that is $500–$800 in fees every year. TaxAppeal charges a flat $89 plus your county's mandatory VAB fee (typically $15–$50) — one time, no percentage cut."],
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



export default function Florida() {
const router = useRouter();
const [openFaq, setOpenFaq] = useState(null);

// Preserve UTM parameters through to /apply so Google Ads attribution works.
// Also pre-fills state=FL so the apply flow defaults to Florida.
const go = () => {
  const params = new URLSearchParams();
  params.set('state', 'FL');
  if (typeof window !== 'undefined') {
    const src = new URLSearchParams(window.location.search);
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid'].forEach(k => {
      if (src.get(k)) params.set(k, src.get(k));
    });
    // Store UTMs in sessionStorage so they survive across /apply steps
    if (src.get('utm_source')) {
      try { sessionStorage.setItem('taxappeal_utm', src.toString()); } catch(_) {}
    }
  }
  router.push(`/apply?${params.toString()}`);
};

// Capture gclid for Google Ads attribution on first load
useEffect(() => {
  if (typeof window === 'undefined') return;
  const src = new URLSearchParams(window.location.search);
  const gclid = src.get('gclid');
  if (gclid) {
    try { sessionStorage.setItem('taxappeal_gclid', gclid); } catch(_) {}
  }
}, []);

return (
<>
<Head>
<title>Florida Property Tax Appeal Service | $89 + County Fee | TaxAppeal USA</title>
<meta name="description" content="Appeal your Florida TRIM notice for $89 plus your county's mandatory VAB filing fee (set by each county, typically $15–$50). We draft your VAB petition, pay the county fee, and mail it to your county VAB 7+ days before your deadline. All 67 Florida counties." />
<link rel="canonical" href="https://www.taxappealusa.com/florida" />
<meta property="og:title" content="Florida Property Tax Appeal — $89 + County Fee | TaxAppeal USA" />
<meta property="og:description" content="Stop overpaying on Florida property taxes. $89 service fee plus your county's mandatory VAB filing fee (varies by county, typically $15–$50). You sign your petition; we pay the county fee and mail it. All 67 counties." />
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
"description": "Property tax appeal petition preparation, county VAB fee payment, and tracked mail filing for Florida homeowners. Covers all 67 counties.",
"offers": { "@type": "AggregateOffer", "lowPrice": "104.00", "highPrice": "139.00", "priceCurrency": "USD", "offerCount": "67" }
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
.cities-grid { grid-template-columns: 1fr 1fr !important; }
.compare-grid { grid-template-columns: 1fr !important; }
.hero-title { font-size: 30px !important; }
.testimonials-grid { grid-template-columns: 1fr !important; }
.included-grid { grid-template-columns: 1fr !important; }
.fee-breakdown { grid-template-columns: 1fr !important; }
}
`}</style>

{(() => {
  const preOrderOpen = new Date('2026-06-12');
  const windowOpen = new Date('2026-08-11');
  const windowClose = new Date('2026-09-18');
  const today = new Date();
  const barStyle = { background: C.gold, color: C.darkNavy, textAlign: 'center', padding: '10px 16px', fontSize: 14, fontWeight: 600 };
  if (today >= preOrderOpen && today < windowOpen) {
    const days = Math.ceil((windowOpen - today) / (1000*60*60*24));
    return (
      <div style={barStyle}>
        🔒 Reserve your Florida spot now — TRIM notices start arriving in {days} days. Lock in the $89 rate today; we file the moment your county's window opens. <a href="/apply" style={{ color: C.darkNavy, textDecoration: 'underline', marginLeft: 6, fontWeight: 700 }}>Get started →</a>
      </div>
    );
  }
  if (today >= windowOpen && today <= windowClose) {
    return (
      <div style={barStyle}>
        🚨 Florida's filing window is open — file before your county's 25-day deadline. <a href="/apply" style={{ color: C.darkNavy, textDecoration: 'underline', marginLeft: 6, fontWeight: 700 }}>Get started →</a>
      </div>
    );
  }
  return null;
})()}


{/* Nav */}
<div style={{ background: C.white, borderBottom: `1.5px solid ${C.border}`, padding: "16px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
<a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
<div style={{ width: 34, height: 34, background: C.navy, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🏠</div>
<div>
<div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: C.darkNavy }}>TaxAppeal USA</div>
<div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "1.5px", color: C.mutedGray }}>Property Tax Dispute</div>
</div>
</a>
<button className="btn-primary" style={{ padding: "10px 22px", fontSize: 14 }} onClick={go}>Start my dispute →</button>
</div>

{/* Hero */}
<section style={{ background: C.navy, padding: "64px 40px", color: C.white }}>
<JurisdictionOutcomes
          heading="What Florida VAB records show"
          intro="We are a new company and have no results of our own to show you yet. These are published county figures — read them alongside the caveat below, because Florida counties differ enormously."
          footnote="Florida VAB outcomes are not uniform: Marion County reduced 0 of 310 requested assessments in tax year 2022."
          cards={[
            {
              stat: "35%",
              head: "of residential Miami-Dade VAB petitions won a reduction",
              body: "The Board reduced 14,856 of the 41,942 residential petitions filed for tax year 2024. Counting only petitions the Board actually decided — excluding those withdrawn or settled — the rate was 57%.",
              source: "Miami-Dade County VAB, Form DR-529 Tax Impact Notice, Tax Year 2024",
              url: "https://www.miamidade.gov/resources/legal-ads/2025/2025-06-10-public-notice-tax-impact-of-vab.pdf",
            },
            {
              stat: "$589",
              head: "average tax reduction per residential parcel the Board reduced",
              body: "Miami-Dade’s VAB shifted $8.76 million in residential taxes across 14,856 reduced parcels in tax year 2024 — about $589 each, every year until the property is reassessed.",
              source: "Miami-Dade County VAB, Form DR-529 Tax Impact Notice, Tax Year 2024",
              url: "https://www.miamidade.gov/resources/legal-ads/2025/2025-06-10-public-notice-tax-impact-of-vab.pdf",
            },
            {
              stat: "$1.34B",
              head: "in residential taxable value removed in one county, in one year",
              body: "That is what Miami-Dade’s Value Adjustment Board took off the residential rolls for tax year 2024. Every dollar of it belonged to a homeowner who filed a petition before the deadline.",
              source: "Miami-Dade County VAB, Form DR-529 Tax Impact Notice, Tax Year 2024",
              url: "https://www.miamidade.gov/resources/legal-ads/2025/2025-06-10-public-notice-tax-impact-of-vab.pdf",
            },
          ]}
        />
</section>

{/* Price comparison */}
<section style={{ padding: "56px 40px", background: C.white }}>
<div style={{ maxWidth: 800, margin: "0 auto" }}>
<h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>TaxAppeal vs. Florida Property Tax Appeal Firms</h2>
<p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36, lineHeight: 1.7 }}>Most Florida firms charge 25–40% of your savings — every year. Here is how TaxAppeal's flat fee compares.</p>
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
<div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "1px", color: C.gold, marginBottom: 12 }}>TaxAppeal USA</div>
<div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: C.gold, marginBottom: 8 }}>$89 + county fee. Period.</div>
<p style={{ fontSize: 14, color: "#8596AF", lineHeight: 1.7, marginBottom: 16 }}>Same $2,000 reduction. You pay $89 plus your county's VAB fee (typically $15–$50) once and keep the rest. Every year after that, the savings are 100% yours.</p>
{["$89 service + your county's fee, that's it", "County VAB fee paid on your behalf", "Keep 100% of your savings", "Mailed 7+ days before your deadline"].map(item => (
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

{/* City directory.
    These 131 pages existed but nothing linked to them - /florida had no internal
    link to a single one, so they were reachable only through the sitemap. Grouped
    by county because county is what determines the board, the deadline and the
    filing fee. */}
<section style={{ padding: "56px 40px", background: C.white }}>
<div style={{ maxWidth: 980, margin: "0 auto" }}>
<h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>Florida cities we file in</h2>
<p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36, lineHeight: 1.6 }}>
Your deadline, filing fee and Value Adjustment Board are all set by your county — find yours below.
</p>
{Object.entries(
  floridaCities.reduce((acc, c) => {
    (acc[c.county] = acc[c.county] || []).push(c);
    return acc;
  }, {})
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([county, cities]) => (
    <div key={county} style={{ marginBottom: 26 }}>
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "1.5px", color: C.navy, fontWeight: 700, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${C.border}` }}>
        {county} County
      </div>
      <div className="cities-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "6px 16px" }}>
        {cities
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => (
            <Link key={c.slug} href={`/florida/${c.slug}`} style={{ fontSize: 13, color: C.bodyGray, padding: "4px 0", textDecoration: "none" }}>
              {c.name}
            </Link>
          ))}
      </div>
    </div>
  ))}
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

{/* CTA */}
<section style={{ background: C.navy, padding: "64px 40px", textAlign: "center" }}>
<h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 34, color: C.white, marginBottom: 12 }}>Ready to appeal your Florida property taxes?</h2>
<p style={{ fontSize: 16, color: "#8596AF", marginBottom: 8 }}>File before your county's VAB deadline. $89 flat plus the county filing fee — we never take a percentage.</p>
<p style={{ fontSize: 14, color: "#5A7A9F", marginBottom: 28 }}>$89 service fee plus your county's mandatory VAB filing fee (typically $15–$50) — the exact amount depends on your county. You sign your petition; we pay the county fee and mail it.</p>
<button className="btn-primary" style={{ background: C.gold, color: C.darkNavy, fontSize: 17, padding: "18px 44px" }} onClick={go}>
Start My Florida Appeal — $89 + County Fee →
</button>
</section>

{/* Footer */}
<footer style={{ background: C.darkNavy, padding: "24px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
<p style={{ color: C.mutedGray, fontSize: 12 }}>© 2026 TaxAppeal USA · customerservice@taxappealusa.com</p>
<div style={{ display: "flex", gap: 20 }}>
<a href="/texas" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Texas</a>
<a href="/georgia" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Georgia</a>
<a href="/florida" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Florida</a>
<a href="/terms" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Terms</a>
<a href="/privacy" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Privacy</a>
</div>
</footer>
</>
);
}
