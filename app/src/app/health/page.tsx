"use client";

import { CollectionPage, numberFromDraft, type CollectionConfig } from "@/components/CollectionPage";
import { formatDateJa } from "@/lib/date";
import { numStr, str } from "@/lib/draft";

const ITEMS = ["体重", "体温", "血圧（上）", "血圧（下）", "睡眠時間", "歩数", "通院", "服薬", "その他"];
const UNIT_HINT: Record<string, string> = { 体重: "kg", 体温: "℃", "血圧（上）": "mmHg", "血圧（下）": "mmHg", 睡眠時間: "時間", 歩数: "歩" };

const config: CollectionConfig<"health"> = {
  key: "health",
  title: "健康記録",
  noun: "健康記録",
  intro: "体重や睡眠などを、自分の記録として残します。この記録は診断ではありません。体調に不安があるときは、医療機関に相談してください。",
  emptyText: "まだ記録がありません。今日の体重や睡眠時間から記録してみましょう。",
  fields: [
    { name: "date", label: "日付", type: "date", required: true, half: true },
    { name: "item", label: "項目", type: "select", half: true, options: ITEMS.map((x) => ({ value: x, label: x })) },
    { name: "value", label: "数値（任意）", type: "number", decimal: true, half: true },
    { name: "unit", label: "単位（任意）", type: "text", half: true, placeholder: "空欄なら自動" },
    { name: "note", label: "メモ（任意）", type: "textarea", placeholder: "体調、気づいたことなど" },
  ],
  initial: ({ today }) => ({ date: today, item: "体重", value: "", unit: "", note: "" }),
  toDraft: (h) => ({ date: h.date, item: h.item, value: numStr(h.value), unit: h.unit, note: h.note }),
  fromDraft: (d) => ({
    date: str(d, "date"),
    item: str(d, "item"),
    value: numberFromDraft(str(d, "value")),
    unit: str(d, "unit") || UNIT_HINT[str(d, "item")] || "",
    note: str(d, "note"),
  }),
  validate: (d) => (numberFromDraft(str(d, "value")) === null && !str(d, "note") ? { value: "数値かメモのどちらかを入力してください" } : ({} as Record<string, string>)),
  sort: (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  groupBy: (h) => h.date,
  groupLabel: (k) => formatDateJa(k, true),
  row: (h) => ({
    title: h.item,
    sub: h.note,
    right: h.value !== null ? `${h.value.toLocaleString("ja-JP")}${h.unit ? ` ${h.unit}` : ""}` : undefined,
  }),
};

export default function HealthPage() {
  return <CollectionPage config={config} />;
}
