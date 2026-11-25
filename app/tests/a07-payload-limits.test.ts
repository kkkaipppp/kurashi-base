import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { clipText } from "@/lib/clip";
import { buildCalendarItems, CAL_MAX_ITEMS, CAL_TEXT_MAX } from "@/lib/calendarExport";
import { buildReminders, DEFAULT_REMINDERS, REMINDER_TEXT_MAX } from "@/lib/reminders";
import type { AppData, CalendarEvent } from "@/lib/types";

// o11 A07：iPhone アプリ（ios/App/App/WidgetBridgePlugin.swift）は、受け取る中身の大きさに上限がある。
// 通知の一覧は 200,000 バイト、カレンダーの一覧は 5,000,000 バイト。超えると丸ごと受け取らず、
// 消した予定の通知が残ったり、カレンダーが1件も書き直されなかったりする。取り込んだ予定の名前がとても長くても、上限の内側に収める
const SWIFT_REMINDERS_LIMIT = 200_000;
const SWIFT_CALENDAR_LIMIT = 5_000_000;
const now = "2026-11-25T00:00:00.000Z";
const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
const LONG = "長".repeat(20_000);

function longData(): AppData {
  const d = emptyData(now);
  const evs: CalendarEvent[] = [];
  // 毎週くり返す、名前と場所がとても長い予定を、曜日ごとに 10 件（毎日 10 件になる。カレンダーには 211 日 × 10 件）
  for (let i = 0; i < 70; i++)
    evs.push({ id: `e${i}`, title: `${LONG}${i}`, startDate: `2026-01-0${1 + (i % 7)}`, endDate: `2026-01-0${1 + (i % 7)}`, allDay: false, startTime: `1${i % 10}:00`, endTime: `1${i % 10}:30`, location: LONG, note: "", repeat: "weekly", createdAt: now, updatedAt: now });
  d.events = evs;
  d.recurring = [{ id: "r", name: LONG, amount: 99_999_999, cycle: "monthly", anchorDay: 1, nextDueDate: "2026-12-01", categoryId: "exp-1", paymentMethod: "", active: true, createdAt: now, updatedAt: now }];
  d.tasks = Array.from({ length: 80 }, (_, i) => ({ id: `k${i}`, title: LONG, due: "2026-11-27", done: false, note: "", createdAt: now, updatedAt: now }));
  return d;
}

describe("o11 A07：iPhone アプリに渡す中身の大きさ", () => {
  it("clipText：短い文字はそのまま。長い文字は max 文字（最後は…）。絵文字を途中で切らない", () => {
    expect(clipText("会議", 40)).toBe("会議");
    expect(clipText("", 40)).toBe("");
    expect(clipText("あいうえお", 5)).toBe("あいうえお");
    expect(clipText("あいうえおか", 5)).toBe("あいうえ…");
    const s = clipText("👨‍👩‍👧😀😀😀😀😀", 4);
    expect(Array.from(s)).toHaveLength(4);
    expect(s.endsWith("…")).toBe(true);
    expect(s).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/); // 片方だけのサロゲートが残らない
  });
  it("通知：名前がとても長い予定・タスクが多くても、一覧は 200,000 バイトの内側。題名と本文は120文字まで", () => {
    const list = buildReminders(longData(), "2026-11-25T09:00:00", { ...DEFAULT_REMINDERS, on: true });
    expect(list.length).toBeGreaterThan(0);
    expect(bytes(list)).toBeLessThan(SWIFT_REMINDERS_LIMIT);
    for (const r of list) {
      expect(Array.from(r.title).length).toBeLessThanOrEqual(REMINDER_TEXT_MAX);
      expect(Array.from(r.body).length).toBeLessThanOrEqual(REMINDER_TEXT_MAX);
    }
  });
  it("カレンダー：名前・場所がとても長い毎日の予定でも、一覧は 5,000,000 バイトの内側。名前と場所は200文字まで", () => {
    const items = buildCalendarItems(longData(), "2026-11-25");
    expect(items.length).toBe(CAL_MAX_ITEMS); // 211 日 × 10 件のうち、上限まで
    expect(bytes(items)).toBeLessThan(SWIFT_CALENDAR_LIMIT);
    expect(items.some((i) => i.title.startsWith("固定費 ") && i.title.endsWith("¥99,999,999"))).toBe(true); // 名前の長い固定費も、金額は残る
    for (const it of items) {
      expect(Array.from(it.title).length).toBeLessThanOrEqual(CAL_TEXT_MAX);
      expect(Array.from(it.location).length).toBeLessThanOrEqual(CAL_TEXT_MAX);
    }
  });
  it("ふつうの長さの名前は、前と同じ（切らない）", () => {
    const d = emptyData(now);
    d.events = [{ id: "e", title: "歯医者", startDate: "2026-11-26", endDate: "2026-11-26", allDay: false, startTime: "10:00", endTime: "11:00", location: "駅前", note: "", createdAt: now, updatedAt: now }];
    d.recurring = [{ id: "r", name: "家賃", amount: 80000, cycle: "monthly", anchorDay: 27, nextDueDate: "2026-11-27", categoryId: "exp-1", paymentMethod: "", active: true, createdAt: now, updatedAt: now }];
    const items = buildCalendarItems(d, "2026-11-25");
    expect(items.map((i) => i.title).slice(0, 2)).toEqual(["歯医者", "固定費 家賃 ¥80,000"]); // 固定費は180日先まで毎月
    expect(items[0].location).toBe("駅前");
    const rs = buildReminders(d, "2026-11-25T09:00:00", { ...DEFAULT_REMINDERS, on: true });
    expect(rs.map((r) => r.title)).toEqual(["歯医者", "固定費の支払日：家賃"]);
  });
});
