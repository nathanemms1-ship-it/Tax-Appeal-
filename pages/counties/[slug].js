import Head from "next/head";
import Link from "next/link";
import { getAllCountySlugs, getCountyBySlug } from "../../lib/countyData";

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
  TX: { verb: "protest", deadline: "May 15", process: "Appraisal Review Board (ARB) hearing", year: "2026" },
  GA: { verb: "appeal", deadline: "April 1", process: "Board of Equalization (BOE) hearing", year: "2026" },
  FL: { verb: "petition", deadline: "25 days after TRIM notice (September)", process: "Value Adjustment Board (VAB) petition", year: "2026" },
};

const stateNames = { TX: "Texas", GA: "Georgia", FL: "Florida" };

const faqs = (county) => {
  const t = stateTerms[county.code];
  return [
    {
      q: `What is the deadline to ${t.verb} property taxes in ${county.name} County, ${county.state}?`,
      a: `The ${county.name} County property tax ${t.verb} deadline is ${county.deadline} (or 30 days after your assessment notice, whichever is later). Under ${county.statute}, you must file your ${t.verb} before this date or lose the right to challenge your assessment for the year.`,
    },
    {
      q: `How does TaxAppeal USA handle my ${county.name} County ${t.verb}?`,
      a: `We generate a professional protest letter using your ${county.name} County property data, comparable sales in your area, and the specific legal arguments that work best with the ${county.district}. You review and sign it, then we send it via USPS Certified Mail in your name — filed as your own protest.`,
    },
    {
      q: `How much can I save on my ${county.name} County property taxes?`,
      a: `The average successful ${t.verb} in ${county.state} reduces the assessed value by 10–20%, saving homeowners $600–$2,000+ per year. TaxAppeal USA charges a flat $79 — far better than the 25–50% contingency fee charged by most protest companies.`,
    },
    {
      q: `What appraisal district handles ${county.name} County?`,
      a: `${county.name} County property tax ${t.verb}s are handled by the ${county.district}. TaxAppeal USA directs your certified letter to the correct address automatically.`,
    },
    {
      q: `Is it worth protesting my ${county.name} County property taxes?`,
      a: `Yes. Between 60–80% of ${county.state} homeowners who file a ${t.verb} receive a reduction. The cost to try is just $79 with TaxAppeal USA — and if you save even $500/year, you'll earn back that fee in under two months.`,
    },
    {
      q: `Do I need to attend a hearing for my ${county.name} County ${t.verb}?`,
      a: `Not with TaxAppeal USA. We send your certified letter with a complete evidence package. Many ${county.state} counties settle protests informally before any hearing is required. If your county schedules a formal ${t.process}, we'll notify you with guidance on what to expect.`,
    },
  ];
};

