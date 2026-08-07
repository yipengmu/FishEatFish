import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel's Other preset uses the static export path; Cloudflare Sites keeps vinext.
  ...(process.env.NEXT_STATIC_EXPORT ? { output: "export" as const } : {}),
};

export default nextConfig;
