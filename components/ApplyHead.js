import Head from 'next/head';

/**
 * Head for the funnel at /apply.
 *
 * Separate component rather than inline, because pages/apply.js is ~3,000 lines and
 * adding a `next/head` import to it means adding one more thing that can be broken
 * by an edit anywhere in that file.
 *
 * No canonical here on purpose. pages/_app.js derives one from router.asPath and
 * every tag it emits carries a de-dupe key, so declaring another would produce two
 * — which is the defect 17953d9 spent 41 files fixing.
 */
export default function ApplyHead() {
  return (
    <Head>
      <title>Start Your Property Tax Appeal — $89 Flat | TaxAppeal USA</title>
      <meta
        name="description"
        content="File your property tax appeal in about 4 minutes. $89 flat — never a percentage of your savings. We prepare the petition with comparable sales evidence, you sign it, we mail it with tracking. Texas, Georgia and Florida."
      />
    </Head>
  );
}
