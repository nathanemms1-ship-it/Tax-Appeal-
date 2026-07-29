import Head from 'next/head';
import { useRouter } from 'next/router';
import JurisdictionOutcomes from '../components/JurisdictionOutcomes';

const C = {
  navy: "#1B3A6B", gold: "#FFC940", darkNavy: "#0F1F3D", bg: "#F4F7FC",
  lightBlue: "#EEF3FB", bodyGray: "#5A6B82", mutedGray: "#8596AF",
  border: "#E8EDF4", white: "#FFFFFF", green: "#2E7D52",
};

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap');`;

const faqs = [
  ["What is the deadline to protest property taxes in Texas?", "The deadline is May 15 or 30 days after you receive your Notice of Appraised Value, whichever is later. If you miss this window, you cannot protest until the following year."],
  ["How much can I save by protesting my Texas property taxes?", "The average Texas homeowner who protests saves $800–$2,500 per year. With TaxAppeal's flat $89 fee, you keep 100% of those savings — unlike firms that take 25–50% of what you save."],
  ["What is the success rate for property tax protests in Texas?", "Texas does not publish a statewide protest success rate — the Comptroller's ARB survey explicitly does not collect hearing results, so any statewide figure you see advertised is not coming from the state. The best available evidence is county-level: economists analysing Dallas Central Appraisal District records found that 69.7% of homeowner-filed protests won a reduction in 2020, with average first-year savings of $485 (American Economic Journal: Economic Policy, 2025). Outcomes vary by county and by property, and TaxAppeal cannot guarantee a reduction."],
  ["How does TaxAppeal compare to other Texas property tax protest companies?", "Most Texas protest firms charge 25–50% of your savings as a contingency fee. On a $2,000 reduction, that's $500–$1,000 in fees. TaxAppeal charges a flat $89 — you keep every dollar you save."],
  ["Do I need to attend a hearing if I file a property tax protest?", "Not necessarily. Many protests are resolved at the informal level without a hearing. TaxAppeal's certified mail filing creates an official record of your protest with the appraisal district."],
  ["What evidence does TaxAppeal use in my protest letter?", "We analyze comparable sales in your area, current market conditions, property-specific defects, and any discrepancies in county records. Every letter cites Texas Tax Code §41.41 and §41.43."],
  ["Which Texas counties does TaxAppeal serve?", "TaxAppeal serves all 254 Texas counties including Harris, Dallas, Tarrant, Bexar, Travis, Collin, Denton, Fort Bend, Williamson, Montgomery, and every other county in the state."],
  ["Can my property tax assessment go up if I protest?", "No. Texas law prevents your assessment from being raised as a result of your protest. There is zero risk to filing."],
  ["What is the Appraisal Review Board (ARB) in Texas?", "The Appraisal Review Board is an independent panel that hears property tax protests in Texas. If your informal hearing with the appraisal district doesn't result in an acceptable reduction, your case proceeds to the ARB where you present comparable sales evidence to a three-person panel."],
  ["Can I protest my Texas property taxes every year?", "Yes. Texas homeowners can file a new protest every single year. Your Notice of Appraised Value resets each spring, giving you a fresh window to challenge the value — even if you protested last year."],
  ["What is unequal appraisal and how does it help my Texas protest?", "Under Texas Tax Code §41.43, you can protest that your property is appraised higher than comparable properties — even if your value is accurate. This 'unequal appraisal' argument is powerful because it only requires showing neighboring homes with similar values are assessed lower, regardless of market value."],
  ["Which appraisal districts handle Texas property tax protests?", "Texas has 254 county appraisal districts (CADs), one per county. Major ones include the Harris County Appraisal District (HCAD), Dallas Central Appraisal District (DCAD), Tarrant Appraisal District (TAD), Bexar Appraisal District, and Travis Central Appraisal District (TCAD). TaxAppeal files with whichever CAD covers your property."],
];

