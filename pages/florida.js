import Head from 'next/head';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

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
["How much can I save by appealing my Florida property taxes?", "The average Florida homeowner who appeals saves $800–$2,800 per year. Even after the $89 service fee plus your county's filing fee, a successful appeal typically pays for itself within the first month of savings."],
["What is a TRIM notice in Florida?", "TRIM stands for Truth in Millage. It is the annual notice mailed every August showing your assessed value and estimated tax bill. This is NOT your final tax bill — it is a proposal you can challenge within 25 days."],
["What is the Value Adjustment Board in Florida?", "The VAB is a county board that hears property tax petitions in Florida. If you disagree with your property appraiser's assessment, you file a petition with the VAB. A Special Magistrate reviews the evidence and issues a recommended decision."],
["What is a Special Magistrate in Florida?", "A Special Magistrate is an independent hearing officer appointed by the Value Adjustment Board. They review comparable sales evidence presented by both the property owner and the county appraiser, then issue a recommended decision to the VAB."],
["Does TaxAppeal serve all Florida counties?", "Yes. We serve all 67 Florida counties including Miami-Dade, Broward, Palm Beach, Hillsborough, Orange, Pinellas, Duval, Lee, and every other county in the state."],
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

const testimonials = [
{ name: "Michael R.", location: "Orange County", saved: "$2,200", quote: "The TRIM notice seemed way off compared to what my neighbors sold for. TaxAppeal put together the comparable sales evidence and handled everything — including the county fee. Got a reduction on the first try." },
{ name: "Patricia K.", location: "Broward County", saved: "$1,960", quote: "I didn't even know I could appeal. A friend told me about TaxAppeal and figured $89 plus a small county fee was worth a shot. Saved almost $2,000 a year — I wish I'd done this sooner." },
{ name: "David L.", location: "Palm Beach County", saved: "$3,100", quote: "Other firms wanted 35% of my savings. On a $3,100 reduction that would have been over $1,000 in fees every year. TaxAppeal charged $89 plus my county's filing fee. Not a hard decision." },
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
<meta name="description" content="Appeal your Florida TRIM notice for $89 plus your county's mandatory VAB filing fee (set by each county, typically $15–$50). We draft your VAB petition, pay the county fee, and mail it to your county VAB 7+ days before your deadline. 82% approval rate. All 67 Florida counties." />
<link rel="canonical" href="https://www.taxappealusa.com/florida" />
<meta property="og:title" content="Florida Property Tax Appeal — $89 + County Fee | TaxAppeal USA" />
<meta property="og:description" content="Stop overpaying on Florida property taxes. $89 service fee plus your county's mandatory VAB filing fee (varies by county, typically $15–$50). We handle everything including the county payment. All 67 counties." />
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
<div style={{ maxWidth: 900, margin: "0 auto" }}>
<div style={{ fontSize: 12, color: C.gold, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 16 }}>Florida Property Tax Appeal Service</div>
<h1 className="hero-title" style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, lineHeight: 1.15, marginBottom: 16 }}>
Appeal Your Florida Property Taxes — $89 + County Fee
</h1>
<p style={{ fontSize: 18, color: "#8596AF", lineHeight: 1.6, maxWidth: 640, marginBottom: 12 }}>
Stop overpaying. We draft a formal VAB petition, pay your county's mandatory filing fee on your behalf, and mail everything 7+ days before your deadline to ensure timely receipt. No percentage cuts. Keep 100% of your savings.
</p>

{/* Pricing breakdown banner */}
<div style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "14px 18px", marginBottom: 18, display: "inline-flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
<div style={{ fontSize: 13, color: "#8596AF", fontFamily: "'DM Sans', sans-serif" }}>
<span style={{ color: C.gold, fontWeight: 700 }}>$89</span> TaxAppeal service fee
</div>
<div style={{ fontSize: 13, color: "#5A7A9F" }}>+</div>
<div style={{ fontSize: 13, color: "#8596AF", fontFamily: "'DM Sans', sans-serif" }}>
<span style={{ color: C.gold, fontWeight: 700 }}>$15–$50</span> your county's VAB filing fee <span style={{ fontSize: 11, color: "#5A7A9F" }}>(set by your county, required by state law)</span>
</div>
<div style={{ fontSize: 13, color: "#5A7A9F" }}>=</div>
<div style={{ fontSize: 15, color: C.white, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>
$104–$139 total, depending on your county
</div>
</div>

<div style={{ background: "#C0392B", display: "inline-block", borderRadius: 6, padding: "8px 14px", fontSize: 13, color: C.white, fontWeight: 500, marginBottom: 24 }}>
⚠️ Florida requires RECEIPT by deadline — not just postmark. We file 7+ days early.
</div>

<div className="hero-stats" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 32 }}>
{[["82%", "Approval rate"], ["$2,100", "Avg. savings"], ["$89+", "Starting price"], ["67", "FL counties"]].map(([n, l]) => (
<div key={l} style={{ background: "#0F1F3D", borderRadius: 10, padding: "16px", textAlign: "center" }}>
<div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: C.gold }}>{n}</div>
<div style={{ fontSize: 11, color: "#5A7A9F", marginTop: 4 }}>{l}</div>
</div>
))}
</div>
<button className="btn-primary" style={{ background: C.gold, color: C.darkNavy, fontSize: 17, padding: "18px 44px" }} onClick={go}>
File My Florida Appeal — $89 + County Fee →
</button>
<div style={{ fontSize: 13, color: "#5A7A9F", marginTop: 12 }}>Takes about 4 minutes. $89 service fee + your county's VAB filing fee (varies by county, typically $15–$50). We handle the county payment for you.</div>
</div>
</section>

