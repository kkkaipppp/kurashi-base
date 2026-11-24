import { dailyAllowance } from "./allowance";
import { summarizeMonth } from "./aggregate";
import { categoryIsInvest, categoryMap } from "./classify";
import { IS_PERSONAL } from "./edition";
import { monthBreakdown } from "./monthBreakdown";
import type { AppData } from "./types";

/**
 * 今月の家計を1か所で計算する（100点化の指示 D：ホーム・振り返りで同じ定義を使う）。
 * - 生活費：投資（名前に「投資」が入ったカテゴリ）を除いた支出。予算と比べるのはこれ
 * - 生活予算の残り：予算 − 生活費
 * - 自由に使える残り：生活予算の残り − まだ記録していない今月の固定費
 * - 1日あたり：自由に使える残り ÷ 月末までの日数（今日を含む、切り捨て）
 * 例（指示書の検証データ）：予算 120,000・生活費 96,420・投資 100,000・未記録の固定費 8,000・残り7日
 *   → 生活予算の残り 23,580・自由に使える残り 15,580・1日あたり 2,225
 */
export interface MonthLedger {
  budget: number | null;
  lifeExpense: number;
  investMove: number;
  income: number;
  lifeBudgetLeft: number | null;
  unpaidFixed: number;
  freeLeft: number | null;
  perDay: number | null;
  daysLeft: number;
}

export function monthLedger(data: AppData, month: string, today: string): MonthLedger {
  const b = monthBreakdown(data, month, today);
  const budget = data.budget.monthly ?? null;
  // 投資の固定費（積立など）は、自由に使える残りから引かない（生活費の予算と比べる額に入れていないため）
  const cats = categoryMap(data);
  const a = dailyAllowance(budget, b.lifeExpense, data.recurring.filter((r) => !categoryIsInvest(cats.get(r.categoryId))), today);
  return {
    budget,
    lifeExpense: b.lifeExpense,
    investMove: b.invest,
    income: b.income,
    lifeBudgetLeft: budget === null ? null : budget - b.lifeExpense,
    unpaidFixed: a?.unpaidFixed ?? 0,
    freeLeft: a ? a.left : null,
    perDay: a ? a.perDay : null,
    daysLeft: a?.daysLeft ?? 0,
  };
}

/**
 * 予算と比べる「使った額」。自分用は投資を除いた生活費、公開版は今までどおりすべての支出。
 * ホーム・今日のナビ・振り返り・ウィジェットで同じものを使う（点検役の指摘：画面ごとに数字が食い違っていた）
 */
export function budgetSpent(data: AppData, month: string, today: string, personal: boolean = IS_PERSONAL): number {
  return personal ? monthBreakdown(data, month, today).lifeExpense : summarizeMonth(data.transactions, month).expense;
}

/** 投資として数えているカテゴリの名前（画面に出して、分け方を本人が確かめられるように） */
export function investCategoryNames(data: AppData): string[] {
  // 非表示でも、記録があれば出す（そのカテゴリの記録は投資として数えているため）
  const used = new Set(data.transactions.map((t) => t.categoryId));
  return data.categories.filter((c) => categoryIsInvest(c) && (!c.archived || used.has(c.id))).map((c) => c.name);
}
