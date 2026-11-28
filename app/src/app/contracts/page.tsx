"use client";

import { CollectionPage, numberFromDraft, type CollectionConfig } from "@/components/CollectionPage";
import { Card } from "@/components/ui";
import { daysBetween, formatDateJa } from "@/lib/date";
import { numStr, str } from "@/lib/draft";
import { formatYen } from "@/lib/money";
import { contractMoney, linkedRecurring, monthlyOf } from "@/lib/contractLink";
import type { AppData, Contract } from "@/lib/types";

// 版の値を直接比べる（公開版の組み立てから、自分用の入力を外すため）
const PERSONAL_BUILD = process.env.NEXT_PUBLIC_KB_EDITION === "personal";
const PER_LABEL = { month: "月", year: "年", week: "週", once: "" } as const;

const CYCLES = [
  { value: "monthly", label: "毎月" },
  { value: "yearly", label: "毎年" },
  { value: "none", label: "一括・なし" },
];

const config: CollectionConfig<"contracts"> = {
  key: "contracts",
  title: "契約",
  noun: "契約",
  intro: "スマホ・保険・サブスク・賃貸などの契約と、更新日を記録します。支払いを家計に入れるときは「固定費」にも追加してください。解約の手続きは、各サービスで行ってください。",
  emptyText: "契約はまだありません。",
  fields: ({ data }: { data: AppData }) => [
    { name: "name", label: "名前", type: "text", required: true, placeholder: "例：スマホ料金" },
    // 固定費とつなぐ（自分用。To-Be 2026-11-28 S3-3）。つないだら、金額と周期は固定費の側を使う。つなぐのは選んだときだけ
    ...(PERSONAL_BUILD && data.recurring.length > 0
      ? [
          {
            name: "recurringId",
            label: "つなぐ固定費",
            optional: true,
            type: "select" as const,
            hint: "つなぐと、支払額と周期は固定費の金額を使います（固定費の画面で直します）。同じ支払いを2回入れずに済みます",
            options: [{ value: "", label: "つながない" }, ...data.recurring.map((r) => ({ value: r.id, label: `${r.name}（${formatYen(r.amount)}${r.active ? "" : "・止めている"}）` }))],
          },
        ]
      : []),
    { name: "provider", label: "契約先", optional: true, type: "text", placeholder: "例：〇〇モバイル" },
    { name: "amount", label: "支払額（円）", optional: true, type: "number", half: true },
    { name: "cycle", label: "支払い", type: "select", half: true, options: CYCLES },
    { name: "renewalDate", label: "更新日", optional: true, type: "date", half: true },
    { name: "status", label: "状態", type: "select", half: true, options: [{ value: "active", label: "契約中" }, { value: "cancelled", label: "解約済み" }] },
    { name: "note", label: "メモ", optional: true, type: "textarea", placeholder: "解約の方法、問い合わせ先など" },
  ],
  initial: () => ({ name: "", provider: "", amount: "", cycle: "monthly", renewalDate: "", status: "active", note: "" }),
  toDraft: (c) => ({ name: c.name, provider: c.provider, amount: numStr(c.amount), cycle: c.cycle, renewalDate: c.renewalDate, status: c.status, note: c.note, recurringId: c.recurringId ?? "" }),
  fromDraft: (d) => ({
    name: str(d, "name"),
    provider: str(d, "provider"),
    amount: numberFromDraft(str(d, "amount")),
    cycle: str(d, "cycle") as Contract["cycle"],
    renewalDate: str(d, "renewalDate"),
    status: str(d, "status") as Contract["status"],
    note: str(d, "note"),
    // 自分用だけ触る（公開版は項目を触らない＝あるつなぎはそのまま残る）
    ...(PERSONAL_BUILD ? { recurringId: str(d, "recurringId") || undefined } : {}),
  }),
  sort: (a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1) || (a.renewalDate || "9999").localeCompare(b.renewalDate || "9999"),
  row: (c, { today, data }) => {
    const d = c.renewalDate ? daysBetween(today, c.renewalDate) : null;
    const r = PERSONAL_BUILD ? linkedRecurring(c, data.recurring) : null;
    const m = PERSONAL_BUILD ? contractMoney(c, data.recurring) : { amount: c.amount, per: c.cycle === "monthly" ? "month" : c.cycle === "yearly" ? "year" : "once", source: "contract" as const };
    const link = PERSONAL_BUILD && c.recurringId ? (r ? `固定費「${r.name}」とつないでいます` : "つないだ固定費が見つかりません") : "";
    return {
      title: c.name,
      sub: [c.provider, c.renewalDate ? `更新 ${formatDateJa(c.renewalDate, true)}` : "更新日 未入力", link].filter(Boolean).join("・"),
      muted: c.status === "cancelled",
      badge:
        // 解約したのに、つないだ固定費がまだ動いている（固定費の画面で止める。自動では止めない）
        PERSONAL_BUILD && c.status === "cancelled" && r?.active
          ? { text: "固定費が止まっていません", tone: "warn" }
          : c.status === "cancelled"
          ? { text: "解約済み", tone: "info" }
          : d !== null && d < 0
            ? { text: "更新日を過ぎています", tone: "warn" }
            : d !== null && d <= 30
              ? { text: `更新まで${d}日`, tone: "warn" }
              : undefined,
      right: m.amount !== null && m.per !== "once" ? `${formatYen(m.amount)}/${PER_LABEL[m.per as keyof typeof PER_LABEL]}` : m.amount !== null ? formatYen(m.amount) : undefined,
    };
  },
  header: ({ list, data }) => {
    // つないだ契約は、固定費の金額で数える（自分用。公開版はつなぎを見ず、契約の金額のまま）
    const money = (c: Contract) => contractMoney(PERSONAL_BUILD ? c : { ...c, recurringId: undefined }, data.recurring);
    const active = list.filter((c) => c.status === "active" && money(c).amount !== null);
    if (!active.length) return null;
    const monthly = active.reduce((s, c) => s + monthlyOf(money(c)), 0);
    return (
      <Card className="flex items-center justify-between py-3">
        <span className="text-[14px] font-semibold text-ink-2">契約中の支払い（月あたりの目安）{PERSONAL_BUILD && <span className="num block text-[12px] font-medium text-ink-3">年あたり {formatYen(monthly * 12)}</span>}</span>
        <span className="num text-lg font-bold">{formatYen(monthly)}</span>
      </Card>
    );
  },
};


export default function ContractsPage() {
  return <CollectionPage config={config} />;
}
