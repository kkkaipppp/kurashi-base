import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "くらしベース",
  applicationName: "くらしベース",
  description: "暮らしの面倒を、ひとつに。予定・お金・旅行・勉強をまとめて記録できるアプリ（β版）。記録は端末のブラウザの中だけに保存します",
  appleWebApp: { title: "くらしベース", statusBarStyle: "default" },
  // 友人βの間は検索エンジンに載せない（URL を知っている人だけが使う）
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f4ef",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
