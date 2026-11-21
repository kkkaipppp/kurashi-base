"use client";

import { ComingSoon } from "@/components/CollectionPage";
import { Card } from "@/components/ui";

const ITEMS = [
  { name: "銀行・クレジットカード", status: "未接続", note: "明細の自動取り込み。金融機関との連携のしくみが必要です" },
  { name: "証券会社（NISA）", status: "未接続", note: "今は「資産・NISA」で手入力します" },
  { name: "Googleカレンダーなど", status: "未接続", note: "予定の読み込み・書き出し" },
  { name: "iPhoneのショートカット・通知", status: "未接続", note: "決済の通知から支出を記録。Webアプリでは、ほかのアプリの通知を自動では読めません" },
  { name: "レシートの文字の読み取り（OCR）", status: "準備中", note: "今は「画像から取り込む」で、画像を見ながら手で入力します" },
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
        <h2 className="mb-2 text-[15px] font-bold">つなぐ予定の先</h2>
        <ul className="divide-y divide-line">
          {ITEMS.map((i) => (
            <li key={i.name} className="py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-semibold">{i.name}</span>
                <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-2">{i.status}</span>
              </div>
              <p className="mt-0.5 text-[12px] text-ink-3">{i.note}</p>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
