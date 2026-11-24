import { addDays, weekdayOf } from "./date";
import type { Transaction } from "./types";

/**
 * 週・年の収支（振り返りの「週」「年」。2026-11-24 平尾さん：年間と週の収支も見たい）。
 * 週は月曜はじまり。支出・収入はすべての記録を足すだけ（月の振り返りと同じ数え方）。
 */

export interface PeriodSummary {
  from: string;
  to: string;
  expense: number;
  income: number;
  balance: number;
  count: number;
  byCategory: { categoryId: string; total: number }[]; // 支出のカテゴリ別（多い順）
}

/** その日を含む週（月曜〜日曜） */
export function weekRange(date: string): { from: string; to: string } {
  const back = (weekdayOf(date) + 6) % 7; // 月曜なら0、日曜なら6
  const from = addDays(date, -back);
  return { from, to: addDays(from, 6) };
}

export function summarizePeriod(txs: Transaction[], from: string, to: string): PeriodSummary {
  let expense = 0;
  let income = 0;
  let count = 0;
  const cat = new Map<string, number>();
  for (const t of txs) {
    if (t.date < from || t.date > to) continue;
    count++;
    if (t.type === "expense") {
      expense += t.amount;
      cat.set(t.categoryId, (cat.get(t.categoryId) ?? 0) + t.amount);
    } else income += t.amount;
  }
  const byCategory = [...cat].map(([categoryId, total]) => ({ categoryId, total })).sort((a, b) => b.total - a.total);
  return { from, to, expense, income, balance: income - expense, count, byCategory };
}

/** 週の7日それぞれの支出・収入（月曜から） */
export function dailyInWeek(txs: Transaction[], from: string): { date: string; expense: number; income: number }[] {
  const days = Array.from({ length: 7 }, (_, i) => ({ date: addDays(from, i), expense: 0, income: 0 }));
  const idx = new Map(days.map((d, i) => [d.date, i]));
  for (const t of txs) {
    const i = idx.get(t.date);
    if (i === undefined) continue;
    if (t.type === "expense") days[i].expense += t.amount;
    else days[i].income += t.amount;
  }
  return days;
}

/** 年の12か月それぞれの支出・収入 */
export function monthlyInYear(txs: Transaction[], year: number): { month: number; expense: number; income: number }[] {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, expense: 0, income: 0 }));
  const y = String(year);
  for (const t of txs) {
    if (t.date.slice(0, 4) !== y) continue;
    const m = Number(t.date.slice(5, 7)) - 1;
    if (t.type === "expense") months[m].expense += t.amount;
    else months[m].income += t.amount;
  }
  return months;
}

export function yearRange(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** 直近 n 週（最後の週の月曜 lastFrom まで）の、週ごとの支出・収入（推移用） */
export function weeklyTrend(txs: Transaction[], lastFrom: string, n = 12): { from: string; expense: number; income: number }[] {
  const weeks = Array.from({ length: n }, (_, i) => ({ from: addDays(lastFrom, -7 * (n - 1 - i)), expense: 0, income: 0 }));
  const start = weeks[0].from;
  const end = addDays(lastFrom, 6);
  for (const t of txs) {
    if (t.date < start || t.date > end) continue;
    const i = weeks.findIndex((w, k) => t.date >= w.from && (k === n - 1 || t.date < weeks[k + 1].from));
    if (i < 0) continue;
    if (t.type === "expense") weeks[i].expense += t.amount;
    else weeks[i].income += t.amount;
  }
  return weeks;
}
