import type { CapacitorConfig } from "@capacitor/cli";

// 個人で使う iPhone アプリ（ウィジェット用）。docs/widget/WIDGET_PLAN.md
const config: CapacitorConfig = {
  appId: "jp.kurashibase.personal",
  appName: "くらしベース",
  webDir: "out",
  // 画面いっぱいに描き、上（時計・ノッチ）と下（ホームバー）の余白は画面の側で取る（globals.css の --sat・--sab）。
  // 2026-11-28：contentInset "always" では、長い画面でスクロールすると下のボタンの並びの位置が変わった（平尾さんの写真）。
  // 背景は白（描き始める前に一瞬見える所。決めていないと黒く出る）
  ios: { contentInset: "never", backgroundColor: "#ffffff" },
};

export default config;
