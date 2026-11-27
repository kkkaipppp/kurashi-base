import Link from "next/link";
import { Card, IconChevronR } from "./ui";

/** 自分用の使い方：メニューと計画（To-Be 2026-11-27。05「目的別」「送信・権限の実態を明示」） */
export function GuideTobe() {
  const linkCls = "flex min-h-11 items-center justify-between rounded-lg px-1 text-[15px] font-semibold text-brand";
  return (
    <Card>
      <h2 className="text-[17px] font-bold">メニューと計画</h2>
      <h3 className="mt-2 text-[14px] font-bold">下のボタン</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-[14px]">
        <li>初めは「ホーム・カレンダー・追加・家計簿・メニュー」です。真ん中の「追加」から、支出・予定・やることなどを足します</li>
        <li>並びは設定の「下のメニュー」で変えられます。やることは、ホームの「今日やること」とメニューの下の一覧から開きます</li>
      </ul>
      <h3 className="mt-3 text-[14px] font-bold">メニュー</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-[14px]">
        <li>計画・目標・資産・契約・固定費・健康・メモ・書類に分かれています。旅行は「計画」、資格・勉強は「目標」の中です</li>
        <li>「編集」で並びを変えられます。出す機能は設定の「メニューに出す機能」で選びます。隠しても記録は消えず、検索で見つかります</li>
        <li>やること・お金の記録・分類していない記録・レシートを見て入力・ウィジェット・バックアップは、メニューの下の一覧から開きます</li>
      </ul>
      <h3 className="mt-3 text-[14px] font-bold">友達と飲み会の計画を立てたい</h3>
      <ol className="mt-1 list-decimal space-y-1 pl-5 text-[14px]">
        <li>メニュー →「計画」→「計画を作る」→「飲み会・集まり」</li>
        <li>「お店を比べる」に候補を入れて、決めたら「これに決める」</li>
        <li>日にちを入れて「予定に入れる」。予約などは「次にやること」に足します</li>
        <li>予算は見込みで、家計簿の支出には入りません。払ったら家計簿に支出を記録し、計画の「支出の記録をつなぐ」で選びます</li>
      </ol>
      <p className="mt-2 text-[13px] text-ink-3">
        みんなに日程を聞くリンクや、回答を集める機能はまだありません。連絡は LINE などで行ってください。計画を消しても、つないだ予定・やること・支出は消えません。
      </p>
      <Link href="/plans" className={`mt-2 ${linkCls}`}>
        計画を開く
        <IconChevronR className="size-4" />
      </Link>
    </Card>
  );
}
