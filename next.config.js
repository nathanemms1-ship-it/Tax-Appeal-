/** @type {import('next').NextConfig} */

/**
 * Security headers.
 *
 * The site had none. The two that actually mattered here:
 *
 *  - Referrer-Policy. Without it Chrome sends strict-origin-when-cross-origin for
 *    most navigations, but the apply funnel puts the property address and county in
 *    the page, and any outbound link (county portals, statute citations, the source
 *    links we now render on the marketing pages) leaks the full referring URL to a
 *    third party. Same-origin keeps referrers off third parties entirely.
 *  - X-Frame-Options / frame-ancestors. The apply funnel takes a homeowner's name,
 *    address and their signature on a document sworn under penalty of perjury.
 *    Nothing stopped that flow being framed.
 *
 * CSP note: this is deliberately NOT `default-src 'self'`. The pages use inline
 * <style> blocks and inline JSON-LD, Next injects inline bootstrap script, and
 * Stripe Checkout redirects out. A strict CSP here would need nonce plumbing
 * through every page and would break the funnel on the first deploy. What is set
 * below is the subset that is enforceable today without that work:
 * frame-ancestors (not expressible via X-Frame-Options for multiple origins),
 * base-uri, form-action, and upgrade-insecure-requests. Tightening script-src
 * requires the nonce work first - do that as its own change, with the funnel
 * exercised end to end, not as a drive-by.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(self), interest-cohort=()',
  },
  {
    // Vercel terminates TLS and the domain is HTTPS-only. Two years with preload.
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "frame-ancestors 'self'",
      "base-uri 'self'",
      // Forms post to us or to Stripe Checkout, nowhere else.
      "form-action 'self' https://checkout.stripe.com https://*.stripe.com",
      'upgrade-insecure-requests',
    ].join('; '),
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        // The apply funnel and the customer portal must never be cached by a shared
        // proxy - they render the homeowner's address, assessed value and order state.
        source: '/(apply|portal|success)/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      },
    ];
  },
  async redirects() {
    return [
      { source: '/florida/wellington-fl', destination: '/florida/wellington', permanent: true },
      { source: '/florida/parkland-fl', destination: '/florida/parkland', permanent: true },
      { source: '/florida/davie-fl', destination: '/florida/davie', permanent: true },
      { source: '/florida/plantation-fl', destination: '/florida/plantation', permanent: true },
      { source: '/florida/pinecrest-fl', destination: '/florida/pinecrest', permanent: true },
    ];
  },
};

module.exports = nextConfig;