{/* Fee Transparency Section */}
<section style={{ padding: "48px 40px", background: "#FFF8E6", borderBottom: `1px solid #FFD97A` }}>
<div style={{ maxWidth: 800, margin: "0 auto" }}>
<h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, textAlign: "center", marginBottom: 8, color: C.darkNavy }}>
Why Florida Has an Extra County Filing Fee
</h2>
<p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 32, lineHeight: 1.7 }}>
Florida is the only state we serve that charges a mandatory county filing fee. Here's the full breakdown.
</p>
<div className="fee-breakdown" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
{[
["🏛️", "Your County's VAB Fee (varies)", "Required by Florida law (HB 7031, effective July 2025). Each county sets its own amount — typically $15 to $50. Paid directly to your county's Value Adjustment Board. We send a check on your behalf — you don't have to do anything."],
["🏠", "$89 TaxAppeal Service", "Your petition preparation, comparable sales analysis, AI-generated letter with legal citations, tracked mail filing sent 7+ days early, and email tracking."],
["💰", "$89 + Fee — Still Wins", "Contingency firms charge $500–$800 on a $2,000 reduction. With TaxAppeal you pay $89 plus your county's fee once, and keep the rest — every year after that, the savings are 100% yours."],
].map(([icon, title, desc]) => (
<div key={title} style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
<div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
<div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6, color: C.darkNavy }}>{title}</div>
<div style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.6 }}>{desc}</div>
</div>
))}
</div>
</div>
</section>

{/* What's Included */}
<section style={{ padding: "56px 40px", background: C.lightBlue }}>
<div style={{ maxWidth: 800, margin: "0 auto" }}>
<h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>Everything Included for $89 + Your County's Fee</h2>
<p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36, lineHeight: 1.7 }}>One payment covers the entire VAB petition process, including the county filing fee we pay on your behalf.</p>
<div className="included-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
{[
["📊", "Comparable Sales Analysis", "We pull recent sales of similar homes in your area to prove your assessed value exceeds fair market value under Florida Statute § 193.011."],
["✍️", "Formal VAB Petition (DR-486)", "A professionally drafted Value Adjustment Board petition citing Florida Statute § 194.011 with your property-specific data and comparable sales evidence."],
["💳", "County VAB Filing Fee Paid", "We pay your county's mandatory VAB filing fee (typically $15–$50, set by each county) on your behalf via check — so you don't need to make a separate payment or visit the county office."],
["📬", "Mailed Early, Tracked Delivery", "We file 7+ days before the 25-day deadline. Florida requires RECEIPT, not just postmark — so we build in a buffer and track delivery to confirm it arrives on time."],
["📧", "Email Confirmation & Tracking", "You receive a copy of your complete VAB petition and USPS tracking number immediately after filing."],
["🏛️", "Special Magistrate Ready", "Your petition is drafted to be effective before a Special Magistrate with clear comparable sales evidence and legal citations under § 194.011."],
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
["💳", "We Pay Your County's Filing Fee For You", "Florida's VAB requires a filing fee set by each county (HB 7031, typically $15–$50). We include a check payable to your county's VAB with your petition — one less thing for you to handle."],
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
<p style={{ fontSize: 16, color: "#8596AF", marginBottom: 8 }}>Join thousands of Florida homeowners saving money every year.</p>
<p style={{ fontSize: 14, color: "#5A7A9F", marginBottom: 28 }}>$89 service fee plus your county's mandatory VAB filing fee (typically $15–$50) — the exact amount depends on your county. We handle everything including the county payment.</p>
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
