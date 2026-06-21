// pages/florida/[city].js
// Dynamic neighborhood pages for Florida property tax appeals
// Creates 50 pages at /florida/[city-slug] e.g. /florida/miami-beach

import Head from 'next/head';
import Link from 'next/link';

const floridaCities = [
  { slug: "miami-beach", name: "Miami Beach", county: "Miami-Dade", medianHomeValue: 875000, avgSavings: 2400, description: "Miami Beach homeowners face some of Florida's highest assessed values, making property tax appeals especially valuable." },
  { slug: "coral-gables", name: "Coral Gables", county: "Miami-Dade", medianHomeValue: 1100000, avgSavings: 3100, description: "Coral Gables luxury homes are frequently over-assessed, making appeals one of the smartest financial moves homeowners can make." },
  { slug: "coconut-grove", name: "Coconut Grove", county: "Miami-Dade", medianHomeValue: 950000, avgSavings: 2700, description: "Coconut Grove's historic homes and waterfront properties are often valued inconsistently, creating strong grounds for appeal." },
  { slug: "brickell", name: "Brickell", county: "Miami-Dade", medianHomeValue: 620000, avgSavings: 1800, description: "Brickell condo owners frequently win property tax appeals due to market fluctuations in Miami's urban core." },
  { slug: "aventura", name: "Aventura", county: "Miami-Dade", medianHomeValue: 480000, avgSavings: 1400, description: "Aventura's high-rise condos and luxury homes are prime candidates for property tax appeals." },
  { slug: "doral", name: "Doral", county: "Miami-Dade", medianHomeValue: 520000, avgSavings: 1500, description: "Doral's rapidly growing real estate market means assessments often lag behind or overshoot actual market values." },
  { slug: "kendall", name: "Kendall", county: "Miami-Dade", medianHomeValue: 480000, avgSavings: 1300, description: "Kendall homeowners consistently find their assessments higher than comparable sales support." },
  { slug: "hialeah", name: "Hialeah", county: "Miami-Dade", medianHomeValue: 390000, avgSavings: 1100, description: "Hialeah's large homeowner population means millions in collective over-assessed property taxes every year." },
  { slug: "boca-raton", name: "Boca Raton", county: "Palm Beach", medianHomeValue: 680000, avgSavings: 1900, description: "Boca Raton's luxury market and gated communities make property tax appeals a financially savvy move for homeowners." },
  { slug: "fort-lauderdale", name: "Fort Lauderdale", county: "Broward", medianHomeValue: 520000, avgSavings: 1500, description: "Fort Lauderdale's waterfront and canal properties are frequently over-assessed relative to comparable sales." },
  { slug: "pompano-beach", name: "Pompano Beach", county: "Broward", medianHomeValue: 410000, avgSavings: 1200, description: "Pompano Beach homeowners have strong appeal success rates thanks to market inconsistencies in assessed values." },
  { slug: "hollywood-fl", name: "Hollywood", county: "Broward", medianHomeValue: 390000, avgSavings: 1100, description: "Hollywood Florida homeowners near the beach often see assessments that don't reflect actual market conditions." },
  { slug: "weston", name: "Weston", county: "Broward", medianHomeValue: 620000, avgSavings: 1800, description: "Weston's master-planned communities and high home values make property tax appeals especially rewarding." },
  { slug: "coral-springs", name: "Coral Springs", county: "Broward", medianHomeValue: 480000, avgSavings: 1400, description: "Coral Springs homeowners frequently succeed in appeals due to assessment inconsistencies across similar neighborhoods." },
  { slug: "pembroke-pines", name: "Pembroke Pines", county: "Broward", medianHomeValue: 430000, avgSavings: 1200, description: "Pembroke Pines is one of Broward's largest cities with thousands of homeowners who could benefit from an appeal." },
  { slug: "miramar", name: "Miramar", county: "Broward", medianHomeValue: 460000, avgSavings: 1300, description: "Miramar's fast-growing real estate market creates frequent assessment discrepancies worth challenging." },
  { slug: "west-palm-beach", name: "West Palm Beach", county: "Palm Beach", medianHomeValue: 430000, avgSavings: 1200, description: "West Palm Beach homeowners benefit from appeals especially in neighborhoods with mixed property types and values." },
  { slug: "boynton-beach", name: "Boynton Beach", county: "Palm Beach", medianHomeValue: 380000, avgSavings: 1100, description: "Boynton Beach's active 55+ community and family neighborhoods both see regular over-assessment issues." },
  { slug: "delray-beach", name: "Delray Beach", county: "Palm Beach", medianHomeValue: 520000, avgSavings: 1500, description: "Delray Beach's revitalized downtown and beach proximity drive high assessments that are frequently worth challenging." },
  { slug: "palm-beach-gardens", name: "Palm Beach Gardens", county: "Palm Beach", medianHomeValue: 620000, avgSavings: 1800, description: "Palm Beach Gardens luxury communities and golf course homes are regularly assessed above supportable market values." },
  { slug: "jupiter-fl", name: "Jupiter", county: "Palm Beach", medianHomeValue: 580000, avgSavings: 1700, description: "Jupiter's waterfront and equestrian properties often have assessments that don't match comparable sales evidence." },
  { slug: "wellington-fl", name: "Wellington", county: "Palm Beach", medianHomeValue: 520000, avgSavings: 1500, description: "Wellington homeowners in equestrian and suburban communities consistently find value in property tax appeals." },
  { slug: "brandon-fl", name: "Brandon", county: "Hillsborough", medianHomeValue: 360000, avgSavings: 1000, description: "Brandon's booming suburban growth means assessments often outpace what comparable homes are actually selling for." },
  { slug: "riverview-fl", name: "Riverview", county: "Hillsborough", medianHomeValue: 370000, avgSavings: 1050, description: "Riverview is one of Florida's fastest growing communities — rapid development creates assessment inconsistencies." },
  { slug: "wesley-chapel", name: "Wesley Chapel", county: "Pasco", medianHomeValue: 390000, avgSavings: 1100, description: "Wesley Chapel's new construction boom makes it especially important to verify your assessment against actual sales." },
  { slug: "temple-terrace", name: "Temple Terrace", county: "Hillsborough", medianHomeValue: 320000, avgSavings: 900, description: "Temple Terrace homeowners near the University of South Florida corridor often see inconsistent assessments." },
  { slug: "lutz-fl", name: "Lutz", county: "Hillsborough", medianHomeValue: 480000, avgSavings: 1400, description: "Lutz's upscale lakefront and acreage properties are frequently assessed without adequate comparable sales analysis." },
  { slug: "clearwater-fl", name: "Clearwater", county: "Pinellas", medianHomeValue: 380000, avgSavings: 1100, description: "Clearwater Beach and inland properties alike see appeal successes thanks to Florida's favorable VAB petition process." },
  { slug: "st-petersburg-fl", name: "St. Petersburg", county: "Pinellas", medianHomeValue: 360000, avgSavings: 1000, description: "St. Pete's rapidly gentrifying neighborhoods mean assessments are often based on outdated or inflated comps." },
  { slug: "largo-fl", name: "Largo", county: "Pinellas", medianHomeValue: 290000, avgSavings: 820, description: "Largo homeowners benefit from appeals particularly in neighborhoods transitioning between older and newer construction." },
  { slug: "dunedin-fl", name: "Dunedin", county: "Pinellas", medianHomeValue: 420000, avgSavings: 1200, description: "Dunedin's charming downtown and waterfront proximity drive high assessments that are often successfully appealed." },
  { slug: "tarpon-springs", name: "Tarpon Springs", county: "Pinellas", medianHomeValue: 350000, avgSavings: 990, description: "Tarpon Springs' unique historic character and sponge docks area create assessment challenges worth appealing." },
  { slug: "winter-park-fl", name: "Winter Park", county: "Orange", medianHomeValue: 680000, avgSavings: 1900, description: "Winter Park's luxury homes and historic estates are frequently over-assessed by Orange County appraisers." },
  { slug: "kissimmee-fl", name: "Kissimmee", county: "Osceola", medianHomeValue: 330000, avgSavings: 940, description: "Kissimmee's short-term rental market creates unique assessment challenges that homeowners can successfully appeal." },
  { slug: "oviedo-fl", name: "Oviedo", county: "Seminole", medianHomeValue: 430000, avgSavings: 1200, description: "Oviedo's highly desirable school district drives home prices that assessors don't always accurately reflect." },
  { slug: "lake-nona", name: "Lake Nona", county: "Orange", medianHomeValue: 520000, avgSavings: 1500, description: "Lake Nona's medical city and new construction boom create rapid assessment changes worth reviewing annually." },
  { slug: "apopka-fl", name: "Apopka", county: "Orange", medianHomeValue: 360000, avgSavings: 1020, description: "Apopka's suburban growth and new development create frequent assessment inconsistencies for homeowners to challenge." },
  { slug: "naples-fl", name: "Naples", county: "Collier", medianHomeValue: 890000, avgSavings: 2500, description: "Naples homeowners have some of Florida's highest savings potential — luxury properties are frequently over-assessed." },
  { slug: "marco-island", name: "Marco Island", county: "Collier", medianHomeValue: 980000, avgSavings: 2800, description: "Marco Island's waterfront and gulf access properties have among the highest appeal success rates in Florida." },
  { slug: "bonita-springs", name: "Bonita Springs", county: "Lee", medianHomeValue: 560000, avgSavings: 1600, description: "Bonita Springs luxury communities and golf course properties regularly see assessment reductions on appeal." },
  { slug: "fort-myers-fl", name: "Fort Myers", county: "Lee", medianHomeValue: 380000, avgSavings: 1080, description: "Fort Myers homeowners experienced significant post-hurricane assessment volatility, creating strong appeal opportunities." },
  { slug: "cape-coral", name: "Cape Coral", county: "Lee", medianHomeValue: 390000, avgSavings: 1100, description: "Cape Coral's massive canal system and waterfront market make property assessments especially difficult to get right." },
  { slug: "estero-fl", name: "Estero", county: "Lee", medianHomeValue: 480000, avgSavings: 1360, description: "Estero's upscale communities and golf course developments frequently see favorable results from VAB petitions." },
  { slug: "sarasota-fl", name: "Sarasota", county: "Sarasota", medianHomeValue: 510000, avgSavings: 1450, description: "Sarasota's arts district and beachfront properties are often assessed above what comparable sales actually support." },
  { slug: "venice-fl", name: "Venice", county: "Sarasota", medianHomeValue: 420000, avgSavings: 1200, description: "Venice homeowners near the island and beach areas consistently benefit from the Florida VAB appeal process." },
  { slug: "north-port-fl", name: "North Port", county: "Sarasota", medianHomeValue: 340000, avgSavings: 970, description: "North Port's rapid growth makes it one of Sarasota County's most active markets for successful property tax appeals." },
  { slug: "jacksonville-beach", name: "Jacksonville Beach", county: "Duval", medianHomeValue: 580000, avgSavings: 1650, description: "Jacksonville Beach oceanfront and near-beach properties are frequently assessed above actual market values." },
  { slug: "ponte-vedra-beach", name: "Ponte Vedra Beach", county: "St. Johns", medianHomeValue: 820000, avgSavings: 2300, description: "Ponte Vedra Beach luxury homes and golf communities have some of northeast Florida's highest appeal savings potential." },
  { slug: "fleming-island", name: "Fleming Island", county: "Clay", medianHomeValue: 380000, avgSavings: 1080, description: "Fleming Island homeowners in Clay County's fastest growing area often find their assessments outpacing market data." },
  { slug: "daytona-beach", name: "Daytona Beach", county: "Volusia", medianHomeValue: 290000, avgSavings: 820, description: "Daytona Beach homeowners near the speedway and ocean find significant value in the VAB appeal process." },
  { slug: "new-smyrna-beach", name: "New Smyrna Beach", county: "Volusia", medianHomeValue: 480000, avgSavings: 1360, description: "New Smyrna Beach's surf town charm drives high demand and frequent over-assessment of beachside properties." },
];
{ slug: "parkland-fl", name: "Parkland", county: "Broward", medianHomeValue: 920000, avgSavings: 2600, description: "Parkland was ranked the #1 best place to live in Florida, and its luxury gated communities reflect that prestige in their assessed values. Over-assessments here translate to thousands in unnecessary taxes annually." },
  { slug: "davie-fl", name: "Davie", county: "Broward", medianHomeValue: 480000, avgSavings: 1400, description: "Davie homeowners across one of Broward's largest communities frequently find assessment inconsistencies. With equestrian estates and suburban neighborhoods, varied property types create strong appeal opportunities." },
  { slug: "cooper-city-fl", name: "Cooper City", county: "Broward", medianHomeValue: 540000, avgSavings: 1550, description: "Cooper City is consistently ranked among Broward's most desirable suburbs, and high demand drives assessments above true market value. Our flat fee appeal process gives homeowners a clear path to savings." },
  { slug: "plantation-fl", name: "Plantation", county: "Broward", medianHomeValue: 500000, avgSavings: 1450, description: "Plantation's established neighborhoods and proximity to Fort Lauderdale create assessment pressures that often exceed actual sale prices. Formal VAB petitions here regularly achieve meaningful reductions." },
  { slug: "deerfield-beach", name: "Deerfield Beach", county: "Broward", medianHomeValue: 390000, avgSavings: 1100, description: "Deerfield Beach homeowners benefit from strong appeal success rates in Broward County. Coastal and inland properties alike frequently carry assessments that exceed what comparable sales support." },
  { slug: "lighthouse-point", name: "Lighthouse Point", county: "Broward", medianHomeValue: 780000, avgSavings: 2200, description: "Lighthouse Point's waterfront homes and boating community command premium prices that assessors frequently overestimate. Our certified mail filing ensures your VAB petition is received by the deadline." },
  { slug: "sunny-isles-beach", name: "Sunny Isles Beach", county: "Miami-Dade", medianHomeValue: 950000, avgSavings: 2700, description: "Sunny Isles Beach's luxury high-rises are among Miami-Dade's most frequently over-assessed properties. Condo market fluctuations create significant opportunities for successful tax appeals." },
  { slug: "hallandale-beach", name: "Hallandale Beach", county: "Broward", medianHomeValue: 420000, avgSavings: 1200, description: "Hallandale Beach homeowners on the Miami-Dade border benefit from formal appeals as rapidly changing market conditions create assessment discrepancies throughout this coastal community." },
  { slug: "surfside-fl", name: "Surfside", county: "Miami-Dade", medianHomeValue: 1200000, avgSavings: 3400, description: "Surfside's exclusive beachfront community carries some of Miami-Dade's highest assessed values. Even modest percentage reductions through a VAB appeal can yield thousands in annual tax savings." },
  { slug: "bal-harbour", name: "Bal Harbour", county: "Miami-Dade", medianHomeValue: 1500000, avgSavings: 4200, description: "Bal Harbour's ultra-luxury properties and world-class shopping district create unique valuation challenges. Over-assessments here represent some of the largest savings opportunities in all of Florida." },
  { slug: "key-biscayne", name: "Key Biscayne", county: "Miami-Dade", medianHomeValue: 1400000, avgSavings: 3900, description: "Key Biscayne's island exclusivity and limited comparable sales create frequent over-assessment situations. Our flat $79 fee is a minimal investment compared to the annual savings a successful appeal delivers." },
  { slug: "pinecrest-fl", name: "Pinecrest", county: "Miami-Dade", medianHomeValue: 1050000, avgSavings: 3000, description: "Pinecrest's upscale residential community with large lot homes is frequently over-assessed by Miami-Dade. With median home values over $1M, successful appeals here routinely save homeowners $3,000 or more annually." },
  { slug: "homestead-fl", name: "Homestead", county: "Miami-Dade", medianHomeValue: 350000, avgSavings: 1000, description: "Homestead homeowners in Miami-Dade's southern communities benefit from formal VAB petitions as rapid growth has created assessment inconsistencies across this expanding market." },
  { slug: "westchase-fl", name: "Westchase", county: "Hillsborough", medianHomeValue: 580000, avgSavings: 1650, description: "Westchase is one of Tampa's most desirable master-planned communities, and high demand drives assessments that frequently exceed true market value. Our streamlined filing process makes appealing straightforward." },
  { slug: "south-tampa-fl", name: "South Tampa", county: "Hillsborough", medianHomeValue: 720000, avgSavings: 2050, description: "South Tampa's Bayshore Boulevard corridor and historic neighborhoods carry premium assessments that often outpace comparable sales. With median values over $700K, every percentage point of reduction matters." },
  { slug: "carrollwood-fl", name: "Carrollwood", county: "Hillsborough", medianHomeValue: 400000, avgSavings: 1150, description: "Carrollwood's established suburban neighborhoods and lakefront homes frequently carry over-assessments in Hillsborough County. Our certified mail filing ensures your protest reaches the VAB on time." },
  { slug: "siesta-key-fl", name: "Siesta Key", county: "Sarasota", medianHomeValue: 1150000, avgSavings: 3300, description: "Siesta Key's award-winning beaches and luxury homes create significant valuation challenges. Over-assessments on this barrier island are common, and successful appeals regularly save homeowners thousands annually." },
  { slug: "lakewood-ranch-fl", name: "Lakewood Ranch", county: "Manatee", medianHomeValue: 560000, avgSavings: 1600, description: "Lakewood Ranch is one of the nation's fastest-growing master-planned communities. Rapid new construction creates comparable sales gaps that lead to frequent over-assessments worth appealing." },
  { slug: "bradenton-fl", name: "Bradenton", county: "Manatee", medianHomeValue: 380000, avgSavings: 1100, description: "Bradenton homeowners across Manatee County benefit from formal VAB appeals as waterfront and suburban properties alike are frequently assessed above what comparable sales support." },
  { slug: "port-st-lucie-fl", name: "Port St. Lucie", county: "St. Lucie", medianHomeValue: 370000, avgSavings: 1050, description: "Port St. Lucie is one of Florida's fastest-growing cities, and rapid expansion creates consistent assessment discrepancies. Our flat fee appeal process is perfect for this high-volume, high-opportunity market." },
  { slug: "vero-beach-fl", name: "Vero Beach", county: "Indian River", medianHomeValue: 450000, avgSavings: 1300, description: "Vero Beach's upscale coastal community and golf course neighborhoods frequently carry over-assessments. Indian River County homeowners benefit from formal VAB petitions that target these discrepancies." },
  { slug: "lakeland-fl", name: "Lakeland", county: "Polk", medianHomeValue: 310000, avgSavings: 900, description: "Lakeland homeowners between Tampa and Orlando benefit from formal VAB appeals as this growing market experiences frequent assessment inconsistencies. Our flat $79 fee makes protesting accessible for every homeowner." },
  { slug: "doctor-phillips-fl", name: "Doctor Phillips", county: "Orange", medianHomeValue: 680000, avgSavings: 1900, description: "Doctor Phillips homeowners near the Restaurant Row corridor and luxury golf communities frequently find their assessments exceed comparable sale prices, making formal appeals an excellent financial decision." },
  { slug: "windermere-fl", name: "Windermere", county: "Orange", medianHomeValue: 1100000, avgSavings: 3100, description: "Windermere's lakefront estates and gated communities are prime candidates for property tax appeals. With limited comparable sales and unique waterfront features, assessors frequently miss the mark on true market value." },
  { slug: "hunters-creek-fl", name: "Hunters Creek", county: "Orange", medianHomeValue: 420000, avgSavings: 1200, description: "Hunters Creek's large planned community with thousands of homes sees consistent over-assessment patterns. Our flat $79 fee makes formal VAB filing affordable for every homeowner in this Orange County community." },
  { slug: "new-tampa-fl", name: "New Tampa", county: "Hillsborough", medianHomeValue: 450000, avgSavings: 1300, description: "New Tampa's large planned communities and consistent housing stock create both the need and the evidence for successful property tax appeals. Our flat fee service handles all filing formalities." },
  { slug: "estero-fl", name: "Estero", county: "Lee", medianHomeValue: 520000, avgSavings: 1500, description: "Estero's luxury communities between Fort Myers and Naples see frequent over-assessments as high demand pushes assessed values above true market prices. Our filing service makes the appeal process seamless." },
  { slug: "longboat-key-fl", name: "Longboat Key", county: "Sarasota", medianHomeValue: 1200000, avgSavings: 3400, description: "Longboat Key's ultra-luxury barrier island homes are among Sarasota County's most frequently over-assessed. Gulf-front estates here regularly see six-figure assessment reductions through formal VAB appeals." },
  { slug: "golden-gate-fl", name: "Golden Gate", county: "Collier", medianHomeValue: 380000, avgSavings: 1100, description: "Golden Gate homeowners in the Naples area benefit from formal VAB appeals as Collier County's growing market creates assessment inconsistencies across this large suburban community." },
  { slug: "melbourne-fl", name: "Melbourne", county: "Brevard", medianHomeValue: 320000, avgSavings: 900, description: "Melbourne homeowners on the Space Coast benefit from formal property tax appeals as the tech and aerospace boom drives assessments that frequently outpace comparable sales." },export async function getStaticPaths() {
  const paths = floridaCities.map((city) => ({
    params: { city: city.slug },
  }));
  return { paths, fallback: false };
}

