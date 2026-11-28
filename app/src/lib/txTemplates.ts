import type { Transaction } from "./types";

/**
 * 「追加」の「前の記録から」（To-Be 02「＋：前回、コピー」。自分用、2026-11-28）。
 * 新しい順に、同じ中身（種類・店名・カテゴリ・金額）を1つにまとめて最大 n 件。
 * 返金の記録・口座間の移動（カード引き落としを含む）は、毎回の中身が違うので出さない。
 * メモと日付は写さない（日付は「追加」で選んだ日、メモはその回のもの）。押すまで何も保存しない。
 */
export interface TxTemplate {
  key: string;
  type: "expense" | "income";
  amount: number;
  categoryId: string;
  merchant: string;
  paymentMethod: string;
  countAs?: "life" | "invest";
}

const keyOf = (t: Transaction) => `${t.type}|${t.merchant.trim()}|${t.categoryId}|${t.amount}`;
const usable = (t: Transaction) => !t.refundOf && t.countAs !== "transfer" && t.advanceGross === undefined && !t.claim;
const toTemplate = (t: Transaction): TxTemplate => ({
  key: keyOf(t),
  type: t.type,
  amount: t.amount,
  categoryId: t.categoryId,
  merchant: t.merchant.trim(),
  paymentMethod: t.paymentMethod,
  ...(t.countAs === "life" || t.countAs === "invest" ? { countAs: t.countAs } : {}),
});

/**
 * 入力のひな形（記録に「ひな形にする」を付けたもの。決定 2026-11-28）。同じ中身は1つにまとめ、店名の順に最大 8 件。
 * 立替・経費・返金・口座間の移動は、毎回の中身が違うので出さない
 */
export function pinnedTemplates(txs: Transaction[], n = 8): TxTemplate[] {
  const out = new Map<string, TxTemplate>();
  for (const t of txs) if (t.template && usable(t) && !out.has(keyOf(t))) out.set(keyOf(t), toTemplate(t));
  return [...out.values()].sort((a, b) => a.merchant.localeCompare(b.merchant, "ja") || a.amount - b.amount).slice(0, n);
}

export function recentTemplates(txs: Transaction[], n = 3, skip: Set<string> = new Set()): TxTemplate[] {
  const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const out: TxTemplate[] = [];
  const seen = new Set<string>();
  for (const t of sorted) {
    if (!usable(t)) continue;
    const key = keyOf(t);
    if (seen.has(key) || skip.has(key)) continue;
    seen.add(key);
    out.push(toTemplate(t));
    if (out.length === n) break;
  }
  return out;
}
