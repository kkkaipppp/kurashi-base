import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { parseAppearance } from "@/lib/appearance";
import { currentLayout, layoutFor } from "@/lib/homeLayout";
import { weekAhead, yearReview } from "@/lib/lookAhead";
import { keepCategory } from "@/lib/inbox";
import type { CalendarEvent, Goal, RecurringExpense, Transaction } from "@/lib/types";

// 期待値は決めごと（To-Be 02：文字サイズ/テーマ・週の見通し・年間振り返り。2026-11-28）から手で作った
const ts = "2026-11-28T00:00:00.000Z";

describe("表示の大きさと色（端末の設定）", () => {
  it("知らない値・壊れた値は標準・白に戻す", () => {
    expect(parseAppearance(JSON.stringify({ text: "large", theme: "warm" }))).toEqual({ text: "large", theme: "warm" });
    expect(parseAppearance(JSON.stringify({ text: "huge", theme: "dark" }))).toEqual({ text: "normal", theme: "white" });
    expect(parseAppearance("{")).toEqual({ text: "normal", theme: "white" });
    expect(parseAppearance(null)).toEqual({ text: "normal", theme: "white" });
  });
});

describe("ホームの「この先7日」", () => {
  it("初めは隠す。前に並びを保存した人にも、勝手に出さない（編集で出せる）", () => {
    expect(layoutFor({ nextRecurring: true, needsReview: true } as never, null, true)).not.toContain("week");
    const saved = { nextRecurring: true, needsReview: true, order: ["budget", "today", "todo", "navi"], hidden: [] } as never;
    expect(currentLayout(saved).order).toContain("week");
    expect(currentLayout(saved).hidden).toContain("week");
    expect(layoutFor(saved, null, true)).not.toContain("week");
    // 編集で出したあと（並びに入れて保存）は出る
    const shown = { nextRecurring: true, needsReview: true, order: ["week", "budget"], hidden: [] } as never;
    expect(layoutFor(shown, null, true)).toContain("week");
  });

  it("明日から7日：予定の数・固定費の支払い（一部払いは残り）・期限の数。何もない日は出さない。今日と8日後は数えない", () => {
    const d = emptyData(ts);
    const ev = (id: string, date: string): CalendarEvent => ({ id, title: id, startDate: date, endDate: date, allDay: true, startTime: "", endTime: "", note: "", createdAt: ts, updatedAt: ts });
    d.events = [ev("today", "2026-11-28"), ev("a", "2026-11-29"), ev("b", "2026-11-29"), ev("late", "2026-12-06")];
    const rec = (o: Partial<RecurringExpense> & { id: string }) => ({ name: "家賃", amount: 80000, cycle: "monthly", nextDueDate: "2026-12-01", categoryId: "exp-1", paymentMethod: "", active: true, note: "", createdAt: ts, updatedAt: ts, ...o }) as unknown as RecurringExpense;
    d.recurring = [rec({ id: "r1" }), rec({ id: "r2", name: "電話", amount: 5000, partialPaid: { due: "2026-12-01", paid: 2000 } } as never), rec({ id: "off", active: false })];
    d.tasks = [{ id: "t", title: "書類", due: "2026-12-03", done: false, note: "", createdAt: ts, updatedAt: ts }];
    expect(weekAhead(d, "2026-11-28")).toEqual([
      { date: "2026-11-29", events: 2, pay: 0, payCount: 0, deadlines: 0 },
      { date: "2026-12-01", events: 0, pay: 83000, payCount: 2, deadlines: 0 },
      { date: "2026-12-03", events: 0, pay: 0, payCount: 0, deadlines: 1 },
    ]);
  });
});

