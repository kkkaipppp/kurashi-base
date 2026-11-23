import { eventsOnDay, summarizeMonth } from "./aggregate";
import { monthKey } from "./date";
import type { AppData } from "./types";

/** iPhone のウィジェットに渡す要約。記録の全部は渡さず、表示に要る数字と予定名だけ（docs/widget/WIDGET_PLAN.md） */
export interface WidgetSummary {
  v: 1;
  updatedAt: string; // ISO
  today: string; // YYYY-MM-DD
  events: { title: string; time: string }[]; // 今日の予定（最大3件。time は "終日" か "10:00"）
  moreEvents: number; // 4件目から
  monthExpense: number; // 今月の支出
  monthIncome: number; // 今月の収入
  budget: number | null; // 1か月の予算
  remaining: number | null; // 予算 − 今月の支出（予算がなければ null）
}

export const WIDGET_EVENTS_MAX = 3;

export function buildWidgetSummary(data: AppData, today: string, nowIso: string): WidgetSummary {
  const evs = eventsOnDay(data.events, today);
  const sum = summarizeMonth(data.transactions, monthKey(today));
  const budget = data.budget.monthly ?? null;
  return {
    v: 1,
    updatedAt: nowIso,
    today,
    events: evs.slice(0, WIDGET_EVENTS_MAX).map((e) => ({
      title: e.title.trim() || "（名前なし）",
      // 何日も続く予定の2日目以降は、時刻ではなく「終日」として出す（くり返しの予定は毎回その時刻。aggregate.ts の並べ方と同じ判定）
      time: e.allDay || (e.startDate < today && e.startDate !== e.endDate) ? "終日" : e.startTime,
    })),
    moreEvents: Math.max(0, evs.length - WIDGET_EVENTS_MAX),
    monthExpense: sum.expense,
    monthIncome: sum.income,
    budget,
    remaining: budget === null ? null : budget - sum.expense,
  };
}
