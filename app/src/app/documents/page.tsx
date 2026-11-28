"use client";

import { CollectionPage, type CollectionConfig } from "@/components/CollectionPage";
import { daysBetween, formatDateJa } from "@/lib/date";
import { str } from "@/lib/draft";

// 写真の保管場所は自分用だけ（版の値を直接比べる）
const PERSONAL_BUILD = process.env.NEXT_PUBLIC_KB_EDITION === "personal";

const CATEGORIES = ["身分証・免許", "保険", "年金・税金", "住まい", "車", "医療", "家電・保証書", "その他"];

const config: CollectionConfig<"documents"> = {
  key: "documents",
  title: "生活書類",
  noun: "書類",
  intro: "大事な書類の名前・期限・保管場所を記録します。書類の画像やファイルは保存しません（保管場所のメモだけです）。",
  emptyText: "書類はまだありません。",
  fields: [
    { name: "title", label: "名前", type: "text", required: true, placeholder: "例：運転免許証" },
    { name: "category", label: "分類", type: "select", half: true, options: CATEGORIES.map((x) => ({ value: x, label: x })) },
    { name: "expiry", label: "期限", optional: true, type: "date", half: true },
    { name: "place", label: "保管場所", optional: true, type: "text", placeholder: "例：寝室の引き出し、クラウドのフォルダ名" },
    ...(PERSONAL_BUILD ? [{ name: "photoPlace", label: "写真・スキャンの保管場所", optional: true, type: "text" as const, placeholder: "例：iPhone の写真「書類」アルバム、クラウドのフォルダ名", hint: "写真はこのアプリには入れません（端末の容量を守るため）。iPhone の写真などに置き、どこにあるかを書いておきます" }] : []),
    { name: "note", label: "メモ", optional: true, type: "textarea" },
  ],
  initial: () => ({ title: "", category: CATEGORIES[0], expiry: "", place: "", note: "" }),
  toDraft: (d) => ({ title: d.title, category: d.category, expiry: d.expiry, place: d.place, note: d.note, ...(PERSONAL_BUILD ? { photoPlace: d.photoPlace ?? "" } : {}) }),
  fromDraft: (d) => ({ title: str(d, "title"), category: str(d, "category"), expiry: str(d, "expiry"), place: str(d, "place"), note: str(d, "note"), ...(PERSONAL_BUILD ? { photoPlace: str(d, "photoPlace").trim().slice(0, 200) || undefined } : {}) }),
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
