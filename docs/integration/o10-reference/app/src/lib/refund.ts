import { isValidDateStr } from "./date";
import { isMoveOnly } from "./classify";
import type { AppData, Transaction } from "./types";

/**
 * 返金（NEXT v21 X02：取消・返金。元の支出を、返金の分だけ減らす）。
 * - 一部の返金：元の支出の金額を、返金の額だけ減らす。全額の返金：元の支出を、収支に数えない（countAs=transfer。金額は残す）
 * - 返金の記録（refundOf つき）は、収入にも支出にも数えない（countAs=transfer）。元の支出が減るので、二重に数えない
 * - 返金の記録を消す（取り消す）と、元の金額・数え方が元に戻る
 * どの集計も、今までどおり「金額」と「数え方」だけを見る（返金のための分岐を、あちこちに入れない）
 */
export type RefundResult = { ok: true; next: AppData } | { ok: false; error: string };

export function refundedTotal(d: Pick<AppData, "transactions">, txId: string): number {
  return d.transactions.filter((t) => t.refundOf === txId).reduce((a, t) => a + t.amount, 0);
}

export function applyRefund(d: AppData, txId: string, amount: number, date: string, refundId: string, ts: string): RefundResult {
  if (!refundId.trim() || d.transactions.some((t) => t.id === refundId)) return { ok: false, error: "返金の記録IDが重複または不正です" };
  const orig = d.transactions.find((t) => t.id === txId);
  if (!orig) return { ok: false, error: "元の記録が見つかりません" };
  if (orig.type !== "expense") return { ok: false, error: "返金にできるのは、支出の記録だけです" };
  if (orig.refundOf) return { ok: false, error: "返金の記録を、さらに返金にはできません" };
  if (isMoveOnly(orig)) return { ok: false, error: "収支に数えない記録（すでに全額返金したもの・引落など）は、返金にできません" };
  if (!Number.isInteger(amount) || amount < 1) return { ok: false, error: "返金の額は、1円以上の整数で入れてください" };
  if (amount > orig.amount) return { ok: false, error: `返金の額が、元の支出（残り ${orig.amount.toLocaleString("ja-JP")}円）より大きいです` };
  if (!isValidDateStr(date)) return { ok: false, error: "日付が正しくありません" };
  const full = amount === orig.amount;
  const incomeCat = d.categories.find((c) => c.kind === "income" && c.name === "その他の収入") ?? d.categories.find((c) => c.kind === "income");
  const refund: Transaction = {
    id: refundId,
    type: "income",
    date,
    amount,
    currency: orig.currency,
    categoryId: incomeCat?.id ?? orig.categoryId,
    merchant: orig.merchant,
    paymentMethod: orig.paymentMethod,
    note: `返金（${orig.date} の支出）`,
    source: "manual",
    countAs: "transfer",
    refundOf: orig.id,
    ...(full && orig.countAs && orig.countAs !== "transfer" ? { refundWas: orig.countAs } : {}),
    createdAt: ts,
    updatedAt: ts,
  };
  const next = d.transactions.map((t) => (t.id === orig.id ? (full ? { ...t, countAs: "transfer" as const, updatedAt: ts } : { ...t, amount: t.amount - amount, updatedAt: ts }) : t));
  return { ok: true, next: { ...d, transactions: [...next, refund] } };
}

/** 返金の記録を取り消す：元の金額（一部）か、元の数え方（全額）を戻して、返金の記録を消す。元の記録がもうなければ、返金の記録だけ消す */
export function undoRefund(d: AppData, refundId: string, ts: string): AppData {
  const r = d.transactions.find((t) => t.id === refundId);
  if (!r || !r.refundOf) return d;
  const orig = d.transactions.find((t) => t.id === r.refundOf);
  const partialLeft = orig && orig.countAs !== "transfer";
  // 旧形式では全額に達した最後の返金が、元の分類を保持する。
  const closingRefund = d.transactions.filter((t) => t.refundOf === r.refundOf).at(-1);
  const rest = d.transactions.filter((t) => t.id !== refundId);
  const restored = rest.map((t) => {
    if (!orig || t.id !== orig.id) return t;
    if (partialLeft) return { ...t, amount: t.amount + r.amount, updatedAt: ts };
    const { countAs: _drop, ...others } = t; // eslint-disable-line @typescript-eslint/no-unused-vars
    return { ...others, amount: r.amount, ...(closingRefund?.refundWas ? { countAs: closingRefund.refundWas } : {}), updatedAt: ts };
  });
  return { ...d, transactions: restored };
}
