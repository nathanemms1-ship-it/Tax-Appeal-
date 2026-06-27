// pages/api/sitemap.xml.js
// Self-contained sitemap — no imports, hardcoded slugs

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
  "bal-harbour","key-biscayne","surfside-fl","longboat-key-fl","windermere-fl",
  "parkland-fl","south-tampa-fl","sunny-isles-beach","pinecrest-fl",
  "doctor-phillips-fl","hunters-creek-fl","new-tampa-fl","lakewood-ranch-fl",
  "port-st-lucie-fl","vero-beach-fl","lakeland-fl","melbourne-fl","davie-fl",
  "cooper-city-fl","plantation-fl","deerfield-beach","lighthouse-point",
  "homestead-fl","westchase-fl","carrollwood-fl","golden-gate-fl",
  "palm-beach-fl","30a-fl","destin-fl","amelia-island-fl","fernandina-beach-fl",
  "nocatee-fl","the-villages-fl","celebration-fl","lake-mary-fl",
  "stuart-fl","jensen-beach-fl","viera-fl","st-johns-fl","fort-walton-beach-fl",
  "panama-city-beach","navarre-fl","gainesville-fl","ocala-fl",
  "orange-park-fl","altamonte-springs","sanford-fl","longwood-fl","clermont-fl",
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
  "st-johns-county-fl","manatee-county-fl","pasco-county-fl","seminole-county-fl",
  "volusia-county-fl","lake-county-fl","osceola-county-fl","alachua-county-fl",
  "leon-county-fl","flagler-county-fl","clay-county-fl","marion-county-fl",
  "st-lucie-county-fl","martin-county-fl","indian-river-county-fl","charlotte-county-fl",
  "hernando-county-fl","citrus-county-fl","okaloosa-county-fl","santa-rosa-county-fl",
  "bay-county-fl","walton-county-fl","escambia-county-fl","putnam-county-fl",
  "highlands-county-fl","hardee-county-fl","desoto-county-fl","hendry-county-fl",
  "glades-county-fl","okeechobee-county-fl","columbia-county-fl","suwannee-county-fl",
  "nassau-county-fl","baker-county-fl","union-county-fl","bradford-county-fl",
  "gilchrist-county-fl","levy-county-fl","dixie-county-fl","lafayette-county-fl",
  "madison-county-fl","taylor-county-fl","hamilton-county-fl","columbia-county-fl",
  "holmes-county-fl","washington-county-fl","jackson-county-fl","calhoun-county-fl",
  "gulf-county-fl","franklin-county-fl","gadsden-county-fl","liberty-county-fl",
];

const arkansasCountySlugs = [
  "benton-county-ar","pulaski-county-ar","washington-county-ar","sebastian-county-ar","faulkner-county-ar",
  "saline-county-ar","craighead-county-ar","garland-county-ar","white-county-ar","lonoke-county-ar",
  "pope-county-ar","jefferson-county-ar","miller-county-ar","crawford-county-ar","crittenden-county-ar",
  "independence-county-ar","mississippi-county-ar","greene-county-ar","union-county-ar","hot-spring-county-ar",
  "boone-county-ar","johnson-county-ar","ouachita-county-ar","van-buren-county-ar","carroll-county-ar",
];

const citySlugs = [
  "houston-tx","dallas-tx","fort-worth-tx","austin-tx","san-antonio-tx","el-paso-tx",
  "atlanta-ga","savannah-ga","augusta-ga",
  "miami-fl","tampa-fl","orlando-fl","jacksonville-fl","fort-lauderdale-fl",
];

const blogSlugs = [
  "how-to-protest-property-taxes-texas",
  "harris-county-property-tax-protest-guide",
  "dallas-county-appraisal-protest-deadline",
  "tarrant-county-property-tax-appeal",
  "travis-county-property-tax-protest",
  "how-to-appeal-property-taxes-georgia",
  "fulton-county-property-tax-appeal-guide",
  "cobb-county-property-tax-protest",
  "florida-trim-notice-explained",
  "how-to-file-vab-petition-florida",
  "miami-dade-property-tax-appeal",
  "broward-county-property-tax-appeal",
  "when-do-florida-trim-notices-arrive-2026",
  "how-to-read-florida-trim-notice-2026",
  "florida-homestead-exemption-vs-property-tax-appeal",
  "florida-trim-notice-deadline-2026",
  "how-to-appeal-florida-property-tax-trim-notice-guide",
  "what-is-a-vab-petition-florida-homeowners-guide",
  "georgia-property-tax-appeal-deadline-2026",
  "texas-property-tax-protest-deadline-2026",
  "how-to-fight-property-taxes-benton-county-arkansas",
  "arkansas-property-tax-appeal-deadline-2026",
  "arkansas-board-of-equalization-appeal-guide",
];

export default function handler(req, res) {
  const base = "https://www.taxappealusa.com";
  const today = new Date().toISOString().split("T")[0];

  const staticPages = [
    { url: "/", priority: "1.0", changefreq: "weekly" },
    { url: "/texas", priority: "0.9", changefreq: "monthly" },
    { url: "/georgia", priority: "0.9", changefreq: "monthly" },
    { url: "/florida", priority: "0.9", changefreq: "monthly" },
    { url: "/arkansas", priority: "0.9", changefreq: "monthly" },
    { url: "/blog", priority: "0.8", changefreq: "weekly" },
    { url: "/partners", priority: "0.7", changefreq: "monthly" },
    { url: "/terms", priority: "0.3", changefreq: "yearly" },
    { url: "/privacy", priority: "0.3", changefreq: "yearly" },
  ];

  const countyPages = [
    ...texasCountySlugs.map((s) => ({ url: "/counties/" + s, priority: "0.8", changefreq: "monthly" })),
    ...georgiaCountySlugs.map((s) => ({ url: "/counties/" + s, priority: "0.8", changefreq: "monthly" })),
    ...floridaCountySlugs.map((s) => ({ url: "/counties/" + s, priority: "0.8", changefreq: "monthly" })),
    ...arkansasCountySlugs.map((s) => ({ url: "/counties/" + s, priority: "0.8", changefreq: "monthly" })),
  ];

  const cityPages = citySlugs.map((s) => ({ url: "/cities/" + s, priority: "0.8", changefreq: "monthly" }));

  const floridaNeighborhoodPages = floridaCitySlugs.map((s) => ({
    url: "/florida/" + s,
    priority: "0.85",
    changefreq: "monthly",
  }));

  const blogPages = blogSlugs.map((s) => ({ url: "/blog/" + s, priority: "0.7", changefreq: "monthly" }));

  const allPages = [...staticPages, ...countyPages, ...cityPages, ...floridaNeighborhoodPages, ...blogPages];

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    allPages.map((page) =>
      '  <url>\n' +
      '    <loc>' + base + page.url + '</loc>\n' +
      '    <lastmod>' + today + '</lastmod>\n' +
      '    <changefreq>' + page.changefreq + '</changefreq>\n' +
      '    <priority>' + page.priority + '</priority>\n' +
      '  </url>'
    ).join('\n') +
    '\n</urlset>';

  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate");
  res.status(200).send(xml);
}
