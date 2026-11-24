import { dailyAllowance } from "./allowance";
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
  const a = dailyAllowance(budget, b.lifeExpense, data.recurring, today);
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

/** 投資として数えているカテゴリの名前（画面に出して、分け方を本人が確かめられるように） */
export function investCategoryNames(data: AppData): string[] {
  return data.categories.filter((c) => c.kind === "expense" && c.name.includes("投資")).map((c) => c.name);
}
