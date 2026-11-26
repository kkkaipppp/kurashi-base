import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { bookPlan } from "@/lib/studyCore";
import { validateAppData } from "@/lib/schema";
import { emptyData } from "@/lib/defaults";
import type { StudySubject } from "@/lib/types";

// o31 F017 教材ごとの計画。期待値は手で計算した（今日は勉強できる日に数え、試験日は数えない）
describe("o31 教材の1日の量（bookPlan）", () => {
  const today = "2026-11-27";
  it("300ページ中100ページ済み・試験まで30日 → 残り200を30日で 1日7ページ（6.67を切り上げ）", () => {
    expect(bookPlan(300, 100, today, "2026-12-27")).toEqual({ kind: "ok", perDay: 7, workDays: 30, remaining: 200 });
  });
  it("復習の10日を除く → 200を20日で 1日10ページ", () => {
    expect(bookPlan(300, 100, today, "2026-12-27", 10)).toEqual({ kind: "ok", perDay: 10, workDays: 20, remaining: 200 });
  });
  it("年をまたぐ・うるう年：2027-12-31 → 2028-03-01 は 61日（2月29日を含む）", () => {
    expect(bookPlan(61, 0, "2027-12-31", "2028-03-01")).toEqual({ kind: "ok", perDay: 1, workDays: 61, remaining: 61 });
  });
  it("試験の前日なら1日で残り全部", () => {
    expect(bookPlan(50, 20, today, "2026-11-28")).toEqual({ kind: "ok", perDay: 30, workDays: 1, remaining: 30 });
  });
  it("復習の日で勉強の日が残らないときは数を出さない", () => {
    expect(bookPlan(300, 100, today, "2026-12-27", 30)).toEqual({ kind: "noDays", days: 30 });
  });
  it("数を出せないときは理由を返す（作り話の数を出さない）", () => {
    expect(bookPlan(null, 0, today, "2026-12-27")).toEqual({ kind: "noTotal" });
    expect(bookPlan(0, 0, today, "2026-12-27")).toEqual({ kind: "noTotal" });
    expect(bookPlan(100, 100, today, "2026-12-27")).toEqual({ kind: "done" });
    expect(bookPlan(100, 120, today, "2026-12-27")).toEqual({ kind: "done" });
    expect(bookPlan(100, 0, today, "")).toEqual({ kind: "noExam" });
    expect(bookPlan(100, 0, today, today)).toEqual({ kind: "past" });
    expect(bookPlan(100, 0, today, "2026-11-01")).toEqual({ kind: "past" });
  });
});

describe("o31 復習の日数のデータ（任意・足すだけ）", () => {
  const ts = "2026-11-27T00:00:00.000Z";
  const subj = (o: Partial<StudySubject>): StudySubject => ({ id: "s1", name: "簿記2級", examDate: "", targetHours: null, archived: false, createdAt: ts, updatedAt: ts, ...o });
  const ok = (o: Partial<StudySubject>) => validateAppData({ ...emptyData(ts), studySubjects: [subj(o)] }).ok;
  it("無い・0・365 は読める。負・366・小数・文字は受け付けない", () => {
    expect(ok({})).toBe(true);
    expect(ok({ reviewDays: 0 })).toBe(true);
    expect(ok({ reviewDays: 365 })).toBe(true);
    expect(ok({ reviewDays: -1 })).toBe(false);
    expect(ok({ reviewDays: 366 })).toBe(false);
    expect(ok({ reviewDays: 1.5 })).toBe(false);
    expect(ok({ reviewDays: "7" as never })).toBe(false);
  });
  it("資格の編集で復習の日数を消さない（フォームにない項目は残す作り）", () => {
    const src = readFileSync("src/app/study/page.tsx", "utf8");
    const line = src.split("\n").find((l) => l.includes("...keep }"))!;
    expect(line).toBeTruthy();
    expect(line).not.toContain("reviewDays");
  });
  it("計画は自分用の本棚の中だけ（公開版の組み立てに入らない）", () => {
    const page = readFileSync("src/app/study/page.tsx", "utf8");
    expect(page).toMatch(/const StudyShelf = SHELF \? dynamic\(/);
    expect(readFileSync("src/components/StudyShelf.tsx", "utf8")).toContain("PlanLine");
  });
});
