import Head from 'next/head'
import Script from 'next/script'
import { useEffect } from 'react'
import { useRouter } from 'next/router'
import DisclaimerFooter from '../components/DisclaimerFooter'
import WaitlistBanner from '../components/WaitlistBanner'

// Google Ads / GA4 tag IDs — set in .env.local and Vercel env vars:
//   NEXT_PUBLIC_GTAG_ID=G-XXXXXXXXXX   (GA4 Measurement ID)
//   NEXT_PUBLIC_GADS_ID=AW-XXXXXXXXXX  (Google Ads Conversion ID)
const GTAG_ID = process.env.NEXT_PUBLIC_GTAG_ID || ''
const GADS_ID = process.env.NEXT_PUBLIC_GADS_ID || ''

export function gtag(...args) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag(...args)
  }
}

export default function App({ Component, pageProps }) {
  const router = useRouter()

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
      {/* Google tag (gtag.js) — loads only when IDs are configured */}
      {GTAG_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GTAG_ID}`}
            strategy="afterInteractive"
          />
          <Script id="gtag-init" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('js', new Date());
            gtag('config', '${GTAG_ID}', { page_path: window.location.pathname });
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
        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="TaxAppeal USA" />
        <meta property="og:title" content="TaxAppeal — We fight your property tax bill. You keep the savings." />
        <meta property="og:description" content="Flat $89 fee. No percentage cuts. We prepare your property tax protest; you sign it and we mail it for you, with tracking. Takes 4 minutes. Available in TX, FL, GA, AR, and AL." />
        <meta property="og:url" content="https://www.taxappealusa.com" />
        <meta property="og:image" content="https://www.taxappealusa.com/og-image.png" />
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="TaxAppeal — $89 Flat Fee Property Tax Dispute Service" />
        <meta name="twitter:description" content="We prepare your property tax protest; you sign it and we mail it for you. $89 flat — no percentage cuts." />
        {/* Canonical */}
        <link rel="canonical" href="https://www.taxappealusa.com" />
        {/* Favicon */}
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚖️</text></svg>" />
        {/* Structured Data — Organization */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "TaxAppeal USA",
          "url": "https://www.taxappealusa.com",
          "email": "customerservice@taxappealusa.com",
          "description": "Property tax dispute filing service. We prepare property tax protest letters and petitions that the owner signs, and we mail them for a flat $89 fee — USPS certified mail in Texas, Georgia, Arkansas and Alabama, and tracked USPS First Class mail in Florida.",
          "areaServed": [
            { "@type": "State", "name": "Texas" },
            { "@type": "State", "name": "Georgia" },
            { "@type": "State", "name": "Florida" }
          ],
          "serviceType": "Property Tax Dispute Filing",
          "priceRange": "$89"
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
            "price": "89.00",
            "priceCurrency": "USD",
            "description": "Flat fee per property filing — includes document preparation and tracked USPS mailing"
          },
          "areaServed": ["Texas", "Georgia", "Florida", "Arkansas", "Alabama"]
        })}} />
      </Head>
      <WaitlistBanner />
      <Component {...pageProps} />
      <DisclaimerFooter />
    </>
  )
}
