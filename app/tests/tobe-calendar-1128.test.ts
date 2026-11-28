import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { emptyData } from "@/lib/defaults";
import { undatedItems } from "@/lib/undated";
import { taskEventDate } from "@/lib/taskEvent";
import { occursOn } from "@/lib/aggregate";
import { validateAppData } from "@/lib/schema";
import type { CalendarEvent, Plan, Task } from "@/lib/types";

// 期待値は決めごと（To-Be 03「期限と実施日時は別」・02「日程未定」「誕生日」。2026-11-28）から手で作った
const ts = "2026-11-28T00:00:00.000Z";
const task = (o: Partial<Task> & { id: string }): Task => ({ title: "書類を出す", due: "", done: false, note: "", createdAt: ts, updatedAt: ts, ...o });

// やる日は自分用だけ（版の値は読み込みのときに決まる）。自分用として読み込み直す
let deadlinesOn: typeof import("@/lib/deadlines").deadlinesOn;
let deadlineDays: typeof import("@/lib/deadlines").deadlineDays;
let pub: typeof import("@/lib/deadlines");
beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "public");
  vi.resetModules();
  pub = await import("@/lib/deadlines");
  vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "personal");
  vi.resetModules();
  ({ deadlinesOn, deadlineDays } = await import("@/lib/deadlines"));
});
afterAll(() => vi.unstubAllEnvs());

describe("期限とやる日", () => {
  it("公開版は、復元したデータにやる日があっても出さない", () => {
    const d = emptyData(ts);
    d.tasks = [task({ id: "a", due: "2026-12-10", doDate: "2026-12-05" })];
    expect(pub.deadlinesOn(d, "2026-12-05")).toEqual([]);
    expect([...pub.deadlineDays(d, "2026-12")]).toEqual(["2026-12-10"]);
  });
  it("やる日があれば、予定にするときはやる日に作る（無ければ期限、どちらも無ければ今日）", () => {
    expect(taskEventDate({ due: "2026-12-10", doDate: "2026-12-05" }, "2026-11-28")).toBe("2026-12-05");
    expect(taskEventDate({ due: "2026-12-10" }, "2026-11-28")).toBe("2026-12-10");
    expect(taskEventDate({ due: "" }, "2026-11-28")).toBe("2026-11-28");
  });
  it("やる日が期限より後なら「期限を過ぎています」。年が違えば期限に年を出す", () => {
    const d = emptyData(ts);
    d.tasks = [task({ id: "late", due: "2026-12-10", doDate: "2026-12-15" }), task({ id: "yr", due: "2027-01-05", doDate: "2026-12-28" }), task({ id: "nodue", doDate: "2026-12-20" })];
    expect(deadlinesOn(d, "2026-12-15")[0].sub).toBe("期限を過ぎています・期限 12月10日(木)");
    expect(deadlinesOn(d, "2026-12-28")[0].sub).toBe("期限 2027年1月5日(火)");
    expect(deadlinesOn(d, "2026-12-20")[0].sub).toBeUndefined();
  });
  it("期限 12/10・やる日 12/5 → 12/5 に「やる日」、12/10 に「やること」（期限）。両方の日に印", () => {
    const d = emptyData(ts);
    d.tasks = [task({ id: "a", due: "2026-12-10", doDate: "2026-12-05" })];
    expect(deadlinesOn(d, "2026-12-05").map((x) => [x.kind, x.sub])).toEqual([["やる日", "期限 12月10日(木)"]]);
    expect(deadlinesOn(d, "2026-12-10").map((x) => x.kind)).toEqual(["やること"]);
    expect([...deadlineDays(d, "2026-12")].sort()).toEqual(["2026-12-05", "2026-12-10"]);
  });
  it("やる日と期限が同じ日なら1つだけ。終わったものはやる日に出さない。予定にしたものは出さない", () => {
    const d = emptyData(ts);
    const ev: CalendarEvent = { id: "e", title: "x", startDate: "2026-12-06", endDate: "2026-12-06", allDay: true, startTime: "", endTime: "", note: "", createdAt: ts, updatedAt: ts };
    d.events = [ev];
    d.tasks = [
      task({ id: "same", due: "2026-12-05", doDate: "2026-12-05" }),
      task({ id: "done", doDate: "2026-12-05", done: true }),
      task({ id: "ev", doDate: "2026-12-05", eventId: "e" }),
    ];
    expect(deadlinesOn(d, "2026-12-05").map((x) => x.key)).toEqual(["t-same"]);
    // 予定にしたものは、やる日の印も出さない（予定として出る）
    d.tasks = [task({ id: "ev", doDate: "2026-12-07", eventId: "e" })];
    expect([...deadlineDays(d, "2026-12")]).toEqual([]);
  });
  it("保存の形：やる日は省ける。正しくない日付は断る", () => {
    const d = emptyData(ts);
    d.tasks = [task({ id: "a", doDate: "2026-12-05" }), task({ id: "b" })];
    expect(validateAppData(JSON.parse(JSON.stringify(d))).ok).toBe(true);
    const bad = JSON.parse(JSON.stringify(d));
    bad.tasks[0].doDate = "2026-02-30";
    expect(validateAppData(bad).ok).toBe(false);
  });
});

describe("日程未定", () => {
  it("日にちの無い検討中・準備中の計画と、期限もやる日も無い終わっていないやることだけ", () => {
    const d = emptyData(ts);
    const plan = (id: string, status: Plan["status"], date: string) => ({ id, type: "other", title: `計画${id}`, status, date, createdAt: ts, updatedAt: ts }) as unknown as Plan;
    d.plans = [plan("1", "considering", ""), plan("2", "preparing", ""), plan("3", "considering", "2026-12-01"), plan("4", "done" as Plan["status"], "")];
    d.tasks = [task({ id: "n" }), task({ id: "due", due: "2026-12-01" }), task({ id: "do", doDate: "2026-12-01" }), task({ id: "fin", done: true })];
    expect(undatedItems(d).map((x) => x.key)).toEqual(["p-1", "p-2", "t-n"]);
  });
});

describe("誕生日（毎年・終日）", () => {
  const bd = (startDate: string): CalendarEvent => ({ id: "b", title: "誕生日", startDate, endDate: startDate, allDay: true, startTime: "", endTime: "", note: "", repeat: "yearly", createdAt: ts, updatedAt: ts });
  it("毎年同じ日に出る。前の年には出ない", () => {
    expect(occursOn(bd("2000-05-03"), "2026-05-03")).toBe(true);
    expect(occursOn(bd("2000-05-03"), "2026-05-04")).toBe(false);
    expect(occursOn(bd("2027-05-03"), "2026-05-03")).toBe(false);
  });
  it("2月29日生まれは、うるう年でない年は2月28日に出る", () => {
    expect(occursOn(bd("2000-02-29"), "2027-02-28")).toBe(true);
    expect(occursOn(bd("2000-02-29"), "2028-02-29")).toBe(true);
    expect(occursOn(bd("2000-02-29"), "2028-02-28")).toBe(false);
  });
});
