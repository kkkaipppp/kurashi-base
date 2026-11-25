import { categoryMap, isMoveOnly, txIsFixed, txIsInvest } from "@/lib/classify";
import type { AppData } from "@/lib/types";

/**
 * 月の振り返りの「固定費と変動費」「生活と投資」（レビュー o1 の P11 と、家計を良くする機能 2・3）。記録からの計算だけ。
 * - 固定費・投資の分け方は lib/classify.ts（取引ごとの上書き → カテゴリの分類 → 名前、の順。固定費は支払いとしてつないだ記録）
 * - NISA の買付は、投資の記録とは別に数える（入金と買付を足すと二重になるため、足さない）
 */
export interface MonthBreakdown {
  fixed: number;
  variable: number;
  invest: number; // 投資のカテゴリの支出
  lifeExpense: number; // 投資を除いた支出
  income: number;
  lifeBalance: number; // 収入 − 生活の支出
  nisaBuy: number; // その月の NISA の買付
  nisaSell: number;
  /** 先月の同じ日までと比べて増えたカテゴリ（上位3件） */
  increases: { categoryId: string; now: number; prev: number; diff: number }[];
  /** 先月の同じ日までと比べて減ったカテゴリ（上位3件。diff はマイナス） */
  decreases: { categoryId: string; now: number; prev: number; diff: number }[];
  /** 生活費の、先月の同じ日までとの差の合計（今 − 先月） */
  diffTotal: number;
  hasPrev: boolean;
}


export function monthBreakdown(data: AppData, key: string, today: string): MonthBreakdown {
  const cats = categoryMap(data);
  let fixed = 0;
  let variable = 0;
  let invest = 0;
  let income = 0;
  for (const t of data.transactions) {
    if (t.date.slice(0, 7) !== key || isMoveOnly(t)) continue;
    if (t.type === "income") {
      income += t.amount;
      continue;
    }
    if (txIsInvest(t, cats)) invest += t.amount;
    else if (txIsFixed(t, data.recurring)) fixed += t.amount;
    else variable += t.amount;
  }
  let nisaBuy = 0;
  let nisaSell = 0;
  for (const n of data.nisa) {
    if (n.date.slice(0, 7) !== key) continue;
    if (n.kind === "buy") nisaBuy += n.amount;
    else nisaSell += n.amount;
  }

  // 先月の同じ日まで（今月が今の月なら今日の日付まで、過去の月なら月末まで）と比べる
  const [y, m] = key.split("-").map(Number);
  const prevKey = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const day = today.slice(0, 7) === key ? Number(today.slice(8, 10)) : 31;
  const byCat = (k: string) => {
    const mp = new Map<string, number>();
    for (const t of data.transactions) {
      // 投資は「使った」ではないので、増えたものには入れない
      if (t.type !== "expense" || isMoveOnly(t) || txIsInvest(t, cats) || t.date.slice(0, 7) !== k || Number(t.date.slice(8, 10)) > day) continue;
      mp.set(t.categoryId, (mp.get(t.categoryId) ?? 0) + t.amount);
    }
    return mp;
  };
  const now = byCat(key);
  const prev = byCat(prevKey);
  // 先月に記録が1件でもあれば比べる（同じ日までに無くても「増えた」は出せる）
  const hasPrev = data.transactions.some((t) => t.type === "expense" && !isMoveOnly(t) && t.date.slice(0, 7) === prevKey);
  const ids = new Set([...now.keys(), ...prev.keys()]);
  const diffs = [...ids].map((categoryId) => ({ categoryId, now: now.get(categoryId) ?? 0, prev: prev.get(categoryId) ?? 0, diff: (now.get(categoryId) ?? 0) - (prev.get(categoryId) ?? 0) }));
  const increases = hasPrev ? diffs.filter((x) => x.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 3) : [];
  const decreases = hasPrev ? diffs.filter((x) => x.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 3) : [];
  const diffTotal = diffs.reduce((s, x) => s + x.diff, 0);

  const lifeExpense = fixed + variable;
  return { fixed, variable, invest, lifeExpense, income, lifeBalance: income - lifeExpense, nisaBuy, nisaSell, increases, decreases, diffTotal, hasPrev };
}
