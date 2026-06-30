import Head from 'next/head'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32" />
        <link rel="icon" href="/favicon-16x16.png" type="image/png" sizes="16x16" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <title>TaxAppeal — Property Tax Dispute Service | $89 Flat Fee</title>
        <meta name="description" content="We fight your property tax bill. Flat $89 fee — no percentage cuts. We draft and file your property tax protest via certified mail. Takes 4 minutes. TX, GA, FL." />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="TaxAppeal USA" />
        <meta property="og:title" content="TaxAppeal — We fight your property tax bill. You keep the savings." />
        <meta property="og:description" content="Flat $89 fee. No percentage cuts. We draft and file your property tax protest via USPS certified mail. 82% approval rate. Takes 4 minutes. Available in TX, FL, GA, AR, and AL." />
        <meta property="og:url" content="https://www.taxappealusa.com" />
        <meta property="og:image" content="https://www.taxappealusa.com/og-image.png" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="TaxAppeal — $89 Flat Fee Property Tax Dispute Service" />
        <meta name="twitter:description" content="We draft and file your property tax protest via certified mail. 82% approval rate. $89 flat — no percentage cuts." />

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
          "email": "disputes@taxappealusa.com",
          "description": "Property tax dispute filing service. We draft and file property tax protest letters via USPS certified mail for a flat $89 fee.",
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
          "description": "AI-powered property tax protest letter generation and certified mail filing. We analyze your property assessment, find comparable sales, and file a formal protest on your behalf.",
          "offers": {
            "@type": "Offer",
            "price": "89.00",
            "priceCurrency": "USD",
            "description": "Flat fee per property dispute filing — includes letter generation, USPS certified mail with return receipt"
          },
          "areaServed": ["Texas", "Georgia", "Florida"]
        })}} />
      </Head>
      <Component {...pageProps} />
    </>
  )
}
