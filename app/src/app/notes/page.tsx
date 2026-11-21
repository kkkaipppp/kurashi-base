"use client";

import { CollectionPage, type CollectionConfig } from "@/components/CollectionPage";
import { formatDateJa } from "@/lib/date";
import { bool, str } from "@/lib/draft";

const config: CollectionConfig<"notes"> = {
  key: "notes",
  title: "生活記録・メモ",
  noun: "メモ",
  intro: "日記のような日々の記録も、日付のないメモも残せます。日付を入れると、日付ごとにまとまります。",
  emptyText: "まだメモがありません。今日あったことや、覚えておきたいことを書いてみましょう。",
  fields: [
    { name: "title", label: "タイトル（任意）", type: "text", placeholder: "例：今日のふりかえり" },
    { name: "body", label: "本文", type: "textarea" },
    { name: "date", label: "日付（任意）", type: "date", half: true },
    { name: "pinned", label: "上に固定する", type: "checkbox", half: true },
  ],
  initial: ({ today }) => ({ title: "", body: "", date: today, pinned: false }),
  toDraft: (n) => ({ title: n.title, body: n.body, date: n.date, pinned: n.pinned }),
  fromDraft: (d) => ({ title: str(d, "title"), body: str(d, "body"), date: str(d, "date"), pinned: bool(d, "pinned") }),
  validate: (d) => (!str(d, "title") && !str(d, "body") ? { body: "タイトルか本文を入力してください" } : ({} as Record<string, string>)),
  // 固定したもの → 日付の新しい順 → 日付なし
  sort: (a, b) => Number(b.pinned) - Number(a.pinned) || (b.date || "0000").localeCompare(a.date || "0000") || b.updatedAt.localeCompare(a.updatedAt),
  groupBy: (n) => (n.pinned ? "pinned" : n.date || "none"),
  groupLabel: (k) => (k === "pinned" ? "固定したメモ" : k === "none" ? "日付なし" : formatDateJa(k, true)),
  row: (n) => ({
    title: n.title || n.body.split("\n")[0].slice(0, 40),
    sub: n.title ? n.body.replace(/\n/g, " ").slice(0, 60) : n.pinned && n.date ? formatDateJa(n.date) : undefined,
  }),
};

export default function NotesPage() {
  return <CollectionPage config={config} />;
}
