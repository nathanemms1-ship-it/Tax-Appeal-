// pages/api/sitemap.xml.js
// Self-contained sitemap — do not import from external files

const floridaCitySlugs = [
  // Batch 1 — South Florida core
  "miami-beach","coral-gables","coconut-grove","brickell","aventura",
  "doral","kendall","hialeah","boca-raton","fort-lauderdale",
  "pompano-beach","hollywood-fl","weston","coral-springs","pembroke-pines",
  "miramar","west-palm-beach","boynton-beach","delray-beach","palm-beach-gardens",
  "jupiter-fl","wellington-fl",
  // Tampa Bay
  "brandon-fl","riverview-fl","wesley-chapel","temple-terrace","lutz-fl",
  "clearwater-fl","st-petersburg-fl","largo-fl","dunedin-fl","tarpon-springs",
  // Orlando metro
  "winter-park-fl","kissimmee-fl","oviedo-fl","lake-nona","apopka-fl",
  // Southwest Florida
  "naples-fl","marco-island","bonita-springs","fort-myers-fl","cape-coral","estero-fl",
  // Sarasota / Venice
  "sarasota-fl","venice-fl","north-port-fl",
  // Jacksonville area
  "jacksonville-beach","ponte-vedra-beach","fleming-island",
  // Daytona area
  "daytona-beach","new-smyrna-beach",
  // Batch 2 — high value
  "bal-harbour","key-biscayne","surfside-fl","longboat-key-fl","windermere-fl",
  "siesta-key-fl","parkland-fl","south-tampa-fl","sunny-isles-beach","pinecrest-fl",
  "doctor-phillips-fl","hunters-creek-fl","new-tampa-fl","lakewood-ranch-fl","bradenton-fl",
  "port-st-lucie-fl","vero-beach-fl","lakeland-fl","melbourne-fl","davie-fl",
  "cooper-city-fl","plantation-fl","deerfield-beach","lighthouse-point","hallandale-beach",
  "homestead-fl","westchase-fl","carrollwood-fl","golden-gate-fl",
  // Batch 3
  "palm-beach-fl","30a-fl","destin-fl","amelia-island-fl","fernandina-beach",
  "pensacola-beach","nocatee-fl","the-villages-fl","celebration-fl","lake-mary-fl",
  "stuart-fl","jensen-beach-fl","viera-fl","st-johns-fl","fort-walton-beach",
  "niceville-fl","panama-city-beach","navarre-fl","gainesville-fl","ocala-fl",
  "orange-park-fl","altamonte-springs","sanford-fl","longwood-fl","clermont-fl",
  "minneola-fl","rockledge-fl","palm-bay-fl","tradition-fl","north-miami-beach",
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
  // High population
  "miami-dade-county-fl","broward-county-fl","palm-beach-county-fl","hillsborough-county-fl",
  "orange-county-fl","pinellas-county-fl","duval-county-fl","polk-county-fl",
  "brevard-county-fl","volusia-county-fl","pasco-county-fl","seminole-county-fl",
  "sarasota-county-fl","lee-county-fl","collier-county-fl","manatee-county-fl",
  // Mid population
  "marion-county-fl","st-lucie-county-fl","st-johns-county-fl","lake-county-fl",
  "hernando-county-fl","charlotte-county-fl","osceola-county-fl","indian-river-county-fl",
  "martin-county-fl","alachua-county-fl","leon-county-fl","escambia-county-fl",
  "okaloosa-county-fl","bay-county-fl","citrus-county-fl","clay-county-fl",
  "nassau-county-fl","flagler-county-fl","sumter-county-fl","santa-rosa-county-fl",
  "walton-county-fl","monroe-county-fl",
  // Lower population
  "putnam-county-fl","highlands-county-fl","columbia-county-fl","suwannee-county-fl",
  "okeechobee-county-fl","wakulla-county-fl","jefferson-county-fl","taylor-county-fl",
  "hamilton-county-fl","madison-county-fl","lafayette-county-fl","dixie-county-fl",
  "levy-county-fl","gilchrist-county-fl","baker-county-fl","bradford-county-fl",
  "union-county-fl","gulf-county-fl","calhoun-county-fl","jackson-county-fl",
  "washington-county-fl","holmes-county-fl","glades-county-fl","hendry-county-fl",
  "desoto-county-fl","hardee-county-fl",
];

const citySlugs = [
  "houston","dallas","fort-worth","austin","atlanta","miami","tampa",
];

const blogSlugs = [
  // Texas blogs
  "harris-county-property-tax-protest-guide-2026",
  "tarrant-county-property-tax-protest-guide-2026",
  "dallas-county-property-tax-protest-guide-2026",
  "texas-property-tax-protest-deadline-2026",
  "flat-fee-vs-contingency-property-tax-protest",
  "travis-county-property-tax-protest-guide-2026",
  "how-to-read-texas-notice-of-appraised-value",
  "collin-county-property-tax-protest-guide-2026",
  "bexar-county-property-tax-protest-guide-2026",
  "how-much-can-i-save-protesting-property-taxes-texas",
  "texas-property-tax-protest-letter-what-to-include",
  "denton-county-property-tax-protest-guide-2026",
  "fort-bend-county-property-tax-protest-guide-2026",
  "montgomery-county-property-tax-protest-guide-2026",
  // Georgia blogs
  "fulton-county-property-tax-appeal-guide-2026",
  "georgia-property-tax-appeal-deadline-2026",
  "dekalb-county-property-tax-appeal-guide-2026",
  "gwinnett-county-property-tax-appeal-guide-2026",
  // Florida blogs — original batch
  "miami-dade-property-tax-appeal-guide-2026",
  "hillsborough-county-property-tax-appeal-2026",
  "florida-trim-notice-deadline-2026",
  "broward-county-property-tax-appeal-guide-2026",
  "palm-beach-county-property-tax-appeal-guide-2026",
  "how-to-appeal-florida-property-tax-trim-notice-guide",
  // Florida blogs — June 19-20 batch (10 new posts)
  "orange-county-florida-property-tax-appeal-guide-2026",
  "pinellas-county-florida-property-tax-appeal-guide-2026",
  "sarasota-county-florida-property-tax-appeal-guide-2026",
  "lee-county-florida-property-tax-appeal-guide-2026",
  "collier-county-florida-property-tax-appeal-guide-2026",
  "what-is-a-vab-petition-florida-homeowners-guide",
  "how-much-can-i-save-appealing-florida-property-tax",
  "florida-property-tax-appeal-letter-what-to-include-to-win",
  "okaloosa-county-florida-property-tax-appeal-guide-2026",
  // Florida blogs — June 20-21 batch
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
    { url: "/blog", priority: "0.8", changefreq: "weekly" },
    { url: "/terms", priority: "0.3", changefreq: "yearly" },
    { url: "/privacy", priority: "0.3", changefreq: "yearly" },
  ];

  const cityPages = citySlugs.map((s) => ({
    url: `/${s}`,
    priority: "0.8",
    changefreq: "monthly",
  }));

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

  const blogPages = blogSlugs.map((s) => ({
    url: `/blog/${s}`,
    priority: "0.7",
    changefreq: "monthly",
  }));

  const allPages = [
    ...staticPages,
    ...cityPages,
    ...countyPages,
    ...floridaNeighborhoodPages,
    ...blogPages,
  ];

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
