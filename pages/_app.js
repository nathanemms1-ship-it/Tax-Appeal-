import Head from 'next/head'
import Script from 'next/script'
import { useEffect } from 'react'
import { useRouter } from 'next/router'
import DisclaimerFooter from '../components/DisclaimerFooter'
import WaitlistBanner from '../components/WaitlistBanner'
import FL_COUNTY_FEES from '../lib/flCountyFees'

/**
 * THE SITE-WIDE PRICE RANGE, DERIVED — NOT TYPED.
 *
 * $89 is the service fee. Texas and Georgia have no filing fee, so $89 is the whole
 * price there; Florida checkout adds the county's VAB fee, so the top of the range
 * is $89 plus the dearest confirmed county.
 *
 * Written as a literal "$89-$139" first, and that was wrong on the same principle
 * this whole file's schema was wrong on: a hardcoded fee goes stale the first time a
 * VAB changes one, and nothing would have said so. Estimated fees are excluded
 * because checkout refuses those counties outright, so no customer can be charged
 * one.
 *
 * Deliberately no fee range in the prose descriptions below. A concrete "$15-$50"
 * there put a number on EVERY page on the site — including county pages whose own
 * fee is neither — which is exactly the defect the Florida city pages were being
 * fixed for.
 */
const CONFIRMED_FEES = Object.values(FL_COUNTY_FEES)
  .filter((f) => f.confidence === 'confirmed')
  .map((f) => f.vabFee)
const PRICE_RANGE_MIN = 8900
const PRICE_RANGE_MAX = 8900 + Math.max(...CONFIRMED_FEES)
const usd = (cents) => `$${(cents / 100).toFixed(0)}`

// Google Ads / GA4 tag IDs — set in .env.local and Vercel env vars:
//   NEXT_PUBLIC_GTAG_ID=G-XXXXXXXXXX   (GA4 Measurement ID)
//   NEXT_PUBLIC_GADS_ID=AW-XXXXXXXXXX  (Google Ads Conversion ID)
const GTAG_ID = process.env.NEXT_PUBLIC_GTAG_ID || ''
const GADS_ID = process.env.NEXT_PUBLIC_GADS_ID || ''

// Either ID is enough to justify loading gtag.js, and the loader only needs ONE
// of them in its src — additional properties are attached by the config() calls
// below.
//
// This used to be gated on GTAG_ID alone. Google Ads conversion tracking does not
// require GA4, so an account configured with only NEXT_PUBLIC_GADS_ID loaded no
// tag at all: apply.js and success.js both check `window.gtag` before firing, so
// every conversion silently did nothing and Google Ads reported zero conversions
// on real, paid orders. Caught 8 Aug 2026 while wiring conversion tracking for the
// Florida launch, before any ad spend — which is the only reason it was cheap.
const TAG_LOADER_ID = GTAG_ID || GADS_ID

export function gtag(...args) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag(...args)
  }
}

const SITE_ORIGIN = 'https://www.taxappealusa.com'

