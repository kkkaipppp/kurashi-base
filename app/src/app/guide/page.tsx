"use client";

import Link from "next/link";
import { useUI } from "@/components/UIContext";
import { Button, Card, IconChevronR, PageHeader } from "@/components/ui";
import { BRAND, LogoMark } from "@/components/Logo";

const linkCls = "flex min-h-11 items-center justify-between rounded-xl px-1 text-[14px] font-semibold text-brand hover:bg-brand-soft";

export default function GuidePage() {
  const ui = useUI();
  return (
    <main className="space-y-3">
      <PageHeader title="使い方" />

      <Card className="flex items-center gap-3">
        <LogoMark size={48} />
        <div>
          <p className="text-[17px] font-bold" style={{ color: "var(--logo-ink)" }}>
            {BRAND.name}
          </p>
          <p className="text-[13px] text-ink-2">{BRAND.message}予定・お金・旅行・勉強を、ここにまとめて記録できます。</p>
        </div>
      </Card>

      <Card>
        <h2 className="text-[17px] font-bold">はじめにやること</h2>
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
        <h2 className="text-[17px] font-bold">ほかにできること</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-[14px]">
          <li>予定を押すと詳細が開きます。場所を入れておくと「行き方を調べる」で Googleマップが開きます。「Googleカレンダーに追加する」は、Google の画面で保存すると登録されます（このアプリとは連動しません）。</li>
          <li>旅行は「メニュー → 旅行」。日ごとの行程（移動・宿泊・観光など）と持ち物をまとめられます。</li>
          <li>資格は「メニュー → 資格の学習」。候補から選ぶと、出典のある資格だけ勉強時間の目安が出ます。試験日と目標を入れると、1日に勉強したい時間が分かります。</li>
        </ul>
        <div className="mt-3 grid gap-1">
          <Link href="/trips" className={linkCls}>
            旅行を開く
            <IconChevronR className="size-4" />
          </Link>
          <Link href="/study" className={linkCls}>
            資格の学習を開く
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
          <li>レシートの文字の自動読み取り（OCR。「レシートを見て入力」で、画像を見ながら手で入力できます）</li>
          <li>Googleカレンダーとの同期（予定を Google の画面に渡すだけです）</li>
          <li>友達や家族とのデータの共有、端末どうしの同期</li>
          <li>通知、iPhone のホーム画面のウィジェット</li>
        </ul>
        <p className="mt-2 text-[13px] text-ink-3">このアプリは試用版（β版）です。使い勝手や表示は、これから変わることがあります。</p>
      </Card>
    </main>
  );
}
