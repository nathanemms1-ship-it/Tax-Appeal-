import Head from "next/head";
import Link from "next/link";
import { getAllCountySlugs, getCountyBySlug } from "../../lib/countyData";
import { taglineFor } from '../../lib/flTaglines';

const C = {
  navy: "#1B2A4A",
  navyLight: "#243454",
  gold: "#C9A84C",
  goldDim: "#8B6F2E",
  white: "#FFFFFF",
  offWhite: "#F8F7F4",
  text: "#1A1A2E",
  muted: "#666680",
  green: "#1A7A4A",
};

const stateTerms = {
  TX: { verb: "protest", noun: "protest", deadline: "May 15", process: "Appraisal Review Board (ARB) hearing", form: "Form 50-132", year: "2026" },
  GA: { verb: "appeal", noun: "appeal", deadline: "April 1", process: "Board of Equalization (BOE) hearing", form: "Form PT-311A", year: "2026" },
  FL: { verb: "petition", noun: "appeal", deadline: "25 days after TRIM notice (September)", process: "Value Adjustment Board (VAB) petition", form: "Form DR-486", year: "2026" },
  AR: { verb: "appeal", noun: "appeal", deadline: "Board of Equalization deadline", process: "County Board of Equalization hearing", form: "a written appeal to the County Board of Equalization", year: "2026" },
  AL: { verb: "appeal", noun: "appeal", deadline: "30 days after your valuation notice", process: "Board of Equalization hearing", form: "a written protest to the Board of Equalization", year: "2026" },
};

// Fallback so any state code (including future launches) always renders and never breaks the build.
const DEFAULT_TERMS = { verb: "appeal", noun: "appeal", deadline: "your county deadline", process: "Board of Equalization hearing", form: "a property tax appeal petition", year: "2026" };
const termsFor = (county) => stateTerms[county.code] || DEFAULT_TERMS;

const stateNames = { TX: "Texas", GA: "Georgia", FL: "Florida", AR: "Arkansas", AL: "Alabama" };

// Concise, self-contained answer placed at the top of the page.
// Leads with the direct answer + year + deadline + form + statute — the format
// AI engines (ChatGPT, Perplexity, Google AI Overviews) extract and cite.
const directAnswer = (county) => {
  const t = termsFor(county);
  if (county.code === "FL") {
    return `To appeal your ${county.name} County property taxes in 2026, file a Value Adjustment Board petition (${t.form}) within 25 days of your TRIM notice — typically by mid-September. Include evidence of overassessment such as recent comparable sales, and pay your county's VAB filing fee. Filing is authorized under ${county.statute}. TaxAppeal USA prepares your DR-486 petition, you sign it yourself as ${county.statute} requires, and we pay the county filing fee and mail it to the ${county.district} for a flat $89 plus that fee. TaxAppeal USA is not your representative and does not appear before the Board.`;
  }
  if (county.code === "GA") {
    return `To appeal your ${county.name} County property taxes in 2026, file a property tax appeal (${t.form}) with the ${county.district} within 45 days of your annual assessment notice. Support your appeal with comparable sales showing your home is overvalued. Appeals are authorized under ${county.statute}. TaxAppeal USA writes and certified-mails your appeal for a flat $89 — no percentage of your savings.`;
  }
  if (county.code === "TX") {
    return `To protest your ${county.name} County property taxes in 2026, file a Notice of Protest (${t.form}) with the ${county.district} by May 15 — or within 30 days of your appraisal notice, whichever is later. Include comparable sales showing your home is overassessed. Protests are authorized under ${county.statute}. TaxAppeal USA writes and certified-mails your protest for a flat $89 — no percentage of your savings.`;
  }
  return `To appeal your ${county.name} County property taxes in 2026, file ${t.form} with the ${county.district} by ${county.deadline}. Support your appeal with recent comparable sales showing your home is assessed above market value. Appeals are authorized under ${county.statute}. TaxAppeal USA prepares and certified-mails your appeal for a flat $89 — no percentage of your savings.`;
};

