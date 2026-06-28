// pages/api/sitemap.xml.js
// Self-contained sitemap — do not import from external files
// Updated: 2026-06-28 — 108 blog posts, all states

const floridaCitySlugs = [
  "miami-beach","coral-gables","coconut-grove","brickell","aventura","doral","kendall","hialeah",
  "boca-raton","fort-lauderdale","pompano-beach","hollywood-fl","weston","coral-springs","pembroke-pines","miramar",
  "west-palm-beach","boynton-beach","delray-beach","palm-beach-gardens","jupiter-fl","wellington-fl",
  "brandon-fl","riverview-fl","wesley-chapel","temple-terrace","lutz-fl",
  "clearwater-fl","st-petersburg-fl","largo-fl","dunedin-fl","tarpon-springs",
  "winter-park-fl","kissimmee-fl","oviedo-fl","lake-nona","apopka-fl",
  "naples-fl","marco-island","bonita-springs","fort-myers-fl","cape-coral","estero-fl",
  "sarasota-fl","venice-fl","north-port-fl",
  "jacksonville-beach","ponte-vedra-beach","fleming-island",
  "daytona-beach","new-smyrna-beach",
  "palm-beach","north-miami-beach","key-biscayne","lakeland-fl","hunters-creek-fl",
  "the-villages-fl","palm-bay-fl","port-st-lucie-fl","vero-beach-fl","pensacola-fl",
  "panama-city-beach-fl","tallahassee-fl","gainesville-fl","ocala-fl","st-augustine-fl",
  "deltona-fl","melbourne-fl","palm-coast-fl","santa-rosa-beach-fl","destin-fl",
  "bradenton-fl","punta-gorda-fl","port-charlotte-fl","crystal-river-fl","homosassa-fl",
  "fernandina-beach-fl","yulee-fl","land-o-lakes-fl","zephyrhills-fl","auburndale-fl",
  "haines-city-fl","celebration-fl","st-cloud-fl","poinciana-fl","dade-city-fl",
  "ormond-beach-fl","holly-hill-fl","edgewater-fl","new-port-richey-fl","tarpon-springs",
];

const allCountySlugs = [
  // Texas — 254 counties (major ones)
  "harris-county-tx","dallas-county-tx","tarrant-county-tx","bexar-county-tx","travis-county-tx",
  "collin-county-tx","denton-county-tx","fort-bend-county-tx","montgomery-county-tx","williamson-county-tx",
  "el-paso-county-tx","hidalgo-county-tx","cameron-county-tx","lubbock-county-tx","webb-county-tx",
  "jefferson-county-tx","smith-county-tx","brazoria-county-tx","galveston-county-tx","nueces-county-tx",
  "bell-county-tx","hays-county-tx","mclennan-county-tx","parker-county-tx","grayson-county-tx",
  "tom-green-county-tx","rockwall-county-tx","kaufman-county-tx","johnson-county-tx","ellis-county-tx",
  "hunt-county-tx","comal-county-tx","guadalupe-county-tx","bastrop-county-tx","caldwell-county-tx",
  // Georgia — 159 counties (major ones)
  "fulton-county-ga","gwinnett-county-ga","cobb-county-ga","dekalb-county-ga","cherokee-county-ga",
  "forsyth-county-ga","henry-county-ga","hall-county-ga","richmond-county-ga","bibb-county-ga",
  "chatham-county-ga","columbia-county-ga","muscogee-county-ga","clayton-county-ga","fayette-county-ga",
  "newton-county-ga","paulding-county-ga","douglas-county-ga","rockdale-county-ga","floyd-county-ga",
  // Florida — 67 counties
  "miami-dade-county-fl","broward-county-fl","palm-beach-county-fl","hillsborough-county-fl",
  "orange-county-fl","pinellas-county-fl","duval-county-fl","brevard-county-fl",
  "lee-county-fl","polk-county-fl","sarasota-county-fl","collier-county-fl",
  "manatee-county-fl","pasco-county-fl","volusia-county-fl","lake-county-fl",
  "st-lucie-county-fl","osceola-county-fl","st-johns-county-fl","alachua-county-fl",
  "escambia-county-fl","leon-county-fl","marion-county-fl","clay-county-fl",
  "okaloosa-county-fl","charlotte-county-fl","flagler-county-fl","hernando-county-fl",
  "indian-river-county-fl","martin-county-fl","sumter-county-fl","nassau-county-fl",
  "santa-rosa-county-fl","walton-county-fl","bay-county-fl","highlands-county-fl",
  "citrus-county-fl","putnam-county-fl","columbia-county-fl","monroe-county-fl",
  // Arkansas — 75 counties (major ones)
  "benton-county-ar","pulaski-county-ar","washington-county-ar","sebastian-county-ar","faulkner-county-ar",
  "saline-county-ar","garland-county-ar","craighead-county-ar","lonoke-county-ar","white-county-ar",
  "miller-county-ar","pope-county-ar","st-francis-county-ar","union-county-ar","boone-county-ar",
];

