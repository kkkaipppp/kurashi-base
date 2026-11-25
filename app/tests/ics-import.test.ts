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

describe("独立点検（f738ca1）の指摘への試験", () => {
  const ev = (lines: string[]) => wrap(["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n"));
  const valid = (r: ReturnType<typeof parseIcs>) => {
    let i = 0;
    return validateAppData(applyIcsImport(emptyData(now), r.events, () => `e${i++}`, now)).ok;
  };
  it("高-1：範囲外になる日付（2200年の終わり＋長さ・とても大きい長さ）は作らない。どの入力でも保存の検査に通る", () => {
    const r = parseIcs(wrap([
      ["BEGIN:VEVENT", "SUMMARY:a", "DTSTART;TZID=Asia/Tokyo:22001231T230000", "DURATION:PT2H", "END:VEVENT"].join("\r\n"),
      ["BEGIN:VEVENT", "SUMMARY:b", "DTSTART;TZID=Asia/Tokyo:20261201T100000", "DURATION:PT99999999H", "END:VEVENT"].join("\r\n"),
      ["BEGIN:VEVENT", "SUMMARY:ok", "DTSTART;VALUE=DATE:20261201", "END:VEVENT"].join("\r\n"),
    ].join("\r\n")));
    expect(r.skipped).toBe(2);
    expect(r.events.map((e) => e.title)).toEqual(["ok"]);
    expect(valid(r)).toBe(true);
  });
  it("高-1：保存の境界でも、検査を通らないデータは保存しない", async () => {
    const { LocalStorageRepository } = await import("@/lib/repository");
    const bad = emptyData(now);
    bad.events = [{ id: "x", title: "t", startDate: "2201-01-01", endDate: "2201-01-01", allDay: true, startTime: "", endTime: "", note: "", createdAt: now, updatedAt: now }];
    const r = await new LocalStorageRepository().save(bad, null);
    expect(r.ok).toBe(false);
  });
  it("中-1：例外の日（EXDATE）・足した日（RDATE）・その回だけ動かした回（RECURRENCE-ID）がある繰り返しは、最初の回だけ＋メモ。動かした回は別の予定として足す。取り消された予定（CANCELLED）は写さない", () => {
    const r = parseIcs(wrap([
      ["BEGIN:VEVENT", "UID:w1", "SUMMARY:週例", "DTSTART;TZID=Asia/Tokyo:20261201T100000", "RRULE:FREQ=WEEKLY", "EXDATE;TZID=Asia/Tokyo:20261208T100000", "END:VEVENT"].join("\r\n"),
      ["BEGIN:VEVENT", "UID:w2", "SUMMARY:動いた週例", "DTSTART;TZID=Asia/Tokyo:20261202T100000", "RRULE:FREQ=WEEKLY", "END:VEVENT"].join("\r\n"),
      ["BEGIN:VEVENT", "UID:w2", "RECURRENCE-ID;TZID=Asia/Tokyo:20261209T100000", "SUMMARY:動いた週例", "DTSTART;TZID=Asia/Tokyo:20261210T150000", "END:VEVENT"].join("\r\n"),
      ["BEGIN:VEVENT", "SUMMARY:中止", "STATUS:CANCELLED", "DTSTART;VALUE=DATE:20261205", "END:VEVENT"].join("\r\n"),
    ].join("\r\n")));
    expect(r.events.map((e) => [e.title, e.startDate, e.repeat ?? ""])).toEqual([["週例", "2026-12-01", ""], ["動いた週例", "2026-12-02", ""], ["動いた週例", "2026-12-10", ""]]);
    expect(r.repeatDropped).toBe(2);
    expect(r.cancelled).toBe(1);
    expect(r.events[2].note).toContain("その回だけ動かした");
  });
  it("中-2：写せない形の繰り返し（毎月の曜日・毎年の月の指定・毎週の別の曜日・29〜31日の毎月・2/29の毎年）は写さない。開始日の曜日と同じ BYDAY は写す", () => {
    const rules: [string, string, boolean][] = [
      ["20261207", "FREQ=MONTHLY;BYDAY=MO", false],
      ["20260310", "FREQ=YEARLY;BYMONTH=3,6", false],
      ["20261207", "FREQ=WEEKLY;BYDAY=WE", false], // 12/7 は月曜
      ["20261207", "FREQ=WEEKLY;BYDAY=MO", true],
      ["20261231", "FREQ=MONTHLY", false],
      ["20280229", "FREQ=YEARLY", false],
      ["20261215", "FREQ=MONTHLY;BYMONTHDAY=15", true],
    ];
    for (const [d, rule, ok] of rules) {
      const r = parseIcs(ev(["SUMMARY:x", `DTSTART;VALUE=DATE:${d}`, `RRULE:${rule}`]));
      expect([rule, !!r.events[0].repeat]).toEqual([rule, ok]);
    }
  });
  it("中-3：長さ（P1D・P1DT2H・P1W・PT1H0M0S）を読む。終日の長さ P3D は3日間", () => {
    const at = (d: string) => parseIcs(ev(["SUMMARY:x", "DTSTART;TZID=Asia/Tokyo:20261201T100000", `DURATION:${d}`])).events[0];
    expect([at("P1D").endDate, at("P1D").endTime]).toEqual(["2026-12-02", "10:00"]);
    expect([at("P1DT2H").endDate, at("P1DT2H").endTime]).toEqual(["2026-12-02", "12:00"]);
    expect(at("P1W").endDate).toBe("2026-12-08");
    expect(at("PT1H0M0S").endTime).toBe("11:00");
    const allDay = parseIcs(ev(["SUMMARY:x", "DTSTART;VALUE=DATE:20261201", "DURATION:P3D"])).events[0];
    expect([allDay.startDate, allDay.endDate]).toEqual(["2026-12-01", "2026-12-03"]);
  });
  it("中-4：5000件を超えた分は数えて知らせる", () => {
    const many = Array.from({ length: 5003 }, (_, i) => ["BEGIN:VEVENT", `SUMMARY:e${i}`, "DTSTART;VALUE=DATE:20261201", "END:VEVENT"].join("\r\n")).join("\r\n");
    const r = parseIcs(wrap(many));
    expect(r.events).toHaveLength(5000);
    expect(r.overLimit).toBe(3);
  });
  it("低：終わり＜始まり（同じ日）は開始と同じ時刻に。UNTIL が開始より前は写さない。UNTIL の世界時は日本時間の日付に", () => {
    const a = parseIcs(ev(["SUMMARY:x", "DTSTART;TZID=Asia/Tokyo:20261201T100000", "DTEND;TZID=Asia/Tokyo:20261201T090000"])).events[0];
    expect(a.endTime).toBe("10:00");
    const b = parseIcs(ev(["SUMMARY:x", "DTSTART;VALUE=DATE:20261201", "RRULE:FREQ=WEEKLY;UNTIL=20261101"]));
    expect(b.events[0].repeat).toBeUndefined();
    const c = parseIcs(ev(["SUMMARY:x", "DTSTART;TZID=Asia/Tokyo:20261201T080000", "RRULE:FREQ=WEEKLY;UNTIL=20261221T230000Z"])).events[0];
    expect(c.repeatUntil).toBe("2026-12-22"); // 世界時 12/21 23:00 ＝ 日本時間 12/22 8:00
  });
  it("低：文字のエスケープ（\\n は改行にしない）・引用符の中のコロン・UTC の TZID・長いメモ（500字まで）・絵文字を割らない", () => {
    const r = parseIcs(ev([
      "SUMMARY:" + "😀".repeat(150),
      'DESCRIPTION;ALTREP="http://x.example/a":本文 C:\\new',
      "DTSTART;TZID=UTC:20261201T150000",
    ]));
    const e = r.events[0];
    expect(Array.from(e.title)).toHaveLength(100);
    expect(e.title.endsWith("😀")).toBe(true);
    expect(e.note).toBe("本文 C:\new");
    expect([e.startDate, e.startTime]).toEqual(["2026-12-02", "00:00"]);
    const long = parseIcs(ev(["SUMMARY:x", "DTSTART;VALUE=DATE:20261201", "DESCRIPTION:" + "あ".repeat(2000), "RRULE:FREQ=WEEKLY;INTERVAL=2"])).events[0];
    expect(Array.from(long.note).length).toBeLessThanOrEqual(500);
    expect(long.note).toContain("繰り返しは写していません");
  });
  it("低：ファイルの中で重なった予定は、アプリにある重複と分けて数える", () => {
    const r = parseIcs(wrap([1, 2].map(() => ["BEGIN:VEVENT", "SUMMARY:同じ", "DTSTART;VALUE=DATE:20261201", "END:VEVENT"].join("\r\n")).join("\r\n")));
    const p = planIcsImport(emptyData(now), r);
    expect([p.add.length, p.duplicates, p.inFileDuplicates]).toEqual([1, 0, 1]);
  });
  it("低：最後の予定が途中で切れたファイルは、数えて知らせる", () => {
    const r = parseIcs(["BEGIN:VCALENDAR", "BEGIN:VEVENT", "SUMMARY:途中", "DTSTART;VALUE=DATE:20261201"].join("\r\n"));
    expect(r.skipped).toBe(1);
  });
});

describe("再点検（28fc339）の低への試験", () => {
  it("低-a：繰り返しの決まりがなく、足した日（RDATE）だけの予定は、最初の回だけ＋メモ＋件数", () => {
    const r = parseIcs(wrap(["BEGIN:VEVENT", "SUMMARY:足した日", "DTSTART;VALUE=DATE:20261201", "RDATE;VALUE=DATE:20261215", "END:VEVENT"].join("\r\n")));
    expect(r.repeatDropped).toBe(1);
    expect(r.events[0].note).toContain("繰り返しは写していません");
    expect(r.events[0].note.includes("\n")).toBe(false); // 改行の文字そのもの（バックスラッシュ＋n）を入れない
  });
});