describe("この先7日：毎週の固定費・やる日", () => {
  it("毎週の固定費は7日の中の回をすべて（11/28 が未払いの次回なら 12/5 にも出す）。やる日は期限に数えない", () => {
    const d = emptyData(ts);
    d.recurring = [{ id: "w", name: "習い事", amount: 3000, cycle: "weekly", anchorDay: 1, nextDueDate: "2026-11-28", categoryId: "exp-1", paymentMethod: "", active: true, note: "", createdAt: ts, updatedAt: ts } as never];
    d.tasks = [{ id: "t", title: "書類", due: "2026-12-10", doDate: "2026-11-30", done: false, note: "", createdAt: ts, updatedAt: ts }];
    expect(weekAhead(d, "2026-11-28")).toEqual([{ date: "2026-12-05", events: 0, pay: 3000, payCount: 1, deadlines: 0 }]);
  });
});

describe("まとめてカテゴリを変えるときに外す記録", () => {
  it("カードの引き落とし・振替・経費・返金・精算は外す。ふつうの支出・収入は外さない", () => {
    expect(keepCategory({ countAs: "transfer" })).toBe(true);
    expect(keepCategory({ refundOf: "x" })).toBe(true);
    expect(keepCategory({ settles: "x" })).toBe(true);
    expect(keepCategory({ claim: true, countAs: "transfer" })).toBe(true);
    expect(keepCategory({})).toBe(false);
    expect(keepCategory({ countAs: "invest" })).toBe(false);
  });
});

describe("年のふりかえり", () => {
  it("その年の達成した目標・勉強の時間・旅行・支出と収入。前の年は数えない", () => {
    const d = emptyData(ts);
    const goal = (o: Partial<Goal> & { id: string }): Goal => ({ title: "g", deadline: "", kind: "check", target: null, current: 0, unit: "", done: false, note: "", createdAt: ts, updatedAt: ts, ...o });
    d.goals = [
      goal({ id: "met", achievements: [{ at: "2026-05-01", verdict: "met", conditions: [] }] }),
      goal({ id: "unmet", achievements: [{ at: "2026-05-01", verdict: "unmet", conditions: [] }] }),
      goal({ id: "old", achievements: [{ at: "2025-12-31", verdict: "met", conditions: [] }] }),
      goal({ id: "done", done: true, updatedAt: "2026-03-01T00:00:00.000Z" }),
      goal({ id: "open" }),
    ];
    d.studyLogs = [
      { id: "s1", subjectId: "x", date: "2026-02-01", minutes: 90, note: "", createdAt: ts, updatedAt: ts },
      { id: "s2", subjectId: "x", date: "2025-12-31", minutes: 30, note: "", createdAt: ts, updatedAt: ts },
    ] as never;
    d.trips = [{ id: "tr", startDate: "2026-08-10" }, { id: "tr0", startDate: "2025-08-10" }] as never;
    const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({ type: "expense", date: "2026-01-10", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: ts, updatedAt: ts, ...o });
    d.transactions = [tx({ id: "a" }), tx({ id: "b", date: "2026-12-31", amount: 500 }), tx({ id: "c", date: "2025-12-31", amount: 9999 }), tx({ id: "i", type: "income", categoryId: "inc-1", amount: 300000 })];
    expect(yearReview(d, "2026")).toEqual({ year: "2026", goalsMet: 2, studyMinutes: 90, trips: 1, expense: 1500, invest: 0, income: 300000 });
    // 投資は支出と分ける。振替（カードの引き落とし）・返金は数えない（点検 中1）
    d.categories = [...d.categories, { id: "inv", name: "積立", kind: "expense", role: "invest", archived: false } as never];
    d.transactions.push(tx({ id: "nisa", categoryId: "inv", amount: 30000 }), tx({ id: "card", amount: 50000, countAs: "transfer" } as never));
    const r = yearReview(d, "2026");
    expect([r.expense, r.invest]).toEqual([1500, 30000]);
  });
  it("達成の記録が満たさないだけで、そのあと完了にした目標も数える（点検 低3）", () => {
    const d = emptyData(ts);
    d.goals = [{ id: "g", title: "g", deadline: "", kind: "check", target: null, current: 0, unit: "", done: true, note: "", achievements: [{ at: "2026-05-01", verdict: "unmet", conditions: [] }], createdAt: ts, updatedAt: "2026-09-01T00:00:00.000Z" }];
    expect(yearReview(d, "2026").goalsMet).toBe(1);
  });
});
