"use client";

import { CollectionPage, numberFromDraft, type CollectionConfig } from "@/components/CollectionPage";
import { NotAvailable } from "@/components/NotAvailable";
import { numStr, str } from "@/lib/draft";
import { formatYen } from "@/lib/money";
import { safeExternalLink } from "@/lib/externalLinks";
import type { Wish } from "@/lib/types";

// 自分用だけ（版の値を直接比べる。公開版で直接開いたら「使えません」）
const PERSONAL_BUILD = process.env.NEXT_PUBLIC_KB_EDITION === "personal";

const PRIORITY = [
  { value: "high", label: "すぐ欲しい" },
  { value: "mid", label: "そのうち" },
  { value: "low", label: "いつか" },
];
const STATUS = [
  { value: "want", label: "欲しい" },
  { value: "bought", label: "買った" },
  { value: "dropped", label: "やめた" },
];
const label = (list: { value: string; label: string }[], v: string) => list.find((x) => x.value === v)?.label ?? v;

/** 欲しいもの（To-Be 02 家計簿「欲しいもの」。決定 2026-11-28）。買ったときの支出は家計簿に記録する（ここでは数えない） */
const config: CollectionConfig<"wishes"> = {
  key: "wishes",
  title: "欲しいもの",
  noun: "欲しいもの",
  intro: "欲しいものと目安の値段を残しておけます。買ったら「買った」にし、支出は家計簿に記録してください（ここの値段は支出に数えません）。",
  emptyText: "まだありません。",
  fields: [
    { name: "name", label: "名前", type: "text", required: true, placeholder: "例：新しい靴" },
    { name: "price", label: "目安の値段（円）", optional: true, type: "number", half: true },
    { name: "priority", label: "欲しさ", type: "select", half: true, options: PRIORITY },
    { name: "url", label: "URL", optional: true, type: "text", placeholder: "https://" },
    { name: "status", label: "状態", type: "select", options: STATUS },
    { name: "note", label: "メモ", optional: true, type: "textarea" },
  ],
  initial: () => ({ name: "", price: "", priority: "mid", url: "", status: "want", note: "" }),
  toDraft: (w) => ({ name: w.name, price: numStr(w.price), priority: w.priority, url: w.url, status: w.status, note: w.note }),
  fromDraft: (d) => ({
    name: str(d, "name"),
    price: numberFromDraft(str(d, "price")),
    priority: str(d, "priority") as Wish["priority"],
    url: safeExternalLink(str(d, "url")) ?? "",
    status: str(d, "status") as Wish["status"],
    note: str(d, "note"),
  }),
  validate: (d) => (str(d, "url") && !safeExternalLink(str(d, "url")) ? { url: "http:// か https:// で始まる URL を入れてください" } : ({} as Record<string, string>)),
  // 欲しい → 買った → やめた、欲しさの高い順
  sort: (a, b) => STATUS.findIndex((s) => s.value === a.status) - STATUS.findIndex((s) => s.value === b.status) || PRIORITY.findIndex((p) => p.value === a.priority) - PRIORITY.findIndex((p) => p.value === b.priority),
  groupBy: (w) => w.status,
  groupLabel: (k) => label(STATUS, k),
  row: (w) => ({
    title: w.name,
    sub: [label(PRIORITY, w.priority), w.note].filter(Boolean).join("・"),
    muted: w.status !== "want",
    right: w.price !== null ? formatYen(w.price) : undefined,
  }),
  header: ({ list }) => {
    const want = list.filter((w) => w.status === "want" && w.price !== null);
    if (want.length === 0) return null;
    return <p className="num px-1 text-[13px] text-ink-2">欲しいものの目安の合計：{formatYen(want.reduce((s, w) => s + (w.price ?? 0), 0))}（{want.length}件）</p>;
  },
};

export default function WishesPage() {
  if (!PERSONAL_BUILD) return <NotAvailable />;
  return <CollectionPage config={config} />;
}
