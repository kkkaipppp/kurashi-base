import type { AppData } from "./types";

/**
 * 月の振り返りの「固定費と変動費」「生活と投資」（レビュー o1 の P11 と、家計を良くする機能 2・3）。記録からの計算だけ。
 * - 固定費：固定費（定期の支払い）に登録したカテゴリの支出。それ以外は変動費
 * - 投資：名前に「投資」を含む支出のカテゴリ（例：証券口座への入金）。生活の支出からは外す
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
  hasPrev: boolean;
}

const isInvestName = (name: string) => name.includes("投資");

export function monthBreakdown(data: AppData, key: string, today: string): MonthBreakdown {
  const fixedCats = new Set(data.recurring.filter((r) => r.active).map((r) => r.categoryId));
  const investCats = new Set(data.categories.filter((c) => c.kind === "expense" && isInvestName(c.name)).map((c) => c.id));
  let fixed = 0;
  let variable = 0;
  let invest = 0;
  let income = 0;
  for (const t of data.transactions) {
    if (t.date.slice(0, 7) !== key) continue;
    if (t.type === "income") {
      income += t.amount;
      continue;
    }
    if (investCats.has(t.categoryId)) invest += t.amount;
    else if (fixedCats.has(t.categoryId)) fixed += t.amount;
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
      if (t.type !== "expense" || investCats.has(t.categoryId) || t.date.slice(0, 7) !== k || Number(t.date.slice(8, 10)) > day) continue;
      mp.set(t.categoryId, (mp.get(t.categoryId) ?? 0) + t.amount);
    }
    return mp;
  };
  const now = byCat(key);
  const prev = byCat(prevKey);
  // 先月に記録が1件でもあれば比べる（同じ日までに無くても「増えた」は出せる）
  const hasPrev = data.transactions.some((t) => t.type === "expense" && t.date.slice(0, 7) === prevKey);
  const increases = hasPrev
    ? [...now]
        .map(([categoryId, v]) => ({ categoryId, now: v, prev: prev.get(categoryId) ?? 0, diff: v - (prev.get(categoryId) ?? 0) }))
        .filter((x) => x.diff > 0)
        .sort((a, b) => b.diff - a.diff)
        .slice(0, 3)
    : [];

  const lifeExpense = fixed + variable;
  return { fixed, variable, invest, lifeExpense, income, lifeBalance: income - lifeExpense, nisaBuy, nisaSell, increases, hasPrev };
}
