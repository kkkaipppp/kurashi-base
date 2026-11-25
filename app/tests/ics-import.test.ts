import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { applyIcsImport, parseIcs, planIcsImport } from "@/lib/icsImport";
import { buildCalendarItems } from "@/lib/calendarExport";
import { buildIcs } from "@/lib/ics";
import { validateAppData } from "@/lib/schema";

// Q31＝①：.ics の読み込み。期待値は RFC 5545 の書き方から手で作る（実装から作らない）
const now = "2026-11-25T00:00:00.000Z";
const wrap = (body: string) => ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Apple Inc.//macOS//EN", body, "END:VCALENDAR"].join("\r\n");

describe(".ics の読み込み", () => {
  it("時刻つきの予定（日本時間・TZID=Asia/Tokyo）：名前・日付・時刻・場所・メモ", () => {
    const r = parseIcs(wrap(["BEGIN:VEVENT", "UID:a@x", "SUMMARY:歯医者", "DTSTART;TZID=Asia/Tokyo:20261201T100000", "DTEND;TZID=Asia/Tokyo:20261201T110000", "LOCATION:駅前歯科", "DESCRIPTION:保険証を持つ\\n予約番号\\, 12", "END:VEVENT"].join("\r\n")));
    expect(r.events).toEqual([{ title: "歯医者", startDate: "2026-12-01", endDate: "2026-12-01", allDay: false, startTime: "10:00", endTime: "11:00", note: "保険証を持つ\n予約番号, 12", location: "駅前歯科" }]);
    expect(r.skipped).toBe(0);
  });
  it("世界時（Z）は日本時間に直す：2026-12-01T15:00Z → 12/2 0:00", () => {
    const r = parseIcs(wrap(["BEGIN:VEVENT", "SUMMARY:会議", "DTSTART:20261201T150000Z", "DTEND:20261201T160000Z", "END:VEVENT"].join("\r\n")));
    expect(r.events[0]).toMatchObject({ startDate: "2026-12-02", startTime: "00:00", endDate: "2026-12-02", endTime: "01:00" });
  });
  it("終日の予定：終わりの日は『次の日』で書かれる → 1日前にする（12/24〜12/26 の3日間）", () => {
    const r = parseIcs(wrap(["BEGIN:VEVENT", "SUMMARY:旅行", "DTSTART;VALUE=DATE:20261224", "DTEND;VALUE=DATE:20261227", "END:VEVENT"].join("\r\n")));
    expect(r.events[0]).toMatchObject({ allDay: true, startDate: "2026-12-24", endDate: "2026-12-26", startTime: "", endTime: "" });
  });
  it("折り返した行（次の行の先頭が空白）をつなぐ", () => {
    const r = parseIcs(wrap(["BEGIN:VEVENT", "SUMMARY:とても長い", " 予定の名前", "DTSTART;VALUE=DATE:20261201", "END:VEVENT"].join("\r\n")));
    expect(r.events[0].title).toBe("とても長い予定の名前");
  });
  it("繰り返し：毎週・毎月・毎年（1日の予定）は写す。終わりの日も", () => {
    const r = parseIcs(wrap(["BEGIN:VEVENT", "SUMMARY:ジム", "DTSTART;TZID=Asia/Tokyo:20261202T190000", "RRULE:FREQ=WEEKLY;UNTIL=20270331T000000Z", "END:VEVENT", "BEGIN:VEVENT", "SUMMARY:家賃", "DTSTART;VALUE=DATE:20261227", "RRULE:FREQ=MONTHLY", "END:VEVENT"].join("\r\n")));
    expect(r.events[0]).toMatchObject({ repeat: "weekly", repeatUntil: "2027-03-31" });
    expect(r.events[1]).toMatchObject({ repeat: "monthly", repeatUntil: "" });
    expect(r.repeatDropped).toBe(0);
  });
  it("写せない繰り返し（2週おき・回数・複数の曜日・第n曜日）は、最初の回だけにして、メモに書く（黙って落とさない）", () => {
    const r = parseIcs(wrap(["BEGIN:VEVENT", "SUMMARY:隔週", "DTSTART;VALUE=DATE:20261202", "RRULE:FREQ=WEEKLY;INTERVAL=2", "END:VEVENT", "BEGIN:VEVENT", "SUMMARY:第2月曜", "DTSTART;VALUE=DATE:20261214", "RRULE:FREQ=MONTHLY;BYDAY=2MO", "END:VEVENT"].join("\r\n")));
    expect(r.events.map((e) => e.repeat)).toEqual([undefined, undefined]);
    expect(r.repeatDropped).toBe(2);
    expect(r.events[0].note).toContain("繰り返しは写していません");
  });
  it("日付のない予定・壊れた日付は数えて飛ばす。通知（VALARM）の中身は読まない", () => {
    const r = parseIcs(wrap(["BEGIN:VEVENT", "SUMMARY:日付なし", "END:VEVENT", "BEGIN:VEVENT", "SUMMARY:変な日", "DTSTART;VALUE=DATE:20260230", "END:VEVENT", "BEGIN:VEVENT", "SUMMARY:本物", "DTSTART;VALUE=DATE:20261201", "BEGIN:VALARM", "DESCRIPTION:通知の文", "SUMMARY:通知の名前", "END:VALARM", "END:VEVENT"].join("\r\n")));
    expect(r.skipped).toBe(2);
    expect(r.events.map((e) => e.title)).toEqual(["本物"]);
    expect(r.events[0].note).toBe("");
  });
  it("日本以外の時間帯は、時刻をそのまま写し、数を知らせる", () => {
    const r = parseIcs(wrap(["BEGIN:VEVENT", "SUMMARY:NY", "DTSTART;TZID=America/New_York:20261201T090000", "END:VEVENT"].join("\r\n")));
    expect(r.events[0].startTime).toBe("09:00");
    expect(r.otherTimezone).toBe(1);
  });
});

