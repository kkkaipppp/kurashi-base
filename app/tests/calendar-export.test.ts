import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { buildCalendarItems, calendarWindow } from "@/lib/calendarExport";
import type { CalendarEvent, RecurringExpense } from "@/lib/types";

const now = "2026-11-24T00:00:00.000Z";
const ev = (p: Partial<CalendarEvent>): CalendarEvent => ({
  id: "e", title: "予定", startDate: "2026-11-25", endDate: "2026-11-25", allDay: false, startTime: "10:00", endTime: "11:00",
  note: "", createdAt: now, updatedAt: now, ...p,
});
const rec = (p: Partial<RecurringExpense>): RecurringExpense => ({
  id: "r", name: "家賃", amount: 81330, cycle: "monthly", anchorDay: 27, nextDueDate: "2026-11-27", categoryId: "exp-4",
  paymentMethod: "bank", active: true, createdAt: now, updatedAt: now, ...p,
});

describe("iPhone のカレンダーに入れる予定（2026-11-24 平尾さん：Web 版はファイル、アプリは自動）", () => {
  it("期間は30日前から180日先まで", () => {
    expect(calendarWindow("2026-11-24")).toEqual({ from: "2026-10-25", to: "2027-05-23" });
  });
  it("1回だけ・何日も続く予定はそのまま1件。期間の外は入れない", () => {
    const d = emptyData(now);
    d.events = [
      ev({ id: "a", title: "歯医者" }),
      ev({ id: "b", title: "札幌出張", startDate: "2026-12-01", endDate: "2026-12-03", allDay: true, startTime: "", endTime: "" }),
      ev({ id: "c", title: "昔の", startDate: "2026-01-01", endDate: "2026-01-01" }),
    ];
    const items = buildCalendarItems(d, "2026-11-24");
    expect(items.map((i) => [i.title, i.startDate, i.endDate, i.allDay, i.startTime])).toEqual([
      ["歯医者", "2026-11-25", "2026-11-25", false, "10:00"],
      ["札幌出張", "2026-12-01", "2026-12-03", true, ""],
    ]);
  });
  it("予定のメモは渡さない（場所は渡す）", () => {
    const d = emptyData(now);
    d.events = [ev({ title: "通院", note: "薬の名前など", location: "〇〇クリニック" })];
    const [it0] = buildCalendarItems(d, "2026-11-24");
    expect(it0.notes).toBe("");
    expect(it0.location).toBe("〇〇クリニック");
  });
  it("毎週の予定は期間の中の1回ずつ（終わりの日まで）", () => {
    const d = emptyData(now);
    d.events = [ev({ title: "ジム", startDate: "2026-11-17", endDate: "2026-11-17", repeat: "weekly", repeatUntil: "2026-12-08" })];
    expect(buildCalendarItems(d, "2026-11-24").map((i) => i.startDate)).toEqual(["2026-11-17", "2026-11-24", "2026-12-01", "2026-12-08"]);
  });
  it("固定費は支払日に終日で、名前と金額。止めた固定費は入れない", () => {
    const d = emptyData(now);
    d.recurring = [rec({}), rec({ id: "x", name: "止めた", active: false })];
    const items = buildCalendarItems(d, "2026-11-24");
    expect(items[0]).toMatchObject({ title: "固定費 家賃 ¥81,330", startDate: "2026-11-27", allDay: true });
    expect(items.map((i) => i.startDate)).toEqual(["2026-11-27", "2026-12-27", "2027-01-27", "2027-02-27", "2027-03-27", "2027-04-27"]);
  });
});

it("古い週次固定費も書き出し期間に含める", () => {
  const d = emptyData(now);
  d.recurring = [rec({cycle: "weekly", nextDueDate: "1900-01-01"})];
  const items = buildCalendarItems(d, "2026-11-24");
  expect(items.length).toBe(30);
  expect(items[0].startDate).toBe("2026-10-26");
});
