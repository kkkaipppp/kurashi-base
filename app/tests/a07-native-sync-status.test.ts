import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { errorText, loadSyncStatus, NATIVE_SYNC_KEY, recordSync, SYNC_EVENT, syncProblems } from "@/lib/nativeSyncStatus";
import { wipeAllAppData } from "@/lib/storage";
import { emptyData } from "@/lib/defaults";
import { buildReminders, DEFAULT_REMINDERS } from "@/lib/reminders";
import { calendarOutcome, hasRecords, reminderOutcome, shouldSyncCalendar, shouldSyncReminders } from "@/lib/nativeSyncPlan";

// o11 A07 点検 中-1〜中-3：iPhone アプリへの受け渡しの失敗を黙って捨てない・記録0件で写しを消さない・書き込み中の変更を取りこぼさない
const kv = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
};
/** コメントを除いた中身（コメントに同じ書き方が残っていても、素通りしない。点検2回目 足りない試験2） */
const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const src = stripComments(fs.readFileSync(path.resolve(import.meta.dirname, "../src/components/WidgetSync.tsx"), "utf8"));

describe("受け渡しの結果を残す（中-3）", () => {
  it("失敗を残し、設定に出す一覧になる。成功すれば消える", () => {
    const s = kv();
    recordSync("reminders", false, "通知が許可されていません", s, "2026-11-25T10:00:00.000Z");
    recordSync("calendar", true, undefined, s, "2026-11-25T10:00:00.000Z");
    expect(syncProblems(loadSyncStatus(s))).toEqual([{ kind: "reminders", label: "通知", at: "2026-11-25T10:00:00.000Z", detail: "通知が許可されていません" }]);
    recordSync("reminders", true, undefined, s, "2026-11-25T11:00:00.000Z");
    expect(syncProblems(loadSyncStatus(s))).toEqual([]);
  });
  it("成功が続くときは書き込まない（毎回の保存を増やさない）。壊れた値は空として読む", () => {
    const s = kv();
    recordSync("summary", true, undefined, s, "2026-11-25T10:00:00.000Z");
    const before = s.m.get(NATIVE_SYNC_KEY);
    recordSync("summary", true, undefined, s, "2026-11-25T12:00:00.000Z");
    expect(s.m.get(NATIVE_SYNC_KEY)).toBe(before);
    s.m.set(NATIVE_SYNC_KEY, "{壊れ");
    expect(loadSyncStatus(s)).toEqual({});
    s.m.set(NATIVE_SYNC_KEY, JSON.stringify({ calendar: { at: 1, ok: "x" }, other: { at: "a", ok: false } }));
    expect(loadSyncStatus(s)).toEqual({});
  });
  it("保存できない端末でも、例外を出さない", () => {
    const bad = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    expect(() => recordSync("backup", false, "x", bad)).not.toThrow();
    expect(loadSyncStatus(bad)).toEqual({});
    expect(() => recordSync("backup", false, "x", null)).not.toThrow();
  });
  it("失敗の説明は短く（120文字まで）。Error でなくても読める", () => {
    expect(errorText(new Error("カレンダーへのアクセスが許可されていません"))).toBe("カレンダーへのアクセスが許可されていません");
    expect(errorText("文字")).toBe("文字");
    expect(errorText({})).toBe("うまく渡せませんでした");
    expect(errorText(new Error("あ".repeat(500)))).toHaveLength(120);
  });
  it("「すべて削除」で、この記録も消える（kurashi-base: のキー）", () => {
    const s = kv();
    recordSync("backup", false, "x", s);
    expect(wipeAllAppData(null, s).ok).toBe(true);
    expect(s.m.has(NATIVE_SYNC_KEY)).toBe(false);
  });
  it("4つの受け渡しは、どれも結果を残す（.catch(() => {}) で黙って捨てない）", () => {
    for (const k of ["summary", "calendar", "reminders", "backup"]) expect(src).toContain(`recordSync("${k}", false`);
    expect(src).not.toMatch(/\.catch\(\(\) => \{\s*(\/\/[^\n]*\s*)*\}\)/);
    expect(src).not.toMatch(/\.catch\(\(\) => \{\}\)/);
  });
  it("通知を一部しか登録できなかったときは、次の機会にもう一度入れ替える（登録したことにしない）", () => {
    expect(src).toMatch(/const o = reminderOutcome\(r, settings\.on, list\.length\);\s*if \(o\.done\) lastReminders\.current = /);
    expect(src).toMatch(/recordSync\("reminders", o\.ok, o\.detail\)/);
  });
});

