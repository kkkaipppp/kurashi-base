import { daysInMonth, monthKey, parseDateStr } from "./date";
import { advanceDueDate } from "./recurring";
import type { RecurringExpense } from "./types";

/**
 * 今月あと使える生活費（レビュー o1 の「家計を良くする機能」1）。
 * 予算 − 今月の支出 − 今日から月末までにまだ来る固定費、を月末までの日数（今日を含む）で割る。
 * 予算がなければ出さない（null）。固定費の支払日がまだ来ていないものだけ引く（すでに払って記録した分を二重に引かないため）。
 */
export function unpaidRecurringThisMonth(list: RecurringExpense[], today: string): number {
  const end = `${monthKey(today)}-${String(daysInMonth(parseDateStr(today).y, parseDateStr(today).m)).padStart(2, "0")}`;
  let sum = 0;
  for (const r of list) {
    if (!r.active) continue;
    let d = r.nextDueDate;
    for (let guard = 0; d <= end && guard < 10; guard++) {
      if (d >= today) sum += r.amount;
      d = advanceDueDate(d, r.cycle, r.anchorDay);
    }
  }
  return sum;
}

export interface Allowance {
  perDay: number; // 1日あたり（0 未満は 0）
  daysLeft: number; // 今日を含む月末までの日数
  unpaidFixed: number; // まだ来る今月の固定費
  left: number; // 予算 − 支出 − まだ来る固定費
}

export function dailyAllowance(budget: number | null, monthExpense: number, recurring: RecurringExpense[], today: string): Allowance | null {
  if (budget === null) return null;
  const { y, m, d } = parseDateStr(today);
  const daysLeft = daysInMonth(y, m) - d + 1;
  const unpaidFixed = unpaidRecurringThisMonth(recurring, today);
  const left = budget - monthExpense - unpaidFixed;
  return { perDay: Math.max(0, Math.floor(left / daysLeft)), daysLeft, unpaidFixed, left };
}
