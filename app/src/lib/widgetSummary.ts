import { eventLabel, eventsOnDay, summarizeMonth } from "./aggregate";
import { addDays, monthKey } from "./date";
import { budgetSpent } from "./ledger";
import { clipText } from "./clip";
import type { AppData } from "./types";

/** iPhone のウィジェットに渡す要約。記録の全部は渡さず、表示に要る数字と予定名だけ（docs/widget/WIDGET_PLAN.md） */
export interface WidgetSummary {
  v: 1;
  updatedAt: string; // ISO
  today: string; // YYYY-MM-DD
  events: { title: string; time: string }[]; // 今日の予定（最大3件。time は "終日" か "10:00"）
  moreEvents: number; // 4件目から
  /** 明日の予定（日付が変わってアプリを開くまでの間、ウィジェットが使う。レビュー o1 の P12） */
  tomorrow: { date: string; events: { title: string; time: string }[] };
  monthExpense: number; // 今月の支出
  monthIncome: number; // 今月の収入
  budget: number | null; // 1か月の予算
  remaining: number | null; // 予算 − 予算と比べる額（予算がなければ null）
  budgetSpent: number; // 予算と比べる額（自分用は投資を除いた生活費。lib/ledger.ts）
}

export const WIDGET_EVENTS_MAX = 3;
/** ウィジェットに渡す予定の名前の長さ（ウィジェットに出せるのは十数文字。アプリが受け取る要約は 20,000 バイトまで。o11 A07） */
export const WIDGET_TITLE_MAX = 40;

export function buildWidgetSummary(data: AppData, today: string, nowIso: string): WidgetSummary {
  const evs = eventsOnDay(data.events, today);
  const sum = summarizeMonth(data.transactions, monthKey(today));
  const budget = data.budget.monthly ?? null;
  const spent = budgetSpent(data, monthKey(today), today);
  return {
    v: 1,
    updatedAt: nowIso,
    today,
    events: evs.slice(0, WIDGET_EVENTS_MAX).map((e) => ({
      title: clipText(eventLabel(e), WIDGET_TITLE_MAX),
      // 何日も続く予定の2日目以降は、時刻ではなく「終日」として出す（くり返しの予定は毎回その時刻。aggregate.ts の並べ方と同じ判定）
      time: e.allDay || (e.startDate < today && e.startDate !== e.endDate) ? "終日" : e.startTime,
    })),
    moreEvents: Math.max(0, evs.length - WIDGET_EVENTS_MAX),
    tomorrow: {
      date: addDays(today, 1),
      events: eventsOnDay(data.events, addDays(today, 1))
        .slice(0, WIDGET_EVENTS_MAX)
        .map((e) => ({ title: clipText(eventLabel(e), WIDGET_TITLE_MAX), time: e.allDay || (e.startDate < addDays(today, 1) && e.startDate !== e.endDate) ? "終日" : e.startTime })),
    },
    monthExpense: sum.expense,
    monthIncome: sum.income,
    budget,
    // 予算の残りは、ホームの予算カードと同じ額と比べる（自分用は投資を除いた生活費。lib/ledger.ts）
    remaining: budget === null ? null : budget - spent,
    budgetSpent: spent,
  };
}
