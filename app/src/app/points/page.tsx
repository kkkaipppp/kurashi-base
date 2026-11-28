"use client";

import { CollectionPage, numberFromDraft, type CollectionConfig } from "@/components/CollectionPage";
import { NotAvailable } from "@/components/NotAvailable";
import { daysBetween, formatDateJa } from "@/lib/date";
import { numStr, str } from "@/lib/draft";

// 自分用だけ（版の値を直接比べる。公開版で直接開いたら「使えません」）
const PERSONAL_BUILD = process.env.NEXT_PUBLIC_KB_EDITION === "personal";

/** ポイント（To-Be 02 家計簿「ポイント期限」。2026-11-28）。期限の30日前から、ホームの確認に出す。お店やカード会社とはつながっていない */
const config: CollectionConfig<"points"> = {
  key: "points",
  title: "ポイント",
  noun: "ポイント",
  intro: "お店やカードのポイントの残りと期限を残しておけます。期限の30日前から、ホームの「確認すること」に出します（残りを 0 にすると出しません）。お店やカード会社とはつながっていないので、残りは自分で直してください。",
  emptyText: "まだありません。",
  fields: [
    { name: "name", label: "名前", type: "text", required: true, placeholder: "例：〇〇ポイント" },
    { name: "balance", label: "残り（pt）", optional: true, type: "number", half: true },
    { name: "expiry", label: "期限", optional: true, type: "date", half: true },
    { name: "note", label: "メモ", optional: true, type: "textarea" },
  ],
  initial: () => ({ name: "", balance: "", expiry: "", note: "" }),
  toDraft: (p) => ({ name: p.name, balance: numStr(p.balance), expiry: p.expiry, note: p.note }),
  fromDraft: (d) => ({ name: str(d, "name"), balance: numberFromDraft(str(d, "balance")), expiry: str(d, "expiry"), note: str(d, "note") }),
  // 期限の近い順（期限なしは後ろ）
  sort: (a, b) => (a.expiry || "9999").localeCompare(b.expiry || "9999"),
  row: (p, { today }) => {
    const left = p.expiry ? daysBetween(today, p.expiry) : null;
    return {
      title: p.name,
      sub: [p.expiry ? `${formatDateJa(p.expiry)}まで${left !== null && left >= 0 ? left === 0 ? "（今日まで）" : `（あと${left}日）` : "（期限切れ）"}` : "期限なし", p.note].filter(Boolean).join("・"),
      muted: (left !== null && left < 0) || p.balance === 0,
      right: p.balance !== null ? `${p.balance.toLocaleString("ja-JP")}pt` : undefined,
    };
  },
};

export default function PointsPage() {
  if (!PERSONAL_BUILD) return <NotAvailable />;
  return <CollectionPage config={config} />;
}
