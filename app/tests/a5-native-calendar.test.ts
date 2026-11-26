import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { FEATURE_EDITIONS } from "@/lib/edition";
import { planIcsImport } from "@/lib/icsImport";
import { calendarKey, nativeItemToEvent, nativeRange, nativeToParsed, summarizeCalendars, type NativeCalendarItem } from "@/lib/nativeCalendar";

// A5（2026-11-26 平尾さん「全部おすすめで」＝朝の報告の 8）：自分用アプリで iPhone のカレンダーを直接読む。期待値は手で作った
const src = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const it0 = (o: Partial<NativeCalendarItem>): NativeCalendarItem => ({ title: "歯医者", start: "2026-12-03 10:00", end: "2026-12-03 11:00", allDay: false, calendar: "ホーム", calendarType: "calDAV", ...o });

describe("A5 iPhone のカレンダーを読む", () => {
  it("時刻つきの予定：日付・時刻・場所・メモを写す", () => {
    expect(nativeItemToEvent(it0({ location: "駅前", notes: "保険証" }))).toEqual({ title: "歯医者", startDate: "2026-12-03", endDate: "2026-12-03", allDay: false, startTime: "10:00", endTime: "11:00", note: "保険証", location: "駅前" });
  });
  it("終日の予定：最後の日（含む）を終わりの日に。時刻は空", () => {
    expect(nativeItemToEvent(it0({ allDay: true, start: "2026-12-29 00:00", end: "2026-12-31 23:59" }))).toMatchObject({ startDate: "2026-12-29", endDate: "2026-12-31", startTime: "", endTime: "" });
    // 1日だけの終日（終わりが同じ日の 23:59）
    expect(nativeItemToEvent(it0({ allDay: true, start: "2026-12-29 00:00", end: "2026-12-29 23:59" }))).toMatchObject({ startDate: "2026-12-29", endDate: "2026-12-29" });
  });
  it("日をまたぐ予定・終わりが始まりより前（壊れた値）は開始と同じ時刻", () => {
    expect(nativeItemToEvent(it0({ start: "2026-12-31 22:00", end: "2027-01-01 01:00" }))).toMatchObject({ endDate: "2027-01-01", endTime: "01:00" });
    expect(nativeItemToEvent(it0({ start: "2026-12-03 10:00", end: "2026-12-03 09:00" }))).toMatchObject({ endDate: "2026-12-03", endTime: "10:00" });
  });
  it("読めない日付は作らない。名前なしは「（名前なし）」。長い名前は100文字まで", () => {
    expect(nativeItemToEvent(it0({ start: "2026-02-31 10:00" }))).toBeNull();
    expect(nativeItemToEvent(it0({ start: "x" }))).toBeNull();
    expect(nativeItemToEvent(it0({ title: "  " }))?.title).toBe("（名前なし）");
    expect(Array.from(nativeItemToEvent(it0({ title: "あ".repeat(150) }))!.title)).toHaveLength(100);
  });
  it("カレンダーごとの件数。誕生日・照会は、初めは選ばない", () => {
    const items = [it0({}), it0({ title: "b" }), it0({ calendar: "誕生日", calendarType: "birthday" }), it0({ calendar: "祝日", calendarType: "subscription" })];
    expect(summarizeCalendars(items)).toEqual([
      { name: "ホーム", type: "calDAV", count: 2, defaultOn: true },
      { name: "祝日", type: "subscription", count: 1, defaultOn: false },
      { name: "誕生日", type: "birthday", count: 1, defaultOn: false },
    ]);
  });
  it("選んだカレンダーだけ。すでにある予定（同じ名前・日・時刻）は足さない", () => {
    const items = [it0({}), it0({ title: "会議", calendar: "仕事", calendarType: "exchange" })];
    const sel = new Set([calendarKey({ name: "ホーム", type: "calDAV" })]);
    const parsed = nativeToParsed(items, sel);
    expect(parsed.events.map((e) => e.title)).toEqual(["歯医者"]);
    const d = emptyData("2026-11-26T00:00:00.000Z");
    d.events.push({ id: "e1", title: "歯医者", startDate: "2026-12-03", endDate: "2026-12-03", allDay: false, startTime: "10:00", endTime: "11:00", note: "", createdAt: "x", updatedAt: "x" });
    expect(planIcsImport(d, parsed)).toMatchObject({ duplicates: 1, add: [] });
  });
  it("読む期間：今日から1年（既定）・3か月・1か月前から1年先", () => {
    expect(nativeRange("1y", "2026-11-26")).toEqual({ from: "2026-11-26", to: "2027-11-27" });
    expect(nativeRange("3m", "2026-11-26")).toEqual({ from: "2026-11-26", to: "2027-02-26" });
    expect(nativeRange("past", "2026-11-26")).toEqual({ from: "2026-10-26", to: "2027-11-27" });
  });
  it("自分用だけ・アプリの中だけ・外へ送らない。Swift は「くらしベース」カレンダーと印つきの予定を読まない", () => {
    expect(FEATURE_EDITIONS.nativeCalendarRead).toEqual({ personal: true, public: false });
    const sw = src("ios/App/App/WidgetBridgePlugin.swift");
    expect(sw).toContain('CAPPluginMethod(name: "readCalendarEvents"');
    expect(sw).toContain("$0.calendarIdentifier != own && $0.title != Self.calendarTitle");
    expect(sw).toContain("for ev in events where ev.url != Self.ownedMark");
    const card = src("src/components/NativeCalendarImportCard.tsx");
    expect(card).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon/);
    expect(src("src/app/settings/page.tsx")).toContain("FEATURES.nativeCalendarRead && PERSONAL_BUILD ?");
  });
});