// Real, informational appeal steps — marked up as HowTo schema for AI/rich results.
const howToSteps = (county) => {
  if (county.code === "FL") {
    return [
      { name: "Review your TRIM notice", text: `Check the assessed value on your ${county.name} County TRIM (Truth in Millage) notice, mailed in August.` },
      { name: "Gather your evidence", text: "Collect recent comparable sales and any documentation showing your home is worth less than its assessed value." },
      { name: "Complete Form DR-486", text: "Fill out the Value Adjustment Board petition (Form DR-486) for your parcel." },
      { name: "File within 25 days", text: `File the petition with the ${county.district} and pay the county VAB filing fee within 25 days of your TRIM notice.` },
    ];
  }
  if (county.code === "GA") {
    return [
      { name: "Review your assessment notice", text: `Check the value on your ${county.name} County annual notice of assessment, mailed in spring.` },
      { name: "Gather your evidence", text: "Collect recent comparable sales showing your home is assessed above market value." },
      { name: "Complete Form PT-311A", text: "Fill out the Georgia Appeal of Assessment form (PT-311A) for your property." },
      { name: "File within 45 days", text: `File your appeal with the ${county.district} within 45 days of the notice date.` },
    ];
  }
  if (county.code === "TX") {
    return [
      { name: "Review your appraisal notice", text: `Check the appraised value on your ${county.name} County notice of appraised value, mailed in spring.` },
      { name: "Gather your evidence", text: "Collect comparable sales and photos showing your home is appraised above market value." },
      { name: "File a Notice of Protest", text: "Complete Form 50-132 (Notice of Protest) for your property." },
      { name: "File by May 15", text: `Submit your protest to the ${county.district} by May 15, or within 30 days of your notice.` },
    ];
  }
  return [
    { name: "Review your assessment notice", text: `Check the value on your ${county.name} County property tax assessment notice.` },
    { name: "Gather your evidence", text: "Collect recent comparable sales showing your home is assessed above market value." },
    { name: "Prepare your appeal", text: "Complete your county's property tax appeal petition for your parcel." },
    { name: "File by the deadline", text: `File your appeal with the ${county.district} by ${county.deadline}.` },
  ];
};

const faqs = (county) => {
  const t = termsFor(county);
  return [
    {
      q: `What is the deadline to ${t.verb} property taxes in ${county.name} County, ${county.state}?`,
      a: `The ${county.name} County property tax ${t.verb} deadline is ${county.deadline} (or 30 days after your assessment notice, whichever is later). Under ${county.statute}, you must file your ${t.verb} before this date or lose the right to challenge your assessment for the year.`,
    },
    {
      q: `How does TaxAppeal USA handle my ${county.name} County ${t.verb}?`,
      a: `We generate a professional protest letter using your ${county.name} County property data, comparable sales in your area, and the specific legal arguments that work best with the ${county.district}. You review and sign it, then we send it via trackable USPS mail in your name — filed as your own protest.`,
    },
    {
      q: `How much can I save on my ${county.name} County property taxes?`,
      // "10-20% / $600-$2,000+" had no source. Replaced with a figure that does.
      a: `It depends entirely on the gap between your assessment and your property's market value, and your county makes the final call. For scale, Harris County reported an average value reduction of 6.98% across 516,205 protested accounts in 2024 (HCAD Annual Comprehensive Financial Report). TaxAppeal USA charges a flat $89 — versus the 25–50% of your savings that contingency firms take, every year.`,
    },
    {
      q: `What appraisal district handles ${county.name} County?`,
      a: `${county.name} County property tax ${t.verb}s are handled by the ${county.district}. TaxAppeal USA directs your filing to the correct address automatically.`,
    },
    {
      q: `Is it worth protesting my ${county.name} County property taxes?`,
      // "Between 60-80%" traced to an uncited vendor blog post, not to any agency
      // or study, and was rendering on 572 county pages. See lib/stats.js.
      a: `It costs nothing to file in most counties, and TaxAppeal USA charges a flat $89. Outcome rates are not published by every state — where they are, they vary widely: a peer-reviewed study of Dallas County records found 69.7% of homeowner-filed protests won a reduction in 2020 (American Economic Journal: Economic Policy, 2025), while Florida counties reported anywhere from 57% down to 0% for tax year 2024. Your county decides, and we cannot promise a result.`,
    },
    {
      q: `Do I need to attend a hearing for my ${county.name} County ${t.verb}?`,
      // This used to answer "Not with TaxAppeal USA." We are a document preparation
      // and mailing service and cannot appear for you, so answering a
      // hearing-attendance question that way implied representation we do not
      // provide - and left the owner believing someone would be there.
      a: `That decision is yours. Many ${county.state} ${t.verb}s are resolved on the written evidence without anyone appearing. If a formal hearing is scheduled, TaxAppeal USA cannot attend for you — we are a document preparation and mailing service, not your representative — so you would attend yourself or choose not to. We notify you when we receive a hearing notice, and your evidence package stays on the record either way.`,
    },
  ];
};

