import type { CapacitorConfig } from "@capacitor/cli";

// 平尾さんが自分で使う iPhone アプリ（ウィジェット用）。docs/widget/WIDGET_PLAN.md
const config: CapacitorConfig = {
  appId: "jp.kurashibase.personal",
  appName: "くらしベース",
  webDir: "out",
};

export default config;
