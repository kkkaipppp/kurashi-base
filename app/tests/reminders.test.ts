import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { DEFAULT_REMINDERS, MAX_REMINDERS, applyQuiet, buildReminders, cleanReminderSettings } from "@/lib/reminders";
import type { AppData, CalendarEvent } from "@/lib/types";

// NEXT v21 X13：通知は項目に従属。冪等な ID・取り消し（入れ替え）・静穏時間・秘匿
const now = "2026-11-25T09:00:00";
const S = { ...DEFAULT_REMINDERS, on: true };
const ev = (o: Partial<CalendarEvent> & { id: string }): CalendarEvent => ({ title: "歯医者", startDate: "2026-11-26", endDate: "2026-11-26", allDay: false, startTime: "10:00", endTime: "11:00", note: "", createdAt: now, updatedAt: now, ...o });
const mk = (f: (d: AppData) => void): AppData => {
  const d = emptyData(now);
  f(d);
  return d;
};

describe("通知の予定", () => {
  it("オフのときは何も作らない", () => {
    expect(buildReminders(mk((d) => (d.events = [ev({ id: "a" })])), now, { ...S, on: false })).toEqual([]);
  });
  it("予定は開始の N 分前。終日・完了済みの回・過ぎた時刻は作らない", () => {
    const d = mk((x) => {
      x.events = [
        ev({ id: "a" }),
        ev({ id: "all", allDay: true, startTime: "", endTime: "" }),
        ev({ id: "done", startDate: "2026-11-27", endDate: "2026-11-27", doneDates: ["2026-11-27"] }),
        ev({ id: "past", startDate: "2026-11-25", endDate: "2026-11-25", startTime: "09:10" }),
      ];
    });
    const r = buildReminders(d, now, S);
    expect(r.map((x) => [x.id, x.at])).toEqual([["kb|ev|a|2026-11-26|lead", "2026-11-26T09:30"]]);
    expect(r[0].title).toBe("歯医者");
  });
  it("固定費は支払日の朝（一部だけ払ったときは残りの額）。タスクは期限の日の朝。契約は更新日の7日前の朝", () => {
    const d = mk((x) => {
      x.recurring = [{ id: "r", name: "ジム", amount: 5000, cycle: "monthly", anchorDay: 28, nextDueDate: "2026-11-28", categoryId: "exp-5", paymentMethod: "", active: true, partialPaid: { due: "2026-11-28", paid: 3000 }, createdAt: now, updatedAt: now }];
      x.tasks = [
        { id: "t", title: "提出", due: "2026-11-27", done: false, note: "", createdAt: now, updatedAt: now },
        { id: "t2", title: "済み", due: "2026-11-27", done: true, note: "", createdAt: now, updatedAt: now },
      ];
      x.contracts = [{ id: "c", name: "保険", provider: "", amount: null, cycle: "yearly", renewalDate: "2026-12-02", status: "active", note: "", createdAt: now, updatedAt: now }];
    });
    const r = buildReminders(d, now, S);
    // 契約の更新日（12/2）の7日前は 11/25 の朝だが、いまは 9:00 で朝の時刻（8:00）を過ぎているので作らない
    expect(r.map((x) => [x.id, x.at])).toEqual([
      ["kb|task|t|2026-11-27|due", "2026-11-27T08:00"],
      ["kb|rc|r|2026-11-28|due", "2026-11-28T08:00"],
    ]);
    expect(r[1].body).toContain("¥2,000");
    const early = buildReminders(d, "2026-11-25T06:00:00", S);
    expect(early.map((x) => x.id)).toContain("kb|ct|c|2026-12-02|renew");
  });
  it("同じ入力なら、同じ ID・同じ並び（登録し直しても増えない）。項目を直す・消す・完了にすると、次の入れ替えで消える", () => {
    const d = mk((x) => (x.events = [ev({ id: "a" }), ev({ id: "b", startTime: "15:00", endTime: "16:00" })]));
    const a = buildReminders(d, now, S);
    expect(buildReminders(d, now, S)).toEqual(a);
    expect(new Set(a.map((x) => x.id)).size).toBe(a.length);
    const edited = mk((x) => (x.events = [ev({ id: "a", startTime: "11:00", endTime: "12:00" })]));
    const b = buildReminders(edited, now, S);
    expect(b.map((x) => x.id)).toEqual(["kb|ev|a|2026-11-26|lead"]); // b は消えた
    expect(b[0].at).toBe("2026-11-26T10:30");
    const done = mk((x) => (x.events = [ev({ id: "a", doneDates: ["2026-11-26"] })]));
    expect(buildReminders(done, now, S)).toEqual([]);
  });
  it("静穏時間（22:00〜07:00）に入る時刻は、静穏時間の終わりにずらす（なくさない）", () => {
    expect(applyQuiet(23 * 60, "22:00", "07:00")).toBe(7 * 60);
    expect(applyQuiet(3 * 60, "22:00", "07:00")).toBe(7 * 60);
    expect(applyQuiet(7 * 60, "22:00", "07:00")).toBe(7 * 60);
    expect(applyQuiet(21 * 60 + 59, "22:00", "07:00")).toBe(21 * 60 + 59);
    expect(applyQuiet(12 * 60, "09:00", "09:00")).toBe(12 * 60); // 同じ時刻＝静穏時間なし
    const d = mk((x) => (x.events = [ev({ id: "early", startTime: "07:20", endTime: "08:00" })]));
    expect(buildReminders(d, now, S)[0].at).toBe("2026-11-26T07:00"); // 6:50 → 7:00
  });
  it("内容を隠す設定では、題名・本文に予定の名前・金額を出さない", () => {
    const d = mk((x) => {
      x.events = [ev({ id: "a", title: "内緒の予定", location: "ひみつの場所" })];
      x.recurring = [{ id: "r", name: "秘密の固定費", amount: 12345, cycle: "monthly", anchorDay: 26, nextDueDate: "2026-11-26", categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now }];
    });
    const r = buildReminders(d, now, { ...S, hideDetail: true });
    expect(r.length).toBe(2);
    for (const x of r) expect(x.title + x.body).not.toMatch(/内緒|ひみつ|秘密|12,345/);
    expect(r[0].title).toBe("くらしベース");
  });
  it("近いものから最大50件。2週間より先は作らない", () => {
    const d = mk((x) => {
      x.events = Array.from({ length: 80 }, (_, i) => {
        const day = `2026-11-${String(26 + (i % 3)).padStart(2, "0")}`;
        return ev({ id: `e${i}`, startDate: day, endDate: day, startTime: "12:00", endTime: "13:00" });
      });
    });
    expect(buildReminders(d, now, S)).toHaveLength(MAX_REMINDERS);
    const far = mk((x) => (x.events = [ev({ id: "far", startDate: "2027-01-10", endDate: "2027-01-10" })]));
    expect(buildReminders(far, now, S)).toEqual([]);
  });
  it("設定の保存値は、壊れていても安全な値に戻る", () => {
    expect(cleanReminderSettings(null)).toEqual(DEFAULT_REMINDERS);
    expect(cleanReminderSettings({ on: true, eventLead: 999, quietFrom: "25:00", morning: "07:30", contractDays: 14, hideDetail: true })).toMatchObject({ on: true, eventLead: 30, quietFrom: "22:00", morning: "07:30", contractDays: 14, hideDetail: true });
    expect(cleanReminderSettings({ on: "yes" }).on).toBe(false);
  });
});

