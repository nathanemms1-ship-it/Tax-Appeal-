/**
 * redirects.config.js
 *
 * Permanent redirects for URLs Google still crawls that no longer resolve.
 *
 * Source of truth: Search Console → Page indexing → "Not found (404)",
 * 26 URLs, first detected 1 Jul 2026, last crawled 25–30 Jul 2026.
 *
 * WHY THESE EXIST
 * ---------------
 * The Florida city set was rebuilt at some point onto a bare-slug scheme
 * (/florida/miami-beach). The previous scheme carried a state suffix
 * (/florida/tallahassee-fl). The 131 cities in the current sitemap all
 * resolve; the 24 below are the ones that did not survive the rebuild and
 * were never redirected, so pages/florida/[city].js 404s on them.
 *
 * Only two of the 24 have a live city page under the new scheme
 * (fernandina-beach, panama-city-beach) — those go city → city. The other
 * 22 have no city equivalent and go city → county, which is the closest
 * live page that answers the same query. Every target below was verified
 * to return 200 on 26 Aug 2026.
 *
 * NOTE ON STATUS CODE
 * -------------------
 * `permanent: true` emits 308, not 301. Google treats them identically for
 * indexing and link equity. If you want a literal 301 — some third-party
 * crawlers and link tools still handle it more predictably — replace
 * `permanent: true` with `statusCode: 301` throughout. Do not set both;
 * Next.js throws.
 *
 * These run in next.config.js's redirects(), which is evaluated before
 * filesystem routing, so they take precedence over pages/florida/[city].js
 * without touching that file.
 */

/**
 * Retired /florida/{city}-fl pages → the county page covering that city.
 *
 * Two entries deserve a second look if you ever revisit this map:
 *
 *   santa-rosa-beach → walton, NOT santa-rosa. Santa Rosa Beach is in
 *   Walton County; Santa Rosa County is a different place 90 miles west.
 *   The name is a trap.
 *
 *   poinciana → osceola. Poinciana straddles the Osceola/Polk line. The
 *   larger share of its rooftops sit in Osceola, so that is the better
 *   default, but Polk is defensible if your parcel data says otherwise.
 */
const FL_CITY_TO_COUNTY = {
  'tallahassee-fl': 'leon',
  'pensacola-fl': 'escambia',
  'land-o-lakes-fl': 'pasco',
  'crystal-river-fl': 'citrus',
  'new-port-richey-fl': 'pasco',
  'palm-beach': 'palm-beach', // no -fl suffix; this one 404s as-is
  'port-charlotte-fl': 'charlotte',
  'punta-gorda-fl': 'charlotte',
  'edgewater-fl': 'volusia',
  'st-augustine-fl': 'st-johns',
  'auburndale-fl': 'polk',
  'haines-city-fl': 'polk',
  'dade-city-fl': 'pasco',
  'santa-rosa-beach-fl': 'walton',
  'palm-coast-fl': 'flagler',
  'zephyrhills-fl': 'pasco',
  'deltona-fl': 'volusia',
  'yulee-fl': 'nassau',
  'ormond-beach-fl': 'volusia',
  'st-cloud-fl': 'osceola',
  'homosassa-fl': 'citrus',
  'poinciana-fl': 'osceola',
}

/**
 * Retired city pages that DO have a live equivalent under the current
 * bare-slug scheme. City → city beats city → county: it is a closer match
 * for the query and keeps the visitor on a page about their own town.
 */
const FL_CITY_TO_CITY = {
  'fernandina-beach-fl': 'fernandina-beach',
  'panama-city-beach-fl': 'panama-city-beach',
}

/**
 * Retired state-level blog guides → the state hub.
 *
 * The county-level guides these were presumably split into are all live
 * (/blog/harris-county-property-tax-protest-guide-2026 and siblings), but
 * no single one of them is the right destination for a statewide query.
 * The state hub is.
 *
 * /alabama currently runs waitlist copy rather than buy copy — AL is gated
 * by SERVING_FROM. That is fine as a redirect target: the tax content is
 * accurate and is what ranks. Revisit only if the page ever comes down.
 */
const LEGACY_BLOG = {
  'texas-property-tax-protest-guide-2026': '/texas',
  'alabama-first-time-property-tax-appeal-guide-2026': '/alabama',
}

const legacyRedirects = [
  ...Object.entries(FL_CITY_TO_COUNTY).map(([city, county]) => ({
    source: `/florida/${city}`,
    destination: `/counties/${county}-county-fl`,
    permanent: true,
  })),

  ...Object.entries(FL_CITY_TO_CITY).map(([oldSlug, newSlug]) => ({
    source: `/florida/${oldSlug}`,
    destination: `/florida/${newSlug}`,
    permanent: true,
  })),

  ...Object.entries(LEGACY_BLOG).map(([slug, destination]) => ({
    source: `/blog/${slug}`,
    destination,
    permanent: true,
  })),
]

module.exports = legacyRedirects
module.exports.legacyRedirects = legacyRedirects
module.exports.FL_CITY_TO_COUNTY = FL_CITY_TO_COUNTY
module.exports.FL_CITY_TO_CITY = FL_CITY_TO_CITY
module.exports.LEGACY_BLOG = LEGACY_BLOG
