import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { replaceEventEditableFields } from "@/lib/eventMerge";
import { canShift, departureTime, isDoneOn, shiftEvent, toggleDoneOn } from "@/lib/eventOps";
import { validateAppData } from "@/lib/schema";
import type { CalendarEvent } from "@/lib/types";

// NEXT v21 X06：予定にも完了・延期。ID は変えない。繰り返しは1回だけ完了できる。完了だけでは何も作らない
const now = "2026-11-25T00:00:00.000Z";
const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");
const ev = (o: Partial<CalendarEvent> = {}): CalendarEvent => ({ id: "e", title: "ジム", startDate: "2026-11-26", endDate: "2026-11-26", allDay: false, startTime: "19:00", endTime: "20:00", note: "", createdAt: now, updatedAt: now, ...o });

describe("予定の完了・延期", () => {
  it("完了は日付ごと。取り消せる。繰り返しの予定は、その回だけ完了できる", () => {
    const e = ev({ repeat: "weekly" });
    const a = toggleDoneOn(e, "2026-12-03", now);
    expect(a.doneDates).toEqual(["2026-12-03"]);
    expect(isDoneOn(a, "2026-12-03")).toBe(true);
    expect(isDoneOn(a, "2026-12-10")).toBe(false); // ほかの回は未完了
    const b = toggleDoneOn(a, "2026-12-10", now);
    expect(b.doneDates).toEqual(["2026-12-03", "2026-12-10"]);
    const c = toggleDoneOn(b, "2026-12-03", now);
    expect(c.doneDates).toEqual(["2026-12-10"]);
    expect("doneDates" in toggleDoneOn(c, "2026-12-10", now)).toBe(false); // 空になったら項目ごと消える
    expect(c.id).toBe("e");
  });
  it("延期は、繰り返さない予定だけ。日付だけずらし、ID・時刻・完了の日付の対応は保つ", () => {
    const e = ev({ doneDates: ["2026-11-26"], location: "ジム" });
    const s = shiftEvent(e, 7, now)!;
    expect([s.id, s.startDate, s.endDate, s.startTime, s.location]).toEqual(["e", "2026-12-03", "2026-12-03", "19:00", "ジム"]);
    expect(s.doneDates).toEqual(["2026-12-03"]);
    expect(shiftEvent(ev({ repeat: "weekly" }), 1, now)).toBeNull();
    expect(shiftEvent(e, 0, now)).toBeNull();
    expect(canShift(ev({ repeat: "none" }))).toBe(true);
    // 月末・年末をまたぐ
    expect(shiftEvent(ev({ startDate: "2026-12-31", endDate: "2027-01-01" }), 1, now)).toMatchObject({ startDate: "2027-01-01", endDate: "2027-01-02" });
  });
  it("編集しても、完了の記録は消えない（編集フォームの入力にないため）", () => {
    const e = ev({ doneDates: ["2026-11-26"] });
    const { id: _i, createdAt: _c, updatedAt: _u, doneDates: _d, ...editable } = e; // eslint-disable-line @typescript-eslint/no-unused-vars
    const r = replaceEventEditableFields(e, { ...editable, title: "ジム（変更）" }, now);
    expect(r.doneDates).toEqual(["2026-11-26"]);
    expect(r.title).toBe("ジム（変更）");
  });
  it("完了だけでは、支出・学習時間などの実績を作らない（X08）", () => {
    const lib = src("lib/eventOps.ts") + src("components/EventActions.tsx");
    expect(lib).not.toMatch(/transactions|studyLogs|addTx|addItem/);
  });
});

describe("出発の目安", () => {
  it("開始時刻 − 移動時間。終日・時刻なし・移動時間なし・前の日になるときは出さない", () => {
    expect(departureTime({ allDay: false, startTime: "10:00", travelMinutes: 45 })).toBe("09:15");
    expect(departureTime({ allDay: false, startTime: "00:30", travelMinutes: 45 })).toBeNull(); // 前の日になる
    expect(departureTime({ allDay: true, startTime: "", travelMinutes: 30 })).toBeNull();
    expect(departureTime({ allDay: false, startTime: "10:00" })).toBeNull();
    expect(departureTime({ allDay: false, startTime: "10:00", travelMinutes: 0 })).toBeNull();
    expect(departureTime({ allDay: false, startTime: "08:05", travelMinutes: 5 })).toBe("08:00");
  });
});

describe("保存の形（任意の項目を足すだけ）", () => {
  it("doneDates・travelMinutes は、書き出し→読み込みで残る。おかしな値は断る。今までのデータも読める", () => {
    const d = emptyData(now);
    d.events = [ev({ doneDates: ["2026-11-26"], travelMinutes: 30 })];
    const r = validateAppData(JSON.parse(JSON.stringify(d)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.events[0]).toMatchObject({ doneDates: ["2026-11-26"], travelMinutes: 30 });
    for (const bad of [{ doneDates: ["x"] }, { doneDates: "2026-11-26" }, { travelMinutes: -1 }, { travelMinutes: 1.5 }, { travelMinutes: 2000 }]) {
      const b = JSON.parse(JSON.stringify(d));
      Object.assign(b.events[0], bad);
      expect(validateAppData(b).ok, JSON.stringify(bad)).toBe(false);
    }
    const old = emptyData(now);
    old.events = [ev()];
    expect(validateAppData(JSON.parse(JSON.stringify(old))).ok).toBe(true);
  });
  it("画面は自分用だけ（完了・延期・移動時間）", () => {
    const s = src("components/EventSheet.tsx");
    expect(s).toContain("{IS_PERSONAL && <EventActions");
    expect(s).toContain("travelMinutes: undefined");
    expect(src("components/Rows.tsx")).toContain("isDoneOn(ev, day ?? ev.startDate)");
  });
});