const counties = [
  "Anderson County", "Andrews County", "Angelina County", "Aransas County",
  "Archer County", "Armstrong County", "Atascosa County", "Austin County",
  "Bailey County", "Bandera County", "Bastrop County", "Baylor County",
  "Bee County", "Bell County (Killeen)", "Bexar County (San Antonio)",
  "Blanco County", "Borden County", "Bosque County", "Bowie County",
  "Brazoria County", "Brazos County (Bryan/College Station)", "Brewster County",
  "Briscoe County", "Brooks County", "Brown County", "Burleson County",
  "Burnet County", "Caldwell County", "Calhoun County", "Callahan County",
  "Cameron County (Brownsville)", "Camp County", "Carson County", "Cass County",
  "Castro County", "Chambers County", "Cherokee County", "Childress County",
  "Clay County", "Cochran County", "Coke County", "Coleman County",
  "Collin County (Plano/Frisco)", "Collingsworth County", "Colorado County",
  "Comal County (New Braunfels)", "Comanche County", "Concho County",
  "Cooke County", "Coryell County", "Cottle County", "Crane County",
  "Crockett County", "Crosby County", "Culberson County", "Dallam County",
  "Dallas County (Dallas)", "Dawson County", "Deaf Smith County", "Delta County",
  "Denton County (Denton/Lewisville)", "DeWitt County", "Dickens County",
  "Dimmit County", "Donley County", "Duval County", "Eastland County",
  "Ector County (Odessa)", "Edwards County", "Ellis County (Waxahachie)",
  "El Paso County (El Paso)", "Erath County", "Falls County", "Fannin County",
  "Fayette County", "Fisher County", "Floyd County", "Foard County",
  "Fort Bend County (Sugar Land)", "Franklin County", "Freestone County",
  "Frio County", "Gaines County", "Galveston County (Galveston)",
  "Garza County", "Gillespie County (Fredericksburg)", "Glasscock County",
  "Goliad County", "Gonzales County", "Gray County", "Grayson County (Sherman)",
  "Gregg County (Longview)", "Grimes County", "Guadalupe County (Seguin)",
  "Hale County (Plainview)", "Hall County", "Hamilton County", "Hansford County",
  "Hardeman County", "Hardin County", "Harris County (Houston)",
  "Harrison County (Marshall)", "Hartley County", "Haskell County",
  "Hays County (San Marcos/Kyle)", "Hemphill County", "Henderson County",
  "Hidalgo County (McAllen)", "Hill County", "Hockley County", "Hood County",
  "Hopkins County", "Houston County", "Howard County (Big Spring)",
  "Hudspeth County", "Hunt County (Greenville)", "Hutchinson County",
  "Irion County", "Jack County", "Jackson County", "Jasper County",
  "Jeff Davis County", "Jefferson County (Beaumont)", "Jim Hogg County",
  "Jim Wells County", "Johnson County (Cleburne)", "Jones County",
  "Karnes County", "Kaufman County", "Kendall County (Boerne)",
  "Kenedy County", "Kent County", "Kerr County (Kerrville)", "Kimble County",
  "King County", "Kinney County", "Kleberg County", "Knox County",
  "Lamar County (Paris)", "Lamb County", "Lampasas County", "La Salle County",
  "Lavaca County", "Lee County", "Leon County", "Liberty County",
  "Limestone County", "Lipscomb County", "Live Oak County", "Llano County",
  "Loving County", "Lubbock County (Lubbock)", "Lynn County", "Madison County",
  "Marion County", "Martin County", "Mason County", "Matagorda County",
  "Maverick County (Eagle Pass)", "McCulloch County", "McLennan County (Waco)",
  "McMullen County", "Medina County", "Menard County", "Midland County (Midland)",
  "Milam County", "Mills County", "Mitchell County", "Montague County",
  "Montgomery County (Conroe/The Woodlands)", "Moore County", "Morris County",
  "Motley County", "Nacogdoches County", "Navarro County (Corsicana)",
  "Newton County", "Nolan County", "Nueces County (Corpus Christi)",
  "Ochiltree County", "Oldham County", "Orange County", "Palo Pinto County",
  "Panola County", "Parker County (Weatherford)", "Parmer County",
  "Pecos County", "Polk County", "Potter County (Amarillo)", "Presidio County",
  "Rains County", "Randall County (Canyon/Amarillo)", "Reagan County",
  "Real County", "Red River County", "Reeves County", "Refugio County",
  "Roberts County", "Robertson County", "Rockwall County (Rockwall)",
  "Runnels County", "Rusk County", "Sabine County", "San Augustine County",
  "San Jacinto County", "San Patricio County", "San Saba County",
  "Schleicher County", "Scurry County", "Shackelford County", "Shelby County",
  "Sherman County", "Smith County (Tyler)", "Somervell County",
  "Starr County (Rio Grande City)", "Stephens County", "Sterling County",
  "Stonewall County", "Sutton County", "Swisher County",
  "Tarrant County (Fort Worth/Arlington)", "Taylor County (Abilene)",
  "Terrell County", "Terry County", "Throckmorton County", "Titus County",
  "Tom Green County (San Angelo)", "Travis County (Austin)",
  "Trinity County", "Tyler County", "Upshur County", "Upton County",
  "Uvalde County", "Val Verde County (Del Rio)", "Van Zandt County",
  "Victoria County (Victoria)", "Walker County (Huntsville)", "Waller County",
  "Ward County", "Washington County", "Webb County (Laredo)",
  "Wharton County", "Wheeler County", "Wichita County (Wichita Falls)",
  "Wilbarger County", "Willacy County", "Williamson County (Round Rock/Georgetown)",
  "Wilson County", "Winkler County", "Wise County", "Wood County",
  "Yoakum County", "Young County", "Zapata County", "Zavala County",
];