describe("取り込みの計画と保存", () => {
  const ics = wrap(["BEGIN:VEVENT", "SUMMARY:歯医者", "DTSTART;TZID=Asia/Tokyo:20261201T100000", "END:VEVENT", "BEGIN:VEVENT", "SUMMARY:旅行", "DTSTART;VALUE=DATE:20261224", "DTEND;VALUE=DATE:20261227", "END:VEVENT"].join("\r\n"));
  it("同じ予定（名前・開始日・開始時刻）が、すでにあれば足さない。2回読み込んでも増えない", () => {
    let d = emptyData(now);
    let n = 0;
    const p1 = planIcsImport(d, parseIcs(ics));
    expect(p1.add).toHaveLength(2);
    d = applyIcsImport(d, p1.add, () => `ev_${n++}`, now);
    expect(validateAppData(d).ok).toBe(true);
    const p2 = planIcsImport(d, parseIcs(ics));
    expect(p2.add).toHaveLength(0);
    expect(p2.duplicates).toBe(2);
  });
  it("書き出し（.ics）→ 読み込みの往復で、名前・日付・時刻が保たれる", () => {
    const d = emptyData(now);
    d.events = [{ id: "e", title: "往復", startDate: "2026-12-03", endDate: "2026-12-03", allDay: false, startTime: "09:30", endTime: "10:15", note: "", createdAt: now, updatedAt: now }];
    const text = buildIcs(buildCalendarItems(d, "2026-11-25"), now);
    const back = parseIcs(text).events.find((e) => e.title === "往復");
    expect(back).toMatchObject({ startDate: "2026-12-03", startTime: "09:30", endTime: "10:15", allDay: false });
  });
});

describe("終わりの時刻がない予定", () => {
  it("DURATION があれば足す（10:00＋1時間30分＝11:30）。なければ開始と同じ時刻。日をまたぐ長さは次の日に", () => {
    const r = parseIcs(wrap(["BEGIN:VEVENT", "SUMMARY:a", "DTSTART;TZID=Asia/Tokyo:20261201T100000", "DURATION:PT1H30M", "END:VEVENT", "BEGIN:VEVENT", "SUMMARY:b", "DTSTART;TZID=Asia/Tokyo:20261201T100000", "END:VEVENT", "BEGIN:VEVENT", "SUMMARY:c", "DTSTART;TZID=Asia/Tokyo:20261201T230000", "DURATION:PT2H", "END:VEVENT"].join("\r\n")));
    expect(r.events.map((e) => [e.endDate, e.endTime])).toEqual([["2026-12-01", "11:30"], ["2026-12-01", "10:00"], ["2026-12-02", "01:00"]]);
    const d = emptyData(now);
    expect(validateAppData(applyIcsImport(d, r.events, (() => { let i = 0; return () => `e${i++}`; })(), now)).ok).toBe(true);
  });
});
