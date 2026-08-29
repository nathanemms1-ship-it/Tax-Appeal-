// pages/florida/[city].js
// Dynamic neighborhood pages for Florida property tax appeals
// Creates 110 pages at /florida/[city-slug] e.g. /florida/miami-beach

import Head from 'next/head';
import Link from 'next/link';
import { floridaCities } from '../../lib/floridaCities';
import { taglineFor } from '../../lib/flTaglines';
import { breadcrumbSchema } from '../../lib/breadcrumbs';



export async function getStaticPaths() {
  const paths = floridaCities.map((city) => ({
    params: { city: city.slug },
  }));
  return { paths, fallback: false };
}

export async function getStaticProps({ params }) {
  const city = floridaCities.find((c) => c.slug === params.city);
  if (!city) return { notFound: true };

  /**
   * THE FILING WINDOW DATES WERE HARDCODED HERE, AND THEY WERE THE OLD ONES.
   *
   * This page carried `trimOpen = "August 15, 2026"` in the copy and
   * `windowOpen = new Date('2026-08-11')` in the countdown bar. Both predate the
   * correction recorded in lib/filingWindows.js, which moved Florida's open date to
   * 24 Aug precisely because filing before TRIM notices exist produces premature
   * petitions filed against the prior year's assessed value.
   *
   * The live effect on all 131 city pages: from 11 Aug the banner would have read
   * "Florida's filing window is open" for thirteen days during which the funnel
   * refuses to file. Read it, buy, and nothing goes out.
   *
   * Both now derive from FILING_WINDOWS.FL — the same table apply.js gates on — so
   * the page cannot advertise a window the product will not honour.
   */
  const { FILING_WINDOWS, flPetitionDeadline } = await import('../../lib/filingWindows');
  const { counties } = await import('../../lib/countyData');
  const w = FILING_WINDOWS.FL;
  const fmt = (m, d) => new Date(2026, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const fmtDate = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  /**
   * THE CLOSE DATE IS PER COUNTY. THE OPEN DATE IS NOT.
   *
   * The comment above says both "derive from FILING_WINDOWS.FL — the same table
   * apply.js gates on". That was true of the open date and false of the close: the
   * funnel gates on getFilingWindowStatus(state, county, { strict: true }), which
   * substitutes flPetitionDeadline(county) for the statewide hardDeadline. So every
   * one of these 131 pages published 18 September while the product enforced the
   * county's own date — 7 September in Hillsborough, 8th in Duval, 4th in Indian
   * River. The fix the comment describes was only ever half applied.
   */
  const cityDeadline = flPetitionDeadline(city.county, 2026);

  const countySlug = counties.find((c) => c.code === 'FL' && c.name === city.county)?.slug || null;

  /**
   * $89 IS OUR FEE. IT HAS NEVER BEEN THE PRICE.
   *
   * Checkout charges $89 PLUS the county's VAB filing fee, which we then pay to the
   * county on the owner's behalf. Across the 131 cities this file builds, that fee
   * runs $15 to $50 — so the true total is $104 to $139, and every page that said
   * "$89" understated the price by up to 56%.
   *
   * Two of the places it said so were worse than an omission. The meta description
   * and the deadline FAQ both read "with the county filing fee paid", which does not
   * merely leave the fee out — it tells the homeowner we absorb it. And the
   * competitor table put a bare "$89" in a column headed "Cost on an example
   * reduction", directly against Ownwell's percentage: a false comparison rather
   * than a vague one.
   *
   * This bites hardest from 24 Aug, because these are the pages the Google Ads
   * campaign lands paid Florida traffic on. A homeowner who arrives believing $89
   * and is charged $119 at checkout is a refund request and an Ads policy problem,
   * not merely a bounce.
   *
   * So the fee is derived here, per city, from the same table send-letter.js cuts
   * the cheque from. Each page quotes ITS OWN county's number and shows the
   * arithmetic — "$89 + $30 Broward County filing fee = $119 total" — which is both
   * true and a better sell than a bare $89 with a surprise behind it.
   *
   * feeConfirmed false means the county has not set its 2026 fee, so checkout
   * REFUSES the order outright. Such a page must not quote a total or run a buy
   * CTA — see the NASSAU note in the component.
   */
  const { getFlVabFee, formatVabFee } = await import('../../lib/flCountyFees');
  const fee = getFlVabFee(city.county);
  const feeConfirmed = fee.confidence === 'confirmed';

  return {
    props: {
      city,
      countySlug,
      windowOpenISO: new Date(Date.UTC(2026, w.openMonth - 1, w.openDay)).toISOString().slice(0, 10),
      windowCloseISO: new Date(Date.UTC(2026, cityDeadline.getMonth(), cityDeadline.getDate())).toISOString().slice(0, 10),
      trimOpen: fmt(w.openMonth, w.openDay),
      trimDeadline: fmtDate(cityDeadline),
      feeConfirmed,
      feeLabel: feeConfirmed ? formatVabFee(fee.vabFee) : null,
      totalLabel: feeConfirmed ? formatVabFee(8900 + fee.vabFee) : null,
    },
  };
}

export default function FloridaCityPage({ city, countySlug, windowOpenISO, windowCloseISO, trimOpen, trimDeadline, feeConfirmed, feeLabel, totalLabel }) {
  const formattedValue = city.medianHomeValue.toLocaleString();
  const formattedSavings = city.avgSavings.toLocaleString();
  const countyHref = countySlug ? `/counties/${countySlug}` : '/florida';

  const trail = [
    { name: 'Home', href: '/' },
    { name: 'Florida', href: '/florida' },
    { name: `${city.county} County`, href: countyHref },
    { name: city.name },
  ];

  /**
   * ONE SENTENCE, USED EVERYWHERE A PRICE IS STATED.
   *
   * The reason this is a variable rather than eleven hand-written strings: the
   * previous version had the correct disclosure in the hero and the closing CTA and
   * the wrong one in nine other places, so the page contradicted itself and every
   * partial fix left some of them behind. Anything quoting a number must read from
   * here.
   *
   * `feeCta` is the short form for buttons and the sticky bar, where the full
   * sentence will not fit. It still names the fee — "$89 + county fee" is a promise
   * we keep; a bare "$89 Flat" is not.
   */
  const priceLine = feeConfirmed
    ? `$89 plus ${city.county} County's ${feeLabel} VAB filing fee — ${totalLabel} in total`
    : `$89 plus ${city.county} County's VAB filing fee`;
  const feeCta = feeConfirmed ? `${totalLabel} total` : '$89 + county fee';

  const faqs = [
    {
      q: `How do I appeal my property tax in ${city.name}, Florida?`,
      a: `When you receive your TRIM notice in August, you have 25 days to file a petition with the ${city.county} County Value Adjustment Board (VAB). TaxAppeal USA prepares your petition and mails it for you — you sign it yourself — we generate a professional protest letter with comparable sales evidence and mail it 7+ days before your deadline. The cost is ${priceLine}: our $89 service fee, and the county's own filing fee, which we pay to the ${city.county} County VAB on your behalf.`,
    },
    {
      q: `When is the property tax appeal deadline in ${city.name}?`,
      a: `Florida TRIM notices are mailed in mid-August each year. The VAB petition deadline is 25 days after your notice is mailed, typically falling around September 18. You must file before this date — TaxAppeal USA prepares your petition and mails it once you sign — by tracked USPS First Class mail, with the county's filing fee paid to the VAB on your behalf — with time to spare. That county fee is collected at checkout on top of our $89, not absorbed by us.`,
    },
    {
      q: `How much can I save on property taxes in ${city.name}?`,
      a: `It depends on the gap between your assessed value and your property's market value, and the Value Adjustment Board makes the final decision - we cannot promise a number. For scale, Miami-Dade's VAB reduced 14,856 residential parcels for tax year 2024, shifting about $589 per reduced parcel (Miami-Dade VAB, Form DR-529). ${city.county} County publishes its own figures each year, and Florida counties differ sharply. Whatever reduction you get, you keep all of it — we never take a percentage. The cost is ${priceLine}.`,
    },
    {
      q: `What is a TRIM notice in Florida?`,
      a: `TRIM stands for Truth in Millage. It is a notice mailed by your county property appraiser every August showing your proposed property assessment and estimated taxes. If you believe your assessed value is too high, you have 25 days to file a petition with the Value Adjustment Board.`,
    },
    {
      q: `Do I need an attorney to appeal my ${city.name} property taxes?`,
      a: `No attorney is required. Florida law allows homeowners to file VAB petitions themselves. TaxAppeal USA prepares a professional, evidence-backed petition letter and mails it 7+ days before your deadline for ${priceLine} — no attorney fees, no percentage of savings.`,
    },
    {
      q: `Why choose TaxAppeal USA over other services in ${city.name}?`,
      a: `Every competitor charges 25-50% of your savings — this costs homeowners heavily. TaxAppeal USA charges a flat $89 service fee regardless of how much you save, plus ${city.county} County's VAB filing fee, which we pay to the county for you. You keep every dollar of the reduction.`,
    },
  ];

  /**
   * SCHEMA. The FAQPage block that used to sit here is gone — Google's own doc reads
   * "As of May 7, 2026, FAQ rich results are no longer appearing in Google Search",
   * and the documentation was withdrawn on 15 June 2026. It produced nothing on any of
   * these 131 pages. The visible FAQ section stays; only the inert markup went.
   *
   * LocalBusiness became Service for the same reason it did on the county pages: the
   * type requires a postal address and this had none, so every copy was invalid. The
   * valid version would have advertised a Forest Hill, Texas address on a Miami Beach
   * page. Organization is already declared once, site-wide, in pages/_app.js.
   */
  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `${city.name} property tax appeal filing`,
    serviceType: "Florida VAB petition preparation and tracked mail filing",
    description: `Value Adjustment Board petition preparation, county filing fee payment and tracked mail filing for ${city.name}, ${city.county} County homeowners.`,
    url: `https://www.taxappealusa.com/florida/${city.slug}`,
    provider: { "@type": "Organization", name: "TaxAppeal USA", url: "https://www.taxappealusa.com", telephone: "+18175644050" },
    areaServed: { "@type": "City", name: city.name },
  };

  return (
    <>
      <Head>
        {/* One expression, not an expression next to static text. React SSR emits a
            comment separator between adjacent children, so the two-child form served
            `Miami<!-- --> Property Tax Appeal | ...` — visible in Google's results. */}
        {/* The title and description are the ad and search snippet — the first price
            the homeowner ever sees, and the one they hold us to at checkout. They
            quote the TOTAL, not our cut. The old description said "with the county
            filing fee paid", which reads as "we cover it". */}
        <title>{`${city.name} Property Tax Appeal | ${feeCta} | TaxAppeal USA`}</title>
        <meta name="description" content={`Appeal your ${city.name} property tax bill for ${priceLine}. We prepare your ${city.county} County VAB petition, you sign it, and we mail it 7+ days before your deadline — we pay the county's filing fee to the VAB for you. No percentage of your savings, ever.`} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={`https://www.taxappealusa.com/florida/${city.slug}`} key="canonical" />
        <meta property="og:title" content={`${city.name} Property Tax Appeal | ${feeCta} | TaxAppeal USA`} key="og:title" />
        <meta property="og:description" content={`Appeal your ${city.name} property taxes for ${priceLine}. No percentage of your savings, ever. We prepare the petition, you sign it, we mail it on time.`} key="og:description" />
        <meta property="og:url" content={`https://www.taxappealusa.com/florida/${city.slug}`} key="og:url" />
        <meta property="og:type" content="website" key="og:type" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema(trail, `https://www.taxappealusa.com/florida/${city.slug}`)) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }} />
      </Head>

      {(() => {
        const preOrderOpen = new Date('2026-06-12');
        // Derived from FILING_WINDOWS.FL in getStaticProps, not typed in here. The
        // literals this replaces said the window opened 11 Aug — thirteen days before
        // the funnel will actually file. See the note in getStaticProps.
        const windowOpen = new Date(windowOpenISO);
        const windowClose = new Date(windowCloseISO);
        const today = new Date();
        const barStyle = { background: '#FFC940', color: '#0F1F3D', textAlign: 'center', padding: '10px 16px', fontSize: 14, fontWeight: 600 };
        if (today >= preOrderOpen && today < windowOpen) {
          const days = Math.ceil((windowOpen - today) / (1000*60*60*24));
          return (
            <div style={barStyle}>
              🔒 Reserve your {city.county} County spot now — TRIM notices start arriving in {days} days. Lock in today&apos;s {priceLine}; we file the moment your county&apos;s window opens. <a href="/apply" style={{ color: '#0F1F3D', textDecoration: 'underline', marginLeft: 6, fontWeight: 700 }}>Get started →</a>
            </div>
          );
        }
        if (today >= windowOpen && today <= windowClose) {
          return (
            <div style={barStyle}>
              🚨 Florida's filing window is open — file before your county's 25-day deadline. <a href="/apply" style={{ color: '#0F1F3D', textDecoration: 'underline', marginLeft: 6, fontWeight: 700 }}>Get started →</a>
            </div>
          );
        }
        return null;
      })()}


      <div style={{ fontFamily: "'DM Sans',sans-serif", color: "#1B2A4A", maxWidth: "1100px", margin: "0 auto", padding: "0 24px" }}>
        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0", borderBottom: "1px solid #e5e7eb" }}>
          <Link href="/" style={{ textDecoration: "none" }}><span style={{ fontSize: "22px", fontWeight: "800", color: "#1B2A4A" }}>TaxAppeal <span style={{ color: "#C9A84C" }}>USA</span></span></Link>
          <Link href="/apply"><button style={{ background: "#C9A84C", color: "#1B2A4A", border: "none", borderRadius: "8px", padding: "12px 28px", fontWeight: "700", fontSize: "15px", cursor: "pointer" }}>Start My Appeal — {feeCta}</button></Link>
        </nav>

        {/* Breadcrumb — built from the same `trail` the JSON-LD above uses. The
            {County} crumb is the first inbound link these 131 pages have ever given
            /counties/*, which the TX, GA and AR city templates have had all along. */}
        <nav style={{ padding: "14px 0 0", fontSize: "13px", color: "#6b7280" }}>
          {trail.map((crumb, i) => (
            <span key={crumb.name}>
              {i > 0 && " → "}
              {crumb.href
                ? <Link href={crumb.href} style={{ color: "#6b7280", textDecoration: "none" }}>{crumb.name}</Link>
                : <span style={{ color: "#1B2A4A" }}>{crumb.name}</span>}
            </span>
          ))}
        </nav>

        <section style={{ padding: "40px 0 40px", textAlign: "center" }}>
          <div style={{ background: "#1B2A4A", color: "#C9A84C", display: "inline-block", padding: "6px 18px", borderRadius: "20px", fontSize: "13px", fontWeight: "700", marginBottom: "20px" }}>FLORIDA {city.county.toUpperCase()} COUNTY · VAB PETITION</div>
          <h1 style={{ fontSize: "clamp(32px,5vw,54px)", fontWeight: "800", lineHeight: "1.15", marginBottom: "20px", color: "#1B2A4A" }}>{city.name} Property Tax Appeal</h1>
          <p style={{ fontSize: "20px", color: "#4b5563", maxWidth: "680px", margin: "0 auto 32px", lineHeight: "1.6" }}>{city.description} We prepare your petition and mail it for <strong style={{ color: "#C9A84C" }}>{priceLine}</strong> — and we never take a percentage of what you save.</p>
          {/* See lib/flTaglines.js — Florida only, because the savings gate it
              promises is built on the DOR parcel roll we hold only for Florida. */}
          <p style={{ fontSize: "18px", color: "#1B2A4A", maxWidth: "680px", margin: "-16px auto 30px", lineHeight: "1.55", fontWeight: 700 }}>{taglineFor(city.slug || city.name)}</p>

          {/* NASSAU — the two cities whose county has not set its 2026 fee.

              The funnel already does the right thing: an unconfirmed fee fails the
              second gate in canFileInFlCounty(), so apply.js refuses the sale before
              checkout and captures the email for cron/notify-waitlist. What was
              missing was the page saying so. Sending someone from a confident
              "Start My Appeal" straight into a refusal screen is a bad experience
              even when the refusal itself is correct, and it is the only case on
              these 131 pages where the CTA does not lead to a purchase.

              This renders for exactly two cities today (Fernandina Beach, Amelia
              Island). It disappears on its own the moment Nassau's fee is confirmed
              in lib/flCountyFees.js — no edit here. */}
          {!feeConfirmed && (
            <div style={{ maxWidth: "680px", margin: "0 auto 30px", background: "#FFF8E6", border: "1.5px solid #E5C76B", borderRadius: 10, padding: "16px 20px", textAlign: "left", fontSize: 15, lineHeight: 1.6, color: "#1B2A4A" }}>
              <strong>{city.county} County has not set its 2026 filing fee yet.</strong> The Value
              Adjustment Board usually sets it in late August. We will not take your money for a
              filing we cannot complete, so we are not accepting {city.county} County orders
              today — start below and we will email you the moment the fee is confirmed, in time
              to file.
            </div>
          )}
          <Link href="/apply"><button style={{ background: "#C9A84C", color: "#1B2A4A", border: "none", borderRadius: "10px", padding: "16px 40px", fontWeight: "800", fontSize: "18px", cursor: "pointer", marginBottom: "40px" }}>Appeal My {city.name} Taxes</button></Link>
        </section>

        <div style={{ background: "#1B2A4A", color: "white", borderRadius: "12px", padding: "20px 32px", textAlign: "center", margin: "0 32px 48px" }}>
          <span style={{ fontSize: "16px", fontWeight: "600" }}>Florida TRIM notices mail around <strong style={{ color: "#C9A84C" }}>{trimOpen}</strong> — you have 25 days to file. <strong style={{ color: "#C9A84C" }}>Do not miss your window.</strong></span>
        </div>

        <section style={{ padding: "48px 0", borderTop: "1px solid #e5e7eb" }}>
          <h2 style={{ fontSize: "32px", fontWeight: "800", textAlign: "center", marginBottom: "40px" }}>How It Works for {city.name} Homeowners</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "24px" }}>
            {[
              { step: "1", title: "Enter Your Address", desc: `We instantly pull your ${city.county} County assessment data.` },
              { step: "2", title: "We Build Your Case", desc: "Our system generates a professional VAB petition with real comparable sales evidence." },
              { step: "3", title: "Mailed Early, Tracked", desc: `Your petition is sent to the ${city.county} County VAB via USPS mail with tracking, 7+ days before your deadline.` },
              { step: "4", title: "Track Your Outcome", desc: "We notify you when the county responds. Most results in 60-90 days." },
            ].map((s) => (
              <div key={s.step} style={{ background: "#f8f9fa", borderRadius: "12px", padding: "28px 24px", textAlign: "center" }}>
                <div style={{ width: "44px", height: "44px", background: "#1B2A4A", color: "#C9A84C", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "800", fontSize: "18px", margin: "0 auto 16px" }}>{s.step}</div>
                <h3 style={{ fontSize: "17px", fontWeight: "700", marginBottom: "10px" }}>{s.title}</h3>
                <p style={{ fontSize: "14px", color: "#6b7280", lineHeight: "1.6" }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ padding: "48px 0", borderTop: "1px solid #e5e7eb" }}>
          {/* This table was the single most misleading thing on the page. A bare
              "$89" sat in a column headed "Cost", directly against Ownwell's
              percentage — so it did not merely omit the county fee, it invited a
              total-cost comparison on a number that was not the total. Our row now
              carries the real charge, and the footnote states what the competitor
              figures do and do not include, because a comparison that flatters us by
              measuring the two sides differently is the same defect pointed the other
              way. */}
          <h2 style={{ fontSize: "32px", fontWeight: "800", textAlign: "center", marginBottom: "12px" }}>Our Flat Fee vs. The Competition</h2>
          <p style={{ textAlign: "center", color: "#6b7280", fontSize: "17px", marginBottom: "36px" }}>Every other {city.name} property tax service charges a percentage of your savings.</p>
          {/* overflow-x so the table scrolls inside its own box instead of widening the page. */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
              <thead><tr style={{ background: "#1B2A4A", color: "white" }}><th style={{ padding: "14px 20px", textAlign: "left" }}>Service</th><th style={{ padding: "14px 20px", textAlign: "center" }}>Fee Structure</th><th style={{ padding: "14px 20px", textAlign: "center" }}>Cost on an example ${formattedSavings} reduction</th></tr></thead>
              <tbody>
                <tr style={{ background: "#C9A84C20", fontWeight: "700" }}><td style={{ padding: "14px 20px", borderBottom: "1px solid #e5e7eb" }}>TaxAppeal USA</td><td style={{ padding: "14px 20px", textAlign: "center", borderBottom: "1px solid #e5e7eb" }}>$89 flat + county filing fee</td><td style={{ padding: "14px 20px", textAlign: "center", borderBottom: "1px solid #e5e7eb", color: "#16a34a" }}>{feeCta}</td></tr>
                <tr><td style={{ padding: "14px 20px", borderBottom: "1px solid #e5e7eb" }}>Ownwell</td><td style={{ padding: "14px 20px", textAlign: "center", borderBottom: "1px solid #e5e7eb" }}>25-35% of savings</td><td style={{ padding: "14px 20px", textAlign: "center", borderBottom: "1px solid #e5e7eb", color: "#dc2626" }}>${Math.round(city.avgSavings * 0.30).toLocaleString()}</td></tr>
                <tr style={{ background: "#f9fafb" }}><td style={{ padding: "14px 20px", borderBottom: "1px solid #e5e7eb" }}>O&apos;Connor/CutMyTaxes</td><td style={{ padding: "14px 20px", textAlign: "center", borderBottom: "1px solid #e5e7eb" }}>30-50% of savings</td><td style={{ padding: "14px 20px", textAlign: "center", borderBottom: "1px solid #e5e7eb", color: "#dc2626" }}>${Math.round(city.avgSavings * 0.40).toLocaleString()}</td></tr>
                <tr><td style={{ padding: "14px 20px" }}>Local Tax Attorney</td><td style={{ padding: "14px 20px", textAlign: "center" }}>$300-$800+</td><td style={{ padding: "14px 20px", textAlign: "center", color: "#dc2626" }}>$500+</td></tr>
              </tbody>
            </table>
          </div>
          <p style={{ textAlign: "center", color: "#6b7280", fontSize: "13px", marginTop: "14px", lineHeight: 1.6 }}>
            Our figure is what you pay in total: our $89 service fee{feeConfirmed ? ` plus ${city.county} County's ${feeLabel} VAB filing fee` : " plus your county's VAB filing fee"}, which we pay to the county for you.
            Competitor figures are their service fee on an example {`$${formattedSavings}`} reduction and exclude any county filing fee, which they also charge separately.
          </p>
        </section>

        <section style={{ padding: "48px 0", borderTop: "1px solid #e5e7eb" }}>
          <h2 style={{ fontSize: "28px", fontWeight: "800", marginBottom: "20px" }}>Florida Property Tax Appeal Law</h2>
          <div style={{ background: "#f8f9fa", borderRadius: "12px", padding: "28px 32px" }}>
            <p style={{ fontSize: "16px", lineHeight: "1.7", color: "#374151", marginBottom: "16px" }}>Under <strong>Florida Statute §194.011</strong>, every homeowner has the right to petition the VAB to challenge their property assessment. No attorney required.</p>
            <p style={{ fontSize: "16px", lineHeight: "1.7", color: "#374151", marginBottom: "16px" }}>You have exactly <strong>25 days</strong> from your TRIM notice mailing date to file your VAB petition.</p>
            <p style={{ fontSize: "16px", lineHeight: "1.7", color: "#374151" }}>TaxAppeal USA prepares your petition and sends it to the {city.county} County VAB via USPS mail, 7+ days before your deadline, so you have proof of timely filing.</p>
          </div>
        </section>

        <section style={{ padding: "48px 0", borderTop: "1px solid #e5e7eb" }}>
          <h2 style={{ fontSize: "32px", fontWeight: "800", textAlign: "center", marginBottom: "36px" }}>FAQs — {city.name}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {faqs.map((faq, i) => (
              <div key={i} style={{ background: "#f8f9fa", borderRadius: "12px", padding: "24px 28px" }}>
                <h3 style={{ fontSize: "17px", fontWeight: "700", marginBottom: "10px", color: "#1B2A4A" }}>{faq.q}</h3>
                <p style={{ fontSize: "15px", color: "#4b5563", lineHeight: "1.7", margin: 0 }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ padding: "60px 0", textAlign: "center", borderTop: "1px solid #e5e7eb" }}>
          <h2 style={{ fontSize: "36px", fontWeight: "800", marginBottom: "16px" }}>Ready to Appeal Your {city.name} Property Taxes?</h2>
          <p style={{ fontSize: "18px", color: "#6b7280", maxWidth: "560px", margin: "0 auto 32px" }}>File before your county&apos;s VAB deadline. {priceLine} — and we never take a percentage of your savings.</p>
          <Link href="/apply"><button style={{ background: "#C9A84C", color: "#1B2A4A", border: "none", borderRadius: "10px", padding: "18px 48px", fontWeight: "800", fontSize: "20px", cursor: "pointer" }}>Start My Appeal — {feeCta}</button></Link>
          <p style={{ fontSize: "13px", color: "#9ca3af", marginTop: "16px" }}>Florida Statute §194.011 · TRIM Notice VAB Petition · Mailed Filing</p>
        </section>

        {/* The county page carries the things that vary by county and not by city —
            the VAB Clerk's mailing address, the exact filing fee, the millage. Sending
            people there rather than restating it here is what stops 131 city pages
            becoming 131 copies of the same county facts. */}
        <section style={{ padding: "36px 0", borderTop: "1px solid #e5e7eb", textAlign: "center" }}>
          <p style={{ fontSize: "16px", color: "#4b5563", lineHeight: "1.7", maxWidth: "620px", margin: "0 auto" }}>
            {city.name} files through {city.county} County. The{" "}
            <Link href={countyHref} style={{ color: "#1B2A4A", fontWeight: 700 }}>
              {city.county} County appeal guide
            </Link>{" "}
            has the Value Adjustment Board&apos;s mailing address, the county filing fee, the {trimDeadline} deadline
            and the current millage rate.
          </p>
        </section>

        <footer style={{ borderTop: "1px solid #e5e7eb", padding: "32px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div style={{ fontSize: "14px", color: "#9ca3af" }}>© 2026 TaxAppeal USA · <Link href="/florida" style={{ color: "#9ca3af" }}>Florida Property Tax Appeal</Link> · <Link href="/terms" style={{ color: "#9ca3af" }}>Terms</Link> · <Link href="/privacy" style={{ color: "#9ca3af" }}>Privacy</Link></div>
          <div style={{ fontSize: "13px", color: "#9ca3af" }}>Serving {city.name}, {city.county} County, Florida</div>
        </footer>
      </div>
    </>
  );
}