const cities = [
  {
    name: "Houston",
    slug: "/houston",
    county: "Harris County (HCAD)",
    stats: ["516K accounts protested (2024)", "Harris County HCAD", "6.98% avg reduction"],
    desc: "Houston homeowners face some of the highest effective property tax rates in the nation. We prepare and mail your protest to the Harris County Appraisal District.",
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
    desc: "Fort Worth and the greater Tarrant County area have seen rapid appreciation. We prepare and mail your protest to the Tarrant Appraisal District before the May 15 deadline.",
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
        <title>Texas Property Tax Protest Service | File for $89 — TaxAppeal</title>
        <meta name="description" content="Protest your Texas property taxes for a flat $89 fee. We draft your dispute letter with comparable sales data and file via USPS certified mail. All 254 Texas counties." />
        <link rel="canonical" href="https://www.taxappealusa.com/texas" />
        <meta property="og:title" content="Texas Property Tax Protest — $89 Flat Fee | TaxAppeal" />
        <meta property="og:description" content="Stop overpaying on Texas property taxes. We prepare and mail your protest via certified mail for $89 flat. No contingency fees. Keep 100% of your savings." />
        <meta property="og:url" content="https://www.taxappealusa.com/texas" />
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
          "name": "Texas Property Tax Protest Filing",
          "provider": { "@type": "Organization", "name": "TaxAppeal USA" },
          "areaServed": { "@type": "State", "name": "Texas" },
          "description": "Property tax protest letter preparation and USPS certified mail filing for Texas homeowners. Covers all 254 counties.",
          "offers": { "@type": "Offer", "price": "89.00", "priceCurrency": "USD" }
        })}} />
      </Head>
      <style>{`
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
          <p style={{ fontSize: 15, color: C.bodyGray, textAlign: "center", marginBottom: 36 }}>From Houston to El Paso, Dallas to the Rio Grande Valley — every Texas homeowner can file.</p>
          <div className="counties-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
            {counties.map(c => (
              <div key={c} style={{ fontSize: 12, color: C.bodyGray, padding: "6px 4px", display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ color: C.green, fontSize: 11, flexShrink: 0 }}>✓</span> {c}
              </div>
            ))}
          </div>
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
        <p style={{ fontSize: 16, color: "#8596AF", marginBottom: 28 }}>Texas lets you protest your appraised value every single year. $89 flat — no hidden fees, no percentage cuts.</p>
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
          {[["Houston", "/houston"], ["Dallas", "/dallas"], ["Fort Worth", "/fort-worth"], ["Austin", "/austin"]].map(([name, href]) => (
            <a key={href} href={href} style={{ color: "#3A4F6A", fontSize: 11, textDecoration: "none" }}>{name}</a>
          ))}
        </div>
      </footer>
    </>
  );
}