describe("記録0件のとき・書き込み中の変更（中-1・中-2）", () => {
  it("画面の部品は、決め方（lib/nativeSyncPlan.ts）を使う：カレンダーは記録0件で書き直さない・通知はいつも入れ替える", () => {
    expect(src).toMatch(/if \(!shouldSyncCalendar\(data\)\) return;\s*const t = setTimeout\(\(\) => \{\s*const today = todayStr\(\);\s*const json = JSON\.stringify\(buildCalendarItems/);
    expect(src).toMatch(/if \(!shouldSyncReminders\(\)\) return;\s*const t = setTimeout\(\(\) => \{\s*const settings = loadReminderSettings/);
    expect(src).toContain("if (records === 0) return;"); // 自動バックアップは前から
  });
  it("決め方：記録0件ならカレンダーは書き直さない（カテゴリだけは0件）・通知は入れ替える（0件なら全部消える）", () => {
    const d = emptyData("2026-11-25T00:00:00.000Z");
    expect(hasRecords(d)).toBe(false);
    expect(shouldSyncCalendar(d)).toBe(false);
    expect(shouldSyncReminders()).toBe(true);
    expect(buildReminders(d, "2026-11-25T09:00:00", { ...DEFAULT_REMINDERS, on: true })).toEqual([]);
    d.tasks.push({ id: "k", title: "t", due: "", done: false, note: "", createdAt: "x", updatedAt: "x" });
    expect(hasRecords(d)).toBe(true);
    expect(shouldSyncCalendar(d)).toBe(true);
  });
  it("決め方：通知の結果（拒否・一部の失敗・オフ）", () => {
    expect(reminderOutcome({ denied: true }, true)).toEqual({ done: false, ok: false, detail: expect.stringContaining("許可されていません") });
    expect(reminderOutcome({ failed: 2 }, true)).toEqual({ done: false, ok: false, detail: "2件の通知を登録できませんでした" });
    expect(reminderOutcome({}, true)).toEqual({ done: true, ok: true });
    // オフのときは、拒否されていても警告を残さない（点検2回目 低-1）
    expect(reminderOutcome({ denied: true }, false)).toEqual({ done: true, ok: true });
    expect(calendarOutcome({ skipped: 3 })).toEqual({ ok: false, detail: "日時を読めなかった予定が3件あり、書いていません" });
    expect(calendarOutcome({})).toEqual({ ok: true });
  });
  it("カレンダーへの書き込み中に記録が変わったら、終わったあとにもう一度見る。前面に戻ったときも見る", () => {
    expect(src).toMatch(/if \(calendarBusy\.current\) \{\s*calendarAgain\.current = true;/);
    expect(src).toMatch(/if \(calendarAgain\.current\) \{\s*calendarAgain\.current = false;\s*setResync/);
    const onVis = src.slice(src.indexOf("const onVisibility"), src.indexOf("document.addEventListener(\"visibilitychange\", onVisibility)"));
    expect(onVis).toContain("setResync((n) => n + 1)");
  });
});

describe("o11 A07 点検3回目の足りない試験", () => {
  const card = stripComments(fs.readFileSync(path.resolve(import.meta.dirname, "../src/components/NativeStatusCard.tsx"), "utf8"));
  const plugin = stripComments(fs.readFileSync(path.resolve(import.meta.dirname, "../ios/App/App/WidgetBridgePlugin.swift"), "utf8"));
  it("低-4：登録するものが無いとき（記録0件など）は、拒否されていても警告を残さない。1件以上なら残す", () => {
    expect(reminderOutcome({ denied: true }, true, 0)).toEqual({ done: true, ok: true });
    expect(reminderOutcome({ denied: true }, true, 1).ok).toBe(false);
    expect(src).toMatch(/const list = buildReminders\(/);
  });
  it("低-7：結果が変わったら合図を出し、設定の「iPhone の連携」はそれを受けて出し直す。同じ成功が続くときは出さない", () => {
    const g = globalThis as unknown as { window?: EventTarget };
    const had = g.window;
    g.window = new EventTarget();
    try {
      let n = 0;
      g.window.addEventListener(SYNC_EVENT, () => n++);
      const s = kv();
      recordSync("calendar", false, "x", s);
      expect(n).toBe(1);
      recordSync("calendar", true, undefined, s);
      expect(n).toBe(2);
      recordSync("calendar", true, undefined, s);
      expect(n).toBe(2);
    } finally {
      g.window = had;
    }
    expect(card).toMatch(/window\.addEventListener\(SYNC_EVENT, on\)/);
    expect(card).toMatch(/const on = \(\) => setProblems\(syncProblems\(loadSyncStatus\(\)\)\)/);
  });
  it("低-2：記録0件のときは「反映し直す」で書き直さないと知らせ、「入れた予定を消す」を出す。記録は読むだけ", () => {
    expect(card).toMatch(/const empty = !hasRecords\(data\);/);
    expect(card).toMatch(/if \(empty\) \{\s*ui\.toast\("記録がないので、カレンダーは書き直しません/);
    expect(card).toMatch(/\{\(!calOn \|\| empty\) && \(/);
    expect(card).not.toMatch(/\buseStore\b/);
  });
  it("2回目 低-3（Swift）：読めなかった予定があったときは、書いた印を保存せず、次も書き直す", () => {
    expect(plugin).toMatch(/if skipped == 0 \{ UserDefaults\.standard\.set\(stamp, forKey: Self\.lastSyncKey\) \} else \{ UserDefaults\.standard\.removeObject\(forKey: Self\.lastSyncKey\) \}/);
    expect(plugin).toMatch(/call\.resolve\(\["written": written, "skipped": skipped\]\)/);
  });
});
