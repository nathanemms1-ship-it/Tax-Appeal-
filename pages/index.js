import Head from 'next/head'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
        <title>TaxAppeal — Property Tax Dispute Service</title>
        <meta name="description" content="We fight your property tax bill. Flat $59 fee. No percentage cuts. File in 4 minutes. Available in TX, GA, and FL." />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚖️</text></svg>" />
      </Head>
      <Component {...pageProps} />
    </>
  )
}
