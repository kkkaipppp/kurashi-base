import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { IS_PERSONAL } from "@/lib/edition";

export const metadata: Metadata = {
  title: "くらしベース",
  applicationName: "くらしベース",
  description: "予定と家計を、ひとつのアプリで。記録はこの端末のブラウザの中だけに保存します（β版）",
  appleWebApp: { title: "くらしベース", statusBarStyle: "default" },
  // 友人βの間は検索エンジンに載せない（URL を知っている人だけが使う）
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  // 自分用は画面に入る量を増やすため、全体を 0.88 倍に見せる（平尾さん 2026-11-27「画面いっぱいすぎる」）。
  // 2026-11-28：初めの倍率（initial-scale）で縮めると、iPhone で横幅だけ広がって縮まず、右が切れた（平尾さんの写真）。
  // 倍率は 1 のままにして、globals.css の zoom で縮める。入力欄に触れたときの自動の拡大は、最大の倍率 1 で止める。公開版は今のまま
  initialScale: 1,
  ...(IS_PERSONAL ? { maximumScale: 1 } : {}),
  themeColor: IS_PERSONAL ? "#ffffff" : "#f6f4ef",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased" data-edition={IS_PERSONAL ? "personal" : "public"}>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
