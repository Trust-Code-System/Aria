/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optional alternate build dir so `next build` can run while `next dev` is
  // serving from .next (building into the same dir corrupts both).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  eslint: {
    // Allow production builds to complete even with lint warnings; CI runs lint separately.
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
