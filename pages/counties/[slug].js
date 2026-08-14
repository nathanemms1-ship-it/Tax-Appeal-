import Head from "next/head";
import Link from "next/link";
import { getAllCountySlugs, getCountyBySlug } from "../../lib/countyData";
import { taglineFor } from '../../lib/flTaglines';
import { breadcrumbSchema } from '../../lib/breadcrumbs';

// The revision date is declared in lib/contentRevised.js, not here: lib/sitemapUrls.js
// needs the same value for <lastmod> and is imported by a plain-Node build script,
// which cannot parse this file's JSX. See that module for what the date means.
import { COUNTY_CONTENT_REVISED } from '../../lib/contentRevised';

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

/**
 * WHERE THE FILING ACTUALLY GOES — and why this is not `county.district`.
 *
 * In Texas and Georgia the appraisal district both sets the value and receives the
 * protest, so `county.district` is the right destination and this returns it.
 *
 * Florida splits those two jobs, and this template used to conflate them. A DR-486
 * petition and its fee cheque must be mailed to the CLERK OF THE VALUE ADJUSTMENT
 * BOARD — not to the Property Appraiser, who only set the value being challenged.
 * lib/flVabAddresses.js opens with that warning in capitals because mailing to the
 * Property Appraiser means the petition is never filed and the customer loses the
 * appeal year.
 *
 * `countyData.district` holds the Property Appraiser for FL counties, and the hero,
 * the how-it-works block, the district card and three FAQ answers all rendered it as
 * the mailing target — on all 67 Florida county pages. The filing pipeline has always
 * been correct (pages/api/send-letter.js reads flVabAddresses); it was only these
 * marketing pages that described a filing path the code correctly refuses to take.
 * /miami, /tampa and the other FL city pages already say VAB. This brings the county
 * pages in line with both.
 */
const filingTargetFor = (county, fl) => {
  if (county.code !== "FL") return county.district;
  return fl?.vab?.vabName || `${county.name} County Clerk of the Value Adjustment Board`;
};

// Concise, self-contained answer placed at the top of the page.
// Leads with the direct answer + year + deadline + form + statute — the format
// AI engines (ChatGPT, Perplexity, Google AI Overviews) extract and cite.
const directAnswer = (county, fl) => {
  const t = termsFor(county);
  if (county.code === "FL") {
    const fee = fl ? ` The ${county.name} County VAB filing fee is ${fl.feeText}, payable to ${fl.feePayableTo}.` : "";
    const due = fl ? ` For the 2026 tax year that deadline is ${fl.deadlineText}.` : "";
    const receipt = fl?.receiptRequired
      ? ` ${county.name} County does not accept a postmark as proof of timely filing — the petition must be physically received by the deadline.`
      : "";
    return `To appeal your ${county.name} County property taxes in 2026, file a Value Adjustment Board petition (${t.form}) with the ${filingTargetFor(county, fl)} within 25 days of your TRIM notice.${due}${receipt} Include evidence of overassessment such as recent comparable sales.${fee} Filing is authorized under ${county.statute}. TaxAppeal USA prepares your DR-486 petition, you sign it yourself as ${county.statute} requires, and we pay the county filing fee and mail it for a flat $89 plus that fee. TaxAppeal USA is not your representative and does not appear before the Board.`;
  }
  if (county.code === "GA") {
    return `To appeal your ${county.name} County property taxes in 2026, file a property tax appeal (${t.form}) with the ${county.district} within 45 days of your annual assessment notice. Support your appeal with comparable sales showing your home is overvalued. Appeals are authorized under ${county.statute}. TaxAppeal USA writes and certified-mails your appeal for a flat $89 — no percentage of your savings.`;
  }
  if (county.code === "TX") {
    return `To protest your ${county.name} County property taxes in 2026, file a Notice of Protest (${t.form}) with the ${county.district} by May 15 — or within 30 days of your appraisal notice, whichever is later. Include comparable sales showing your home is overassessed. Protests are authorized under ${county.statute}. TaxAppeal USA writes and certified-mails your protest for a flat $89 — no percentage of your savings.`;
  }
  return `To appeal your ${county.name} County property taxes in 2026, file ${t.form} with the ${county.district} by ${county.deadline}. Support your appeal with recent comparable sales showing your home is assessed above market value. Appeals are authorized under ${county.statute}. TaxAppeal USA prepares and certified-mails your appeal for a flat $89 — no percentage of your savings.`;
};

