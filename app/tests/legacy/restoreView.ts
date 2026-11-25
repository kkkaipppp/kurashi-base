import type { AppData, Transaction } from "@/lib/types";

/**
 * 復元・取り込みの確認画面に出す数（レビュー o1 の P01・P04）。保存はしない、見せるだけ。
 */
export interface DataFigures {
  transactions: number;
  events: number;
  nisa: number;
  expense: number; // 支出の合計
  income: number; // 収入の合計
}

export function figures(d: AppData): DataFigures {
  let expense = 0;
  let income = 0;
  for (const t of d.transactions) {
    if (t.countAs === "transfer") continue; // 収支に数えない記録は、復元後の画面の合計と同じく入れない
    if (t.type === "expense") expense += t.amount;
    else income += t.amount;
  }
  return { transactions: d.transactions.length, events: d.events.length, nisa: d.nisa.length, expense, income };
}

const key = (t: Transaction) => `${t.date}|${t.type}|${t.amount}`;

/**
 * ID が違うのに、日付・種類・金額が同じ記録の数（追加すると二重になっているかもしれないもの）。
 * 自動では消さない。数を見せて、本人に選んでもらうだけ。
 */
export function similarButDifferentId(current: Transaction[], incoming: Transaction[]): number {
  const ids = new Set(current.map((t) => t.id));
  const have = new Map<string, number>();
  for (const t of current) have.set(key(t), (have.get(key(t)) ?? 0) + 1);
  let n = 0;
  for (const t of incoming) {
    if (ids.has(t.id)) continue;
    const k = key(t);
    const left = have.get(k) ?? 0;
    if (left > 0) {
      n++;
      have.set(k, left - 1);
    }
  }
  return n;
}

/** 取り込む明細から、例として見せる5件（新しい順） */
export function sampleRows(incoming: Transaction[], n = 5): Transaction[] {
  return [...incoming].sort((a, b) => b.date.localeCompare(a.date)).slice(0, n);
}