const blogSlugs = [
  // ── TEXAS COUNTY GUIDES ──
  "harris-county-property-tax-protest-guide-2026",
  "tarrant-county-property-tax-protest-guide-2026",
  "dallas-county-property-tax-protest-guide-2026",
  "travis-county-property-tax-protest-guide-2026",
  "bexar-county-property-tax-protest-guide-2026",
  "collin-county-property-tax-protest-guide-2026",
  "denton-county-property-tax-protest-guide-2026",
  "williamson-county-property-tax-protest-guide-2026",
  "montgomery-county-property-tax-protest-guide-2026",
  "fort-bend-county-property-tax-protest-guide-2026",
  "galveston-county-property-tax-protest-guide-2026",
  "el-paso-county-property-tax-protest-guide-2026",
  "hidalgo-county-property-tax-protest-guide-2026",
  "nueces-county-property-tax-protest-guide-2026",
  "mclennan-county-property-tax-protest-guide-2026",
  "hays-county-property-tax-protest-guide-2026",
  "bell-county-property-tax-protest-guide-2026",
  "brazoria-county-property-tax-protest-guide-2026",
  "smith-county-property-tax-protest-guide-2026",
  "jefferson-county-property-tax-protest-guide-2026",
  "lubbock-county-property-tax-protest-guide-2026",
  "parker-county-property-tax-protest-guide-2026",
  "cameron-county-property-tax-protest-guide-2026",
  "grayson-county-property-tax-protest-guide-2026",
  "tom-green-county-property-tax-protest-guide-2026",
  // ── TEXAS EDUCATION / STRATEGY ──
  "texas-property-tax-protest-guide-2026",
  "texas-property-tax-protest-deadline-2026",
  "texas-property-tax-protest-letter-what-to-include",
  "how-to-read-texas-notice-of-appraised-value",
  "how-much-can-i-save-protesting-property-taxes-texas",
  "texas-homestead-exemption-vs-protest-which-saves-more",
  "flat-fee-vs-contingency-property-tax-protest",
  "property-tax-flat-fee-vs-contingency-texas-2026",
  "texas-arb-hearing-guide-2026",
  "texas-unequal-appraisal-protest-guide-2026",
  "texas-property-tax-protest-new-homeowner-guide-2026",
  "texas-property-tax-protest-evidence-checklist-2026",
  "texas-investment-property-tax-protest-guide-2026",
  "texas-mass-appraisal-errors-guide-2026",
  "ownwell-vs-taxappeal-usa-comparison-2026",
  "how-much-does-texas-property-tax-protest-cost-2026",
  "williamson-vs-travis-county-property-taxes-austin",
  // ── FLORIDA COUNTY GUIDES ──
  "miami-dade-property-tax-appeal-guide-2026",
  "broward-county-property-tax-appeal-guide-2026",
  "palm-beach-county-property-tax-appeal-guide-2026",
  "hillsborough-county-property-tax-appeal-2026",
  "orange-county-florida-property-tax-appeal-guide-2026",
  "pinellas-county-florida-property-tax-appeal-guide-2026",
  "sarasota-county-florida-property-tax-appeal-guide-2026",
  "lee-county-florida-property-tax-appeal-guide-2026",
  "collier-county-florida-property-tax-appeal-guide-2026",
  "okaloosa-county-florida-property-tax-appeal-guide-2026",
  "duval-county-jacksonville-property-tax-appeal-guide-2026",
  "manatee-county-florida-property-tax-appeal-guide-2026",
  "pasco-county-florida-property-tax-appeal-guide-2026",
  "volusia-county-florida-property-tax-appeal-guide-2026",
  "brevard-county-florida-property-tax-appeal-guide-2026",
  "polk-county-florida-property-tax-appeal-guide-2026",
  "st-johns-county-florida-property-tax-appeal-guide-2026",
  "osceola-county-florida-property-tax-appeal-guide-2026",
  "st-lucie-county-florida-property-tax-appeal-guide-2026",
  "alachua-county-florida-property-tax-appeal-guide-2026",
  "escambia-county-florida-property-tax-appeal-guide-2026",
  "walton-county-florida-property-tax-appeal-guide-2026",
  "charlotte-county-florida-property-tax-appeal-guide-2026",
  "bay-county-florida-property-tax-appeal-guide-2026",
  "citrus-county-florida-property-tax-appeal-guide-2026",
  "nassau-county-florida-property-tax-appeal-guide-2026",
  // ── FLORIDA EDUCATION / STRATEGY ──
  "how-to-appeal-florida-property-tax-trim-notice-guide",
  "florida-trim-notice-deadline-2026",
  "how-to-read-florida-trim-notice-2026",
  "when-do-florida-trim-notices-arrive-2026",
  "what-is-a-vab-petition-florida-homeowners-guide",
  "florida-vab-filing-fee-by-county-2026",
  "how-much-can-i-save-appealing-florida-property-tax",
  "florida-property-tax-appeal-letter-what-to-include-to-win",
  "florida-property-tax-appeal-success-rate",
  "do-i-need-a-lawyer-to-appeal-florida-property-taxes",
  "non-homestead-property-tax-appeal-florida",
  "save-our-homes-florida-can-you-still-appeal-property-taxes",
  "florida-homestead-exemption-vs-property-tax-appeal",
  "florida-property-tax-appeal-vs-homestead-exemption-which-saves-more",
  "florida-condo-property-tax-appeal-guide-2026",
  "florida-new-construction-property-tax-appeal-2026",
  "florida-property-tax-appeal-evidence-guide-2026",
  "florida-property-tax-appeal-comparable-sales-guide",
  "florida-first-time-property-tax-appeal-guide-2026",
  "florida-property-tax-appeal-deadline-missed-what-now",
  "miami-beach-luxury-property-tax-appeal-2026",
  // ── GEORGIA COUNTY GUIDES ──
  "fulton-county-property-tax-appeal-guide-2026",
  "gwinnett-county-property-tax-appeal-guide-2026",
  "cobb-county-property-tax-appeal-guide-2026",
  "dekalb-county-property-tax-appeal-guide-2026",
  "cherokee-county-property-tax-appeal-guide-2026",
  "forsyth-county-georgia-property-tax-appeal-2026",
  "henry-county-georgia-property-tax-appeal-2026",
  "hall-county-georgia-property-tax-appeal-2026",
  "richmond-county-georgia-property-tax-appeal-2026",
  "paulding-county-georgia-property-tax-appeal-2026",
  "gwinnett-county-georgia-property-tax-appeal-deep-dive-2026",
  // ── GEORGIA EDUCATION / STRATEGY ──
  "georgia-property-tax-appeal-deadline-2026",
  "how-to-read-georgia-notice-of-assessment-2026",
  "how-much-can-i-save-appealing-georgia-property-taxes",
  "georgia-property-tax-appeal-letter-what-to-include",
  "georgia-board-of-equalization-what-homeowners-need-to-know",
  "georgia-property-tax-appeal-complete-guide-2026",
  "atlanta-property-tax-appeal-neighborhood-guide-2026",
  "georgia-property-tax-appeal-evidence-guide-2026",
  "georgia-new-homeowner-property-tax-guide-2026",
  "georgia-investment-property-tax-appeal-2026",
  // ── ARKANSAS COUNTY GUIDES ──
  "benton-county-arkansas-property-tax-appeal-2026",
  "pulaski-county-arkansas-property-tax-appeal-2026",
  "washington-county-arkansas-property-tax-appeal-2026",
  "sebastian-county-arkansas-property-tax-appeal-2026",
  "faulkner-county-arkansas-property-tax-appeal-2026",
  "saline-county-arkansas-property-tax-appeal-2026",
  // ── ARKANSAS EDUCATION / STRATEGY ──
  "arkansas-property-tax-appeal-deadline-2026",
  "how-to-appeal-arkansas-property-taxes-board-of-equalization",
  "arkansas-property-tax-appeal-complete-guide-2026",
  "arkansas-property-tax-vs-other-states-2026",
  "northwest-arkansas-property-tax-appeal-guide-2026",
  "arkansas-homestead-tax-credit-vs-property-tax-appeal-2026",
];

