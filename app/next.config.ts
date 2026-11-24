import type { NextConfig } from "next";

// 版（lib/edition.ts）：KB_EDITION があればそれ、なければ「パソコンでの試し（next dev）とアプリ用の書き出しは personal、それ以外（Vercel）は public」
const edition =
  process.env.KB_EDITION === "personal" || process.env.KB_EDITION === "public"
    ? process.env.KB_EDITION
    : process.env.NODE_ENV === "development" || process.env.KB_EXPORT === "1"
      ? "personal"
      : "public";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_KB_EDITION: edition },
  cacheComponents: true,
  devIndicators: false,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
