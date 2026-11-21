"use client";

import { CollectionPage, numberFromDraft, type CollectionConfig } from "@/components/CollectionPage";
import { Card } from "@/components/ui";
import { daysBetween, formatDateJa } from "@/lib/date";
import { numStr, str } from "@/lib/draft";
import { formatYen } from "@/lib/money";
import type { Contract } from "@/lib/types";

const CYCLES = [
  { value: "monthly", label: "毎月" },
  { value: "yearly", label: "毎年" },
  { value: "none", label: "支払いなし・一括" },
];

const config: CollectionConfig<"contracts"> = {
  key: "contracts",
  title: "契約",
  noun: "契約",
  intro: "スマホ・保険・サブスク・賃貸などの契約と、更新日を記録します。支払いを家計に入れるときは「固定費」にも登録してください。解約の手続きは、各サービスで行ってください。",
  emptyText: "まだ契約が登録されていません。",
  fields: [
    { name: "name", label: "契約名", type: "text", required: true, placeholder: "例：スマホ料金" },
    { name: "provider", label: "契約先（任意）", type: "text", placeholder: "例：〇〇モバイル" },
    { name: "amount", label: "支払額（円・任意）", type: "number", half: true },
    { name: "cycle", label: "支払いの周期", type: "select", half: true, options: CYCLES },
    { name: "renewalDate", label: "次の更新日（任意）", type: "date", half: true },
    { name: "status", label: "状態", type: "select", half: true, options: [{ value: "active", label: "契約中" }, { value: "cancelled", label: "解約済み" }] },
    { name: "note", label: "メモ（任意）", type: "textarea", placeholder: "解約の方法、問い合わせ先など" },
  ],
  initial: () => ({ name: "", provider: "", amount: "", cycle: "monthly", renewalDate: "", status: "active", note: "" }),
  toDraft: (c) => ({ name: c.name, provider: c.provider, amount: numStr(c.amount), cycle: c.cycle, renewalDate: c.renewalDate, status: c.status, note: c.note }),
  fromDraft: (d) => ({
    name: str(d, "name"),
    provider: str(d, "provider"),
    amount: numberFromDraft(str(d, "amount")),
    cycle: str(d, "cycle") as Contract["cycle"],
    renewalDate: str(d, "renewalDate"),
    status: str(d, "status") as Contract["status"],
    note: str(d, "note"),
  }),
  sort: (a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1) || (a.renewalDate || "9999").localeCompare(b.renewalDate || "9999"),
  row: (c, { today }) => {
    const d = c.renewalDate ? daysBetween(today, c.renewalDate) : null;
    return {
      title: c.name,
      sub: [c.provider, c.renewalDate ? `更新 ${formatDateJa(c.renewalDate, true)}` : "更新日 未入力"].filter(Boolean).join("・"),
      muted: c.status === "cancelled",
      badge:
        c.status === "cancelled"
          ? { text: "解約済み", tone: "info" }
          : d !== null && d < 0
            ? { text: "更新日を過ぎています", tone: "warn" }
            : d !== null && d <= 30
              ? { text: `更新まで${d}日`, tone: "warn" }
              : undefined,
      right: c.amount !== null && c.cycle !== "none" ? `${formatYen(c.amount)}/${c.cycle === "monthly" ? "月" : "年"}` : c.amount !== null ? formatYen(c.amount) : undefined,
    };
  },
  header: ({ list }) => {
    const active = list.filter((c) => c.status === "active" && c.amount !== null);
    if (!active.length) return null;
    const monthly = active.reduce((s, c) => s + (c.cycle === "monthly" ? c.amount! : c.cycle === "yearly" ? Math.round(c.amount! / 12) : 0), 0);
    return (
      <Card className="flex items-center justify-between py-3">
        <span className="text-[14px] font-semibold text-ink-2">契約中の支払い（月あたりの目安）</span>
        <span className="num text-lg font-bold">{formatYen(monthly)}</span>
      </Card>
    );
  },
};


export default function ContractsPage() {
  return <CollectionPage config={config} />;
}
