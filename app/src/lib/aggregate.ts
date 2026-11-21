import { monthKey } from "./date";
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

export function summarizeMonth(txs: Transaction[], key: string): MonthSummary {
  const list = txInMonth(txs, key);
  let expense = 0;
  let income = 0;
  const cat = new Map<string, number>();
  for (const t of list) {
    if (t.type === "expense") {
      expense += t.amount;
      cat.set(t.categoryId, (cat.get(t.categoryId) ?? 0) + t.amount);
    } else income += t.amount;
  }
  const byCategory = [...cat.entries()]
    .map(([categoryId, total]) => ({ categoryId, total }))
    .sort((a, b) => b.total - a.total);
  return { expense, income, balance: income - expense, byCategory, count: list.length };
}

/** 今月の残り = 予算 − 当月支出。予算未設定なら null（金額を捏造しない） */
export function remainingBudget(budget: number | null, monthExpense: number): number | null {
  if (budget === null) return null;
  return budget - monthExpense;
}

export function daySummary(txs: Transaction[], date: string) {
  const list = txs.filter((t) => t.date === date);
  return {
    list,
    expense: list.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    income: list.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
  };
}

/** その日に掛かる予定（日跨ぎ含む）を、終日→開始時刻順で返す */
export function eventsOnDay(events: CalendarEvent[], date: string): CalendarEvent[] {
  return events
    .filter((e) => e.startDate <= date && date <= e.endDate)
    .sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      const at = a.startDate < date ? "00:00" : a.startTime;
      const bt = b.startDate < date ? "00:00" : b.startTime;
      return at.localeCompare(bt) || a.title.localeCompare(b.title);
    });
}

export function sortTxDesc(txs: Transaction[]): Transaction[] {
  return [...txs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}
