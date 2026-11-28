import type { CapacitorConfig } from "@capacitor/cli";

// 個人で使う iPhone アプリ（ウィジェット用）。docs/widget/WIDGET_PLAN.md
const config: CapacitorConfig = {
  appId: "jp.kurashibase.personal",
  appName: "くらしベース",
  webDir: "out",
  // 画面の上（時計・ノッチ）と下（ホームバー）に中身が重ならないようにする。
  // その空けた所に見えるアプリの背景は、下のボタンの並びと同じ白にする（決めていないと黒く出る。平尾さん 2026-11-28「下の空白がきもい」）
  ios: { contentInset: "always", backgroundColor: "#ffffff" },
};

export default config;
