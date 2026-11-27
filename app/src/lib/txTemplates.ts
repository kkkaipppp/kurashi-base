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

export function recentTemplates(txs: Transaction[], n = 3): TxTemplate[] {
  const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const out: TxTemplate[] = [];
  const seen = new Set<string>();
  for (const t of sorted) {
    if (t.refundOf || t.countAs === "transfer") continue;
    const key = `${t.type}|${t.merchant.trim()}|${t.categoryId}|${t.amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      type: t.type,
      amount: t.amount,
      categoryId: t.categoryId,
      merchant: t.merchant.trim(),
      paymentMethod: t.paymentMethod,
      ...(t.countAs === "life" || t.countAs === "invest" ? { countAs: t.countAs } : {}),
    });
    if (out.length === n) break;
  }
  return out;
}
