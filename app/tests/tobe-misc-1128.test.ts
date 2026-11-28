import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { overlappingEvents } from "@/lib/aggregate";
import { addPlan, chooseCandidate, addCandidate, copyPlan } from "@/lib/plan";
import type { CalendarEvent } from "@/lib/types";

// 期待値は手で作った（2026-11-28：予定の重なりの警告・計画のコピー）
const ts = "2026-11-28T00:00:00.000Z";
const ev = (o: Partial<CalendarEvent> & { id: string }): CalendarEvent => ({ title: "会議", startDate: "2026-12-01", endDate: "2026-12-01", allDay: false, startTime: "10:00", endTime: "11:00", note: "", createdAt: ts, updatedAt: ts, ...o });
const d0 = { startDate: "2026-12-01", endDate: "2026-12-01", allDay: false, startTime: "10:30", endTime: "11:30" };

describe("予定の重なり", () => {
  it("時間が重なる1日の予定だけ。ちょうど続く・終日・日またぎ・自分自身・別の日は数えない。毎週の予定も重なれば出す", () => {
    const evs = [
      ev({ id: "a" }),
      ev({ id: "b", startTime: "11:30", endTime: "12:00" }),
      ev({ id: "c", allDay: true, startTime: "", endTime: "" }),
      ev({ id: "d", endDate: "2026-12-02" }),
      ev({ id: "e", startDate: "2026-12-02", endDate: "2026-12-02" }),
      ev({ id: "w", startDate: "2026-11-24", endDate: "2026-11-24", repeat: "weekly", startTime: "11:00", endTime: "12:00" }),
    ];
    expect(overlappingEvents(evs, d0).map((e) => e.id)).toEqual(["a", "w"]);
    expect(overlappingEvents(evs, { ...d0, id: "a" }).map((e) => e.id)).toEqual(["w"]);
    expect(overlappingEvents(evs, { ...d0, allDay: true })).toEqual([]);
  });
});

describe("計画のコピー", () => {
  it("種類・名前（コピー）・予算・メモ・候補（決めた印なし）を写す。日にち・状態は写さない", () => {
    let d = addPlan(emptyData(ts), { type: "gathering", title: "忘年会", date: "2026-12-05", budget: 5000, note: "幹事", status: "preparing" }, "p1", ts);
    d = addCandidate(d, "p1", { label: "居酒屋A", url: "", price: 4000, note: "" }, "c1", ts);
    d = chooseCandidate(d, "p1", "c1", ts);
    let n = 0;
    d = copyPlan(d, "p1", "p2", () => `n${++n}`, ts);
    const p2 = d.plans!.find((p) => p.id === "p2")!;
    expect(p2).toMatchObject({ type: "gathering", title: "忘年会（コピー）", date: "", budget: 5000, note: "幹事", status: "considering" });
    expect(p2.candidates).toEqual([{ id: "n1", label: "居酒屋A", url: "", price: 4000, note: "" }]);
    expect(copyPlan(d, "nothing", "p3", () => "x", ts)).toBe(d);
  });
});
