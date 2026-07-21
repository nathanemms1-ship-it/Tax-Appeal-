/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: '/florida/wellington-fl', destination: '/florida/wellington', permanent: true },
      { source: '/florida/parkland-fl', destination: '/florida/parkland', permanent: true },
      { source: '/florida/davie-fl', destination: '/florida/davie', permanent: true },
      { source: '/florida/plantation-fl', destination: '/florida/plantation', permanent: true },
      { source: '/florida/pinecrest-fl', destination: '/florida/pinecrest', permanent: true },
    ];
  },
}

module.exports = nextConfig
