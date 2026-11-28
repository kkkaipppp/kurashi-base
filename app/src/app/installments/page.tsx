"use client";

import { CollectionPage, numberFromDraft, type CollectionConfig } from "@/components/CollectionPage";
import { NotAvailable } from "@/components/NotAvailable";
import { formatDateJa, todayStr } from "@/lib/date";
import { numStr, str } from "@/lib/draft";
import { installmentPlan, installmentStatus } from "@/lib/installments";
import { MAX_AMOUNT, formatYen } from "@/lib/money";

// 自分用だけ（版の値を直接比べる。公開版で直接開いたら「使えません」）
const PERSONAL_BUILD = process.env.NEXT_PUBLIC_KB_EDITION === "personal";

const int = (s: string) => {
  const n = numberFromDraft(s);
  return n !== null && Number.isInteger(n) ? n : null;
};

/** 分割払い（To-Be 02 家計簿「分割払い」。2026-11-28）。支払いの予定の控え。買ったときの支出は家計簿に1回だけ記録する */
const config: CollectionConfig<"installments"> = {
  key: "installments",
  title: "分割払い",
  noun: "分割払い",
  intro: "分割で買ったものの総額・回数・1回目の支払日を入れると、残りの額と次の支払いを出します。買ったときの支出は家計簿に1回だけ記録してください（ここの額は収支に数えません）。毎月の額は総額を回数で割った目安です（割り切れない分は1回目）。カード会社の明細と違うときは、明細を見てください。",
  emptyText: "まだありません。",
  fields: [
    { name: "name", label: "名前", type: "text", required: true, placeholder: "例：スマホ（24回）" },
    { name: "total", label: "支払う総額（手数料込み・円）", type: "number", required: true, half: true },
    { name: "count", label: "回数", type: "number", required: true, half: true, placeholder: "例：24" },
    { name: "firstDate", label: "1回目の支払日", type: "date", required: true },
    { name: "note", label: "メモ（カード・お店など）", optional: true, type: "textarea" },
  ],
  initial: () => ({ name: "", total: "", count: "", firstDate: "", note: "" }),
  toDraft: (x) => ({ name: x.name, total: numStr(x.total), count: String(x.count), firstDate: x.firstDate, note: x.note }),
  fromDraft: (d) => ({ name: str(d, "name"), total: int(str(d, "total")) ?? 0, count: int(str(d, "count")) ?? 0, firstDate: str(d, "firstDate"), note: str(d, "note") }),
  validate: (d) => {
    const e: Record<string, string> = {};
    const t = int(str(d, "total"));
    const c = int(str(d, "count"));
    if (str(d, "total") !== "" && (t === null || t < 1 || t > MAX_AMOUNT)) e.total = `1〜${MAX_AMOUNT.toLocaleString("ja-JP")}円の整数を入れてください`;
    if (str(d, "count") !== "" && (c === null || c < 1 || c > 120)) e.count = "1〜120 の回数を入れてください";
    if (!e.total && !e.count && t !== null && c !== null && t < c) e.total = "総額は回数以上の円にしてください";
    return e;
  },
  // 次の支払日が近い順（払い終わったものは後ろ。点検 低6）
  sort: (a, b) => {
    const t = todayStr();
    return (installmentStatus(a, t).next?.date ?? "9999").localeCompare(installmentStatus(b, t).next?.date ?? "9999") || a.firstDate.localeCompare(b.firstDate);
  },
  row: (x, { today }) => {
    const s = installmentStatus(x, today);
    const plan = installmentPlan(x);
    // 今日が支払日なら、その回を出す（払った回には数えている。点検 低7）
    const todayPay = plan.find((p) => p.date === today);
    return {
      title: x.name,
      sub: [`${s.paidCount}/${x.count}回`, todayPay ? `今日 ${formatYen(todayPay.amount)}` : "", s.next ? `次は${formatDateJa(s.next.date)} ${formatYen(s.next.amount)}` : "払い終わり", plan[plan.length - 1] ? `最後は${formatDateJa(plan[plan.length - 1].date, true)}` : ""].filter(Boolean).join("・"),
      muted: !s.next && !todayPay,
      right: s.left > 0 ? `残り ${formatYen(s.left)}` : undefined,
    };
  },
  header: ({ list, today }) => {
    const left = list.reduce((sum, x) => sum + Math.max(0, installmentStatus(x, today).left), 0);
    if (left <= 0) return null;
    return <p className="num px-1 text-[13px] text-ink-2">分割払いの残りの合計：{formatYen(left)}</p>;
  },
};

export default function InstallmentsPage() {
  if (!PERSONAL_BUILD) return <NotAvailable />;
  return <CollectionPage config={config} />;
}