export default function handler(req, res) {
  const base = "https://www.taxappealusa.com";
  const today = new Date().toISOString().split("T")[0];

  const staticPages = [
    { url: "/", priority: "1.0", changefreq: "weekly" },
    { url: "/apply", priority: "0.95", changefreq: "weekly" },
    { url: "/texas", priority: "0.9", changefreq: "monthly" },
    { url: "/georgia", priority: "0.9", changefreq: "monthly" },
    { url: "/florida", priority: "0.9", changefreq: "monthly" },
    { url: "/arkansas", priority: "0.9", changefreq: "monthly" },
    { url: "/houston", priority: "0.85", changefreq: "monthly" },
    { url: "/dallas", priority: "0.85", changefreq: "monthly" },
    { url: "/fort-worth", priority: "0.85", changefreq: "monthly" },
    { url: "/austin", priority: "0.85", changefreq: "monthly" },
    { url: "/atlanta", priority: "0.85", changefreq: "monthly" },
    { url: "/miami", priority: "0.85", changefreq: "monthly" },
    { url: "/tampa", priority: "0.85", changefreq: "monthly" },
    { url: "/bentonville", priority: "0.85", changefreq: "monthly" },
    { url: "/little-rock", priority: "0.85", changefreq: "monthly" },
    { url: "/fayetteville", priority: "0.85", changefreq: "monthly" },
    { url: "/fort-smith", priority: "0.85", changefreq: "monthly" },
    { url: "/partners", priority: "0.7", changefreq: "monthly" },
    { url: "/blog", priority: "0.7", changefreq: "weekly" },
    { url: "/terms", priority: "0.3", changefreq: "yearly" },
    { url: "/privacy", priority: "0.3", changefreq: "yearly" },
  ];

  const countyPages = allCountySlugs.map((s) => ({
    url: `/counties/${s}`,
    priority: "0.8",
    changefreq: "monthly",
  }));

  const floridaNeighborhoodPages = floridaCitySlugs.map((s) => ({
    url: `/florida/${s}`,
    priority: "0.85",
    changefreq: "monthly",
  }));

  const blogPages = blogSlugs.map((s) => ({
    url: `/blog/${s}`,
    priority: "0.75",
    changefreq: "monthly",
  }));

  const allPages = [...staticPages, ...countyPages, ...floridaNeighborhoodPages, ...blogPages];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages
  .map(
    (page) => `  <url>
    <loc>${base}${page.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate");
  res.status(200).send(xml);
}