export default function App({ Component, pageProps }) {
  const router = useRouter()

  // Route-derived canonical. Query and hash are stripped: ?ref=PARTNER is captured
  // on every page for attribution, and a canonical that changes per visitor is
  // worse than none. A trailing slash is removed so /florida/ and /florida do not
  // declare two different canonical URLs for one document.
  const cleanPath = router.asPath.split(/[?#]/)[0].replace(/\/+$/, '')
  const canonicalUrl = SITE_ORIGIN + cleanPath

  // A 404 is a response, not a document, and must not declare a canonical. Next
  // renders pages/404.js for every unmatched URL with router.pathname === '/404',
  // so before this check every dead link on the internet pointing anywhere at this
  // domain answered with <link rel="canonical" href=".../404">. The 404 status is
  // what Google actually acts on, so this was untidy rather than damaging — but a
  // page that names a canonical is a page asserting it should be indexed as
  // something, and a 404 is asserting the opposite.
  //
  // Tested against router.pathname first, which reads as the obvious check and is
  // wrong: during prerendering the build emitted the canonical anyway, so pathname
  // is not '/404' in that pass. cleanPath is, in both passes — 404.html is
  // prerendered once and every unmatched URL is served that one file, so whatever
  // is baked in here is what every dead link gets. Both are checked because the
  // runtime router is the one that would change first.
  const isErrorPage = ['/404', '/500'].includes(cleanPath) || ['/404', '/500'].includes(router.pathname)

  // Capture partner referral code from ?ref= on ANY page (last-touch attribution).
  //
  // Stored with a timestamp so pages/apply.js can enforce a 90-day attribution
  // window. This used to persist forever, which meant a visitor who clicked a
  // partner link once still credited that partner years later — and because it is
  // captured on EVERY page, a partner dropping ?ref= links around the web could
  // harvest $20 from organic customers they never actually referred.
  //
  // Normalized to uppercase to match the canonical code format. Previously
  // ?ref=jane-smith and ?ref=JANE-SMITH produced different values, and the
  // lowercase one matched no partner — so the referring partner was never paid
  // and the order showed up on the payout sheet as an "Unknown" referrer.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (ref && ref.trim()) {
      try {
        localStorage.setItem('taxappeal_ref', ref.trim().toUpperCase().slice(0, 64))
        localStorage.setItem('taxappeal_ref_at', String(Date.now()))
      } catch (e) { /* private mode */ }
    }
  }, [router.asPath])

  return (
    <>
      {/* Google tag (gtag.js) — loads when EITHER a GA4 or a Google Ads ID is set */}
      {TAG_LOADER_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${TAG_LOADER_ID}`}
            strategy="afterInteractive"
          />
          <Script id="gtag-init" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('js', new Date());
            ${GTAG_ID ? `gtag('config', '${GTAG_ID}', { page_path: window.location.pathname });` : ''}
            ${GADS_ID ? `gtag('config', '${GADS_ID}');` : ''}
          `}</Script>
        </>
      )}
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32" />
        <link rel="icon" href="/favicon-16x16.png" type="image/png" sizes="16x16" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <title>TaxAppeal — Property Tax Dispute Service | $89 Flat Fee</title>
        <meta name="description" content="We fight your property tax bill. Flat $89 fee — no percentage cuts. We prepare your property tax protest; you sign it and we mail it for you. Takes 4 minutes. TX, GA, FL, AR, AL." />
        {/*
          KEYS AND `canonicalUrl` ARE BOTH LOAD BEARING — see scripts/verify-pages.mjs.

          next/head de-duplicates <title> and any <meta> carrying `name`, because
          METATYPES is ['name','httpEquiv','charSet','itemProp']. `property` is not
          in that list and <link> is not de-duplicated at all unless the tag carries
          an explicit `key`. So these tags used to be emitted IN ADDITION TO the
          page's own, and every page shipped two canonicals and two of each og tag.

          Measured on the built output before this change: 1,068 pages carried two
          <link rel="canonical">, the homepage carried three, and exactly ZERO of
          1,081 pages had a single self-referential canonical. Google's documented
          behaviour with conflicting canonicals is to ignore all of them, so the
          self-canonical was inert site-wide — including on the 131 near-duplicate
          Florida city pages, where it was the only thing standing between us and a
          duplicate-content problem.

          Worse were the pages with no canonical of their own. /check and /apply
          each carried exactly one canonical in production and it pointed at the
          homepage, which tells Google those two pages ARE the homepage and should
          not be indexed as themselves. /check is the top of the funnel.

          Two changes. The value is now derived from the route rather than fixed at
          the homepage, so a page that declares nothing still gets a correct
          self-referential canonical. And every tag carries a `key`, so a page that
          DOES declare its own replaces this one instead of appending to it. Page
          files carry the matching keys; the build fails if any page ends up with a
          count other than one.

          asPath, not route: `route` is the template (/counties/[slug]). Query and
          hash are stripped because ?ref=… and #faq are the same document, and a
          canonical that varies per visitor is worse than none.
        */}
        <meta property="og:type" content="website" key="og:type" />
        <meta property="og:site_name" content="TaxAppeal USA" key="og:site_name" />
        <meta property="og:title" content="TaxAppeal — We fight your property tax bill. You keep the savings." key="og:title" />
        <meta property="og:description" content="Flat $89 fee. No percentage cuts. We prepare your property tax protest; you sign it and we mail it for you, with tracking. Takes 4 minutes. Available in TX, FL, GA, AR, and AL." key="og:description" />
        {!isErrorPage && <meta property="og:url" content={canonicalUrl} key="og:url" />}
        <meta property="og:image" content="https://www.taxappealusa.com/og-image.png" key="og:image" />
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="TaxAppeal — $89 Flat Fee Property Tax Dispute Service" />
        <meta name="twitter:description" content="We prepare your property tax protest; you sign it and we mail it for you. $89 flat — no percentage cuts." />
        {/* Canonical */}
        {!isErrorPage && <link rel="canonical" href={canonicalUrl} key="canonical" />}
        {/* Favicon */}
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚖️</text></svg>" />
        {/* Structured Data — Organization */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "TaxAppeal USA",
          "url": "https://www.taxappealusa.com",
          "email": "customerservice@taxappealusa.com",
          /* Arkansas and Alabama were named here and in the Service block's
             areaServed below. SUPPORTED_STATES in pages/apply.js marks both
             `servingFrom: 2027`, so StepProperty refuses them before checkout —
             which means this told Google we serve two states the funnel turns away.
             `areaServed` above had already been corrected to the three real states
             and this sentence had not, so the same file disagreed with itself.

             The price was the second defect: "$89" is our service fee, not the
             price. Florida checkout adds the county's VAB filing fee ($15–$50, see
             lib/flCountyFees.js), so the real range is $89–$139. Texas and Georgia
             have no filing fee, which is why the range starts at $89 rather than
             being a single number. */
          "description": "Property tax dispute filing service. We prepare property tax protest letters and petitions that the owner signs, and we mail them for a flat $89 service fee — USPS certified mail in Texas and Georgia, and tracked USPS First Class mail in Florida, where the county's VAB filing fee is added and paid to the county on the owner's behalf.",
          "areaServed": [
            { "@type": "State", "name": "Texas" },
            { "@type": "State", "name": "Georgia" },
            { "@type": "State", "name": "Florida" }
          ],
          "serviceType": "Property Tax Dispute Filing",
          "priceRange": `${usd(PRICE_RANGE_MIN)}-${usd(PRICE_RANGE_MAX)}`
        })}} />
        {/* Structured Data — Service */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          "name": "Property Tax Dispute Filing",
          "provider": {
            "@type": "Organization",
            "name": "TaxAppeal USA",
            "url": "https://www.taxappealusa.com"
          },
          "serviceType": "Document Preparation Service",
          "description": "Property tax protest and petition preparation with tracked USPS mailing. We analyze your property assessment, find comparable sales, and prepare a formal filing for you to sign.",
          "offers": {
            "@type": "Offer",
            "priceCurrency": "USD",
            "priceSpecification": {
              "@type": "PriceSpecification",
              "minPrice": (PRICE_RANGE_MIN / 100).toFixed(2),
              "maxPrice": (PRICE_RANGE_MAX / 100).toFixed(2),
              "priceCurrency": "USD"
            },
            "description": "$89 service fee per property filing — document preparation and tracked USPS mailing. In Florida the county's VAB filing fee is added at checkout and paid to the county on the owner's behalf."
          },
          "areaServed": ["Texas", "Georgia", "Florida"]
        })}} />
      </Head>
      <WaitlistBanner />
      <Component {...pageProps} />
      <DisclaimerFooter />
    </>
  )
}
