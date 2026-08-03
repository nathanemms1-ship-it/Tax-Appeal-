// pages/texas/[city].js
// Dynamic neighborhood/suburb pages for Texas property tax protests
// Creates 69 pages at /texas/[city-slug] e.g. /texas/plano-tx

import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { texasCities, getTxCityBySlug, getAllTxCitySlugs } from '../../lib/texasCities';

const C = {
  navy: "#1B3A6B",
  gold: "#FFC940",
  darkNavy: "#0F1F3D",
  bg: "#F4F7FC",
  lightBlue: "#EEF3FB",
  bodyGray: "#5A6B82",
  mutedGray: "#8596AF",
  border: "#E8EDF4",
  white: "#FFFFFF",
};

export default function TexasCityPage({ city }) {
  const [openFaq, setOpenFaq] = useState(null);

  if (!city) return <div>City not found</div>;

  const formattedSavings = city.avgSavings.toLocaleString();
  const formattedValue = city.medianValue.toLocaleString();

  const faqs = [
    {
      q: `How do I protest my ${city.name} property taxes?`,
      a: `You file a formal protest with the ${city.district} by May 15 or 30 days from your Notice of Appraised Value, whichever is later. TaxAppeal USA prepares your protest letter with comparable sales evidence and mails it via USPS certified mail — creating legal proof of timely filing.`,
    },
    {
      q: `How much can ${city.name} homeowners save by protesting?`,
      a: `It depends on the gap between your appraised value and your property's market value, and the appraisal district makes the final call — we cannot promise a number. For scale: a peer-reviewed study of Dallas Central Appraisal District records found the average first-year saving on a successful homeowner-filed protest was $485 in 2020 (American Economic Journal: Economic Policy, 2025), and higher-value homes generally have more at stake. Whatever the reduction is, you keep all of it — unlike contingency firms that take 25–40% of what you save, every year.`,
    },
    {
      q: `What is the ${city.name} property tax protest deadline?`,
      a: `The deadline is May 15, 2026, or 30 days after the ${city.district} mails your Notice of Appraised Value — whichever is later. Missing this deadline means waiting a full year to challenge your assessment.`,
    },
    {
      q: `Do I need to go to a hearing to protest my ${city.name} property taxes?`,
      a: `No. Many protests are resolved at the informal hearing level before a formal Appraisal Review Board (ARB) hearing. TaxAppeal's certified mail filing puts your protest on record and our evidence package is designed to win at the informal stage.`,
    },
    {
      q: `What evidence do I need to protest in ${city.name}?`,
      a: `The strongest evidence is comparable sales — homes similar to yours that sold for less than your assessed value. TaxAppeal uses real MLS and public records data to build your comparable sales case automatically based on your property details.`,
    },
    {
      q: `Is TaxAppeal USA's $89 fee worth it for ${city.name} homeowners?`,
      a: `The $89 is what you pay whether or not the district reduces your value — it buys the evidence, the letter, and the certified mail filing. The comparison worth making is against contingency firms, which charge 25–40% of your savings every year: on a $${formattedSavings} reduction that is up to $${Math.round(city.avgSavings * 0.35).toLocaleString()} a year, indefinitely. Ours is $89, once.`,
    },
  ];

  const steps = [
    { step: "1", title: "Enter Your Address", desc: `Provide your ${city.name} property address. TaxAppeal pulls your current ${city.district} assessed value and property details automatically.` },
    { step: "2", title: "We Build Your Case", desc: "Our system compiles comparable sales evidence from your neighborhood and generates a formal protest letter citing Texas Tax Code §41.41 and §41.43." },
    { step: "3", title: "We Mail via Certified Mail", desc: `Your protest is printed and mailed to the ${city.district} via USPS Certified Mail with Return Receipt — creating irrefutable legal proof of timely filing.` },
    { step: "4", title: "You Save Money", desc: `The appraisal district reviews your evidence and typically responds within 30–90 days. ${city.name} homeowners who protest save an average of $${formattedSavings} per year.` },
  ];

  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(f => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": { "@type": "Answer", "text": f.a }
    }))
  };

  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": "TaxAppeal USA",
    "description": `Property tax protest service for ${city.name}, ${city.county} County, Texas`,
    "url": `https://www.taxappealusa.com/texas/${city.slug}`,
    "areaServed": { "@type": "City", "name": city.name, "containedInPlace": { "@type": "State", "name": "Texas" } },
    "offers": { "@type": "Offer", "price": "89.00", "priceCurrency": "USD" },
    "priceRange": "$89"
  };

  return (
    <>
      <Head>
        {/* Single template literal — see pages/florida/[city].js. The two-child form
            served `Midland<!-- --> Property Tax Protest Service | ...`. */}
        <title>{`${city.name} Property Tax Protest Service | File for $89 | TaxAppeal USA`}</title>
        <meta name="description" content={`Protest your ${city.name} property taxes for $89 flat. ${city.county} County homeowners save an average of $${formattedSavings}/year. We file with ${city.district} via certified mail. No percentage cuts.`} />
        <link rel="canonical" href={`https://www.taxappealusa.com/texas/${city.slug}`} />
        <meta property="og:title" content={`${city.name} Property Tax Protest — $89 Flat Fee | TaxAppeal USA`} />
        <meta property="og:description" content={`Protest your ${city.name} property taxes for $89 flat. Certified mail filing. No percentage cuts — you keep every dollar of any reduction.`} />
        <meta property="og:url" content={`https://www.taxappealusa.com/texas/${city.slug}`} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }} />
      </Head>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'DM Sans',sans-serif;background:${C.bg};color:${C.darkNavy};}
        .container{max-width:900px;margin:0 auto;padding:0 24px;}
        .btn-primary{background:${C.navy};color:#fff;border:none;border-radius:8px;padding:16px 36px;font-size:16px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:background 0.2s;}
        .btn-primary:hover{background:${C.gold};color:${C.darkNavy};}
        .btn-gold{background:${C.gold};color:${C.darkNavy};border:none;border-radius:8px;padding:18px 44px;font-size:17px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;}
        @media(max-width:768px){
          .hero-stats{grid-template-columns:1fr 1fr !important;}
          .hero-title{font-size:28px !important;}
          .steps-grid{grid-template-columns:1fr 1fr !important;}
          .compare-grid{grid-template-columns:1fr !important;}
          .info-grid{grid-template-columns:1fr !important;}
        }
      `}</style>

      {/* Nav */}
      <div style={{ background: C.white, borderBottom: `1.5px solid ${C.border}`, padding: "16px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{ width: 34, height: 34, background: C.navy, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🏠</div>
          <div>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: C.darkNavy }}>TaxAppeal USA</div>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "1.5px", color: C.mutedGray }}>Property Tax Dispute</div>
          </div>
        </a>
        <Link href="/apply"><button className="btn-primary" style={{ padding: "10px 22px", fontSize: 14 }}>Start my protest →</button></Link>
      </div>

      {/* Breadcrumb */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: "10px 40px" }}>
        <div className="container" style={{ padding: 0 }}>
          <p style={{ fontSize: 13, color: C.mutedGray }}>
            <a href="/" style={{ color: C.mutedGray, textDecoration: "none" }}>Home</a>
            {" → "}
            <a href="/texas" style={{ color: C.mutedGray, textDecoration: "none" }}>Texas</a>
            {" → "}
            <a href={`/counties/${city.countySlug}`} style={{ color: C.mutedGray, textDecoration: "none" }}>{city.county} County</a>
            {" → "}
            <span style={{ color: C.darkNavy }}>{city.name}</span>
          </p>
        </div>
      </div>

      {/* Hero */}
      <section style={{ background: C.navy, padding: "64px 40px", color: C.white }}>
        <div className="container">
          <div style={{ fontSize: 12, color: C.gold, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 16 }}>
            {city.name}, Texas — {city.metro} Metro — Property Tax Protest
          </div>
          <h1 className="hero-title" style={{ fontFamily: "'DM Serif Display',serif", fontSize: 42, lineHeight: 1.15, marginBottom: 16 }}>
            {city.name} Property Tax Protest — $89 Flat Fee
          </h1>
          <p style={{ fontSize: 18, color: "#8596AF", lineHeight: 1.6, maxWidth: 640, marginBottom: 32 }}>
            {city.description} TaxAppeal files your formal protest with the {city.district} — backed by comparable sales data and certified mail — for a flat $89.
          </p>
          <div className="hero-stats" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 32 }}>
            {[
              ["$89", "Flat fee, any outcome"],
              ["0%", "Of your savings taken"],
              ["$89", "Flat fee"],
              [city.county + " Co.", "Service area"],
            ].map(([n, l]) => (
              <div key={l} style={{ background: "#0F1F3D", borderRadius: 10, padding: "16px", textAlign: "center" }}>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: n.length > 8 ? 14 : 26, color: C.gold }}>{n}</div>
                <div style={{ fontSize: 11, color: "#5A7A9F", marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>
          <Link href="/apply">
            <button className="btn-gold" style={{ fontSize: 17, padding: "18px 44px" }}>
              File My {city.name} Protest — $89 →
            </button>
          </Link>
          <div style={{ fontSize: 13, color: "#5A7A9F", marginTop: 12 }}>Takes about 4 minutes. You won&apos;t be charged until your letter is ready.</div>
        </div>
      </section>

      {/* Why Protest */}
      <section style={{ padding: "56px 40px", background: C.white }}>
        <div className="container">
          <h2 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>
            Why {city.name} Homeowners Should Protest
          </h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36, lineHeight: 1.7 }}>
            Texas law lets you protest your appraised value every single year, at no cost to file. {city.name} homeowners have strong grounds — here&apos;s why.
          </p>
          <div style={{ display: "grid", gap: 24 }}>
            {[
              ["📊", `${city.district} Uses Mass Appraisal`, `The ${city.district} appraises thousands of properties using statistical models that apply broad market trends to entire neighborhoods. Your home's specific condition, updates, and location nuances are often missed — leading to inflated assessments.`],
              ["📈", "Median Home Value Creates High Stakes", `With a median home value of $${formattedValue} in ${city.name}, even a 5% over-assessment means $${Math.round(city.medianValue * 0.05 * 0.025).toLocaleString()} in excess annual taxes. Protesting is one of the highest-ROI financial decisions a homeowner can make.`],
              ["⚖️", "Texas Law Guarantees Your Right to Protest", `Under Texas Tax Code §41.41, every ${city.county} County homeowner has the legal right to protest their assessed value every single year. You don't need an attorney. TaxAppeal handles the evidence, the letter, and the certified mail filing.`],
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

      {/* How It Works */}
      <section style={{ padding: "56px 40px", background: C.lightBlue }}>
        <div className="container">
          <h2 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>
            How TaxAppeal Works in {city.name}
          </h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36, lineHeight: 1.7 }}>
            Four steps. About 4 minutes of your time. You sign the protest; we do the rest.
          </p>
          <div className="steps-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 20 }}>
            {steps.map(s => (
              <div key={s.step} style={{ background: C.white, borderRadius: 12, padding: 24, textAlign: "center", border: `1px solid ${C.border}` }}>
                <div style={{ width: 44, height: 44, background: C.navy, color: C.gold, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Serif Display',serif", fontSize: 20, margin: "0 auto 16px" }}>{s.step}</div>
                <h3 style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>{s.title}</h3>
                <p style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.6 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* District Info */}
      <section style={{ padding: "56px 40px", background: C.white }}>
        <div className="container">
          <h2 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>
            About the {city.district}
          </h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36, lineHeight: 1.7 }}>
            The {city.district} handles property valuations for {city.name} and surrounding {city.county} County communities.
          </p>
          <div className="info-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {[
              ["📅", "2026 Protest Deadline", "May 15, 2026, or 30 days from your Notice of Appraised Value mailing date — whichever is later. File early; informal hearing slots fill up fast."],
              ["📬", "How TaxAppeal Files", `We mail your protest letter with comparable sales evidence via USPS Certified Mail with Return Receipt to the ${city.district} — creating irrefutable legal proof of timely filing.`],
              ["📋", "The ARB Process", "If your protest isn't resolved at the informal level, it goes to the Appraisal Review Board (ARB) — an independent panel. TaxAppeal notifies you and provides guidance at each stage."],
              ["🔗", "Appraisal District Website", `Visit the ${city.district}'s website to look up your current assessed value, download your property record card, and verify your account number before filing.`],
            ].map(([icon, title, desc]) => (
              <div key={title} style={{ background: C.lightBlue, borderRadius: 12, padding: 24 }}>
                <div style={{ fontSize: 24, marginBottom: 10 }}>{icon}</div>
                <h3 style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.7 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Fee Comparison */}
      <section style={{ padding: "56px 40px", background: C.bg }}>
        <div className="container">
          <h2 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>
            $89 Flat vs. Contingency Firms
          </h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36, lineHeight: 1.7 }}>
            Every other {city.name} property tax protest service charges a percentage of your savings — every year.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15, background: C.white, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}` }}>
              <thead>
                <tr style={{ background: C.navy, color: C.white }}>
                  <th style={{ padding: "14px 20px", textAlign: "left" }}>Service</th>
                  <th style={{ padding: "14px 20px", textAlign: "center" }}>Fee Structure</th>
                  <th style={{ padding: "14px 20px", textAlign: "center" }}>Cost on ${formattedSavings} Win</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ fontWeight: 600 }}>
                  <td style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, color: C.navy }}>✓ TaxAppeal USA</td>
                  <td style={{ padding: "14px 20px", textAlign: "center", borderBottom: `1px solid ${C.border}` }}>$89 flat fee</td>
                  <td style={{ padding: "14px 20px", textAlign: "center", borderBottom: `1px solid ${C.border}`, color: "#16a34a" }}>$89</td>
                </tr>
                <tr style={{ background: C.bg }}>
                  <td style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>Ownwell</td>
                  <td style={{ padding: "14px 20px", textAlign: "center", borderBottom: `1px solid ${C.border}` }}>25–35% of savings</td>
                  <td style={{ padding: "14px 20px", textAlign: "center", borderBottom: `1px solid ${C.border}`, color: "#dc2626" }}>${Math.round(city.avgSavings * 0.30).toLocaleString()}</td>
                </tr>
                <tr>
                  <td style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>O&apos;Connor / CutMyTaxes</td>
                  <td style={{ padding: "14px 20px", textAlign: "center", borderBottom: `1px solid ${C.border}` }}>30–50% of savings</td>
                  <td style={{ padding: "14px 20px", textAlign: "center", borderBottom: `1px solid ${C.border}`, color: "#dc2626" }}>${Math.round(city.avgSavings * 0.40).toLocaleString()}</td>
                </tr>
                <tr style={{ background: C.bg }}>
                  <td style={{ padding: "14px 20px" }}>Local Tax Attorney</td>
                  <td style={{ padding: "14px 20px", textAlign: "center" }}>$300–$800+</td>
                  <td style={{ padding: "14px 20px", textAlign: "center", color: "#dc2626" }}>$500+</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Legal */}
      <section style={{ padding: "56px 40px", background: C.white }}>
        <div className="container">
          <h2 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28, marginBottom: 20 }}>
            Texas Property Tax Protest Law
          </h2>
          <div style={{ background: C.lightBlue, borderRadius: 12, padding: "28px 32px", borderLeft: `4px solid ${C.navy}` }}>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: C.darkNavy, marginBottom: 16 }}>
              Under <strong>Texas Tax Code §41.41</strong>, every {city.county} County homeowner has the legal right to protest their assessed value annually — on grounds of market value (§41.43(a)) or unequal appraisal (§41.43(b)).
            </p>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: C.darkNavy, marginBottom: 16 }}>
              The protest deadline is <strong>May 15 or 30 days from your notice mailing date</strong> — whichever is later. Texas Tax Code §41.44 governs timely filing requirements.
            </p>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: C.darkNavy }}>
              TaxAppeal USA prepares your formal protest and sends it to the {city.district} via USPS Certified Mail with Return Receipt — so you have legally admissible proof of timely filing.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: "56px 40px", background: C.bg }}>
        <div className="container">
          <h2 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 30, textAlign: "center", marginBottom: 36 }}>
            {city.name} Property Tax Protest FAQ
          </h2>
          {faqs.map((faq, i) => (
            <div key={i} style={{ background: C.white, border: `1.5px solid ${openFaq === i ? C.navy : C.border}`, borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
              <div onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ padding: "16px 20px", fontSize: 15, fontWeight: 500, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {faq.q}
                <span style={{ color: C.mutedGray, transform: openFaq === i ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0, marginLeft: 12 }}>▾</span>
              </div>
              {openFaq === i && <div style={{ padding: "0 20px 16px", fontSize: 14, color: C.bodyGray, lineHeight: 1.7 }}>{faq.a}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: C.navy, padding: "64px 40px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 34, color: C.white, marginBottom: 12 }}>
          Ready to protest your {city.name} property taxes?
        </h2>
        <p style={{ fontSize: 16, color: "#8596AF", marginBottom: 28, maxWidth: 560, margin: "0 auto 28px" }}>
          Join {city.name} homeowners saving an average of ${formattedSavings}/year. $89 flat — no hidden fees, no percentage cuts.
        </p>
        <Link href="/apply">
          <button className="btn-gold">Start My {city.name} Protest — $89 →</button>
        </Link>
        <p style={{ fontSize: 13, color: "#5A7A9F", marginTop: 16 }}>
          Texas Tax Code §41.41 · {city.district} · USPS Certified Mail Filing
        </p>
      </section>

      {/* Footer */}
      <footer style={{ background: C.darkNavy, padding: "24px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <p style={{ color: C.mutedGray, fontSize: 12 }}>© 2026 TaxAppeal USA · customerservice@taxappealusa.com</p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {[["Texas", "/texas"], ["Georgia", "/georgia"], ["Florida", "/florida"], ["Houston", "/houston"], ["Dallas", "/dallas"], ["Fort Worth", "/fort-worth"], ["Austin", "/austin"], ["San Antonio", "/san-antonio"], ["Atlanta", "/atlanta"], ["Miami", "/miami"], ["Tampa", "/tampa"], ["Terms", "/terms"], ["Privacy", "/privacy"]].map(([label, href]) => (
            <a key={href} href={href} style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>{label}</a>
          ))}
        </div>
      </footer>
    </>
  );
}

export async function getStaticPaths() {
  const paths = getAllTxCitySlugs();
  return { paths, fallback: false };
}

export async function getStaticProps({ params }) {
  const city = getTxCityBySlug(params.city);
  if (!city) return { notFound: true };
  return { props: { city } };
}
