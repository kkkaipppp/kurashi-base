"use client";

import { CollectionPage, type CollectionConfig } from "@/components/CollectionPage";
import { daysBetween, formatDateJa } from "@/lib/date";
import { str } from "@/lib/draft";

const CATEGORIES = ["身分証・免許", "保険", "年金・税金", "住まい", "車", "医療", "保証書・取扱説明書", "その他"];

const config: CollectionConfig<"documents"> = {
  key: "documents",
  title: "生活書類",
  noun: "書類",
  intro: "大事な書類の名前・期限・保管場所を記録します。書類の画像やファイルは保存しません（保管場所のメモだけです）。",
  emptyText: "まだ書類が登録されていません。運転免許証やパスポートの期限から登録してみましょう。",
  fields: [
    { name: "title", label: "書類の名前", type: "text", required: true, placeholder: "例：運転免許証" },
    { name: "category", label: "分類", type: "select", half: true, options: CATEGORIES.map((x) => ({ value: x, label: x })) },
    { name: "expiry", label: "期限（任意）", type: "date", half: true },
    { name: "place", label: "保管場所（任意）", type: "text", placeholder: "例：寝室の引き出し、クラウドのフォルダ名" },
    { name: "note", label: "メモ（任意）", type: "textarea" },
  ],
  initial: () => ({ title: "", category: CATEGORIES[0], expiry: "", place: "", note: "" }),
  toDraft: (d) => ({ title: d.title, category: d.category, expiry: d.expiry, place: d.place, note: d.note }),
  fromDraft: (d) => ({ title: str(d, "title"), category: str(d, "category"), expiry: str(d, "expiry"), place: str(d, "place"), note: str(d, "note") }),
  sort: (a, b) => (a.expiry || "9999").localeCompare(b.expiry || "9999") || a.title.localeCompare(b.title),
  row: (doc, { today }) => {
    const d = doc.expiry ? daysBetween(today, doc.expiry) : null;
    return {
      title: doc.title,
      sub: [doc.category, doc.expiry ? `期限 ${formatDateJa(doc.expiry, true)}` : "", doc.place ? `保管：${doc.place}` : ""].filter(Boolean).join("・"),
      badge: d !== null && d < 0 ? { text: "期限切れ", tone: "warn" } : d !== null && d <= 30 ? { text: `あと${d}日`, tone: "warn" } : undefined,
    };
  },
};

export default function DocumentsPage() {
  return <CollectionPage config={config} />;
}
