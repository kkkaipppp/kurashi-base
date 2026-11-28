"use client";

import { CollectionPage, type CollectionConfig } from "@/components/CollectionPage";
import { formatDateJa } from "@/lib/date";
import { bool, str } from "@/lib/draft";

// 版の値を直接比べる（公開版の組み立てから、自分用の入力を外すため）
const PERSONAL_BUILD = process.env.NEXT_PUBLIC_KB_EDITION === "personal";
/** 「旅行、 家族」のような入力をタグの一覧にする（読点・カンマ・空白で区切る。# は外す。20字まで・10個まで・重ねない） */
export function parseTags(s: string): string[] {
  const out: string[] = [];
  for (const raw of s.normalize("NFKC").split(/[、,\s]+/)) {
    const t = Array.from(raw.replace(/^#+/, "").trim()).slice(0, 20).join("");
    if (t && !out.includes(t)) out.push(t);
    if (out.length === 10) break;
  }
  return out;
}

const config: CollectionConfig<"notes"> = {
  key: "notes",
  title: "生活記録・メモ",
  noun: "メモ",
  intro: "日記のような日々の記録も、日付のないメモも残せます。日付を入れると、日付ごとにまとまります。",
  emptyText: "メモはまだありません。",
  fields: [
    { name: "title", label: "タイトル", optional: true, type: "text", placeholder: "例：今日のふりかえり" },
    { name: "body", label: "本文", type: "textarea" },
    { name: "date", label: "日付", optional: true, type: "date", half: true },
    { name: "pinned", label: "上に固定", type: "checkbox", half: true },
    ...(PERSONAL_BUILD ? [{ name: "tags", label: "タグ", optional: true, type: "text" as const, placeholder: "例：旅行、家族（読点で区切る）" }] : []),
  ],
  initial: ({ today }) => ({ title: "", body: "", date: today, pinned: false }),
  // 「追加」・カレンダーから選んだ日で始める（o31 F002。再点検 L-1）
  newDateField: "date",
  toDraft: (n) => ({ title: n.title, body: n.body, date: n.date, pinned: n.pinned, tags: (n.tags ?? []).join("、") }),
  // タグは自分用だけ触る（公開版は項目を触らない＝あるタグはそのまま残る）
  fromDraft: (d) => ({ title: str(d, "title"), body: str(d, "body"), date: str(d, "date"), pinned: bool(d, "pinned"), ...(PERSONAL_BUILD ? { tags: parseTags(str(d, "tags")).length ? parseTags(str(d, "tags")) : undefined } : {}) }),
  ...(PERSONAL_BUILD ? { tagsOf: (n: { tags?: string[] }) => n.tags ?? [] } : {}),
  validate: (d) => (!str(d, "title") && !str(d, "body") ? { body: "タイトルか本文を入力してください" } : ({} as Record<string, string>)),
  // 固定したもの → 日付の新しい順 → 日付なし
  sort: (a, b) => Number(b.pinned) - Number(a.pinned) || (b.date || "0000").localeCompare(a.date || "0000") || b.updatedAt.localeCompare(a.updatedAt),
  groupBy: (n) => (n.pinned ? "pinned" : n.date || "none"),
  groupLabel: (k) => (k === "pinned" ? "固定したメモ" : k === "none" ? "日付なし" : formatDateJa(k, true)),
  row: (n) => ({
    title: n.title || n.body.split("\n")[0].slice(0, 40),
    sub: [PERSONAL_BUILD && n.tags?.length ? n.tags.map((t) => `#${t}`).join(" ") : "", n.title ? n.body.replace(/\n/g, " ").slice(0, 60) : n.pinned && n.date ? formatDateJa(n.date) : ""].filter(Boolean).join("・") || undefined,
  }),
};

export default function NotesPage() {
  return <CollectionPage config={config} />;
}
