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
  ["How much can I save by appealing my Florida property taxes?", "The average Florida homeowner who appeals saves $800 to $2,800 per year. With TaxAppeal at $79 flat, you keep 100% of those savings."],
  ["What is a TRIM notice in Florida?", "TRIM stands for Truth in Millage. It is the annual notice mailed every August showing your assessed value and estimated tax bill. This is NOT your final tax bill. It is a proposal you can challenge."],
  ["What is the Value Adjustment Board?", "The VAB is a county board that hears property tax petitions in Florida. If you disagree with your property appraiser assessment, you file a petition with the VAB. A Special Magistrate reviews the evidence."],
  ["Does TaxAppeal serve all Florida counties?", "Yes. We serve all 67 Florida counties including Miami-Dade, Broward, Palm Beach, Hillsborough, Orange, Pinellas, Duval, Lee, and every other county."],
  ["Can my assessment go up if I appeal in Florida?", "No. Florida law protects petitioners. Your assessment cannot increase as a result of filing a VAB petition."],
  ["What evidence does TaxAppeal use for Florida appeals?", "We analyze comparable sales, current market conditions, property defects, and county record errors. Every letter cites Florida Statute 194.011 and 193.011."],
  ["How does TaxAppeal compare to other Florida firms?", "Most Florida firms charge 25 to 40% of your savings. On a $2,000 reduction that is $500 to $800 in fees every year. TaxAppeal charges $79 flat."],
];

const counties = [
  "Miami-Dade County", "Broward County (Fort Lauderdale)", "Palm Beach County",
  "Hillsborough County (Tampa)", "Orange County (Orlando)", "Pinellas County (St. Pete)",
  "Duval County (Jacksonville)", "Lee County (Fort Myers)", "Polk County (Lakeland)",
  "Brevard County", "Volusia County (Daytona)", "Seminole County",
  "Pasco County", "Sarasota County", "Manatee County (Bradenton)",
  "Collier County (Naples)", "Osceola County (Kissimmee)", "St. Lucie County",
  "Lake County", "Escambia County (Pensacola)", "Leon County (Tallahassee)",
  "Alachua County (Gainesville)", "St. Johns County", "Clay County", "Marion County (Ocala)",
];