export async function getStaticProps({ params }) {
  const city = floridaCities.find((c) => c.slug === params.city);
  if (!city) return { notFound: true };
  return { props: { city } };
}

export default function FloridaCityPage({ city }) {
  const formattedValue = city.medianHomeValue.toLocaleString();
  const formattedSavings = city.avgSavings.toLocaleString();
  const trimDeadline = "September 18, 2026";
  const trimOpen = "August 15, 2026";

  const faqs = [
    {
      q: `How do I appeal my property tax in ${city.name}, Florida?`,
      a: `When you receive your TRIM notice in August, you have 25 days to file a petition with the ${city.county} County Value Adjustment Board (VAB). TaxAppeal USA handles the entire process for you — we generate a professional protest letter with comparable sales evidence and file it via certified mail, all for a flat $79 fee.`,
    },
    {
      q: `When is the property tax appeal deadline in ${city.name}?`,
      a: `Florida TRIM notices are mailed in mid-August each year. The VAB petition deadline is 25 days after your notice is mailed, typically falling around September 18. You must file before this date — TaxAppeal USA can file on your behalf with time to spare.`,
    },
    {
      q: `How much can I save on property taxes in ${city.name}?`,
      a: `${city.name} homeowners with a median home value of $${formattedValue} save an average of $${formattedSavings} per year when their appeal is successful. At a flat $79 fee, TaxAppeal USA pays for itself many times over.`,
    },
    {
      q: `What is a TRIM notice in Florida?`,
      a: `TRIM stands for Truth in Millage. It is a notice mailed by your county property appraiser every August showing your proposed property assessment and estimated taxes. If you believe your assessed value is too high, you have 25 days to file a petition with the Value Adjustment Board.`,
    },
    {
      q: `Do I need an attorney to appeal my ${city.name} property taxes?`,
      a: `No attorney is required. Florida law allows homeowners to file VAB petitions themselves. TaxAppeal USA prepares a professional, evidence-backed petition letter and sends it via certified mail for just $79 — no attorney fees, no percentage of savings.`,
    },
    {
      q: `Why choose TaxAppeal USA over other services in ${city.name}?`,
      a: `Every competitor charges 25-50% of your savings — this costs homeowners heavily. TaxAppeal USA charges a flat $79 regardless of how much you save. You keep more of what you earn.`,
    },
  ];

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => {
      return {
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      };
    }),
  };

  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "TaxAppeal USA",
    description: `Property tax appeal service for ${city.name}, Florida homeowners`,
    url: `https://www.taxappealusa.com/florida/${city.slug}`,
    areaServed: { "@type": "City", name: city.name },
    priceRange: "$79 flat fee",
    telephone: "+18175644050",
  };

  return (
    <>
      <Head>
        <title>{city.name} Property Tax Appeal | $79 Flat Fee | TaxAppeal USA</title>
        <meta name="description" content={`Appeal your ${city.name} property tax bill for just $79 flat. ${city.county} County homeowners save an average of $${formattedSavings}/year. We file your VAB petition via certified mail. No percentage fees ever.`} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={`https://www.taxappealusa.com/florida/${city.slug}`} />
        <meta property="og:title" content={`${city.name} Property Tax Appeal | $79 Flat | TaxAppeal USA`} />
        <meta property="og:description" content={`Save an average of $${formattedSavings} on your ${city.name} property taxes. Flat $79 fee - no percentages. We handle everything.`} />
        <meta property="og:url" content={`https://www.taxappealusa.com/florida/${city.slug}`} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }} />
      </Head>

      <div style={{ fontFamily: "'DM Sans',sans-serif", color: "#1B2A4A", maxWidth: "1100px", margin: "0 auto", padding: "0 24px" }}>
        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 0", borderBottom: "1px solid #e5e7eb" }}>
          <Link href="/" style={{ textDecoration: "none" }}><span style={{ fontSize: "22px", fontWeight: "800", color: "#1B2A4A" }}>TaxAppeal <span style={{ color: "#C9A84C" }}>USA</span></span></Link>
          <Link href="/apply"><button style={{ background: "#C9A84C", color: "#1B2A4A", border: "none", borderRadius: "8px", padding: "12px 28px", fontWeight: "700", fontSize: "15px", cursor: "pointer" }}>Start My Appeal — $79</button></Link>
        </nav>

        <section style={{ padding: "60px 0 40px", textAlign: "center" }}>
          <div style={{ background: "#1B2A4A", color: "#C9A84C", display: "inline-block", padding: "6px 18px", borderRadius: "20px", fontSize: "13px", fontWeight: "700", marginBottom: "20px" }}>FLORIDA️ {city.county.toUpperCase()} COUNTY· VAB PETITION</div>
          <h1 style={{ fontSize: "clamp(32px,5vw,54px)", fontWeight: "800", lineHeight: "1.15", marginBottom: "20px", color: "#1B2A4A" }}>{city.name} Property Tax Appeal</h1>
          <p style={{ fontSize: "20px", color: "#4b5563", maxWidth: "680px", margin: "0 auto 32px", lineHeight: "1.6" }}>{city.description} Save an average of <strong style={{ color: "#1B2A4A" }}>${formattedSavings}</strong> per year for just <strong style={{ color: "#C9A84C" }}>$79 flat</strong>.</p>
          <Link href="/apply"><button style={{ background: "#C9A84C", color: "#1B2A4A", border: "none", borderRadius: "10px", padding: "16px 40px", fontWeight: "800", fontSize: "18px", cursor: "pointer", marginBottom: "40px" }}>Appeal My {city.name} Taxes →</button></Link>
        </section>

        <div style={{ background: "#1B2A4A", color: "white", borderRadius: "12px", padding: "20px 32px", textAlign: "center", margin: "0 32px 48px" }}>
          <span style={{ fontSize: "16px", fontWeight: "600" }}>🗓️ Florida TRIM notices mail around <strong style={{ color: "#C9A84C" }}>{trimOpen}</strong> - you have 25 days to file. <strong style={{ color: "#C9A84C" }}>Do not miss your window.</strong></span>
        </div>

        <section style={{ padding: "48px 0", borderTop: "1px solid #e5e7eb" }}>
          <h2 style={{ fontSize: "32px", fontWeight: "800", textAlign: "center", marginBottom: "40px" }}>How It Works for {city.name} Homeowners</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "24px" }}>
            {[
              { step: "1", title: "Enter Your Address", desc: `We instantly pull your ${city.county} County assessment data.` },
              { step: "2", title: "We Build Your Case", desc: "Our system generates a professional VAB petition with real comparable sales evidence." },
              { step: "3", title: "Certified Mail Filing", desc: `Your petition is sent to the ${city.county} County VAB via USPS certified mail with tracking.` },
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
          <h2 style={{ fontSize: "32px", fontWeight: "800", textAlign: "center", marginBottom: "12px" }}>$79 Flat vs. The Competition</h2>
          <p style={{ textAlign: "center", color: "#6b7280", fontSize: "17px", marginBottom: "36px" }}>Every other {city.name} property tax service charges a percentage of your savings.</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
            <thead><tr style={{ background: "#1B2A4A", color: "white" }}><th style={{ padding: "14px 20px", textAlign: "left" }}>Service</th><th style={{ padding: "14px 20px", textAlign: "center" }}>Fee Structure</th><th style={{ padding: "14px 20px", textAlign: "center" }}>Cost on ${formattedSavings} Win</th></tr></thead>
            <tbody>
              <tr style={{ background: "#C9A84C20", fontWeight: "700" }}><td style={{ padding: "14px 20px", borderBottom: "1px solid #e5e7eb" }}>✅ TaxAppeal USA</td><td style={{ padding: "14px 20px", textAlign: "center", borderBottom: "1px solid #e5e7eb" }}>$79 flat fee</td><td style={{ padding: "14px 20px", textAlign: "center", borderBottom: "1px solid #e5e7eb", color: "#16a34a" }}>$79</td></tr>
              <tr><td style={{ padding: "14px 20px", borderBottom: "1px solid #e5e7eb" }}>Ownwell</td><td style={{ padding: "14px 20px", textAlign: "center", borderBottom: "1px solid #e5e7eb" }}>25-35% of savings</td><td style={{ padding: "14px 20px", textAlign: "center", borderBottom: "1px solid #e5e7eb", color: "#dc2626" }}>${Math.round(city.avgSavings * 0.30).toLocaleString()}</td></tr>
              <tr style={{ background: "#f9fafb" }}><td style={{ padding: "14px 20px", borderBottom: "1px solid #e5e7eb" }}>O'Connor/CutMyTaxes</td><td style={{ padding: "14px 20px", textAlign: "center", borderBottom: "1px solid #e5e7eb" }}>30-50% of savings</td><td style={{ padding: "14px 20px", textAlign: "center", borderBottom: "1px solid #e5e7eb", color: "#dc2626" }}>${Math.round(city.avgSavings * 0.40).toLocaleString()}</td></tr>
              <tr><td style={{ padding: "14px 20px" }}>Local Tax Attorney</td><td style={{ padding: "14px 20px", textAlign: "center" }}>$300-$800+</td><td style={{ padding: "14px 20px", textAlign: "center", color: "#dc2626" }}>$500+</td></tr>
            </tbody>
          </table>
        </section>

        <section style={{ padding: "48px 0", borderTop: "1px solid #e5e7eb" }}>
          <h2 style={{ fontSize: "28px", fontWeight: "800", marginBottom: "20px" }}>Florida Property Tax Appeal Law</h2>
          <div style={{ background: "#f8f9fa", borderRadius: "12px", padding: "28px 32px" }}>
            <p style={{ fontSize: "16px", lineHeight: "1.7", color: "#374151", marginBottom: "16px" }}>Under <strong>Florida Statute §194.011</strong>, every homeowner has the right to petition the VAB to challenge their property assessment. No attorney required.</p>
            <p style={{ fontSize: "16px", lineHeight: "1.7", color: "#374151", marginBottom: "16px" }}>You have exactly <strong>25 days</strong> from your TRIM notice mailing date to file your VAB petition.</p>
            <p style={{ fontSize: "16px", lineHeight: "1.7", color: "#374151" }}>TaxAppeal USA prepares your petition and sends it to the {city.county} County VAB via USPS certified mail so you have proof of timely filing.</p>
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
          <p style={{ fontSize: "18px", color: "#6b7280", maxWidth: "560px", margin: "0 auto 32px" }}>Join thousands of Florida homeowners saving an average of ${formattedSavings}/year. Just $79 flat.</p>
          <Link href="/apply"><button style={{ background: "#C9A84C", color: "#1B2A4A", border: "none", borderRadius: "10px", padding: "18px 48px", fontWeight: "800", fontSize: "20px", cursor: "pointer" }}>Start My Appeal —  $79 Flat →</button></Link>
          <p style={{ fontSize: "13px", color: "#9ca3af", marginTop: "16px" }}>⚖» Florida Statute §194.011 · TRIM Notice VAB Petition · USPS Certified Mail Filing</p>
        </section>

        <footer style={{ borderTop: "1px solid #e5e7eb", padding: "32px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div style={{ fontSize: "14px", color: "#9ca3af" }}>© 2026 TaxAppeal USA · <Link href="/florida" style={{ color: "#9ca3af" }}>Florida Property Tax Appeal</Link> · <Link href="/terms" style={{ color: "#9ca3af" }}>Terms</Link> · <Link href="/privacy" style={{ color: "#9ca3af" }}>Privacy</Link></div>
          <div style={{ fontSize: "13px", color: "#9ca3af" }}>Serving {city.name}, {city.county} County, Florida</div>
        </footer>
      </div>
    </>
  );
}
