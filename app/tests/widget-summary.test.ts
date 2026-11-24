import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { buildWidgetSummary } from "@/lib/widgetSummary";
import type { CalendarEvent, Transaction } from "@/lib/types";

const now = "2026-11-23T00:00:00.000Z";
const tx = (p: Partial<Transaction>): Transaction => ({
  id: "t", type: "expense", date: "2026-11-23", amount: 1000, currency: "JPY", categoryId: "exp-1",
  merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now, ...p,
});
const ev = (p: Partial<CalendarEvent>): CalendarEvent => ({
  id: "e", title: "予定", startDate: "2026-11-23", endDate: "2026-11-23", allDay: false, startTime: "10:00", endTime: "11:00",
  note: "", createdAt: now, updatedAt: now, ...p,
});

describe("ウィジェットに渡す要約", () => {
  it("今日の予定は3件まで、時刻順。何日も続く予定の途中の日は「終日」", () => {
    const d = emptyData(now);
    d.events = [
      ev({ id: "a", title: "夜", startTime: "19:00", endTime: "20:00" }),
      ev({ id: "b", title: "朝", startTime: "08:00", endTime: "09:00" }),
      ev({ id: "c", title: "出張", startDate: "2026-11-22", endDate: "2026-11-24", allDay: true, startTime: "", endTime: "" }),
      ev({ id: "d", title: "昼", startTime: "12:00", endTime: "13:00" }),
      ev({ id: "x", title: "明日", startDate: "2026-11-24", endDate: "2026-11-24" }),
    ];
    const s = buildWidgetSummary(d, "2026-11-23", now);
    expect(s.events).toEqual([
      { title: "出張", time: "終日" },
      { title: "朝", time: "08:00" },
      { title: "昼", time: "12:00" },
    ]);
    expect(s.moreEvents).toBe(1);
  });
  it("明日の予定も渡す（日付が変わってアプリを開く前のウィジェット用。レビュー o1 の P12）", () => {
    const d = emptyData(now);
    d.events = [ev({ id: "t", title: "明日の歯医者", startDate: "2026-11-24", endDate: "2026-11-24", startTime: "09:00", endTime: "10:00" }), ev({ id: "x", title: "今日" })];
    const s = buildWidgetSummary(d, "2026-11-23", now);
    expect(s.tomorrow).toEqual({ date: "2026-11-24", events: [{ title: "明日の歯医者", time: "09:00" }] });
  });
  it("毎週くり返す予定は、2回目からも時刻で出す（終日にしない）", () => {
    const d = emptyData(now);
    d.events = [ev({ id: "w", title: "ジム", startDate: "2026-11-16", endDate: "2026-11-16", startTime: "20:00", endTime: "21:00", repeat: "weekly" })];
    expect(buildWidgetSummary(d, "2026-11-23", now).events).toEqual([{ title: "ジム", time: "20:00" }]);
  });
  it("今月の支出・収入と、予算の残り（予算がなければ null）", () => {
    const d = emptyData(now);
    d.transactions = [
      tx({ id: "1", amount: 3000 }),
      tx({ id: "2", amount: 2000, date: "2026-11-01" }),
      tx({ id: "3", amount: 9999, date: "2026-10-31" }),
      tx({ id: "4", type: "income", amount: 250000, categoryId: "inc-1" }),
    ];
    const a = buildWidgetSummary(d, "2026-11-23", now);
    expect([a.monthExpense, a.monthIncome, a.budget, a.remaining]).toEqual([5000, 250000, null, null]);
    d.budget.monthly = 100000;
    const b = buildWidgetSummary(d, "2026-11-23", now);
    expect(b.remaining).toBe(95000);
  });
  it("記録の中身（店名・メモ）は渡さない", () => {
    const d = emptyData(now);
    d.transactions = [tx({ merchant: "秘密の店", note: "メモ" })];
    const s = JSON.stringify(buildWidgetSummary(d, "2026-11-23", now));
    expect(s).not.toContain("秘密の店");
    expect(s).not.toContain("メモ");
  });
});

describe("自動バックアップ（iPhone アプリ）", () => {
  it("ファイル名の日付は YYYYMMDD、残すのは14日分。Web 版では動かない作り", async () => {
    const { autoBackupDay, AUTO_BACKUP_KEEP_DAYS } = await import("@/lib/nativeBridge");
    expect(autoBackupDay("2026-11-23")).toBe("20261123");
    expect(AUTO_BACKUP_KEEP_DAYS).toBe(14);
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const s = readFileSync(join(__dirname, "..", "src", "components", "WidgetSync.tsx"), "utf8");
    expect(s.match(/if \(!Capacitor\.isNativePlatform\(\)\) return;/g)?.length).toBe(3); // 要約・カレンダー・バックアップ
    expect(s).toContain("buildBackup(latest.current");
    expect(s).toContain("if (records === 0) return;");
    const { backupRecordCount } = await import("@/lib/nativeBridge");
    expect(backupRecordCount({ categories: 13, transactions: 0, nisa: 0 })).toBe(0);
    expect(backupRecordCount({ categories: 13, transactions: 934, nisa: 1293 })).toBe(2227);
  });
});
