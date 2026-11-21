"use client";

import Link from "next/link";
import { useUI } from "@/components/UIContext";
import { Button, Card, IconChevronR, PageHeader } from "@/components/ui";

const linkCls = "flex min-h-11 items-center justify-between rounded-xl px-1 text-[14px] font-semibold text-brand hover:bg-brand-soft";

export default function GuidePage() {
  const ui = useUI();
  return (
    <main className="space-y-3">
      <PageHeader title="使い方" />

      <Card>
        <h2 className="text-[17px] font-bold">まずは3つだけ</h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-[14px]">
          <li>1か月の予算を決める（あとでも大丈夫）</li>
          <li>画面下の「＋」から、支出・収入・予定・タスクを追加する</li>
          <li>カレンダーでその日の記録を、振り返りで今月の使い方を見る</li>
        </ol>
        <div className="mt-3 grid gap-2">
          <Button onClick={() => ui.openAdd()}>支出・予定を追加する</Button>
          <Link href="/settings#budget" className={linkCls}>
            予算を決める
            <IconChevronR className="size-4" />
          </Link>
          <Link href="/calendar" className={linkCls}>
            カレンダーを開く
            <IconChevronR className="size-4" />
          </Link>
        </div>
      </Card>

      <Card>
        <h2 className="text-[17px] font-bold">記録を守るために</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-[14px]">
          <li>記録は、今使っている端末の、このブラウザの中だけに保存されます。インターネット上には送りません。</li>
          <li>同じURLを別のスマホやPC、別のブラウザで開いても、記録は見えません。URLを友達に送っても、記録は共有されません。</li>
          <li>Safari の履歴・Webサイトデータを消す、機種変更する、といった操作で記録が消えることがあります。</li>
          <li>週に1回ほど「バックアップを書き出す」でファイルに保存してください。そのファイルから、いつでも戻せます。</li>
        </ul>
        <Link href="/settings#backup" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-[14px] font-semibold text-brand-ink">
          バックアップを書き出す
        </Link>
      </Card>

      <Card>
        <h2 className="text-[17px] font-bold">まだできないこと</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px]">
          <li>レシートなどの画像の自動読み取り（画像を見ながら手で入力できます）</li>
          <li>友達や家族とのデータの共有、端末どうしの同期</li>
          <li>通知、iPhone のホーム画面のウィジェット</li>
        </ul>
        <p className="mt-2 text-[13px] text-ink-3">このアプリは試用版（β版）です。使い勝手や表示は、これから変わることがあります。</p>
      </Card>
    </main>
  );
}
