// pages/api/sitemap.xml.js
// Self-contained sitemap — do not import from external files

const floridaCitySlugs = [
  // Batch 1 — original 50
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
  // Batch 2 — 30 new slugs
  "parkland-fl","davie-fl","cooper-city-fl","plantation-fl","deerfield-beach",
  "lighthouse-point","sunny-isles-beach","hallandale-beach","surfside-fl","bal-harbour",
  "key-biscayne","pinecrest-fl","homestead-fl","westchase-fl","south-tampa-fl",
  "carrollwood-fl","siesta-key-fl","lakewood-ranch-fl","bradenton-fl","port-st-lucie-fl",
  "vero-beach-fl","lakeland-fl","doctor-phillips-fl","windermere-fl","hunters-creek-fl",
  "new-tampa-fl","longboat-key-fl","golden-gate-fl","melbourne-fl",
  // Batch 3 — 30 new slugs
  "destin-fl","30a-fl","fort-walton-beach","niceville-fl","pensacola-beach",
  "panama-city-beach","navarre-fl","nocatee-fl","st-johns-fl","orange-park-fl",
  "fernandina-beach","amelia-island-fl","celebration-fl","altamonte-springs","lake-mary-fl",
  "sanford-fl","longwood-fl","clermont-fl","minneola-fl","the-villages-fl",
  "ocala-fl","gainesville-fl","viera-fl","rockledge-fl","palm-bay-fl",
  "stuart-fl","jensen-beach-fl","tradition-fl","palm-beach-fl","north-miami-beach",
];

const texasCountySlugs = [
  "harris-county-tx","dallas-county-tx","tarrant-county-tx","bexar-county-tx","travis-county-tx",
  "collin-county-tx","denton-county-tx","fort-bend-county-tx","montgomery-county-tx","williamson-county-tx",
  "el-paso-county-tx","hidalgo-county-tx","cameron-county-tx","lubbock-county-tx","webb-county-tx",
  "jefferson-county-tx","smith-county-tx","brazoria-county-tx","galveston-county-tx","nueces-county-tx",
];

const georgiaCountySlugs = [
  "fulton-county-ga","gwinnett-county-ga","cobb-county-ga","dekalb-county-ga","cherokee-county-ga",
  "forsyth-county-ga","henry-county-ga","hall-county-ga","richmond-county-ga","bibb-county-ga",
];

const floridaCountySlugs = [
  "miami-dade-county-fl","broward-county-fl","palm-beach-county-fl","hillsborough-county-fl",
  "orange-county-fl","pinellas-county-fl","duval-county-fl","brevard-county-fl",
  "lee-county-fl","polk-county-fl","sarasota-county-fl","collier-county-fl",
];

const citySlugs = [
  "houston-tx","dallas-tx","fort-worth-tx","austin-tx","san-antonio-tx","el-paso-tx",
  "atlanta-ga","savannah-ga","augusta-ga",
  "miami-fl","tampa-fl","orlando-fl","jacksonville-fl","fort-lauderdale-fl",
];

// All 33 live blog posts — actual slugs from lib/blogPosts.js
const blogSlugs = [
  "harris-county-property-tax-protest-guide-2026",
  "tarrant-county-property-tax-protest-guide-2026",
  "dallas-county-property-tax-protest-guide-2026",
  "texas-property-tax-protest-deadline-2026",
  "flat-fee-vs-contingency-property-tax-protest",
  "travis-county-property-tax-protest-guide-2026",
  "fulton-county-property-tax-appeal-guide-2026",
  "miami-dade-property-tax-appeal-guide-2026",
  "hillsborough-county-property-tax-appeal-2026",
  "how-to-read-texas-notice-of-appraised-value",
  "georgia-property-tax-appeal-deadline-2026",
  "florida-trim-notice-deadline-2026",
  "collin-county-property-tax-protest-guide-2026",
  "bexar-county-property-tax-protest-guide-2026",
  "dekalb-county-property-tax-appeal-guide-2026",
  "how-much-can-i-save-protesting-property-taxes-texas",
  "texas-property-tax-protest-letter-what-to-include",
  "denton-county-property-tax-protest-guide-2026",
  "gwinnett-county-property-tax-appeal-guide-2026",
  "broward-county-property-tax-appeal-guide-2026",
  "fort-bend-county-property-tax-protest-guide-2026",
  "montgomery-county-property-tax-protest-guide-2026",
  "palm-beach-county-property-tax-appeal-guide-2026",
  "how-to-appeal-florida-property-tax-trim-notice-guide",
  "orange-county-florida-property-tax-appeal-guide-2026",
  "pinellas-county-florida-property-tax-appeal-guide-2026",
  "sarasota-county-florida-property-tax-appeal-guide-2026",
  "lee-county-florida-property-tax-appeal-guide-2026",
  "collier-county-florida-property-tax-appeal-guide-2026",
  "what-is-a-vab-petition-florida-homeowners-guide",
  "how-much-can-i-save-appealing-florida-property-tax",
  "florida-property-tax-appeal-letter-what-to-include-to-win",
  "okaloosa-county-florida-property-tax-appeal-guide-2026",
  "when-do-florida-trim-notices-arrive-2026",
  "how-to-read-florida-trim-notice-2026",
  "florida-homestead-exemption-vs-property-tax-appeal",
  "do-i-need-a-lawyer-to-appeal-florida-property-taxes",
  "florida-property-tax-appeal-success-rate",
  "duval-county-jacksonville-property-tax-appeal-guide-2026",
  "non-homestead-property-tax-appeal-florida",
];

export default function handler(req, res) {
  const base = "https://www.taxappealusa.com";
  const today = new Date().toISOString().split("T")[0];

  const staticPages = [
    { url: "/", priority: "1.0", changefreq: "weekly" },
    { url: "/texas", priority: "0.9", changefreq: "monthly" },
    { url: "/georgia", priority: "0.9", changefreq: "monthly" },
    { url: "/florida", priority: "0.9", changefreq: "monthly" },
    { url: "/houston", priority: "0.8", changefreq: "monthly" },
    { url: "/dallas", priority: "0.8", changefreq: "monthly" },
    { url: "/fort-worth", priority: "0.8", changefreq: "monthly" },
    { url: "/austin", priority: "0.8", changefreq: "monthly" },
    { url: "/atlanta", priority: "0.8", changefreq: "monthly" },
    { url: "/miami", priority: "0.8", changefreq: "monthly" },
    { url: "/tampa", priority: "0.8", changefreq: "monthly" },
    { url: "/blog", priority: "0.8", changefreq: "weekly" },
    { url: "/terms", priority: "0.3", changefreq: "yearly" },
    { url: "/privacy", priority: "0.3", changefreq: "yearly" },
  ];

  const countyPages = [
    ...texasCountySlugs.map((s) => ({ url: `/counties/${s}`, priority: "0.8", changefreq: "monthly" })),
    ...georgiaCountySlugs.map((s) => ({ url: `/counties/${s}`, priority: "0.8", changefreq: "monthly" })),
    ...floridaCountySlugs.map((s) => ({ url: `/counties/${s}`, priority: "0.8", changefreq: "monthly" })),
  ];

  const floridaNeighborhoodPages = floridaCitySlugs.map((s) => ({
    url: `/florida/${s}`,
    priority: "0.85",
    changefreq: "monthly",
  }));

  const blogPages = blogSlugs.map((s) => ({ url: `/blog/${s}`, priority: "0.7", changefreq: "monthly" }));

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
