// pages/api/sitemap.xml.js
// Import-based sitemap â auto-syncs with data files
// Adding a new county, city, blog post, or TX neighborhood auto-appears here on next deploy

import { counties } from '../../lib/countyData';
import { getAllSlugs as getBlogSlugs } from '../../lib/blogPosts';
import { texasCities } from '../../lib/texasCities';

// Florida neighborhood slugs â inline until city_final_v2 is extracted to its own lib file
// When that happens, replace this with: import { floridaCities } from '../../lib/floridaCities'
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
  "bal-harbour","key-biscayne","surfside-fl","longboat-key-fl","windermere-fl","siesta-key-fl",
  "parkland-fl","south-tampa-fl","sunny-isles-beach","pinecrest-fl",
  "doctor-phillips-fl","hunters-creek-fl","new-tampa-fl","lakewood-ranch-fl","bradenton-fl",
  "port-st-lucie-fl","vero-beach-fl","lakeland-fl","melbourne-fl","davie-fl",
  "cooper-city-fl","plantation-fl","deerfield-beach","lighthouse-point","hallandale-beach",
  "homestead-fl","westchase-fl","carrollwood-fl","golden-gate-fl",
  "palm-beach-fl","30a-fl","destin-fl","amelia-island-fl","fernandina-beach","pensacola-beach",
  "nocatee-fl","the-villages-fl","celebration-fl","lake-mary-fl",
  "stuart-fl","jensen-beach-fl","viera-fl","st-johns-fl","fort-walton-beach","niceville-fl",
  "panama-city-beach","navarre-fl","gainesville-fl","ocala-fl",
  "orange-park-fl","altamonte-springs","sanford-fl","longwood-fl","clermont-fl","minneola-fl",
  "rockledge-fl","palm-bay-fl","tradition-fl","north-miami-beach",
];

export default function handler(req, res) {
  const base = "https://www.taxappealusa.com";
  const today = new Date().toISOString().split("T")[0];

  // ââ Static pages âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const staticPages = [
    { url: "/",          priority: "1.0", changefreq: "weekly" },
    { url: "/texas",     priority: "0.9", changefreq: "monthly" },
    { url: "/georgia",   priority: "0.9", changefreq: "monthly" },
    { url: "/florida",   priority: "0.9", changefreq: "monthly" },
    { url: "/blog",      priority: "0.8", changefreq: "weekly" },
    { url: "/terms",     priority: "0.3", changefreq: "yearly" },
    { url: "/privacy",   priority: "0.3", changefreq: "yearly" },
  ];

  // ââ Major city pages (static files) ââââââââââââââââââââââââââââââââââââââ
  const cityPages = [
    "/houston", "/dallas", "/fort-worth", "/austin", "/san-antonio",
    "/atlanta", "/miami", "/tampa",
  ].map(url => ({ url, priority: "0.8", changefreq: "monthly" }));

  // ââ County pages â auto from countyData.js (254 TX + 51 GA + 67 FL) âââââ
  const countyPages = counties.map(c => ({
    url: `/counties/${c.slug}`,
    priority: "0.8",
    changefreq: "monthly",
  }));

  // ââ Texas neighborhood pages â auto from texasCities.js âââââââââââââââââ
  const txNeighborhoodPages = texasCities.map(c => ({
    url: `/texas/${c.slug}`,
    priority: "0.85",
    changefreq: "monthly",
  }));

  // ââ Florida neighborhood pages â inline (see note above) âââââââââââââââââ
  const flNeighborhoodPages = floridaCitySlugs.map(s => ({
    url: `/florida/${s}`,
    priority: "0.85",
    changefreq: "monthly",
  }));

  // ââ Blog posts â auto from blogPosts.js ââââââââââââââââââââââââââââââââââ
  const blogPages = getBlogSlugs().map(s => ({
    url: `/blog/${s}`,
    priority: "0.7",
    changefreq: "monthly",
  }));

  // ââ Assemble âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const allPages = [
    ...staticPages,
    ...cityPages,
    ...countyPages,
    ...txNeighborhoodPages,
    ...flNeighborhoodPages,
    ...blogPages,
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages
  .map(
    page => `  <url>
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
