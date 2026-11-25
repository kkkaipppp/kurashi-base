"use client";

import { ComingSoon } from "@/components/CollectionPage";
import Link from "next/link";
import { Card } from "@/components/ui";

const ITEMS = [
  { name: "銀行・クレジットカード", status: "未接続", note: "明細の自動取り込み。金融機関との連携のしくみが必要です。今は、家計簿アプリの CSV を「設定」から取り込めます" },
  { name: "証券会社（NISA）", status: "未接続", note: "今は「資産・NISA」で手入力します" },
  { name: "Googleカレンダーなど", status: "未接続", note: "自動でつなぐのは準備中。今は、カレンダーのファイル（.ics）で予定の取り込み・書き出しが「設定」からできます" },
  { name: "iPhoneのショートカット・通知", status: "未接続", note: "決済の通知から支出を記録。Webアプリでは、ほかのアプリの通知を自動では読めません" },
  { name: "レシートの文字の読み取り（OCR）", status: "準備中", note: "今は「レシートを見て入力」で、画像を見ながら手で入力します" },
];

export default function IntegrationsPage() {
  return (
    <>
      <ComingSoon
        title="外部サービス連携"
        lead="ほかのサービスとつないで、入力の手間を減らす予定です。"
        points={["つなぐ先の一覧と、接続の状態を確認する", "つなぐ・切るを自分で選ぶ"]}
        note="今は、どのサービスともつながっていません。データを外部に送ることもありません。"
      />
      <Card className="mt-3">
        <h2 className="mb-1 text-[17px] font-bold">今できること（ファイルで取り込む）</h2>
        <ul className="list-disc space-y-0.5 pl-5 text-[14px]">
          <li>家計簿の CSV（マネーフォワードなどの書き出し）を取り込む</li>
          <li>カレンダーのファイル（.ics）の予定を取り込む・書き出す</li>
        </ul>
        <p className="mt-1 text-[12px] text-ink-3">どちらも端末の中だけで読み込みます（外へは送りません）。</p>
        <Link href="/settings" className="mt-2 inline-flex min-h-11 items-center rounded-lg px-2 text-[13px] font-semibold text-brand hover:bg-brand-soft">
          設定で取り込む
        </Link>
      </Card>
      <Card className="mt-3">
        <h2 className="mb-2 text-[17px] font-bold">つなぐ予定の先</h2>
        <ul className="divide-y divide-line">
          {ITEMS.map((i) => (
            <li key={i.name} className="py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-semibold">{i.name}</span>
                <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-semibold text-ink-2">{i.status}</span>
              </div>
              <p className="mt-0.5 text-[12px] text-ink-3">{i.note}</p>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
