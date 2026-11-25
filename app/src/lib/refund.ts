import { isValidDateStr } from "./date";
import { isMoveOnly } from "./classify";
import type { AppData, Transaction } from "./types";

/**
 * 返金（NEXT v21 X02・v22 G0：取消・返金）。
 * 元の支出は、最初の返金のときに「元の金額（refundGross）」と「元の数え方（refundWas）」を控える。
 * そのあと、返金の記録が増えても減っても、毎回、控えと返金の記録の合計から、元の支出を計算し直す（順番に依存しない）：
 *   返金の合計 0       → 元の金額・元の数え方に戻す（控えも消す）
 *   返金の合計 < 元の金額 → 金額＝元の金額 − 返金の合計（数え方は元のまま）
 *   返金の合計 ＝ 元の金額 → 金額は元のまま、収支に数えない（countAs=transfer）
 * 返金の記録（refundOf つき）は、収入にも支出にも数えない（countAs=transfer）。返金の日は、購入の日と別に持つ。
 * どの集計も、今までどおり「金額」と「数え方」だけを見る（返金のための分岐を、あちこちに入れない）。
 */
export type RefundResult = { ok: true; next: AppData } | { ok: false; error: string };

export function refundedTotal(d: Pick<AppData, "transactions">, txId: string): number {
  return d.transactions.filter((t) => t.refundOf === txId).reduce((a, t) => a + t.amount, 0);
}

/** 元の支出を、返金の記録の合計から計算し直す */
function settle(d: AppData, origId: string, ts: string): AppData {
  const orig = d.transactions.find((t) => t.id === origId);
  if (!orig) return d;
  const sum = refundedTotal(d, origId);
  const gross = orig.refundGross ?? orig.amount;
  const { refundGross: _g, refundWas: _w, ...plain } = orig; // eslint-disable-line @typescript-eslint/no-unused-vars
  const was = orig.refundGross !== undefined ? orig.refundWas : orig.countAs === "transfer" ? undefined : orig.countAs; // 元の数え方（最初の返金のときに控える）
  // 元の数え方を戻した形（transfer は、返金が付けたものなので外す）
  const { countAs: _c, ...base } = plain; // eslint-disable-line @typescript-eslint/no-unused-vars
  const keepWas = was === "life" || was === "invest" ? { countAs: was } : {};
  let next: Transaction;
  if (sum === 0) next = { ...base, ...keepWas, amount: gross, updatedAt: ts };
  else if (sum < gross) next = { ...base, ...keepWas, amount: gross - sum, refundGross: gross, ...(was ? { refundWas: was } : {}), updatedAt: ts };
  else next = { ...base, countAs: "transfer", amount: gross, refundGross: gross, ...(was ? { refundWas: was } : {}), updatedAt: ts };
  return { ...d, transactions: d.transactions.map((t) => (t.id === origId ? next : t)) };
}

export function applyRefund(d: AppData, txId: string, amount: number, date: string, refundId: string, ts: string): RefundResult {
  const orig = d.transactions.find((t) => t.id === txId);
  if (!orig) return { ok: false, error: "元の記録が見つかりません" };
  if (orig.type !== "expense") return { ok: false, error: "返金にできるのは、支出の記録だけです" };
  if (orig.refundOf) return { ok: false, error: "返金の記録を、さらに返金にはできません" };
  // 収支に数えない記録は返金にできない（すでに全額返金したものは、取り消してから）
  if (isMoveOnly(orig) && orig.refundGross === undefined) return { ok: false, error: "収支に数えない記録（引落・口座間の移動など）は、返金にできません" };
  const gross = orig.refundGross ?? orig.amount;
  const left = gross - refundedTotal(d, txId);
  if (!Number.isInteger(amount) || amount < 1) return { ok: false, error: "返金の額は、1円以上の整数で入れてください" };
  if (left <= 0) return { ok: false, error: "すでに全額が返金されています" };
  if (amount > left) return { ok: false, error: `返金の額が、返金できる残り（${left.toLocaleString("ja-JP")}円）より大きいです` };
  if (!isValidDateStr(date)) return { ok: false, error: "日付が正しくありません" };
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
    createdAt: ts,
    updatedAt: ts,
  };
  // 最初の返金のときに、元の金額・数え方を控える（settle が、控えを使って計算し直す）
  const withGross = d.transactions.map((t) => (t.id === orig.id && t.refundGross === undefined ? { ...t, refundGross: t.amount, ...(t.countAs && t.countAs !== "transfer" ? { refundWas: t.countAs } : {}) } : t));
  return { ok: true, next: settle({ ...d, transactions: [...withGross, refund] }, orig.id, ts) };
}

/** 返金の記録を取り消す：その記録を消して、元の支出を計算し直す（ほかの返金は、そのまま残る）。元の記録がもうなければ、返金の記録だけ消す */
export function undoRefund(d: AppData, refundId: string, ts: string): AppData {
  const r = d.transactions.find((t) => t.id === refundId);
  if (!r || !r.refundOf) return d;
  const rest: AppData = { ...d, transactions: d.transactions.filter((t) => t.id !== refundId) };
  return settle(rest, r.refundOf, ts);
}
