"use client";

import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";

export default function GuidePage() {
  return (
    <main className="space-y-3">
      <PageHeader title="はじめての方へ" />
      <Card>
        <h2 className="text-[17px] font-bold">まずは3つだけ</h2>
        <ol className="mt-2 list-decimal space-y-3 pl-5 text-[14px]">
          <li>ホームから予算を設定（あとでも大丈夫）</li>
          <li>画面下の「＋」から支出・収入・予定・タスクを追加</li>
          <li>カレンダーでその日の記録、振り返りで今月の使い方を確認</li>
        </ol>
      </Card>
      <Card>
        <h2 className="text-[17px] font-bold">大切な記録を守るために</h2>
        <p className="mt-2 text-[14px]">記録は今使っている端末の、このブラウザの中だけに保存されます。同じURLを別のスマホやPCで開いても、記録は引き継がれません。</p>
        <p className="mt-2 text-[14px]">Safariのサイトデータを消す、機種変更する、別のブラウザを使うなどの操作で記録が見えなくなることがあります。週に1回など、定期的にバックアップを保存してください。</p>
        <Link href="/settings#backup" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-[14px] font-semibold text-brand-ink">バックアップの設定へ</Link>
      </Card>
      <Card>
        <h2 className="text-[17px] font-bold">まだできないこと</h2>
        <p className="mt-2 text-[14px]">画像の自動読み取り、友達とのデータ共有、自動同期、通知、iPhoneのウィジェットには対応していません。画像を見ながら金額を手入力することはできます。</p>
        <p className="mt-2 text-[13px] text-ink-3">このアプリは試用版です。正式公開前に使い勝手や表示を改善する場合があります。</p>
      </Card>
    </main>
  );
}
