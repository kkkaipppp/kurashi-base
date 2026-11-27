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

const PERSONAL_SCALE = 0.88;

export const viewport: Viewport = {
  width: "device-width",
  // 自分用は画面に入る量を増やすため、全体を少し小さく見せる（平尾さん 2026-11-27「画面いっぱいすぎる」）。
  // 入力欄の文字は 16px のままなので、入力のときの自動の拡大は起きない。公開版は今のまま
  initialScale: IS_PERSONAL ? PERSONAL_SCALE : 1,
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
