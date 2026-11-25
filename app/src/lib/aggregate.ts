import { daysBetween, daysInMonth, monthKey, parseDateStr } from "./date";
import { sumEntries, txEntries } from "./ledgerCore";
import type { CalendarEvent, Transaction } from "./types";

// 集計対象は「確定した取引」だけ。固定費の予定・取込候補は Transaction ではないので混入しない。

export interface MonthSummary {
  expense: number;
  income: number;
  balance: number; // income - expense
  byCategory: { categoryId: string; total: number }[]; // 支出のみ、多い順
  count: number;
}

export function txInMonth(txs: Transaction[], key: string): Transaction[] {
  return txs.filter((t) => monthKey(t.date) === key);
}

/** 月の支出・収入（共通台帳から。count は収支に数えない記録も含めた、その月の記録の件数） */
export function summarizeMonth(txs: Transaction[], key: string): MonthSummary {
  const list = txInMonth(txs, key);
  const s = sumEntries(txEntries(list), () => true);
  return { expense: s.expense, income: s.income, balance: s.income - s.expense, byCategory: s.byCategory, count: list.length };
}

/** 今月の残り = 予算 − 当月支出。予算未設定なら null（金額を捏造しない） */
export function remainingBudget(budget: number | null, monthExpense: number): number | null {
  if (budget === null) return null;
  return budget - monthExpense;
}

export function daySummary(txs: Transaction[], date: string) {
  const list = txs.filter((t) => t.date === date);
  const s = sumEntries(txEntries(list), () => true);
  return { list, expense: s.expense, income: s.income };
}

/** 予定がその日にあるか。繰り返しは1日の予定だけ（週・月・年）。月末を超える日は月末に、2/29 は平年 2/28 に丸める */
export function occursOn(e: CalendarEvent, date: string): boolean {
  const rep = e.repeat ?? "none";
  if (rep === "none" || e.startDate !== e.endDate) return e.startDate <= date && date <= e.endDate;
  if (date < e.startDate) return false;
  if (e.repeatUntil && date > e.repeatUntil) return false;
  const s = parseDateStr(e.startDate);
  const t = parseDateStr(date);
  if (rep === "weekly") return daysBetween(e.startDate, date) % 7 === 0;
  if (rep === "monthly") return t.d === Math.min(s.d, daysInMonth(t.y, t.m));
  return t.m === s.m && t.d === Math.min(s.d, daysInMonth(t.y, t.m));
}

/** その日に掛かる予定（日跨ぎ・繰り返し含む）を、終日→開始時刻順で返す */
export function eventsOnDay(events: CalendarEvent[], date: string): CalendarEvent[] {
  return events
    .filter((e) => occursOn(e, date))
    .sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      const at = a.startDate < date && a.startDate !== a.endDate ? "00:00" : a.startTime;
      const bt = b.startDate < date && b.startDate !== b.endDate ? "00:00" : b.startTime;
      return at.localeCompare(bt) || a.title.localeCompare(b.title);
    });
}

export function sortTxDesc(txs: Transaction[]): Transaction[] {
  return [...txs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}
