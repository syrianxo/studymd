import type { NextConfig } from "next";

// Build cache bust: admin route fix
const nextConfig: NextConfig = {
  /*
   * Security headers applied to all responses.
   * Workstream 3 will tighten the CSP once all asset origins are known.
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Prevent clickjacking
          { key: "X-Frame-Options", value: "DENY" },
          // Force HTTPS (1 year, include subdomains)
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          // Basic XSS protection for older browsers
          { key: "X-XSS-Protection", value: "1; mode=block" },
          // Referrer policy
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          /*
           * Content Security Policy (permissive during development).
           * Tighten in Workstream 3 once all CDN/font origins are confirmed.
           */
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next.js requires 'unsafe-inline' and 'unsafe-eval' in dev;
              // tighten with nonces in production (Workstream 3)
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              // Supabase API + Anthropic API
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com",
              // Slide images (cPanel + Supabase Storage)
              "img-src 'self' data: blob: https://*.supabase.co https://khalidsirawan.com",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },

  /*
   * Image optimization — allow Supabase Storage and the existing cPanel
   * host as trusted image sources.
   */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "khalidsirawan.com",
        pathname: "/hl-pa-study/slides/**",
      },
    ],
  },
};

export default nextConfig;
