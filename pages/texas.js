import Head from 'next/head';
import { useRouter } from 'next/router';
import JurisdictionOutcomes from '../components/JurisdictionOutcomes';
import { texasCities } from '../lib/texasCities';
import { counties as ALL_COUNTIES } from '../lib/countyData';
import Breadcrumb from '../components/Breadcrumb';
import { SITE_ORIGIN } from '../lib/breadcrumbs';
import { currentTaxYear, deadlineShort, deadlineSentence } from '../lib/tx/protestDeadline';

import { C } from "../lib/theme";
import LogoMark from '../components/LogoMark';

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');`;

/* Derived, not typed. These strings carried a bare "May 15" — correct through the
   2026 season, wrong from 2027, when § 1.06 moves the floor to Monday 17 May. */
const TX_TAX_YEAR = currentTaxYear();
const TX_DEADLINE = deadlineShort(TX_TAX_YEAR);
const TX_DEADLINE_SENTENCE = deadlineSentence(TX_TAX_YEAR);

const faqs = [
  ["What is the deadline to protest property taxes in Texas?", `${TX_DEADLINE_SENTENCE} If you miss this window, you cannot protest until the following year.`],
  ["How much can I save by protesting my Texas property taxes?", "It depends on the gap between your appraised value and similar homes, and on the 10% homestead cap — a lower market value doesn't always lower your bill. That is why we check whether a protest will actually lower your tax bill, after caps and exemptions, before you pay. If it won't, we'll tell you, and we won't sell you one. We never promise a specific saving. With TaxAppeal's flat $89 kit you keep 100% of any saving — many firms take 25–50% of what you save."],
  ["What is the success rate for property tax protests in Texas?", "Texas does not publish a statewide protest success rate — the Comptroller's ARB survey explicitly does not collect hearing results, so any statewide figure you see advertised is not coming from the state. The best available evidence is county-level: economists analysing Dallas Central Appraisal District records found that 69.7% of homeowner-filed protests won a reduction in 2020, with average first-year savings of $485 (American Economic Journal: Economic Policy, 2025). Outcomes vary by county and by property, and TaxAppeal cannot guarantee a reduction."],
  ["How does TaxAppeal compare to other Texas property tax protest companies?", "Most Texas protest firms charge 25–50% of your savings as a contingency fee. On a $2,000 reduction, that's $500–$1,000 in fees. TaxAppeal charges a flat $89 for a ready-to-sign protest kit — you keep every dollar you save. The difference: we check the bill impact before you pay, and you sign and mail the protest yourself."],
  ["Do I need to attend a hearing if I file a property tax protest?", "Not necessarily. Many protests are settled at an informal conference with the appraisal district, and you can ask the ARB to decide on your written evidence. TaxAppeal USA does not represent you or attend for you: the appraisal district writes to you directly. Forward us anything it sends and we'll help you understand it."],
  ["What evidence goes in my TaxAppeal protest kit?", "The appraisal district's own roll: an equal-and-uniform comparison showing how similar homes near you are valued, under Texas Tax Code §41.43(b). The kit also includes Comptroller Form 50-132 filled in, a one-page checklist and a return envelope addressed to your appraisal district."],
  ["Which Texas counties does TaxAppeal serve?", "TaxAppeal prepares protest kits for all 254 Texas counties including Harris, Dallas, Tarrant, Bexar, Travis, Collin, Denton, Fort Bend, Williamson, Montgomery, and every other county in the state."],
  ["Can my property tax assessment go up if I protest?", "No. Texas law prevents your assessment from being raised as a result of your protest."],
  ["What is the Appraisal Review Board (ARB) in Texas?", "The Appraisal Review Board is an independent panel that hears property tax protests in Texas. If your informal hearing with the appraisal district doesn't result in an acceptable reduction, your case proceeds to the ARB where you present comparable sales evidence to a three-person panel."],
  ["Can I protest my Texas property taxes every year?", "Yes. Texas homeowners can file a new protest every single year. Your Notice of Appraised Value resets each spring, giving you a fresh window to challenge the value — even if you protested last year."],
  ["What is unequal appraisal and how does it help my Texas protest?", "Under Texas Tax Code §41.43, you can protest that your property is appraised higher than comparable properties — even if your value is accurate. This 'unequal appraisal' argument is powerful because it only requires showing neighboring homes with similar values are assessed lower, regardless of market value."],
  ["Which appraisal districts handle Texas property tax protests?", "Texas has 254 county appraisal districts (CADs), one per county. Major ones include the Harris County Appraisal District (HCAD), Dallas Central Appraisal District (DCAD), Tarrant Appraisal District (TAD), Bexar Appraisal District, and Travis Central Appraisal District (TCAD). The return envelope in your kit is addressed to whichever CAD covers your property."],
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
const counties = ALL_COUNTIES.filter(c => c.code === 'TX');



const cities = [
  {
    name: "Houston",
    slug: "/houston",
    county: "Harris County (HCAD)",
    stats: ["516K accounts protested (2024)", "Harris County HCAD", "6.98% avg reduction"],
    desc: "Houston homeowners face some of the highest effective property tax rates in the nation. We check first, then mail you a ready-to-sign protest for the Harris County Appraisal District.",
  },
  {
    name: "Dallas",
    slug: "/dallas",
    county: "Dallas County (DCAD)",
    stats: ["69.7% of self-filed protests won", "Dallas County DCAD", "AEJ:EP study, 2020"],
    desc: "Dallas property values have surged in recent years, making the appraisal district's mass-appraisal estimates increasingly inaccurate — and increasingly protestable.",
  },
  {
    name: "Fort Worth",
    slug: "/fort-worth",
    county: "Tarrant County (TAD)",
    stats: ["Annual protest right", "Tarrant Appraisal District", "Fast-growing market"],
    desc: `Fort Worth and the greater Tarrant County area have seen rapid appreciation. We check first, then mail you a ready-to-sign protest for the Tarrant Appraisal District, due by ${TX_DEADLINE}.`,
  },
  {
    name: "Austin",
    slug: "/austin",
    county: "Travis County (TCAD)",
    stats: ["187,741 protests filed (2024)", "Travis County TCAD", "Among highest TX rates"],
    desc: "Austin homeowners pay some of the highest property taxes in Texas. Travis County assessments have struggled to keep pace with volatile market swings — in both directions.",
  },
];

export default function Texas() {
  const router = useRouter();
  const go = () => router.push('/apply');

  return (
    <>
      <Head>
        <title>Texas Property Tax Protest Service | $89 Kit — TaxAppeal</title>
        <meta name="description" content="Protest your Texas property taxes for $89 flat. We check first, then mail you a ready-to-sign Form 50-132 protest kit. You sign it and mail it. All 254 counties." />
        <link rel="canonical" href="https://www.taxappealusa.com/texas" key="canonical" />
        <meta property="og:title" content="Texas Property Tax Protest — $89 Flat Fee | TaxAppeal" key="og:title" />
        <meta property="og:description" content="We check whether a protest will lower your Texas tax bill before you pay. If it will, we mail you a ready-to-sign protest kit for $89 flat. Keep 100% of your savings." key="og:description" />
        <meta property="og:url" content="https://www.taxappealusa.com/texas" key="og:url" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          "name": "Texas Property Tax Protest Kit",
          "provider": { "@type": "Organization", "name": "TaxAppeal USA" },
          "areaServed": { "@type": "State", "name": "Texas" },
          "description": "A check of whether a protest will lower the tax bill, then a ready-to-sign Form 50-132 protest kit mailed to the Texas homeowner, who signs it and mails it. Covers all 254 counties.",
          "offers": { "@type": "Offer", "price": "89.00", "priceCurrency": "USD" }
        })}} />
      
        {/* FAQPage JSON-LD removed 22 Aug 2026. Google withdrew the FAQ rich result on
            7 May 2026, so it produced nothing in a search result and was pure page
            weight. scripts/verify-pages.mjs has banned it since 10 Aug — but only
            sampled the Florida surface plus one county per state, so the entire
            Texas city, metro and hub set kept shipping it for twelve days. The
            guard now covers Texas too. The visible FAQ content stays; only the
            markup goes. (Bing still renders FAQ rich results — that is the one
            argument against this, and it loses to consistency with a decision the
            codebase already made and already enforces.) */}
      </Head>

      {/* dangerouslySetInnerHTML, not a text child: React escapes ' & > in text and the client does not, so the two differ and hydration re-renders the whole root. See pages/apply.js. */}
      <style dangerouslySetInnerHTML={{ __html: `
        ${FONT_IMPORT}
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: ${C.bg}; color: ${C.darkNavy}; }
        .btn-primary { background: ${C.navy}; color: #fff; border: none; border-radius: 8px; padding: 16px 36px; font-size: 16px; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; display: inline-block; transition: background 0.2s; }
        .btn-primary:hover { background: ${C.gold}; color: ${C.darkNavy}; }
        .faq-item { background: #fff; border: 1.5px solid ${C.border}; border-radius: 10px; margin-bottom: 10px; overflow: hidden; }
        .faq-q { padding: 16px 20px; font-size: 15px; font-weight: 500; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
        .faq-q:hover { background: ${C.bg}; }
        .faq-a { padding: 0 20px 16px; font-size: 14px; color: ${C.bodyGray}; line-height: 1.7; }
        .city-card { background: ${C.white}; border: 1.5px solid ${C.border}; border-radius: 14px; padding: 24px; text-decoration: none; color: inherit; display: block; transition: box-shadow 0.2s, border-color 0.2s; }
        .city-card:hover { box-shadow: 0 6px 24px rgba(27,58,107,0.10); border-color: ${C.navy}; }
        @media (max-width: 768px) {
          .hero-grid { grid-template-columns: 1fr 1fr !important; }
          .counties-grid { grid-template-columns: 1fr 1fr !important; }
          .compare-grid { grid-template-columns: 1fr !important; }
          .testimonials-grid { grid-template-columns: 1fr !important; }
          .included-grid { grid-template-columns: 1fr !important; }
          .cities-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 480px) {
          .cities-grid { grid-template-columns: 1fr !important; }
        }
      ` }} />

      {/* Nav */}
      <div style={{ background: C.white, borderBottom: `1.5px solid ${C.border}`, padding: "16px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <LogoMark />
          <div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: C.darkNavy }}>TaxAppeal</div>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "1.5px", color: C.mutedGray }}>Property Tax Dispute</div>
          </div>
        </a>
        <button className="btn-primary" style={{ padding: "10px 22px", fontSize: 14 }} onClick={go}>Check your property →</button>
      </div>

      {/* Hero */}

      <Breadcrumb
        trail={[{ name: 'Home', href: '/' }, { name: 'Texas' }]}
        selfUrl={`${SITE_ORIGIN}/texas`}
      />

      <section style={{ background: C.navy, padding: "64px 40px", color: C.white }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ fontSize: 12, color: C.gold, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 16 }}>Texas Property Tax Protest Service</div>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, lineHeight: 1.15, marginBottom: 16 }}>
            Protest Your Texas Property Taxes for $89 Flat
          </h1>
          <p style={{ fontSize: 18, color: C.mutedGray, lineHeight: 1.6, maxWidth: 640, marginBottom: 32 }}>
            We check whether a protest will actually lower your tax bill, after caps and exemptions, before you pay. If it won&apos;t, we&apos;ll tell you, and we won&apos;t sell you one. If it will, we mail you a ready-to-sign kit: Comptroller Form 50-132 filled in, the appraisal district&apos;s own numbers as evidence, and a return envelope addressed to the district. You sign it and mail it — a flat $89. Keep 100% of your savings.
          </p>
          <div className="hero-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 32 }}>
            {[["$89", "Flat fee"], ["0%", "Of your savings taken"], ["You", "Sign it and mail it"], ["254", "TX counties"]].map(([n, l]) => (
              <div key={l} style={{ background: C.darkNavy, borderRadius: 10, padding: "16px", textAlign: "center" }}>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: C.gold }}>{n}</div>
                <div style={{ fontSize: 11, color: "#5A7A9F", marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>
          <button className="btn-primary" style={{ background: C.gold, color: C.darkNavy, fontSize: 17, padding: "18px 44px" }} onClick={go}>
            Check My Texas Protest — $89 →
          </button>
          <div style={{ fontSize: 13, color: "#5A7A9F", marginTop: 12 }}>Before notices go out you can reserve your kit in most districts. It goes out once your district publishes its data, not the day notices arrive; we check again then, and refund you in full if the case is gone or the data comes too late.</div>
        </div>
      </section>

      {/* Published outcomes - on a light background so the source links and
          the disclaimer are legible. They were rendered in body-gray on navy. */}
      <section style={{ padding: "56px 40px", background: C.bg }}>
        <JurisdictionOutcomes
          heading="What Texas appraisal district records show"
          intro="Every figure here comes from an appraisal district's own published data or a peer-reviewed study of it — linked so you can check it yourself."
          
          cards={[
            {
              stat: "69.7%",
              head: "of homeowner-filed Dallas County protests won a reduction",
              body: "Economists analysing Dallas Central Appraisal District records found that homeowners who filed their own protest in 2020 succeeded 69.7% of the time. Average first-year saving on a successful protest: $485.",
              source: "Nathan, Perez-Truglia & Zentner, American Economic Journal: Economic Policy 17(1), 2025",
              url: "https://www.aeaweb.org/articles?id=10.1257%2Fpol.20220768",
            },
            {
              stat: "516,205",
              head: "accounts protested in Harris County in a single year",
              body: "Protesting is not unusual or adversarial in Texas — it is routine. HCAD processed more than half a million protested accounts in 2024, covering $516 billion in value.",
              source: "Harris Central Appraisal District, Annual Comprehensive Financial Report, YE 2024",
              url: "https://hcad.org/assets/uploads/pdf/ACFR-YE-2024_upload.pdf",
            },
            {
              stat: "70%",
              head: "of owner-filed Collin County homestead protests won a lower market value",
              body: "Collin County publishes every protest as open data: 9,731 of 13,910 owner-filed homestead protests in 2025 ended below the noticed market value. On taxable value the figure is 44% \u2014 Texas's 10% homestead cap can hold your taxes flat even when market value drops.",
              source: "Collin CAD Protest Data, Texas Open Data Portal, appraisal year 2025",
              url: "https://data.texas.gov/dataset/Collin-CAD-Protest-Data/xmrt-bxjr",
            },
          ]}
        />
      </section>


      {/* All 254 Counties */}
      <section style={{ padding: "56px 40px", background: C.white }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>All 254 Texas Counties Served</h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36 }}>From Houston to El Paso, Dallas to the Rio Grande Valley — every Texas homeowner can protest.</p>
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
          The 69 /texas/[city] pages had the same defect the Florida city pages
          had before round 6: they existed, they were in the sitemap, and nothing on
          the site linked to one. Grouped by county because county is what determines
          the board and the deadline, and the county heading links to that county's
          page — which is how the /counties/* set finally gets inbound links from
          more than one place. */}
      <section style={{ padding: "56px 40px", background: C.bg }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>Texas cities we cover</h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36, lineHeight: 1.6 }}>Your appraisal district, protest deadline and ARB are all set by your county — find your city below.</p>
          {Object.entries(
            texasCities.reduce((acc, c) => {
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
                      <a key={c.slug} href={`/texas/${c.slug}`} style={{ fontSize: 13, color: C.bodyGray, padding: "4px 0", textDecoration: "none" }}>
                        {c.name}
                      </a>
                    ))}
                </div>
              </div>
            ))}
        </div>
      </section>

      {/* ── CITY PAGES SECTION ── */}
      <section style={{ padding: "56px 40px", background: C.bg }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 12 }}>
            Texas City-Specific Protest Guides
          </h2>
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36, lineHeight: 1.7 }}>
            Each major Texas metro has its own appraisal district, deadlines, and local market data. Select your city for a tailored guide.
          </p>
          <div className="cities-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {cities.map(city => (
              <a key={city.slug} href={city.slug} className="city-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1.5px", color: C.gold, fontWeight: 600, marginBottom: 4 }}>
                      {city.county}
                    </div>
                    <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: C.darkNavy }}>
                      {city.name} Property Tax Protest
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
      <section style={{ padding: "56px 40px", background: C.white }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: "center", marginBottom: 36 }}>Texas Property Tax Protest FAQ</h2>
          {faqs.map(([q, a], i) => (
            <details key={i} className="faq-item">
              <summary className="faq-q">{q} <span style={{ color: C.mutedGray }}>▾</span></summary>
              <div className="faq-a">{a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: C.navy, padding: "64px 40px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 34, color: C.white, marginBottom: 12 }}>Ready to protest your Texas property taxes?</h2>
        <p style={{ fontSize: 16, color: C.mutedGray, marginBottom: 28 }}>Texas lets you protest your appraised value every single year. We check first; the kit is $89 flat — no percentage cuts. We do not file your protest: you sign it and mail it.</p>
        <button className="btn-primary" style={{ background: C.gold, color: C.darkNavy, fontSize: 17, padding: "18px 44px" }} onClick={go}>
          Start My Texas Protest — $89 →
        </button>
      </section>

      {/* Footer */}
      <footer style={{ background: C.darkNavy, padding: "24px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
          <p style={{ color: C.mutedGray, fontSize: 12 }}>© 2026 TaxAppeal USA · customerservice@taxappealusa.com</p>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <a href="/texas" style={{ color: C.gold, fontSize: 12, textDecoration: "none" }}>Texas</a>
            <a href="/georgia" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Georgia</a>
            <a href="/florida" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Florida</a>
            <a href="/terms" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Terms</a>
            <a href="/privacy" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Privacy</a>
          </div>
        </div>
        <div style={{ borderTop: `1px solid rgba(255,255,255,0.06)`, paddingTop: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <span style={{ color: "#3A4F6A", fontSize: 11 }}>Texas cities:</span>
          {[["Houston", "/houston"], ["Dallas", "/dallas"], ["Fort Worth", "/fort-worth"], ["Austin", "/austin"], ["San Antonio", "/san-antonio"], ["El Paso", "/el-paso"]].map(([name, href]) => (
            <a key={href} href={href} style={{ color: "#3A4F6A", fontSize: 11, textDecoration: "none" }}>{name}</a>
          ))}
        </div>
      </footer>
    </>
  );
}
