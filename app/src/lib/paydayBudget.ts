import { addDays, clampDay, parseDateStr } from "./date";
import { BUDGET_EXCLUDES_INVEST, isBudgetExpense, ledgerEntries } from "./ledgerCore";
import type { AppData } from "./types";

/**
 * 給料日からの予算（To-Be 02 家計簿「給料日予算」。2026-11-28）。
 * 期間＝今日以前でいちばん近い給料日 〜 次の給料日の前日（給料日が月末を超える月は月末）。
 * 使った額は、月の予算と同じ数え方（自分用は投資と特別支出を除く。lib/ledgerCore.ts の isBudgetExpense）で、期間の中の記録すべて
 * （月の予算と同じく、先の日付で入れた支出も期間の中なら数える。点検 中1）。1日あたりは固定費を引かない（画面に書く。点検 低1）。
 */
export function paydayPeriod(today: string, payday: number): { from: string; to: string } {
  const t = parseDateStr(today);
  const at = (y: number, m: number) => {
    const yy = m < 1 ? y - 1 : m > 12 ? y + 1 : y;
    const mm = m < 1 ? m + 12 : m > 12 ? m - 12 : m;
    return clampDay(yy, mm, payday);
  };
  const thisMonth = at(t.y, t.m);
  const from = thisMonth <= today ? thisMonth : at(t.y, t.m - 1);
  const f = parseDateStr(from);
  const next = at(f.y, f.m + 1);
  return { from, to: addDays(next, -1) };
}

export interface PaydayBudget {
  from: string;
  to: string;
  budget: number;
  spent: number;
  left: number;
  daysLeft: number;
  perDay: number | null;
}

export function paydayBudget(d: AppData, today: string, excludeInvest: boolean = BUDGET_EXCLUDES_INVEST): PaydayBudget | null {
  const payday = d.budget.payday;
  const budget = d.budget.monthly;
  if (!payday || budget === null) return null;
  const { from, to } = paydayPeriod(today, payday);
  const pick = isBudgetExpense(excludeInvest);
  const spent = ledgerEntries(d)
    .filter((e) => pick(e) && e.date >= from && e.date <= to)
    .reduce((s, e) => s + e.amount, 0);
  const left = budget - spent;
  const daysLeft = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) + 1;
  return { from, to, budget, spent, left, daysLeft, perDay: left > 0 && daysLeft > 0 ? Math.floor(left / daysLeft) : null };
}