export default function CountyPage({ county }) {
  if (!county) return <div style={{ padding: 40, color: C.text }}>County not found.</div>;

  const t = stateTerms[county.code];
  const title = `${county.name} County Property Tax ${county.code === "TX" ? "Protest" : "Appeal"} | TaxAppeal USA`;
  const description = `File your ${county.name} County, ${county.state} property tax ${t.verb} by ${county.deadline}. TaxAppeal USA sends your certified protest letter to the ${county.district} for just $79 flat — no percentage fees.`;
  const canonicalUrl = `https://taxappealusa.com/counties/${county.slug}`;

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

  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "TaxAppeal USA",
    url: "https://taxappealusa.com",
    description: `Property tax protest and appeal service for ${county.name} County, ${county.state} homeowners.`,
    areaServed: {
      "@type": "AdministrativeArea",
      name: `${county.name} County, ${county.state}`,
    },
    priceRange: "$79 flat fee",
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
        <meta property="og:image" content="https://taxappealusa.com/og-image.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
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
            Start My {county.code === "TX" ? "Protest" : "Appeal"} — $79
          </Link>
        </nav>

        {/* HERO */}
        <div style={{ background: `linear-gradient(160deg, ${C.navy} 0%, ${C.navyLight} 100%)`, color: C.white, padding: "60px 32px 56px", textAlign: "center" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{ display: "inline-block", background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.4)", borderRadius: 20, padding: "5px 16px", fontSize: 12, color: C.gold, fontFamily: "Arial,sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 20 }}>
              {county.state} · {county.name} County · {county.code === "FL" ? "TRIM Appeal" : `${t.year} Deadline: ${county.deadline}`}
            </div>
            <h1 style={{ fontSize: "clamp(28px,5vw,46px)", fontWeight: 700, lineHeight: 1.15, margin: "0 0 18px" }}>
              {county.name} County Property Tax {county.code === "TX" ? "Protest" : "Appeal"}
            </h1>
            <p style={{ fontSize: 18, color: "rgba(255,255,255,0.75)", margin: "0 0 32px", lineHeight: 1.6, fontFamily: "Arial,sans-serif" }}>
              We write your protest letter, pull comparable sales in {county.name} County, and send it via USPS Certified Mail to the <strong style={{ color: C.gold }}>{county.district}</strong> — all for a flat $79. No percentage of your savings. No hidden fees.
            </p>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/apply" style={{ background: C.gold, color: C.navy, padding: "16px 36px", borderRadius: 8, fontSize: 16, fontWeight: 700, textDecoration: "none", fontFamily: "Arial,sans-serif" }}>
                File My {county.code === "TX" ? "Protest" : "Appeal"} — $79 Flat
              </Link>
              <a href="#how-it-works" style={{ background: "rgba(255,255,255,0.08)", color: C.white, padding: "16px 28px", borderRadius: 8, fontSize: 15, fontWeight: 500, textDecoration: "none", border: "1px solid rgba(255,255,255,0.2)", fontFamily: "Arial,sans-serif" }}>
                How It Works ↓
              </a>
            </div>
          </div>
        </div>

        {/* STATS STRIP */}
        <div style={{ background: C.white, borderBottom: `1px solid #E5E3DC`, padding: "28px 32px" }}>
          <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 24, textAlign: "center" }}>
            {[
              { num: "$79", label: "Flat fee — never a %" },
              { num: county.deadline, label: `${county.name} County deadline` },
              { num: "60–80%", label: "Protest success rate" },
              { num: "$600–$2K+", label: "Avg annual savings" },
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
            How to {county.code === "TX" ? "Protest" : "Appeal"} Your {county.name} County Property Taxes
          </h2>
          <p style={{ textAlign: "center", color: C.muted, fontFamily: "Arial,sans-serif", fontSize: 16, marginBottom: 48 }}>
            Under {county.statute} — we handle the filing so you don't have to
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 24 }}>
            {[
              { n: "1", title: "Enter your address", body: `We look up your ${county.name} County assessed value, comparable sales, and property details automatically.` },
              { n: "2", title: "Review your case", body: `We calculate your estimated overassessment and show you exactly what evidence we'll submit to the ${county.district}.` },
              { n: "3", title: "Pay $79 flat", body: "No percentage of savings. No surprise fees. One flat fee covers your entire protest from filing to delivery." },
              { n: "4", title: "We mail it certified", body: `Your protest letter goes out via USPS Certified Mail to the ${county.district} — with tracking and proof of delivery.` },
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
            <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>$79 Flat vs. 25–50% Contingency</h2>
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", fontFamily: "Arial,sans-serif", marginBottom: 40, lineHeight: 1.7 }}>
              Every other {county.name} County protest service takes a cut of your savings. TaxAppeal USA doesn't.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 600, margin: "0 auto" }}>
              {[
                { label: "TaxAppeal USA", fee: "$79 flat", savings: "$1,421 kept", highlight: true },
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
              <div style={{ fontSize: 12, color: C.muted, fontFamily: "Arial,sans-serif", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Hearing Process</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.navy }}>{t.process}</div>
            </div>
            {county.districtUrl && (
              <div style={{ gridColumn: "1/-1" }}>
                <div style={{ fontSize: 12, color: C.muted, fontFamily: "Arial,sans-serif", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Official Website</div>
                <a href={county.districtUrl} target="_blank" rel="noopener noreferrer" style={{ color: C.navy, fontSize: 15 }}>{county.districtUrl}</a>
              </div>
            )}
          </div>
          <p style={{ marginTop: 20, fontSize: 14, color: C.muted, fontFamily: "Arial,sans-serif", lineHeight: 1.7 }}>
            TaxAppeal USA automatically routes your certified protest letter to the correct {county.name} County authority. You don't need to look up addresses, forms, or deadlines — we handle all of it.
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
              File My {county.code === "TX" ? "Protest" : "Appeal"} — $79 Flat →
            </Link>
            <div style={{ marginTop: 20, fontSize: 13, color: "rgba(255,255,255,0.5)", fontFamily: "Arial,sans-serif" }}>
              Flat $79 · USPS Certified Mail · No percentage fees · {county.state} only
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
  return { props: { county } };
}
