"use client";

import Link from "next/link";
import { useUI } from "@/components/UIContext";
import { Button, Card, IconChevronR, PageHeader } from "@/components/ui";
import { BRAND, LogoMark } from "@/components/Logo";
import { useIsNativeApp } from "@/lib/platform";
import { FEATURES, IS_PERSONAL } from "@/lib/edition";

// 組み立てのときに決まる値をこのファイルの中で比べる（公開版の組み立てから、自分用の手順を取り除く。点検 低-1）
const PERSONAL_BUILD = process.env.NEXT_PUBLIC_KB_EDITION === "personal";
const linkCls =
  "flex min-h-11 items-center justify-between rounded-xl px-1 text-[14px] font-semibold text-brand hover:bg-brand-soft";

export default function GuidePage() {
  const nativeApp = useIsNativeApp();
  const ui = useUI();
  return (
    <main className="space-y-3">
      <PageHeader title="使い方" />

      <Card className="flex items-center gap-3">
        <LogoMark size={48} />
        <div>
          <p
            className="text-[17px] font-bold"
            style={{ color: "var(--logo-ink)" }}
          >
            {BRAND.name}
          </p>
          <p className="text-[13px] text-ink-2">
            {BRAND.message}
            予定・お金・旅行・勉強を、ここにまとめて記録できます。
          </p>
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

      {!nativeApp && (
        <Card>
          <h2 className="text-[17px] font-bold">次からすぐに開く</h2>
          <p className="mt-2 text-[14px]">
            iPhoneのSafariで共有ボタンを押し、「ホーム画面に追加」を選ぶと、次からアイコンで開けます。
          </p>
          <p className="mt-2 text-[14px] font-semibold">
            アイコンから開いたときと Safari
            で開いたときでは、記録が別々になります。使うのはどちらか1つに決めてください（おすすめはアイコン）。
          </p>
          <p className="mt-2 text-[14px]">
            Safari で入れた記録を移すときは、Safari
            で「バックアップを書き出す」→
            アイコンから開いて、同じ画面で復元します。
          </p>
        </Card>
      )}

      <Card>
        <h2 className="text-[17px] font-bold">ほかにできること</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-[14px]">
          <li>予定を押す → 行き方を調べる・Googleカレンダー</li>
          <li>メニュー → 旅行：日ごとの行程と持ち物</li>
          <li>メニュー → 資格の学習：1日の勉強時間の目安</li>
        </ul>
        {/* 新しく使えるようになった機能（2026-11-26 承認5の3） */}
        <h3 className="mt-3 text-[14px] font-bold">お金の見通しと整理</h3>
        <ul className="mt-1 list-disc space-y-2 pl-5 text-[14px]">
          {FEATURES.forecast && <li>振り返り → 月末の見込み：今のペースだと月末にいくらになるか（確定ではありません）</li>}
          {FEATURES.periodReport && <li>振り返り → 週・年：週ごと・月ごとの支出と収入の推移</li>}
          {FEATURES.decide && <li>メニュー → 買い物の判断：買う前に、今月と来月の予算への影響を見る</li>}
          {FEATURES.inbox && <li>メニュー → 未整理の記録：「その他」の記録を、店名ごとにまとめてカテゴリを付ける</li>}
          {FEATURES.search && <li>メニュー → さがす：記録・予定・メモなどを、1つの言葉で全部の月から探す</li>}
          {(FEATURES.csvImport || FEATURES.icsImport) && <li>設定 → 家計簿の CSV・カレンダーのファイル（.ics）を取り込む（端末の中だけで読み込みます）</li>}
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
          {nativeApp ? (
            <>
              <li>記録はこのアプリの中（Safari の Web 版とは別）</li>
              <li>
                開いたとき・閉じたときに自動でバックアップ（「ファイル」アプリ → このiPhone内 →
                くらしベース）
              </li>
              <li>
                アプリを削除すると、記録と自動バックアップが消えます。ときどき書き出して
                iCloud Drive などにも保存
              </li>
            </>
          ) : (
            <>
              <li>記録はこの端末の、このブラウザの中だけ（Safari など）</li>
              <li>Safari のデータを消すと、記録も消えます</li>
              <li>週に1回、バックアップを書き出す</li>
            </>
          )}
        </ul>
        {/* A4（自分用アプリ。2026-11-26）：機種変更・入れ直しで記録をなくさない手順 */}
        {PERSONAL_BUILD && nativeApp && (
          <details className="mt-2 text-[14px]">
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold">機種変更・入れ直しのときの手順</summary>
            <ol className="list-decimal space-y-1.5 pb-1 pl-5">
              <li>古い iPhone の「ファイル」アプリで、このiPhone内 → くらしベース の、いちばん新しい自動バックアップを、iCloud Drive にコピーする（この iPhone の中にだけあるので、機種変更の方法によっては新しい iPhone に移りません）</li>
              <li>新しい iPhone に、Mac からアプリを入れる</li>
              <li>新しい iPhone でアプリを開き、設定の「バックアップから復元…」で、1 でコピーしたファイルを選び、「バックアップの状態に戻す」を選んで「すべて置き換える」を押す</li>
              <li>件数（記録・予定など）が古い iPhone と同じかを確かめてから、古い iPhone のアプリを消す</li>
            </ol>
          </details>
        )}
        <Link
          href="/settings#backup"
          className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-[14px] font-semibold text-brand-ink"
        >
          バックアップを書き出す
        </Link>
      </Card>

      <Card>
        <h2 className="text-[17px] font-bold">まだできないこと</h2>
        {IS_PERSONAL ? (
          // 自分用：iPhone アプリでは文字の読み取り・通知・ウィジェットが使える（磨き込み 2026-11-26。公開版の文は変えない）
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px]">
            <li>Googleカレンダーとの同期（予定は .ics のファイルで渡す・取り込む）</li>
            <li>友達や家族とのデータの共有、端末どうしの同期</li>
            <li>文字の読み取り・通知・ウィジェットは、iPhone アプリの中だけ（パソコンのブラウザでは使えません）</li>
          </ul>
        ) : (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px]">
            <li>
              レシートの文字の自動読み取り（OCR。「レシートを見て入力」で、画像を見ながら手で入力できます）
            </li>
            <li>
              Googleカレンダーとの自動の同期（予定を Google の画面に渡すことと、.ics のファイルでの取り込み・書き出しはできます）
            </li>
            <li>友達や家族とのデータの共有、端末どうしの同期</li>
            <li>通知、iPhone のホーム画面のウィジェット</li>
          </ul>
        )}
        <p className="mt-2 text-[13px] text-ink-3">
          このアプリは試用版（β版）です。使い勝手や表示は、これから変わることがあります。
        </p>
      </Card>
    </main>
  );
}
