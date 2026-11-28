"use client";

import { CollectionPage, numberFromDraft, type CollectionConfig } from "@/components/CollectionPage";
import { NotAvailable } from "@/components/NotAvailable";
import { formatDateJa } from "@/lib/date";
import { numStr, str } from "@/lib/draft";
import { safeExternalLink } from "@/lib/externalLinks";
import { cancelDaysLeft, cancelWhen } from "@/lib/household";
import { MAX_AMOUNT, formatYen } from "@/lib/money";
import type { Reservation } from "@/lib/types";

// 自分用だけ（版の値を直接比べる。公開版で直接開いたら「使えません」）
const PERSONAL_BUILD = process.env.NEXT_PUBLIC_KB_EDITION === "personal";

const KINDS = [
  { value: "hotel", label: "宿泊" },
  { value: "flight", label: "飛行機" },
  { value: "train", label: "電車・バス" },
  { value: "restaurant", label: "お店" },
  { value: "other", label: "そのほか" },
];
// To-Be 05「予約: 未予約・予約済み・キャンセル済み（外部確認なしで予約済みにしない）」→ 予約済みは本人が選ぶ
const STATUS = [
  { value: "none", label: "未予約" },
  { value: "booked", label: "予約済み" },
  { value: "canceled", label: "キャンセル済み" },
];
const label = (list: { value: string; label: string }[], v: string) => list.find((x) => x.value === v)?.label ?? v;

/** 予約情報と無料キャンセルの期限（To-Be 02 計画「予約」・05「予約情報」。2026-11-28） */
const config: CollectionConfig<"reservations"> = {
  key: "reservations",
  title: "予約",
  noun: "予約",
  intro: "宿・飛行機・お店などの予約番号と、無料キャンセルの期限を残しておけます。「予約済み」にしたものは、期限の3日前からホームの「確認すること」に出します。予約サイトとはつながっていないので、予約済み・キャンセル済みは自分で選んでください。金額は目安で、支出には数えません。",
  emptyText: "まだありません。",
  fields: [
    { name: "name", label: "名前", type: "text", required: true, placeholder: "例：〇〇ホテル" },
    { name: "kind", label: "種類", type: "select", half: true, options: KINDS },
    { name: "status", label: "状態", type: "select", half: true, options: STATUS },
    { name: "date", label: "利用日", optional: true, type: "date", half: true },
    { name: "cancelBy", label: "無料キャンセルの期限", optional: true, type: "date", half: true },
    { name: "ref", label: "予約番号", optional: true, type: "text" },
    { name: "amount", label: "金額の目安（円）", optional: true, type: "number" },
    { name: "url", label: "URL", optional: true, type: "text", placeholder: "https://" },
    { name: "note", label: "メモ", optional: true, type: "textarea" },
  ],
  initial: () => ({ name: "", kind: "hotel", status: "none", date: "", cancelBy: "", ref: "", amount: "", url: "", note: "" }),
  toDraft: (r) => ({ name: r.name, kind: r.kind, status: r.status, date: r.date, cancelBy: r.cancelBy, ref: r.ref, amount: numStr(r.amount), url: r.url, note: r.note }),
  fromDraft: (d) => {
    const amt = numberFromDraft(str(d, "amount"));
    return {
      name: str(d, "name"),
      kind: str(d, "kind") as Reservation["kind"],
      status: str(d, "status") as Reservation["status"],
      date: str(d, "date"),
      cancelBy: str(d, "cancelBy"),
      ref: str(d, "ref"),
      amount: amt !== null && Number.isInteger(amt) && amt > 0 ? amt : null,
      url: safeExternalLink(str(d, "url")) ?? "",
      note: str(d, "note"),
    };
  },
  validate: (d) => {
    const e: Record<string, string> = {};
    if (str(d, "url") && !safeExternalLink(str(d, "url"))) e.url = "http:// か https:// で始まる URL を入れてください";
    const a = str(d, "amount");
    const n = numberFromDraft(a);
    if (a !== "" && (n === null || !Number.isInteger(n) || n <= 0 || n > MAX_AMOUNT)) e.amount = `1〜${MAX_AMOUNT.toLocaleString("ja-JP")}円の金額を入れてください`;
    return e;
  },
  // 予約済み → 未予約 → キャンセル済み、利用日の近い順
  sort: (a, b) => ["booked", "none", "canceled"].indexOf(a.status) - ["booked", "none", "canceled"].indexOf(b.status) || (a.date || "9999").localeCompare(b.date || "9999"),
  groupBy: (r) => r.status,
  groupLabel: (k) => label(STATUS, k),
  row: (r, { today }) => {
    const left = cancelDaysLeft(r, today);
    return {
      title: r.name,
      sub: [label(KINDS, r.kind), r.date ? formatDateJa(r.date) : "日にち未定", r.ref ? `予約番号 ${r.ref}` : "", // 未予約でも入れた期限は見せる（点検 中-2）。ホームに出すのは予約済みだけ
        r.status !== "canceled" && r.cancelBy ? `無料キャンセル ${formatDateJa(r.cancelBy)}まで${r.status === "booked" && left === null ? "（過ぎました）" : r.status === "none" ? "（予約済みにするとホームに出ます）" : ""}` : ""].filter(Boolean).join("・"),
      muted: r.status === "canceled",
      badge: left !== null && left <= 3 ? { text: `キャンセルは${cancelWhen(left)}`, tone: "warn" } : undefined,
      right: r.amount !== null ? formatYen(r.amount) : undefined,
    };
  },
};

export default function ReservationsPage() {
  if (!PERSONAL_BUILD) return <NotAvailable />;
  return <CollectionPage config={config} />;
}
