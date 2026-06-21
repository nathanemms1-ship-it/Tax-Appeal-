// pages/api/sitemap.xml.js
// Self-contained sitemap â do not import from external files

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
];

export default function handler(req, res) {
  const base = "https://www.taxappealusa.com";
  const today = new Date().toISOString().split("T")[0];

  const staticPages = [
    { url: "/", priority: "1.0", changefreq: "weekly" },
    { url: "/texas", priority: "0.9", changefreq: "monthly" },
    { url: "/georgia", priority: "0.9", changefreq: "monthly" },
    { url: "/florida", priority: "0.9", changefreq: "monthly" },
    { url: "/terms", priority: "0.3", changefreq: "yearly" },
    { url: "/privacy", priority: "0.3", changefreq: "yearly" },
  ];

  const countyPages = [
    ...texasCountySlugs.map((s) => ({ url: `/counties/${s}`, priority: "0.8", changefreq: "monthly" })),
    ...georgiaCountySlugs.map((s) => ({ url: `/counties/${s}`, priority: "0.8", changefreq: "monthly" })),
    ...floridaCountySlugs.map((s) => ({ url: `/counties/${s}`, priority: "0.8", changefreq: "monthly" })),
  ];

  const cityPages = citySlugs.map((s) => ({ url: `/cities/${s}`, priority: "0.8", changefreq: "monthly" }));

  const floridaNeighborhoodPages = floridaCitySlugs.map((s) => ({
    url: `/florida/${s}`,
    priority: "0.85",
    changefreq: "monthly",
  }));

  const blogPages = blogSlugs.map((s) => ({ url: `/blog/${s}`, priority: "0.7", changefreq: "monthly" }));

  const allPages = [...staticPages, ...countyPages, ...cityPages, ...floridaNeighborhoodPages, ...blogPages];

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