import { shiftQuiet } from "@/lib/reminders";
describe("静穏時間のずらし（点検役の指摘：日付ごとに正しく。開始より後に鳴らさない）", () => {
  it("夜側（22:00 以降）は翌日の 07:00、朝側（07:00 より前）はその日の 07:00。分が負なら前の日にさかのぼってから判断", () => {
    expect(shiftQuiet("2026-11-26", 23 * 60 + 30, "22:00", "07:00")).toEqual({ date: "2026-11-27", min: 420 });
    expect(shiftQuiet("2026-11-26", 3 * 60, "22:00", "07:00")).toEqual({ date: "2026-11-26", min: 420 });
    expect(shiftQuiet("2026-11-26", 12 * 60, "22:00", "07:00")).toEqual({ date: "2026-11-26", min: 720 });
    expect(shiftQuiet("2026-11-26", -20, "22:00", "07:00")).toEqual({ date: "2026-11-26", min: 420 }); // 前日 23:40 → 夜側 → 当日 07:00
    expect(shiftQuiet("2026-11-26", 8 * 60, "09:00", "07:00")).toEqual({ date: "2026-11-26", min: 480 }); // 夜側の始まりが 09:00 の設定でも日付を壊さない（朝側ではない）
    expect(shiftQuiet("2026-11-26", 13 * 60, "12:00", "14:00")).toEqual({ date: "2026-11-26", min: 840 }); // 日をまたがない静穏時間
  });
  it("ずらした結果が予定の開始以降になるときは登録しない（23:30 開始・6:30 開始・0:10 開始）。7:20 開始は6:50 → 7:00 で登録", () => {
    const at = (start: string) => buildReminders(mk((x) => (x.events = [ev({ id: "q", startTime: start, endTime: "23:59" })])), now, S).map((r) => r.at);
    expect(at("23:30")).toEqual([]); // 23:00 は静穏時間 → 翌日の朝になり、予定の後
    expect(at("06:30")).toEqual([]); // 6:00 → 7:00 は予定の後
    expect(at("00:10")).toEqual([]); // 前日 23:40 → 当日 7:00 は予定の後
    expect(at("07:20")).toEqual(["2026-11-26T07:00"]);
    expect(at("21:00")).toEqual(["2026-11-26T20:30"]); // 静穏時間の外は、そのまま
  });
  it("朝の通知は、朝の時刻が静穏時間に入る設定でも、静穏時間の終わりにずらす（なくさない）", () => {
    const d = mk((x) => (x.tasks = [{ id: "t", title: "提出", due: "2026-11-27", done: false, note: "", createdAt: now, updatedAt: now }]));
    expect(buildReminders(d, now, { ...S, morning: "06:30" })[0].at).toBe("2026-11-27T07:00");
  });
});
