import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { freeSlots } from "@/lib/freeTime";
import type { AppData, CalendarEvent } from "@/lib/types";

// NEXT v21 X10：予定のない時間帯。空白＝自由時間とは限らない。終日の予定は数えない。移動時間はふさがる
const now = "2026-11-25T00:00:00.000Z";
const ev = (o: Partial<CalendarEvent> & { id: string }): CalendarEvent => ({ title: "x", startDate: "2026-11-26", endDate: "2026-11-26", allDay: false, startTime: "10:00", endTime: "11:00", note: "", createdAt: now, updatedAt: now, ...o });
const mk = (events: CalendarEvent[]): AppData => ({ ...emptyData(now), events });

describe("予定のない時間帯", () => {
  it("予定がなければ、活動できる時間（8:00〜22:00）の全体", () => {
    expect(freeSlots(mk([]), "2026-11-26")).toEqual([{ from: "08:00", to: "22:00", minutes: 840 }]);
  });
  it("予定のあいだ・前後を出す。重なる予定は1つにまとめる。30分未満の隙間は出さない", () => {
    const d = mk([ev({ id: "a", startTime: "10:00", endTime: "12:00" }), ev({ id: "b", startTime: "11:30", endTime: "13:00" }), ev({ id: "c", startTime: "13:20", endTime: "14:00" })]);
    expect(freeSlots(d, "2026-11-26")).toEqual([
      { from: "08:00", to: "10:00", minutes: 120 },
      { from: "14:00", to: "22:00", minutes: 480 },
    ]); // 13:00〜13:20 の20分は出さない
  });
  it("移動時間は、予定の前後ともふさがる。終日の予定・時刻のない予定は、ふさがるとしない", () => {
    const d = mk([ev({ id: "a", startTime: "10:00", endTime: "11:00", travelMinutes: 30 }), ev({ id: "b", allDay: true, startTime: "", endTime: "" })]);
    expect(freeSlots(d, "2026-11-26")).toEqual([
      { from: "08:00", to: "09:30", minutes: 90 },
      { from: "11:30", to: "22:00", minutes: 630 },
    ]);
  });
  it("活動できる時間の外の予定は、はみ出さない。空きがなければ空の一覧。繰り返しの予定も、その日の分だけ", () => {
    const d = mk([ev({ id: "a", startTime: "06:00", endTime: "23:00" })]);
    expect(freeSlots(d, "2026-11-26")).toEqual([]);
    const r = mk([ev({ id: "w", repeat: "weekly", startDate: "2026-11-19", endDate: "2026-11-19", startTime: "20:00", endTime: "21:00" })]);
    expect(freeSlots(r, "2026-11-26").at(-1)).toEqual({ from: "21:00", to: "22:00", minutes: 60 });
    expect(freeSlots(r, "2026-11-25")).toEqual([{ from: "08:00", to: "22:00", minutes: 840 }]);
  });
  it("何日かにまたがる予定は、開始の日は夜まで、最後の日は終わりまで。途中の日は数えない（時間が分からないため）", () => {
    const d = mk([ev({ id: "t", startDate: "2026-11-25", endDate: "2026-11-27", startTime: "20:00", endTime: "09:00" })]);
    expect(freeSlots(d, "2026-11-25")).toEqual([{ from: "08:00", to: "20:00", minutes: 720 }]);
    expect(freeSlots(d, "2026-11-26")).toEqual([{ from: "08:00", to: "22:00", minutes: 840 }]);
    expect(freeSlots(d, "2026-11-27")).toEqual([{ from: "09:00", to: "22:00", minutes: 780 }]);
  });
  it("カレンダーの選んだ日に出す（自分用だけ）。無断で予定を作らない", () => {
    const s = readFileSync(join(__dirname, "..", "src", "app", "calendar", "page.tsx"), "utf8");
    expect(s).toContain("const FreeTimeCard = PERSONAL_BUILD ? dynamic(");
    const lib = readFileSync(join(__dirname, "..", "src", "lib", "freeTime.ts"), "utf8") + readFileSync(join(__dirname, "..", "src", "components", "FreeTimeCard.tsx"), "utf8");
    expect(lib).not.toMatch(/addEvent|commit\(|useStore/);
    expect(lib).toContain("自由な時間とは限りません");
  });
});
