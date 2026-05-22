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
};

export default nextConfig;
