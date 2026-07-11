import Head from 'next/head'
import DisclaimerFooter from '../components/DisclaimerFooter'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
        <title>TaxAppeal — Property Tax Dispute Service | $79 Flat Fee</title>
        <meta name="description" content="We fight your property tax bill. Flat $79 fee — no percentage cuts. We prepare your property tax protest; you sign it and we mail it certified. Takes 4 minutes. TX, GA, FL." />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="TaxAppeal USA" />
        <meta property="og:title" content="TaxAppeal — We fight your property tax bill. You keep the savings." />
        <meta property="og:description" content="Flat $79 fee. No percentage cuts. We draft and file your property tax protest via USPS certified mail. 82% approval rate. Takes 4 minutes. Available in TX, GA, and FL." />
        <meta property="og:url" content="https://www.taxappealusa.com" />
        <meta property="og:image" content="https://www.taxappealusa.com/og-image.png" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="TaxAppeal — $79 Flat Fee Property Tax Dispute Service" />
        <meta name="twitter:description" content="We draft and file your property tax protest via certified mail. 82% approval rate. $79 flat — no percentage cuts." />

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
          "description": "Property tax dispute preparation service. We prepare property tax protest letters; the owner reviews and signs, and we mail them via USPS certified mail for a flat $79 fee.",
          "areaServed": [
            { "@type": "State", "name": "Texas" },
            { "@type": "State", "name": "Georgia" },
            { "@type": "State", "name": "Florida" }
          ],
          "serviceType": "Property Tax Dispute Filing",
          "priceRange": "$79"
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
          "description": "Self-service property tax protest letter preparation and certified-mail filing. We build your protest from your assessment and comparable sales; you review and sign it, and we mail it certified in your name.",
          "offers": {
            "@type": "Offer",
            "price": "79.00",
            "priceCurrency": "USD",
            "description": "Flat fee per property dispute filing — includes letter generation, USPS certified mail with return receipt"
          },
          "areaServed": ["Texas", "Georgia", "Florida"]
        })}} />
      </Head>
      <Component {...pageProps} />
      <DisclaimerFooter />
    </>
  )
}
