import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable React Strict Mode to prevent double-mounting in development.
  // React Strict Mode intentionally mounts every component twice to detect
  // side effects. With Supabase, this causes multiple concurrent calls to
  // auth.getSession(), which all fight for the same browser navigator.locks
  // token. This results in the "Lock not released within 5000ms" error and
  // data loss when switching tabs. This setting has no effect in production.
  reactStrictMode: false,

  // Experimental options for Next.js 16
  // 1. Set the maximum request body size for proxy buffering to 10MB.
  // 2. This prevents "Request Entity Too Large" errors on file uploads.
  experimental: {
    proxyClientMaxBodySize: "10mb",
  },

  // Security headers applied to every response. Hardens against clickjacking,
  // MIME sniffing, referrer leakage, and protocol downgrade, and constrains the
  // sources the browser will load. Applied at the framework level so no route
  // can forget them.
  async headers() {
    // Content-Security-Policy: 'unsafe-inline' is required for Next.js' injected
    // bootstrap scripts and Tailwind's inline styles; images allow data/blob URIs
    // and Vercel Blob (https) avatars. frame-ancestors 'none' blocks framing.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