export default function Florida() {
  const router = useRouter();
  const [openFaq, setOpenFaq] = useState(null);
  const go = () => router.push('/apply');

  return (
    <>
      <Head>
        <title>Florida Property Tax Appeal Service | File for $79 | TaxAppeal</title>
        <meta name="description" content="Appeal your Florida property taxes for a flat $79 fee. We draft your VAB petition with comparable sales data and file via USPS certified mail. All 67 Florida counties." />
        <link rel="canonical" href="https://www.taxappealusa.com/florida" />
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
        <button className="btn-primary" style={{ padding: "10px 22px", fontSize: 14 }} onClick={go}>Start my dispute</button>
      </div>

      {/* Hero */}
      <section style={{ background: C.navy, padding: "64px 40px", color: C.white }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ fontSize: 12, color: C.gold, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 16 }}>Florida Property Tax Appeal Service</div>
          <h1 className="hero-title" style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, lineHeight: 1.15, marginBottom: 16 }}>Appeal Your Florida Property Taxes for $79 Flat</h1>
          <p style={{ fontSize: 18, color: "#8596AF", lineHeight: 1.6, maxWidth: 640, marginBottom: 12 }}>
            Stop overpaying. We draft a formal appeal backed by comparable sales data, legal citations under Florida Statute 194.011, and file your VAB petition via USPS certified mail. Flat $79. No contingency fees.
          </p>
          <div style={{ background: "#C0392B", display: "inline-block", borderRadius: 6, padding: "8px 14px", fontSize: 13, color: C.white, fontWeight: 500, marginBottom: 24 }}>
            ⚠️ Florida requires RECEIPT by deadline, not just postmark. We file 7+ days early.
          </div>
          <div className="hero-stats" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 32 }}>
            {[["82%", "Approval rate"], ["$2,100", "Avg. savings"], ["$79", "Flat fee"], ["67", "FL counties"]].map(([n, l]) => (
              <div key={l} style={{ background: "#0F1F3D", borderRadius: 10, padding: "16px", textAlign: "center" }}>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: C.gold }}>{n}</div>
                <div style={{ fontSize: 11, color: "#5A7A9F", marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>
          <button className="btn-primary" style={{ background: C.gold, color: C.darkNavy, fontSize: 17, padding: "18px 44px" }} onClick={go}>File My Florida Appeal — $79</button>
          <div style={{ fontSize: 13, color: "#5A7A9F", marginTop: 12 }}>Takes about 4 minutes. You will not be charged until your letter is ready.</div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: "56px 40px", background: C.white }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>How Florida Property Tax Appeals Work</h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36, lineHeight: 1.7 }}>Florida homeowners receive TRIM notices every August. You have 25 days to petition the Value Adjustment Board if your assessment is too high.</p>
          <div style={{ display: "grid", gap: 24 }}>
            {[
              ["📋", "Every August You Receive Your TRIM Notice", "Florida property appraisers mail Truth in Millage notices every August. This shows your assessed value as of January 1st and your estimated tax bill. Under Florida Statute 194.011, you have the right to challenge this value."],
              ["⚖️", "You Have 25 Days to Petition the VAB", "Under Florida Statute 194.011, you have 25 days from your TRIM notice to file a petition with the Value Adjustment Board. You can challenge value, assessment, or both. Florida requires RECEIPT by deadline, not just postmark."],
              ["📊", "Comparable Sales Build Your Case", "Florida law allows you to present comparable sales evidence proving the property appraiser overvalued your property. TaxAppeal analyzes 2.1 million recent transactions to build a data-backed case."],
              ["📬", "TaxAppeal Files 7+ Days Before Deadline", "Florida VAB petition deadlines fall in mid-September. Unlike Texas, Florida requires your petition to be RECEIVED, not just postmarked. TaxAppeal files at least 7 days early to ensure timely receipt."],
              ["✅", "Strong Cases Win Before the VAB", "A well-documented petition with comparable sales evidence gives you a strong position. The property appraiser must prove their assessment methodology is correct under Florida Statute 193.011."],
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

      {/* Price comparison */}
      <section style={{ padding: "56px 40px", background: C.bg }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>TaxAppeal vs. Florida Property Tax Appeal Firms</h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36, lineHeight: 1.7 }}>Most Florida firms charge 25 to 40% of your savings. Here is how TaxAppeal compares.</p>
          <div className="compare-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "1px", color: C.mutedGray, marginBottom: 12 }}>Typical Florida Firm</div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: "#C0392B", marginBottom: 8 }}>25 to 40% of savings</div>
              <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.7, marginBottom: 16 }}>On a $2,000 annual reduction, you would pay $500 to $800 in fees every single year.</p>
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

      {/* Counties */}
      <section style={{ padding: "56px 40px", background: C.white }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>We Serve All 67 Florida Counties</h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36 }}>From Miami to Jacksonville, Tampa to Orlando. Every Florida homeowner can file.</p>
          <div className="counties-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {counties.map(c => (
              <div key={c} style={{ fontSize: 13, color: C.bodyGray, padding: "8px 0", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: C.green, fontSize: 12 }}>✓</span> {c}
              </div>
            ))}
            <div style={{ fontSize: 13, color: C.navy, fontWeight: 500, padding: "8px 0" }}>+ 42 more counties</div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: "56px 40px", background: C.bg }}>
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
        <p style={{ fontSize: 16, color: "#8596AF", marginBottom: 28 }}>Join thousands of Florida homeowners saving money every year. $79 flat. No hidden fees.</p>
        <button className="btn-primary" style={{ background: C.gold, color: C.darkNavy, fontSize: 17, padding: "18px 44px" }} onClick={go}>Start My Florida Appeal — $79</button>
      </section>

      {/* Footer */}
      <footer style={{ background: C.darkNavy, padding: "24px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <p style={{ color: C.mutedGray, fontSize: 12 }}>© 2026 TaxAppeal USA</p>
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