export default function CountyPage({ county, lastUpdated, lastUpdatedISO }) {
  if (!county) return <div style={{ padding: 40, color: C.text }}>County not found.</div>;

  const t = termsFor(county);
  const action = county.code === "TX" ? "Protest" : "Appeal";
  const title = `${county.name} County Property Tax ${action} 2026 | TaxAppeal USA`;
  const description = `${county.name} County, ${county.state} property tax ${t.verb} for 2026 — deadline ${county.deadline}. TaxAppeal USA mails your ${t.noun} to the ${county.district} for $89 flat.`;
  const canonicalUrl = `https://www.taxappealusa.com/counties/${county.slug}`;

  const faqList = faqs(county);

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqList.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `How to ${t.verb} property taxes in ${county.name} County, ${county.state} (2026)`,
    description: `Step-by-step guide to filing a ${county.name} County property tax ${t.noun} for the 2026 tax year under ${county.statute}.`,
    totalTime: "PT15M",
    step: howToSteps(county).map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    url: canonicalUrl,
    description,
    dateModified: lastUpdatedISO,
  };

  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "TaxAppeal USA",
    url: "https://www.taxappealusa.com",
    description: `Property tax protest and appeal service for ${county.name} County, ${county.state} homeowners.`,
    areaServed: {
      "@type": "AdministrativeArea",
      name: `${county.name} County, ${county.state}`,
    },
    priceRange: "$89 flat fee",
  };

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://www.taxappealusa.com/og-image.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
        />
      </Head>

      <div style={{ fontFamily: "'Georgia','Times New Roman',serif", color: C.text, background: C.offWhite, minHeight: "100vh" }}>

        {/* NAV */}
        <nav style={{ background: C.navy, padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, background: `linear-gradient(135deg,${C.gold},${C.goldDim})`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: C.white }}>⚖</div>
            <span style={{ color: C.white, fontSize: 18, fontWeight: 700, letterSpacing: "0.03em" }}>TaxAppeal USA</span>
          </Link>
          <Link href="/apply" style={{ background: C.gold, color: C.navy, padding: "10px 22px", borderRadius: 6, fontSize: 14, fontWeight: 700, textDecoration: "none", fontFamily: "Arial, sans-serif" }}>
            Start My {action} — $89
          </Link>
        </nav>

        {/* HERO */}
        <div style={{ background: `linear-gradient(160deg, ${C.navy} 0%, ${C.navyLight} 100%)`, color: C.white, padding: "60px 32px 56px", textAlign: "center" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{ display: "inline-block", background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.4)", borderRadius: 20, padding: "5px 16px", fontSize: 12, color: C.gold, fontFamily: "Arial,sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 20 }}>
              {county.state} · {county.name} County · {county.code === "FL" ? "2026 TRIM Appeal" : `${t.year} Deadline: ${county.deadline}`}
            </div>
            <h1 style={{ fontSize: "clamp(28px,5vw,46px)", fontWeight: 700, lineHeight: 1.15, margin: "0 0 18px" }}>
              {county.name} County Property Tax {action} 2026
            </h1>
            <p style={{ fontSize: 18, color: "rgba(255,255,255,0.75)", margin: "0 0 32px", lineHeight: 1.6, fontFamily: "Arial,sans-serif" }}>
              We write your protest letter, pull comparable sales in {county.name} County, and send it via trackable USPS mail to the <strong style={{ color: C.gold }}>{county.district}</strong> — all for a flat $89. No percentage of your savings. No hidden fees.
            </p>
            {/* FLORIDA ONLY. The line is a promise about the savings gate in
                lib/dor/qualify.js, and that gate only exists for Florida — it is
                built on the DOR parcel roll, which we hold for FL and nowhere
                else. Showing it on a Texas or Georgia page would be a promise
                the product cannot keep there. See lib/flTaglines.js. */}
            {county.code === "FL" && (
              <p style={{ fontSize: 16, color: C.gold, margin: "-14px 0 30px", lineHeight: 1.6, fontFamily: "Arial,sans-serif", fontWeight: 700 }}>
                {taglineFor(county.slug || county.name)}
              </p>
            )}
            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/apply" style={{ background: C.gold, color: C.navy, padding: "16px 36px", borderRadius: 8, fontSize: 16, fontWeight: 700, textDecoration: "none", fontFamily: "Arial,sans-serif" }}>
                File My {action} — $89 Flat
              </Link>
              <a href="#how-it-works" style={{ background: "rgba(255,255,255,0.08)", color: C.white, padding: "16px 28px", borderRadius: 8, fontSize: 15, fontWeight: 500, textDecoration: "none", border: "1px solid rgba(255,255,255,0.2)", fontFamily: "Arial,sans-serif" }}>
                How It Works ↓
              </a>
            </div>
          </div>
        </div>

        {/* DIRECT ANSWER — self-contained answer box for AI/GEO extraction */}
        <div style={{ background: C.white, borderBottom: `1px solid #E5E3DC`, padding: "34px 32px" }}>
          <div style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: "Arial,sans-serif", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
              {county.name} County Property Tax {action} — 2026 · Updated {lastUpdated}
            </div>
            <p style={{ fontSize: 18, lineHeight: 1.65, color: C.text, margin: 0, fontFamily: "Arial,sans-serif" }}>
              {directAnswer(county)}
            </p>
          </div>
        </div>

        {/* STATS STRIP */}
        <div style={{ background: C.offWhite, borderBottom: `1px solid #E5E3DC`, padding: "28px 32px" }}>
          <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 24, textAlign: "center" }}>
            {[
              { num: "$89", label: "Flat fee — never a %" },
              { num: county.deadline, label: `${county.name} County deadline` },
              // These two tiles read "60-80% Protest success rate" and "$600-$2K+
              // Avg annual savings" on all 572 county pages. Neither traced to any
              // source - the 60-80% is an uncited vendor-blog figure. A bare stat
              // tile has no room for attribution, so these are now facts about our
              // own service, which are true by construction. See lib/stats.js.
              { num: "0%", label: "Of your savings taken" },
              { num: "You", label: "Sign it — we mail it" },
            ].map(({ num, label }) => (
              <div key={label}>
                <div style={{ fontSize: 28, fontWeight: 700, color: C.navy, marginBottom: 4 }}>{num}</div>
                <div style={{ fontSize: 13, color: C.muted, fontFamily: "Arial,sans-serif" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* HOW IT WORKS */}
        <div id="how-it-works" style={{ maxWidth: 860, margin: "0 auto", padding: "64px 32px 48px" }}>
          <h2 style={{ fontSize: 30, fontWeight: 700, color: C.navy, marginBottom: 8, textAlign: "center" }}>
            How to {action} Your {county.name} County Property Taxes
          </h2>
          <p style={{ textAlign: "center", color: C.muted, fontFamily: "Arial,sans-serif", fontSize: 16, marginBottom: 48 }}>
            Under {county.statute} — we prepare it, you sign it, we mail it
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 24 }}>
            {[
              { n: "1", title: "Enter your address", body: `We look up your ${county.name} County assessed value, comparable sales, and property details automatically.` },
              { n: "2", title: "Review your case", body: `We calculate your estimated overassessment and show you exactly what evidence we'll submit to the ${county.district}.` },
              // The signing step was missing from this block entirely. In Florida the
              // owner's signature on DR-486 Part 3 is what makes the petition valid
              // (s. 194.011(3), Fla. Stat.), so a "how it works" that omits it
              // describes a process that cannot happen.
              { n: "3", title: "Read it and sign it", body: `You review the completed filing and sign it yourself — it is filed in your name, as ${county.state === "Florida" ? "s. 194.011(3), Florida Statutes requires" : "the property owner"}.` },
              { n: "4", title: county.code === "FL" ? "We mail it for you" : "We mail it certified", body: `Your signed filing goes out to the ${county.district}${county.code === "FL" ? " by tracked USPS First Class mail, with the county filing fee paid" : " by USPS certified mail"} — and we email you when it is on its way.` },
            ].map(({ n, title, body }) => (
              <div key={n} style={{ background: C.white, border: "1px solid #E5E3DC", borderRadius: 12, padding: "28px 24px" }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: C.navy, color: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{n}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.navy, marginBottom: 8 }}>{title}</div>
                <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, fontFamily: "Arial,sans-serif" }}>{body}</div>
              </div>
            ))}
          </div>
        </div>

        {/* WHY FLAT FEE */}
        <div style={{ background: C.navy, color: C.white, padding: "56px 32px" }}>
          <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
            <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>$89 Flat vs. 25–50% Contingency</h2>
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", fontFamily: "Arial,sans-serif", marginBottom: 40, lineHeight: 1.7 }}>
              Every other {county.name} County protest service takes a cut of your savings. TaxAppeal USA doesn't.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 600, margin: "0 auto" }}>
              {[
                { label: "TaxAppeal USA", fee: "$89 flat", savings: "$1,421 kept", highlight: true },
                { label: "Typical protest company", fee: "25–50% of savings", savings: "$375–$750 to them", highlight: false },
              ].map(({ label, fee, savings, highlight }) => (
                <div key={label} style={{ background: highlight ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${highlight ? C.gold : "rgba(255,255,255,0.1)"}`, borderRadius: 10, padding: "24px 20px" }}>
                  <div style={{ fontSize: 13, color: highlight ? C.gold : "rgba(255,255,255,0.5)", fontFamily: "Arial,sans-serif", marginBottom: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: highlight ? C.gold : C.white, marginBottom: 6 }}>{fee}</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", fontFamily: "Arial,sans-serif" }}>On a $1,500 savings: <strong style={{ color: highlight ? C.gold : "#FF8888" }}>{savings}</strong></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* DISTRICT INFO */}
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "56px 32px 48px" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: C.navy, marginBottom: 24 }}>
            {county.name} County Appraisal District
          </h2>
          <div style={{ background: C.white, border: "1px solid #E5E3DC", borderRadius: 12, padding: "28px 32px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: "Arial,sans-serif", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Appraisal Authority</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.navy }}>{county.district}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: "Arial,sans-serif", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Filing Deadline</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.navy }}>{county.deadline}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: "Arial,sans-serif", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Legal Authority</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.navy }}>{county.statute}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: "Arial,sans-serif", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Required Form</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.navy }}>{t.form}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: "Arial,sans-serif", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Hearing Process</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.navy }}>{t.process}</div>
            </div>
            {county.districtUrl && (
              <div>
                <div style={{ fontSize: 12, color: C.muted, fontFamily: "Arial,sans-serif", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Official Website</div>
                <a href={county.districtUrl} target="_blank" rel="noopener noreferrer" style={{ color: C.navy, fontSize: 15 }}>{county.districtUrl}</a>
              </div>
            )}
          </div>
          <p style={{ marginTop: 20, fontSize: 14, color: C.muted, fontFamily: "Arial,sans-serif", lineHeight: 1.7 }}>
            TaxAppeal USA routes your protest to the correct {county.name} County authority automatically, so you don&apos;t have to track down addresses, forms or deadlines. You review and sign the filing; we pay any county fee and mail it.
          </p>
        </div>

        {/* FAQ */}
        <div style={{ background: C.white, padding: "56px 32px" }}>
          <div style={{ maxWidth: 860, margin: "0 auto" }}>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: C.navy, marginBottom: 40, textAlign: "center" }}>
              {county.name} County Property Tax FAQs
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {faqList.map(({ q, a }) => (
                <div key={q} style={{ border: "1px solid #E5E3DC", borderRadius: 10, padding: "22px 26px" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.navy, marginBottom: 10 }}>{q}</div>
                  <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.7, fontFamily: "Arial,sans-serif" }}>{a}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div style={{ background: `linear-gradient(160deg, ${C.navy} 0%, ${C.navyLight} 100%)`, color: C.white, padding: "64px 32px", textAlign: "center" }}>
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 14 }}>
              Ready to lower your {county.name} County taxes?
            </h2>
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", fontFamily: "Arial,sans-serif", marginBottom: 36, lineHeight: 1.7 }}>
              Deadline: <strong style={{ color: C.gold }}>{county.deadline}</strong>. Get started in under 3 minutes — enter your address and we'll show you your estimated savings before you pay anything.
            </p>
            <Link href="/apply" style={{ background: C.gold, color: C.navy, padding: "18px 44px", borderRadius: 8, fontSize: 18, fontWeight: 700, textDecoration: "none", display: "inline-block", fontFamily: "Arial,sans-serif" }}>
              File My {action} — $89 Flat →
            </Link>
            <div style={{ marginTop: 20, fontSize: 13, color: "rgba(255,255,255,0.5)", fontFamily: "Arial,sans-serif" }}>
              Flat $89 · trackable USPS mail · No percentage fees · {county.state} only
            </div>
          </div>
        </div>

        {/* STATE LINK */}
        <div style={{ background: C.offWhite, padding: "28px 32px", textAlign: "center", borderTop: "1px solid #E5E3DC" }}>
          <div style={{ maxWidth: 860, margin: "0 auto" }}>
            <Link href={`/${county.state.toLowerCase()}`} style={{ color: C.navy, fontSize: 14, fontFamily: "Arial,sans-serif" }}>
              ← All {county.state} Counties
            </Link>
            <span style={{ margin: "0 16px", color: C.muted }}>·</span>
            <Link href="/" style={{ color: C.navy, fontSize: 14, fontFamily: "Arial,sans-serif" }}>
              TaxAppeal USA Home
            </Link>
          </div>
        </div>

      </div>
    </>
  );
}

export async function getStaticPaths() {
  const { getAllCountySlugs } = await import("../../lib/countyData");
  const paths = getAllCountySlugs();
  return { paths, fallback: false };
}

export async function getStaticProps({ params }) {
  const { getCountyBySlug } = await import("../../lib/countyData");
  const county = getCountyBySlug(params.slug);
  if (!county) return { notFound: true };
  const now = new Date();
  const lastUpdated = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const lastUpdatedISO = now.toISOString();
  return { props: { county, lastUpdated, lastUpdatedISO } };
}
