import type { NextConfig } from "next";

// iPhone アプリ（Capacitor）用は、静的なファイルに書き出す（KB_EXPORT=1 npm run build:app）。
// 公開中の Web 版（Vercel）は、これまでどおり KB_EXPORT なしで作る。
const forApp = process.env.KB_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(forApp ? { output: "export" as const, images: { unoptimized: true } } : {}),
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
