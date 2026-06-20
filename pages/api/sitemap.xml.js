// pages/api/sitemap.xml.js
// IMPORTANT: This file must be fully self-contained — no imports from lib/ files.
// Next.js API routes that use external imports can silently fail on Vercel.

export default function handler(req, res) {
  // All county slugs hardcoded here so the sitemap never breaks
  const countySlugs = [
    // Texas
    "harris-county-tx","dallas-county-tx","tarrant-county-tx","bexar-county-tx","travis-county-tx",
    "collin-county-tx","hidalgo-county-tx","denton-county-tx","fort-bend-county-tx","montgomery-county-tx",
    "williamson-county-tx","cameron-county-tx","nueces-county-tx","brazoria-county-tx","galveston-county-tx",
    "lubbock-county-tx","jefferson-county-tx","webb-county-tx","el-paso-county-tx","bell-county-tx",
    "johnson-county-tx","smith-county-tx","ellis-county-tx","midland-county-tx","ector-county-tx",
    "mclennan-county-tx","hays-county-tx","guadalupe-county-tx","rockwall-county-tx","parker-county-tx",
    "kaufman-county-tx","hunt-county-tx","wichita-county-tx","brazos-county-tx","taylor-county-tx",
    "grayson-county-tx","comal-county-tx","tom-green-county-tx","bastrop-county-tx","wilson-county-tx",
    "liberty-county-tx","henderson-county-tx","polk-county-tx","hardin-county-tx","orange-county-tx",
    "angelina-county-tx","nacogdoches-county-tx","cherokee-county-tx","van-zandt-county-tx","wood-county-tx",
    "rusk-county-tx","harrison-county-tx","gregg-county-tx","panola-county-tx","bowie-county-tx",
    "lamar-county-tx","fannin-county-tx","grayson-county-tx","cooke-county-tx","montague-county-tx",
    "clay-county-tx","archer-county-tx","young-county-tx","palo-pinto-county-tx","erath-county-tx",
    "hood-county-tx","wise-county-tx","jack-county-tx","parker-county-tx","stephens-county-tx",
    "gray-county-tx","wheeler-county-tx","childress-county-tx","hall-county-tx","hardeman-county-tx",
    "hale-county-tx","lamb-county-tx","bailey-county-tx","parmer-county-tx","castro-county-tx",
    "swisher-county-tx","briscoe-county-tx","floyd-county-tx","motley-county-tx","cottle-county-tx",
    "king-county-tx","knox-county-tx","baylor-county-tx","wilbarger-county-tx","throckmorton-county-tx",
    "haskell-county-tx","jones-county-tx","shackelford-county-tx","callahan-county-tx","eastland-county-tx",
    "comanche-county-tx","brown-county-tx","mills-county-tx","lampasas-county-tx","san-saba-county-tx",
    "mcculloch-county-tx","concho-county-tx","menard-county-tx","kimble-county-tx","sutton-county-tx",
    "schleicher-county-tx","irion-county-tx","crockett-county-tx","upton-county-tx","reagan-county-tx",
    "crane-county-tx","winkler-county-tx","ward-county-tx","reeves-county-tx","pecos-county-tx",
    "terrell-county-tx","brewster-county-tx","presidio-county-tx","jeff-davis-county-tx","hudspeth-county-tx",
    "culberson-county-tx","loving-county-tx","nolan-county-tx","mitchell-county-tx","howard-county-tx",
    "martin-county-tx","dawson-county-tx","terry-county-tx","yoakum-county-tx","cochran-county-tx",
    "hockley-county-tx","lynn-county-tx","scurry-county-tx","borden-county-tx","fisher-county-tx",
    "grimes-county-tx","waller-county-tx","austin-county-tx","colorado-county-tx","wharton-county-tx",
    "matagorda-county-tx","jackson-county-tx","victoria-county-tx","calhoun-county-tx","aransas-county-tx",
    "san-patricio-county-tx","kleberg-county-tx","jim-wells-county-tx","duval-county-tx","brooks-county-tx",
    "willacy-county-tx","starr-county-tx","zapata-county-tx","jim-hogg-county-tx","maverick-county-tx",
    "kinney-county-tx","val-verde-county-tx","edwards-county-tx","real-county-tx","uvalde-county-tx",
    "medina-county-tx","bandera-county-tx","kerr-county-tx","kendall-county-tx","gillespie-county-tx",
    "mason-county-tx","llano-county-tx","burnet-county-tx","blanco-county-tx","milam-county-tx",
    "robertson-county-tx","leon-county-tx","freestone-county-tx","limestone-county-tx","falls-county-tx",
    "coryell-county-tx","hamilton-county-tx","bosque-county-tx","hill-county-tx","navarro-county-tx",
    "anderson-county-tx","upshur-county-tx","titus-county-tx","cass-county-tx","red-river-county-tx",
    "delta-county-tx","sabine-county-tx","san-augustine-county-tx","shelby-county-tx","san-jacinto-county-tx",
    "trinity-county-tx","walker-county-tx","somervell-county-tx","hood-county-tx","palo-duro-county-tx",
    // Georgia
    "fulton-county-ga","gwinnett-county-ga","cobb-county-ga","dekalb-county-ga","cherokee-county-ga",
    "forsyth-county-ga","hall-county-ga","henry-county-ga","richmond-county-ga","muscogee-county-ga",
    "bibb-county-ga","chatham-county-ga","columbia-county-ga","paulding-county-ga","fayette-county-ga",
    "douglas-county-ga","carroll-county-ga","coweta-county-ga","barrow-county-ga","newton-county-ga",
    "walton-county-ga","rockdale-county-ga","clayton-county-ga","pickens-county-ga","lumpkin-county-ga",
    "jackson-county-ga","whitfield-county-ga","gordon-county-ga","bartow-county-ga","floyd-county-ga",
    "catoosa-county-ga","walker-county-ga","dougherty-county-ga","thomas-county-ga","lowndes-county-ga",
    "glynn-county-ga","effingham-county-ga","bryan-county-ga","liberty-county-ga","bulloch-county-ga",
    "ware-county-ga","pierce-county-ga","coffee-county-ga","tift-county-ga","colquitt-county-ga",
    "laurens-county-ga","toombs-county-ga","tattnall-county-ga","appling-county-ga","dodge-county-ga","ben-hill-county-ga",
    // Florida
    "miami-dade-county-fl","broward-county-fl","palm-beach-county-fl","hillsborough-county-fl","orange-county-fl",
    "pinellas-county-fl","duval-county-fl","polk-county-fl","brevard-county-fl","volusia-county-fl",
    "pasco-county-fl","seminole-county-fl","sarasota-county-fl","lee-county-fl","collier-county-fl",
    "manatee-county-fl","marion-county-fl","st-lucie-county-fl","st-johns-county-fl","lake-county-fl",
    "hernando-county-fl","charlotte-county-fl","osceola-county-fl","indian-river-county-fl","martin-county-fl",
    "alachua-county-fl","leon-county-fl","escambia-county-fl","okaloosa-county-fl","bay-county-fl",
    "citrus-county-fl","clay-county-fl","nassau-county-fl","flagler-county-fl","putnam-county-fl",
    "sumter-county-fl","highlands-county-fl","columbia-county-fl","suwannee-county-fl","okeechobee-county-fl",
    "santa-rosa-county-fl","walton-county-fl","wakulla-county-fl","jefferson-county-fl","taylor-county-fl",
    "hamilton-county-fl","madison-county-fl","lafayette-county-fl","dixie-county-fl","levy-county-fl",
    "gilchrist-county-fl","baker-county-fl","bradford-county-fl","union-county-fl","gulf-county-fl",
    "calhoun-county-fl","jackson-county-fl","washington-county-fl","holmes-county-fl","glades-county-fl",
    "hendry-county-fl","desoto-county-fl","hardee-county-fl","monroe-county-fl",
  ];

  const base = "https://taxappealusa.com";
  const today = new Date().toISOString().split("T")[0];

  // Static pages
  const staticPages = [
    { url: "/", priority: "1.0", changefreq: "weekly" },
    { url: "/apply", priority: "0.9", changefreq: "monthly" },
    { url: "/texas", priority: "0.9", changefreq: "monthly" },
    { url: "/georgia", priority: "0.9", changefreq: "monthly" },
    { url: "/florida", priority: "0.9", changefreq: "monthly" },
    { url: "/cities/houston", priority: "0.8", changefreq: "monthly" },
    { url: "/cities/dallas", priority: "0.8", changefreq: "monthly" },
    { url: "/cities/fort-worth", priority: "0.8", changefreq: "monthly" },
    { url: "/cities/austin", priority: "0.8", changefreq: "monthly" },
    { url: "/cities/atlanta", priority: "0.8", changefreq: "monthly" },
    { url: "/cities/miami", priority: "0.8", changefreq: "monthly" },
    { url: "/cities/tampa", priority: "0.8", changefreq: "monthly" },
    { url: "/terms", priority: "0.3", changefreq: "yearly" },
    { url: "/privacy", priority: "0.3", changefreq: "yearly" },
  ];

  const countyEntries = countySlugs.map(slug => ({
    url: `/counties/${slug}`,
    priority: "0.7",
    changefreq: "monthly",
  }));

  const allPages = [...staticPages, ...countyEntries];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages.map(({ url, priority, changefreq }) => `  <url>
    <loc>${base}${url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join("\n")}
</urlset>`;

  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
  res.status(200).send(xml);
}
