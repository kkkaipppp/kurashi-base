import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { activeDays, usageWeeks } from "@/lib/usageDays";
import { addDays } from "@/lib/date";
import type { AppData, Transaction } from "@/lib/types";

// A1（論点 Q15 は B）：記録した日の数。期待値は手で決めた（今日 2026-11-26、直近28日＝10/30〜11/26）
const today = "2026-11-26";
/** その日の正午（端末の現地の時刻）に作った記録 */
const at = (day: string) => new Date(`${day}T12:00:00`).toISOString();
const tx = (id: string, day: string, upd?: string): Transaction => ({ id, type: "expense", date: day, amount: 100, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: at(day), updatedAt: at(upd ?? day) });
const withTx = (txs: Transaction[]): AppData => ({ ...emptyData(at("2026-01-01")), transactions: txs });

describe("A1：記録した日の数（続けて使えているか）", () => {
  it("記録が何もなければ、4週とも0日・達成していない", () => {
    const u = usageWeeks(emptyData(at("2026-01-01")), today);
    expect(u.weeks.map((w) => w.days)).toEqual([0, 0, 0, 0]);
    expect(u.meetsGoal).toBe(false);
    expect(u.total).toBe(0);
  });
  it("7日ずつの区切りは、今日を含む週が最後。10/30〜11/5、11/6〜11/12、11/13〜11/19、11/20〜11/26", () => {
    const u = usageWeeks(emptyData(at("2026-01-01")), today);
    expect(u.weeks.map((w) => [w.from, w.to])).toEqual([
      ["2026-10-30", "2026-11-05"],
      ["2026-11-06", "2026-11-12"],
      ["2026-11-13", "2026-11-19"],
      ["2026-11-20", "2026-11-26"],
    ]);
  });
  it("同じ日に何件記録しても1日。作った日と直した日の両方を数える。28日より前は数えない", () => {
    const d = withTx([tx("a", "2026-11-26"), tx("b", "2026-11-26"), tx("c", "2026-11-20", "2026-11-22"), tx("old", "2026-10-29")]);
    const u = usageWeeks(d, today);
    expect(u.weeks.map((w) => w.days)).toEqual([0, 0, 0, 3]); // 11/20・11/22・11/26
    expect(u.total).toBe(3);
  });
  it("4週とも5日以上なら達成。1週でも4日なら未達", () => {
    const days: string[] = [];
    for (const [from, n] of [["2026-10-30", 5], ["2026-11-06", 6], ["2026-11-13", 7], ["2026-11-20", 5]] as const) for (let i = 0; i < n; i++) days.push(addDays(from, i));
    const d = withTx(days.map((day, i) => tx(`t${i}`, day)));
    const u = usageWeeks(d, today);
    expect(u.weeks.map((w) => w.days)).toEqual([5, 6, 7, 5]);
    expect(u.meetsGoal).toBe(true);
    const less = withTx(days.filter((x) => x !== "2026-11-24").map((day, i) => tx(`t${i}`, day)));
    expect(usageWeeks(less, today).weeks.map((w) => w.days)).toEqual([5, 6, 7, 4]);
    expect(usageWeeks(less, today).meetsGoal).toBe(false);
  });
  it("予定・タスクなど、ほかの記録も数える。壊れた日時は数えない", () => {
    const d = emptyData(at("2026-01-01"));
    d.events = [{ id: "e", title: "x", startDate: "2026-12-01", endDate: "2026-12-01", allDay: true, startTime: "", endTime: "", note: "", createdAt: at("2026-11-25"), updatedAt: at("2026-11-25") }];
    d.tasks = [{ id: "k", title: "x", due: "", done: false, note: "", createdAt: "壊れた", updatedAt: at("2026-11-21") }];
    expect([...activeDays(d)].sort()).toEqual(["2026-11-21", "2026-11-25"]);
    expect(usageWeeks(d, today).weeks.map((w) => w.days)).toEqual([0, 0, 0, 2]);
  });
});
