import type { NextConfig } from "next";

// iPhone アプリ（Capacitor）用は、静的なファイルに書き出す（KB_EXPORT=1 npm run build:app）。
// 公開中の Web 版（Vercel）は、これまでどおり KB_EXPORT なしで作る。
const forApp = process.env.KB_EXPORT === "1";

// 版（lib/edition.ts）：KB_EDITION があればそれ、なければ「パソコンでの試し（next dev）とアプリ用の書き出しは personal、それ以外（Vercel）は public」
const edition =
  process.env.KB_EDITION === "personal" || process.env.KB_EDITION === "public"
    ? process.env.KB_EDITION
    : process.env.NODE_ENV === "development" || process.env.KB_EXPORT === "1"
      ? "personal"
      : "public";

const nextConfig: NextConfig = {
  ...(forApp ? { output: "export" as const, images: { unoptimized: true } } : {}),
  env: { NEXT_PUBLIC_KB_EDITION: edition },
  cacheComponents: !forApp,
  devIndicators: false,
  partialPrefetching: !forApp,
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
