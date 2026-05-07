import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloudflare Pages (@opennextjs/cloudflare) ではNode.jsランタイムは使わない
  // Clerk・Supabase・StripeはEdge Runtime対応済み
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    },
  ],
};

export default nextConfig;