/**
 * Real, informational appeal steps.
 *
 * These were marked up as HowTo structured data. That markup is now deleted — Google
 * removed the HowTo rich result on 14 Sept 2023 ("no longer shown in search results,
 * on both desktop and mobile devices") and withdrew the documentation with it. The
 * steps are kept because they are useful page content; only the inert JSON-LD is gone.
 */
const howToSteps = (county, fl) => {
  if (county.code === "FL") {
    return [
      { name: "Review your TRIM notice", text: `Check the assessed value on your ${county.name} County TRIM (Truth in Millage) notice, mailed in August.` },
      { name: "Gather your evidence", text: "Collect recent comparable sales and any documentation showing your home is worth less than its assessed value." },
      { name: "Complete Form DR-486", text: "Fill out the Value Adjustment Board petition (Form DR-486) for your parcel." },
      { name: fl ? `File by ${fl.deadlineText}` : "File within 25 days", text: `File the petition with the ${filingTargetFor(county, fl)} — not the Property Appraiser — and pay the ${fl ? fl.feeText : "county"} VAB filing fee within 25 days of your TRIM notice.` },
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

const faqs = (county, fl) => {
  const t = termsFor(county);
  const target = filingTargetFor(county, fl);
  return [
    {
      q: `What is the deadline to ${t.verb} property taxes in ${county.name} County, ${county.state}?`,
      a: county.code === "FL" && fl
        ? `Florida gives you 25 days from the date your TRIM notice is mailed. For the 2026 tax year the ${county.name} County deadline is ${fl.deadlineText}, and TaxAppeal USA works to that date. ${fl.receiptRequired ? `${county.name} County does not accept a postmark as proof of filing — your petition must be physically received by then, which is why we mail well ahead of the deadline.` : "Florida satisfies the deadline by physical receipt, not by postmark, so we mail well ahead of it."} Filing is authorized under ${county.statute}.`
        : `The ${county.name} County property tax ${t.verb} deadline is ${county.deadline} (or 30 days after your assessment notice, whichever is later). Under ${county.statute}, you must file your ${t.verb} before this date or lose the right to challenge your assessment for the year.`,
    },
    {
      q: `How does TaxAppeal USA handle my ${county.name} County ${t.verb}?`,
      a: `We generate a professional ${t.noun} using your ${county.name} County property data, comparable sales in your area, and the specific legal arguments that work best in ${county.name} County. You review and sign it, then we send it via trackable USPS mail in your name to the ${target} — filed as your own ${t.noun}.`,
    },
    {
      q: `How much can I save on my ${county.name} County property taxes?`,
      // "10-20% / $600-$2,000+" had no source. Replaced with a figure that does.
      a: county.code === "FL" && fl?.millage
        ? `Your saving is the size of the reduction multiplied by your local tax rate. ${county.name} County's ${fl.millage.year} millage is ${fl.millage.totalText} per $1,000 of taxable value, so every $10,000 knocked off a taxable value is worth roughly ${fl.millage.per10kText} a year — before any assessment cap. Where Save Our Homes or the 10% non-homestead cap already holds your taxable value below market, a reduction can be absorbed by the cap and save you nothing at all, which is why our free check tells you which applies to your property before you pay. TaxAppeal USA charges a flat $89 plus the county filing fee — never a percentage of your savings.`
        : `It depends entirely on the gap between your assessment and your property's market value, and your county makes the final call. For scale, Harris County reported an average value reduction of 6.98% across 516,205 protested accounts in 2024 (HCAD Annual Comprehensive Financial Report). TaxAppeal USA charges a flat $89 — versus the 25–50% of your savings that contingency firms take, every year.`,
    },
    // FLORIDA SPLITS VALUING FROM RECEIVING. The old single question — "What appraisal
    // district handles X County?" answered with county.district — was correct for TX and
    // GA and actively wrong for FL, where it named the Property Appraiser as the office
    // that "handles" a petition the Property Appraiser never receives.
    ...(county.code === "FL"
      ? [
          {
            q: `Where do I mail my ${county.name} County VAB petition?`,
            a: fl?.vab
              ? `To the ${fl.vab.vabName}, ${fl.vab.street}, ${fl.vab.city}, ${fl.vab.state} ${fl.vab.zip}${fl.vab.attn ? ` (attn: ${fl.vab.attn})` : ""}. Not to the ${county.district} — the Property Appraiser sets your value but does not receive the petition, and a DR-486 mailed there is never filed. TaxAppeal USA mails to the Clerk's address above and pays the filing fee with it.`
              : `To the Clerk of the Value Adjustment Board for ${county.name} County — not to the ${county.district}. The Property Appraiser sets your value but does not receive the petition, and a DR-486 mailed there is never filed. TaxAppeal USA confirms the current Clerk address for your county against the county's own published source before mailing.`,
          },
          {
            q: `What is the ${county.name} County VAB filing fee?`,
            a: fl
              ? `${fl.feeText} per parcel, payable to ${fl.feePayableTo}. Florida House Bill 7031 (effective July 2025) lets counties charge up to $50; ${county.name} County's adopted rate is ${fl.feeText}. TaxAppeal USA pays it on your behalf with your petition, so your all-in cost is ${fl.allInText} and you do not write a separate cheque to the county.`
              : `Florida House Bill 7031 (effective July 2025) lets counties charge up to $50 per petition. TaxAppeal USA pays your county's fee on your behalf with your petition.`,
          },
          {
            q: `Who is the ${county.name} County Property Appraiser?`,
            a: `The ${county.district} sets the assessed value of every property in ${county.name} County — that is the value a VAB petition challenges. The Property Appraiser does not decide your petition and does not receive it; the Value Adjustment Board decides it and the Clerk of the Board receives it.`,
          },
        ]
      : [
          {
            q: `What appraisal district handles ${county.name} County?`,
            a: `${county.name} County property tax ${t.verb}s are handled by the ${county.district}. TaxAppeal USA directs your filing to the correct address automatically.`,
          },
        ]),
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

export default function CountyPage({ county, fl, contentRevised }) {
  if (!county) return <div style={{ padding: 40, color: C.text }}>County not found.</div>;

  const t = termsFor(county);
  const action = county.code === "TX" ? "Protest" : "Appeal";
  const target = filingTargetFor(county, fl);
  const title = `${county.name} County Property Tax ${action} 2026 | TaxAppeal USA`;
  const description = county.code === "FL" && fl
    ? `${county.name} County, Florida VAB petition for 2026 — deadline ${fl.deadlineText}, county filing fee ${fl.feeText}. TaxAppeal USA prepares your DR-486, pays the fee and mails it to the Clerk of the Value Adjustment Board for $89 flat.`
    : `${county.name} County, ${county.state} property tax ${t.verb} for 2026 — deadline ${county.deadline}. TaxAppeal USA mails your ${t.noun} to the ${county.district} for $89 flat.`;
  const canonicalUrl = `https://www.taxappealusa.com/counties/${county.slug}`;
  const stateHref = `/${county.state.toLowerCase()}`;

  const faqList = faqs(county, fl);
  const steps = howToSteps(county, fl);

  /**
   * SCHEMA: WHAT IS HERE, AND WHAT WAS DELETED.
   *
   * Deleted — FAQPage. Google's own doc now reads "As of May 7, 2026, FAQ rich results
   * are no longer appearing in Google Search"; the documentation was removed on
   * 15 June 2026 and Search Console API support was dropped this month. It produced
   * nothing and cost bytes on 573 pages.
   *
   * Deleted — HowTo. Dead since 14 Sept 2023, docs withdrawn the same day.
   *
   * Added — BreadcrumbList. This is the one type on this page that still earns a rich
   * result, and the site had ZERO instances of it anywhere: /texas/[city] and
   * /blog/[slug] render a visible breadcrumb trail with no markup behind it. The trail
   * does not have to mirror the URL path, so a flat /counties/* URL is no obstacle —
   * Home → Florida → Miami-Dade County is the honest hierarchy regardless.
   *
   * Replaced — LocalBusiness became Service. LocalBusiness requires an address and had
   * none, so 573 copies were invalid; the ones that would have validated would have put
   * a Forest Hill, TX street address on a Miami-Dade page, which is worse. Organization
   * already lives once in pages/_app.js — this references it as the provider instead of
   * restating it. Service earns no rich result and is not expected to; it is here
   * because it is the type that is actually true.
   *
   * NOT added — Review / AggregateRating. Google: "If the entity that's being reviewed
   * controls the reviews about itself, their pages ... are ineligible for star review
   * feature." Self-hosted testimonials produce no stars and risk a manual action.
   */
  const trail = [
    { name: "Home", href: "/" },
    { name: county.state, href: stateHref },
    { name: `${county.name} County` },
  ];

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    url: canonicalUrl,
    description,
    // A real content-revision date, not the build clock. See COUNTY_CONTENT_REVISED.
    dateModified: contentRevised,
  };

  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `${county.name} County property tax ${t.noun} filing`,
    serviceType: `Property tax ${t.noun} preparation and filing`,
    url: canonicalUrl,
    description: `Preparation, county fee payment and tracked mail filing of a ${county.name} County, ${county.state} property tax ${t.noun} under ${county.statute}.`,
    provider: { "@type": "Organization", name: "TaxAppeal USA", url: "https://www.taxappealusa.com" },
    areaServed: { "@type": "AdministrativeArea", name: `${county.name} County, ${county.state}` },
    offers: {
      "@type": "Offer",
      price: fl ? String(89 + fl.feeDollars) : "89",
      priceCurrency: "USD",
      description: fl
        ? `$89 service fee plus the ${county.name} County VAB filing fee of ${fl.feeText}, which TaxAppeal USA pays on the customer's behalf.`
        : "$89 flat service fee. No percentage of savings.",
    },
  };

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonicalUrl} key="canonical" />
        <meta property="og:title" content={title} key="og:title" />
        <meta property="og:description" content={description} key="og:description" />
        <meta property="og:url" content={canonicalUrl} key="og:url" />
        <meta property="og:type" content="website" key="og:type" />
        <meta property="og:image" content="https://www.taxappealusa.com/og-image.jpg" key="og:image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema(trail, canonicalUrl)) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }}
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

        {/* BREADCRUMB — matches breadcrumbSchema above. Mirrors the pattern already
            used on /texas/[city] and /blog/[slug], which have the visible trail but
            no markup behind it. */}
        <div style={{ background: C.white, borderBottom: "1px solid #E5E3DC", padding: "10px 32px" }}>
          <div style={{ maxWidth: 860, margin: "0 auto" }}>
            {/* Same `trail` array the JSON-LD is built from — that is what keeps the
                visible crumbs and the markup from drifting apart. */}
            <p style={{ fontSize: 13, color: C.muted, fontFamily: "Arial,sans-serif", margin: 0 }}>
              {trail.map((crumb, i) => (
                <span key={crumb.name}>
                  {i > 0 && " → "}
                  {crumb.href
                    ? <a href={crumb.href} style={{ color: C.muted, textDecoration: "none" }}>{crumb.name}</a>
                    : <span style={{ color: C.navy }}>{crumb.name}</span>}
                </span>
              ))}
            </p>
          </div>
        </div>

        {/* HERO */}
        <div style={{ background: `linear-gradient(160deg, ${C.navy} 0%, ${C.navyLight} 100%)`, color: C.white, padding: "60px 32px 56px", textAlign: "center" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{ display: "inline-block", background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.4)", borderRadius: 20, padding: "5px 16px", fontSize: 12, color: C.gold, fontFamily: "Arial,sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 20 }}>
              {county.state} · {county.name} County · {county.code === "FL" && fl ? `2026 Deadline: ${fl.deadlineText}` : county.code === "FL" ? "2026 TRIM Appeal" : `${t.year} Deadline: ${county.deadline}`}
            </div>
            <h1 style={{ fontSize: "clamp(28px,5vw,46px)", fontWeight: 700, lineHeight: 1.15, margin: "0 0 18px" }}>
              {county.name} County Property Tax {action} 2026
            </h1>
            <p style={{ fontSize: 18, color: "rgba(255,255,255,0.75)", margin: "0 0 32px", lineHeight: 1.6, fontFamily: "Arial,sans-serif" }}>
              {county.code === "FL" ? (
                <>
                  We prepare your DR-486 petition, pull comparable sales in {county.name} County, and mail it with the county filing fee paid to the <strong style={{ color: C.gold }}>{target}</strong> — $89 flat{fl ? <> plus the {fl.feeText} county fee, <strong style={{ color: C.gold }}>{fl.allInText} all in</strong></> : null}. No percentage of your savings.
                </>
              ) : (
                <>
                  We write your protest letter, pull comparable sales in {county.name} County, and send it via trackable USPS mail to the <strong style={{ color: C.gold }}>{county.district}</strong> — all for a flat $89. No percentage of your savings. No hidden fees.
                </>
              )}
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
              {county.name} County Property Tax {action} — 2026 · Reviewed {contentRevised}
            </div>
            <p style={{ fontSize: 18, lineHeight: 1.65, color: C.text, margin: 0, fontFamily: "Arial,sans-serif" }}>
              {directAnswer(county, fl)}
            </p>
          </div>
        </div>

        {/* POSTMARK WARNING — Pasco and Marion only (FL_POSTMARK_NOT_ACCEPTED).
            Florida satisfies the deadline by physical receipt in every county, but
            these two say so explicitly and reject postmarked petitions outright.
            Nobody else publishes this at the county level. */}
        {fl?.receiptRequired && (
          <div style={{ background: "#FFF6E5", borderBottom: "1px solid #E8D9B0", padding: "20px 32px" }}>
            <div style={{ maxWidth: 820, margin: "0 auto" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#8B6F2E", fontFamily: "Arial,sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                A postmark is not enough in {county.name} County
              </div>
              <p style={{ fontSize: 15, color: C.text, margin: 0, lineHeight: 1.65, fontFamily: "Arial,sans-serif" }}>
                {county.name} County states that a postmarked petition is untimely — your DR-486 must be
                physically in the Clerk&apos;s hands by {fl.deadlineText}, not merely posted by then. Mailing on the
                deadline loses the year. TaxAppeal USA mails {county.name} County petitions well ahead of the date
                and checks the carrier&apos;s own delivery estimate against the deadline before each one goes out.
              </p>
            </div>
          </div>
        )}

        {/* STATS STRIP */}
        <div style={{ background: C.offWhite, borderBottom: `1px solid #E5E3DC`, padding: "28px 32px" }}>
          <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 24, textAlign: "center" }}>
            {[
              // These tiles read "60-80% Protest success rate" and "$600-$2K+
              // Avg annual savings" on all 572 county pages. Neither traced to any
              // source - the 60-80% is an uncited vendor-blog figure. A bare stat
              // tile has no room for attribution, so these are now facts about our
              // own service, which are true by construction. See lib/stats.js.
              //
              // The FL variants below are county-varying facts of the same kind: the
              // fee comes from the same table checkout charges from, and the deadline
              // from the same window the funnel gates on. Neither can drift from what
              // we actually do without the build failing.
              { num: "$89", label: "Flat fee — never a %" },
              fl
                ? { num: fl.feeText, label: `${county.name} County VAB fee — we pay it` }
                : { num: "0%", label: "Of your savings taken" },
              { num: fl ? fl.deadlineShort : county.deadline, label: `${county.name} County 2026 deadline` },
              fl
                ? { num: fl.allInText, label: "All in — service + county fee" }
                : { num: "You", label: "Sign it — we mail it" },
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
              { n: "2", title: "Review your case", body: `We calculate your estimated overassessment and show you exactly what evidence we'll submit on your behalf.` },
              // The signing step was missing from this block entirely. In Florida the
              // owner's signature on DR-486 Part 3 is what makes the petition valid
              // (s. 194.011(3), Fla. Stat.), so a "how it works" that omits it
              // describes a process that cannot happen.
              { n: "3", title: "Read it and sign it", body: `You review the completed filing and sign it yourself — it is filed in your name, as ${county.state === "Florida" ? "s. 194.011(3), Florida Statutes requires" : "the property owner"}.` },
              // Destination is filingTargetFor(), not county.district — in Florida those
              // are two different offices and only one of them can receive a DR-486.
              { n: "4", title: county.code === "FL" ? "We mail it for you" : "We mail it certified", body: `Your signed filing goes out to the ${target}${county.code === "FL" ? `, with the ${fl ? fl.feeText : "county"} filing fee paid, by tracked USPS mail` : " by USPS certified mail"} — and we email you when it is on its way.` },
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

        {/* DISTRICT INFO.
            In Florida this section is split in two, because the county splits the job:
            the Property Appraiser sets the value, the Clerk of the VAB receives the
            petition. Rendering one office under one heading is what produced the
            "mail it to the Property Appraiser" error this section used to carry. */}
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "56px 32px 48px" }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: C.navy, marginBottom: 24 }}>
            {county.code === "FL" ? `Filing a ${county.name} County VAB Petition` : `${county.name} County Appraisal District`}
          </h2>

          {/* FLORIDA: where the petition actually goes. */}
          {county.code === "FL" && (
            <div style={{ background: C.white, border: `2px solid ${C.gold}`, borderRadius: 12, padding: "28px 32px", marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: C.goldDim, fontFamily: "Arial,sans-serif", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                Where the petition is filed
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 10 }}>{target}</div>
              {fl?.vab ? (
                <address style={{ fontSize: 15, color: C.text, fontStyle: "normal", lineHeight: 1.7, fontFamily: "Arial,sans-serif", marginBottom: 14 }}>
                  {fl.vab.attn && <>{fl.vab.attn}<br /></>}
                  {fl.vab.street}<br />
                  {fl.vab.city}, {fl.vab.state} {fl.vab.zip}
                </address>
              ) : (
                <p style={{ fontSize: 15, color: C.text, lineHeight: 1.7, fontFamily: "Arial,sans-serif", marginBottom: 14 }}>
                  We confirm the current Clerk address for {county.name} County against the county&apos;s own
                  published source before mailing, and will not send a petition to an address we have not verified.
                </p>
              )}
              <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.7, fontFamily: "Arial,sans-serif", margin: 0 }}>
                <strong style={{ color: C.text }}>Not the {county.district}.</strong> The Property Appraiser sets the
                value your petition challenges, but does not receive the petition — a DR-486 mailed there is never
                filed, and the appeal year is lost.
                {fl?.vab
                  ? " TaxAppeal USA mails to the Clerk address above and encloses the filing fee."
                  : " TaxAppeal USA encloses the filing fee and mails to the Clerk once that address is confirmed."}
                {fl?.vab?.sourceUrl && (
                  <>
                    {" "}
                    <a href={fl.vab.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: C.navy }}>
                      Verified against {county.name} County&apos;s published VAB page →
                    </a>
                  </>
                )}
              </p>
            </div>
          )}

          <div style={{ background: C.white, border: "1px solid #E5E3DC", borderRadius: 12, padding: "28px 32px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: "Arial,sans-serif", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>{county.code === "FL" ? "Who Set Your Value" : "Appraisal Authority"}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.navy }}>{county.district}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: "Arial,sans-serif", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Filing Deadline</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.navy }}>{fl ? fl.deadlineText : county.deadline}</div>
            </div>
            {fl && (
              <div>
                <div style={{ fontSize: 12, color: C.muted, fontFamily: "Arial,sans-serif", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>County VAB Filing Fee</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.navy }}>{fl.feeText} per parcel</div>
                <div style={{ fontSize: 13, color: C.muted, fontFamily: "Arial,sans-serif", marginTop: 4 }}>Payable to {fl.feePayableTo} — we pay it for you</div>
              </div>
            )}
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
            {/* Millage is what turns a value reduction into dollars, and it varies more
                across Florida than most owners expect — 13.77 in Brevard to 19.86 in
                Broward. School and non-school are kept apart because the 10%
                non-homestead cap (s 193.1554) applies to non-school levies only. */}
            {fl?.millage && (
              <div>
                <div style={{ fontSize: 12, color: C.muted, fontFamily: "Arial,sans-serif", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>{fl.millage.year} Millage Rate</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.navy }}>{fl.millage.totalText} per $1,000</div>
                <div style={{ fontSize: 13, color: C.muted, fontFamily: "Arial,sans-serif", marginTop: 4 }}>
                  School {fl.millage.schoolText} · non-school {fl.millage.nonSchoolText}
                </div>
              </div>
            )}
            {county.districtUrl && (
              <div>
                <div style={{ fontSize: 12, color: C.muted, fontFamily: "Arial,sans-serif", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Official Website</div>
                <a href={county.districtUrl} target="_blank" rel="noopener noreferrer" style={{ color: C.navy, fontSize: 15 }}>{county.districtUrl}</a>
              </div>
            )}
          </div>
          <p style={{ marginTop: 20, fontSize: 14, color: C.muted, fontFamily: "Arial,sans-serif", lineHeight: 1.7 }}>
            {fl ? (
              <>
                At {fl.millage ? `${fl.millage.totalText} per $1,000` : "your county's millage"}, every $10,000 removed
                from a taxable value is worth roughly {fl.millage ? fl.millage.per10kText : "a proportional amount"} a
                year — <strong style={{ color: C.text }}>before any assessment cap</strong>. Where Save Our Homes or the
                10% non-homestead cap already holds your taxable value below market, a reduction can be absorbed and
                save you nothing. Our <Link href="/check" style={{ color: C.navy }}>free {county.name} County check</Link> tells
                you which applies to your property before you pay anything.
              </>
            ) : (
              <>
                TaxAppeal USA routes your protest to the correct {county.name} County authority automatically, so you
                don&apos;t have to track down addresses, forms or deadlines. You review and sign the filing; we pay any
                county fee and mail it.
              </>
            )}
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
              Deadline: <strong style={{ color: C.gold }}>{fl ? fl.deadlineText : county.deadline}</strong>. Get started in under 3 minutes — enter your address and we&apos;ll show you your estimated savings before you pay anything.
            </p>
            <Link href="/apply" style={{ background: C.gold, color: C.navy, padding: "18px 44px", borderRadius: 8, fontSize: 18, fontWeight: 700, textDecoration: "none", display: "inline-block", fontFamily: "Arial,sans-serif" }}>
              File My {action} — {fl ? `${fl.allInText} All In` : "$89 Flat"} →
            </Link>
            <div style={{ marginTop: 20, fontSize: 13, color: "rgba(255,255,255,0.5)", fontFamily: "Arial,sans-serif" }}>
              {fl ? `$89 service + ${fl.feeText} ${county.name} County VAB fee` : "Flat $89"} · trackable USPS mail · No percentage fees · {county.state} only
            </div>
          </div>
        </div>

        {/* CITIES IN THIS COUNTY.
            Until now a county page's only outbound internal links were the state hub
            and home — 573 leaves hanging off one hub. These are a real containment
            relationship straight out of lib/floridaCities.js, and they close the loop
            with /florida/[city], which now links back up here.

            Deliberately NOT here: "nearby counties". We hold no adjacency data for
            Florida, and inventing a neighbour list would be arbitrary links dressed as
            a hierarchy — the shape Google's doorway policy calls out as "closer to
            search results than a clearly defined, browseable hierarchy". The state hub
            already lists all 67 and is one click away. */}
        {fl?.cities?.length > 0 && (
          <div style={{ background: C.white, padding: "48px 32px", borderTop: "1px solid #E5E3DC" }}>
            <div style={{ maxWidth: 860, margin: "0 auto" }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: C.navy, marginBottom: 8 }}>
                {county.name} County cities we cover
              </h2>
              <p style={{ fontSize: 14, color: C.muted, fontFamily: "Arial,sans-serif", marginBottom: 20, lineHeight: 1.7 }}>
                Every one of these files through the {county.name} County Value Adjustment Board on the
                same {fl.deadlineText} deadline, with the same {fl.feeText} county filing fee.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 18px" }}>
                {fl.cities.map((c) => (
                  <a key={c.slug} href={`/florida/${c.slug}`} style={{ color: C.navy, fontSize: 14, fontFamily: "Arial,sans-serif" }}>
                    {c.name}
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

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

/**
 * Per-county Florida facts, assembled at build time.
 *
 * ============================================================================
 * WHY EVERY FIELD COMES FROM A MODULE AND NONE IS WRITTEN HERE
 * ============================================================================
 * The fee is read from lib/flCountyFees.js — the same table pages/api/checkout.js
 * charges from — so the page cannot advertise a price we will not honour. That has
 * already broken twice on the city pages (/orlando quoted $15 while checkout took
 * $50; /jacksonville quoted $15 for a season after Duval adopted the cap), which is
 * why scripts/verify-pages.mjs asserts the built HTML against this same table. That
 * check is extended to county pages in this change.
 *
 * The address is read from lib/flVabAddresses.js via getFlVabAddress(), which returns
 * null for any county whose entry is not marked `confirmed`. That null is honoured
 * rather than worked around: an unconfirmed county renders no address at all. Putting
 * a plausible-looking government address on a page is how a homeowner mails a petition
 * into a void, and this file's own header says the filing path must not fall back to
 * any other source.
 *
 * The deadline is derived from FILING_WINDOWS.FL, the same window pages/apply.js gates
 * the funnel on, so the date advertised is the date we actually file to.
 *
 * Millage returns null rather than a default for any county not in the table — see the
 * comment on millageForCounty. A page that cannot compute the dollars says so by
 * omitting the row, and never substitutes a statewide average.
 */
function floridaFacts(county) {
  return import("../../lib/flCountyFees").then(async ({ getFlVabFee, formatVabFee }) => {
    const { getFlVabAddress, flCountyRequiresReceipt } = await import("../../lib/flVabAddresses");
    const { millageForCounty } = await import("../../lib/dor/millage");
    const { countyNoFromName } = await import("../../lib/dor/coverage");
    const { FILING_WINDOWS } = await import("../../lib/filingWindows");
    const { floridaCities } = await import("../../lib/floridaCities");

    const fee = getFlVabFee(county.name);
    const vab = getFlVabAddress(county.name);
    const m = millageForCounty(countyNoFromName(county.name));

    // FILING_WINDOWS.FL.hardMonth/hardDay is the 2026 VAB deadline the funnel gates on.
    const w = FILING_WINDOWS.FL;
    const deadlineDate = new Date(2026, w.hardMonth - 1, w.hardDay);
    const deadlineText = deadlineDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const deadlineShort = deadlineDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    const feeDollars = fee.vabFee / 100;
    const total = m ? m.school + m.nonSchool : null;

    return {
      feeDollars,
      feeText: formatVabFee(fee.vabFee),
      feePayableTo: fee.payableTo,
      feeConfirmed: fee.confidence === "confirmed",
      allInText: `$${89 + feeDollars}`,
      // getFlVabAddress already filtered to confirmed-only; null means "do not display".
      vab: vab
        ? {
            vabName: vab.vabName,
            attn: vab.attn || null,
            street: vab.street,
            city: vab.city,
            state: vab.state,
            zip: vab.zip,
            sourceUrl: vab.sourceUrl || null,
          }
        : null,
      receiptRequired: flCountyRequiresReceipt(county.name),
      millage: m
        ? {
            year: m.year,
            totalText: total.toFixed(4),
            schoolText: m.school.toFixed(4),
            nonSchoolText: m.nonSchool.toFixed(4),
            // One mill is $1 per $1,000, so $10,000 of taxable reduction is worth
            // 10 x the total millage in dollars per year, before any cap.
            per10kText: `$${Math.round(total * 10)}`,
          }
        : null,
      deadlineText,
      deadlineShort,
      // floridaCities.county holds the bare county name ("Miami-Dade"), which matches
      // countyData.name exactly — verified across all 131 cities, 32 counties, no misses.
      cities: floridaCities
        .filter((c) => c.county === county.name)
        .map((c) => ({ slug: c.slug, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}

export async function getStaticProps({ params }) {
  const { getCountyBySlug } = await import("../../lib/countyData");
  const county = getCountyBySlug(params.slug);
  if (!county) return { notFound: true };

  // Florida only. TX/GA/AL/AR get `fl: null` and render exactly as before — the data
  // behind these fields (VAB fees, VAB clerk addresses, the DOR millage table) exists
  // for Florida and nowhere else, and inventing equivalents for the other states is
  // how a page starts stating things the product cannot back.
  const fl = county.code === "FL" ? await floridaFacts(county) : null;

  return { props: { county, fl, contentRevised: COUNTY_CONTENT_REVISED } };
}
