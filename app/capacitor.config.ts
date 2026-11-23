import type { CapacitorConfig } from "@capacitor/cli";

// 個人で使う iPhone アプリ（ウィジェット用）。docs/widget/WIDGET_PLAN.md
const config: CapacitorConfig = {
  appId: "jp.kurashibase.personal",
  appName: "くらしベース",
  webDir: "out",
  // 画面の上（時計・ノッチ）と下（ホームバー）に中身が重ならないようにする
  ios: { contentInset: "always" },
};

export default config;
