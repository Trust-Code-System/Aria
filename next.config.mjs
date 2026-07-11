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
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Allow the Aria Chrome extension side panel to embed the app.
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' chrome-extension: https://aria-vert-chi.vercel.app;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
