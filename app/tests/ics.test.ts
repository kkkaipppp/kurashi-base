import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIcs, icsEscape, icsFold } from "@/lib/ics";
import type { CalendarItem } from "@/lib/calendarExport";

const item = (p: Partial<CalendarItem>): CalendarItem => ({
  title: "予定", startDate: "2026-11-25", endDate: "2026-11-25", allDay: false, startTime: "10:00", endTime: "11:00", location: "", notes: "", ...p,
});

describe("カレンダー用ファイル（.ics、Web 版。2026-11-24 平尾さん：Web 版でできる限界まで）", () => {
  it("時刻つき・終日（何日も続く予定は最後の日の次の日まで）", () => {
    const s = buildIcs(
      [item({ title: "歯医者" }), item({ title: "札幌出張", startDate: "2026-12-01", endDate: "2026-12-03", allDay: true, startTime: "", endTime: "" })],
      "2026-11-24T03:00:00.000Z",
    );
    expect(s).toContain("DTSTART:20261125T100000\r\nDTEND:20261125T110000\r\nSUMMARY:歯医者");
    expect(s).toContain("DTSTART;VALUE=DATE:20261201\r\nDTEND;VALUE=DATE:20261204");
    expect(s).toContain("DTSTAMP:20261124T030000Z");
    expect(s.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(s.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
  it("何日も続く時刻つきの予定（22:00〜翌02:00）は、終わりの時刻をそのまま使う", () => {
    const s = buildIcs([item({ startDate: "2026-11-25", endDate: "2026-11-26", startTime: "22:00", endTime: "02:00" })], "2026-11-24T00:00:00.000Z");
    expect(s).toContain("DTSTART:20261125T220000\r\nDTEND:20261126T020000");
  });
  it("同じ予定は同じ UID。メモは書かない", () => {
    const a = buildIcs([item({ title: "ジム" })], "2026-11-24T00:00:00.000Z");
    const b = buildIcs([item({ title: "ジム" })], "2026-11-25T00:00:00.000Z");
    const uid = (s: string) => s.match(/UID:(.*)\r\n/)?.[1];
    expect(uid(a)).toBe(uid(b));
    expect(buildIcs([item({ notes: "ひみつ" })], "2026-11-24T00:00:00.000Z")).not.toContain("ひみつ");
  });
  it("カンマ・セミコロン・改行を書き換え、長い行は75バイトで折る", () => {
    expect(icsEscape("a,b;c\nd\\e")).toBe("a\\,b\\;c\\nd\\\\e");
    const folded = icsFold(`SUMMARY:${"あ".repeat(40)}`);
    for (const line of folded.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${"あ".repeat(40)}`);
  });
  it("設定の画面に「カレンダー用ファイルを書き出す」がある", () => {
    const s = readFileSync(join(__dirname, "..", "src", "app", "settings", "page.tsx"), "utf8");
    expect(s).toContain("カレンダー用ファイルを書き出す");
    expect(s).toContain("buildIcs(buildCalendarItems(data, today)");
  });
});
