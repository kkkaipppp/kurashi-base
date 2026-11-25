import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { errorText, loadSyncStatus, NATIVE_SYNC_KEY, recordSync, syncProblems } from "@/lib/nativeSyncStatus";
import { wipeAllAppData } from "@/lib/storage";

// o11 A07 点検 中-1〜中-3：iPhone アプリへの受け渡しの失敗を黙って捨てない・記録0件で写しを消さない・書き込み中の変更を取りこぼさない
const kv = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
};
const src = fs.readFileSync(path.resolve(import.meta.dirname, "../src/components/WidgetSync.tsx"), "utf8");

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
    expect(src).toMatch(/if \(failed === 0\) lastReminders\.current = /);
  });
});

describe("記録0件のとき・書き込み中の変更（中-1・中-2）", () => {
  it("記録が0件のときは、カレンダーと通知を入れ替えない（もう書いた写しを消さない）", () => {
    const cal = src.slice(src.indexOf("// iPhone のカレンダーへの反映"), src.indexOf("// 通知（"));
    const rem = src.slice(src.indexOf("// 通知（"), src.indexOf("// 自動バックアップと"));
    expect(cal).toMatch(/if \(!hasRecords\(data\)\) return;/);
    expect(rem).toMatch(/if \(!hasRecords\(data\)\) return;/);
    expect(src).toContain("if (records === 0) return;"); // 自動バックアップは前から
  });
  it("カレンダーへの書き込み中に記録が変わったら、終わったあとにもう一度見る。前面に戻ったときも見る", () => {
    expect(src).toMatch(/if \(calendarBusy\.current\) \{\s*calendarAgain\.current = true;/);
    expect(src).toMatch(/if \(calendarAgain\.current\) \{\s*calendarAgain\.current = false;\s*setResync/);
    const onVis = src.slice(src.indexOf("const onVisibility"), src.indexOf("document.addEventListener(\"visibilitychange\", onVisibility)"));
    expect(onVis).toContain("setResync((n) => n + 1)");
  });
});
