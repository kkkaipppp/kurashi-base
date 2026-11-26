import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { goalSaveError, judge, liveParentId, toNumber, type GoalCondition } from "@/lib/goalCond";
import { addStudyLogOnce, bookUnit, liveBookId, studyLogExistsError, subjectExistsError } from "@/lib/studyCore";
import { emptyData } from "@/lib/defaults";
import type { StudyLog, StudySubject } from "@/lib/types";

// o31 再点検（kurashi-qa）・反証（kurashi-redteam）2026-11-27 の指摘の直し。期待値は手で決めた
const c = (o: Partial<GoalCondition>): GoalCondition => ({ id: "c", label: "x", unit: "円", op: "range", target: 40000, targetMax: 50000, actual: 45000, ...o });

describe("範囲の条件：期限の前は、上限を超えたときだけ満たさない（再点検 M-1）", () => {
  it("期限の前", () => {
    expect(judge(c({ actual: 45000 }), { periodOpen: true })).toBe("unknown");
    expect(judge(c({ actual: 30000 }), { periodOpen: true })).toBe("unknown");
    expect(judge(c({ actual: 50001 }), { periodOpen: true })).toBe("unmet");
    expect(judge(c({ actual: 50000 }), { periodOpen: true })).toBe("unknown");
  });
  it("期限のあと（境目の値は満たす）", () => {
    expect(judge(c({ actual: 40000 }))).toBe("met");
    expect(judge(c({ actual: 50000 }))).toBe("met");
    expect(judge(c({ actual: 39999 }))).toBe("unmet");
    expect(judge(c({ actual: 50001 }))).toBe("unmet");
    expect(judge(c({ targetMax: undefined }))).toBe("unknown");
  });
});

describe("数の読み取り（再点検 L-4）", () => {
  it("数の形だけを受け付ける", () => {
    expect([toNumber("0x10"), toNumber("1e3"), toNumber("1,2,3"), toNumber("０ｘ１０"), toNumber("12a"), toNumber("--1")]).toEqual([null, null, null, null, null, null]);
  });
  it("全角・3桁ごとのカンマ・小数・いろいろなマイナス", () => {
    expect([toNumber("１，２３４"), toNumber("1,234,567"), toNumber("-1.5"), toNumber("−5"), toNumber("－３")]).toEqual([1234, 1234567, -1.5, -5, -3]);
  });
});

describe("消えた参照を残さない（再点検 L-2・L-3）と単位（M-2・M-3）", () => {
  const books = [{ id: "b1", unit: "problem" as const }, { id: "b2" }];
  it("消えた教材は選ばない", () => {
    expect(liveBookId(books, "b1")).toBe("b1");
    expect(liveBookId(books, "gone")).toBe("");
    expect(liveBookId(books, undefined)).toBe("");
  });
  it("教材の単位（未設定はページ。記録の並び順で変えない）", () => {
    expect(bookUnit(books, "b1")).toBe("problem");
    expect(bookUnit(books, "b2")).toBe("page");
    expect(bookUnit(books, "")).toBe("page");
  });
  it("消えた親・自分自身は「なし」", () => {
    const goals = [{ id: "g1" }, { id: "g2" }];
    expect(liveParentId(goals, "g1", "g2")).toBe("g2");
    expect(liveParentId(goals, "g1", "gone")).toBe("");
    expect(liveParentId(goals, "g1", "g1")).toBe("");
    expect(liveParentId(goals, "g1", undefined)).toBe("");
  });
});

describe("目標の条件の保存（反証 2）：最新のデータで確かめる", () => {
  const goals = [
    { id: "a", updatedAt: "t1" },
    { id: "b", updatedAt: "t1", parentId: "a" },
  ];
  it("変わっていなければ保存してよい", () => {
    expect(goalSaveError(goals, "a", "t1", "")).toBeNull();
  });
  it("消えていたら保存しない", () => {
    expect(goalSaveError(goals, "zz", "t1", "")).toContain("削除");
  });
  it("ほかのタブで変わっていたら保存しない（向こうの変更を消さない）", () => {
    expect(goalSaveError(goals, "a", "t0", "")).toContain("変わっていた");
  });
  it("最新のデータで輪になる親は拒む（b→a がもうあるので a→b は輪）", () => {
    expect(goalSaveError(goals, "a", "t1", "b")).toContain("輪");
  });
});

describe("タイマーの記録は1件・二重のときに「記録しました」と言わない（反証 3）", () => {
  const ts = "2026-11-27T00:00:00.000Z";
  const log: StudyLog = { id: "sl_timer_op1", subjectId: "s1", date: "2026-11-27", minutes: 30, note: "", createdAt: ts, updatedAt: ts };
  const subj: StudySubject = { id: "s1", name: "簿記", examDate: "", targetHours: null, archived: false, createdAt: ts, updatedAt: ts };
  const d0 = { ...emptyData(ts), studySubjects: [subj] };
  it("同じ ID を2回足しても1件。2回目は前の中身のまま", () => {
    const d1 = addStudyLogOnce(d0, log);
    const d2 = addStudyLogOnce(d1, { ...log, minutes: 99 });
    expect(d2.studyLogs).toHaveLength(1);
    expect(d2.studyLogs[0].minutes).toBe(30);
  });
  it("もう記録があれば、保存を止める理由を返す", () => {
    expect(studyLogExistsError(d0, log.id)).toBeNull();
    expect(studyLogExistsError(addStudyLogOnce(d0, log), log.id)).toContain("すでに記録");
  });
  it("資格が消えていたら保存しない", () => {
    expect(subjectExistsError(d0, "s1")).toBeNull();
    expect(subjectExistsError({ studySubjects: [] }, "s1")).toContain("削除");
  });
  it("画面は保存の列の中で確かめる（commit の check に渡す）", () => {
    expect(readFileSync("src/components/StudyTimer.tsx", "utf8")).toMatch(/check: \(cur\) => subjectExistsError\(cur, timer\.subjectId\) \?\? studyLogExistsError\(cur, log\.id\)/);
    expect(readFileSync("src/components/GoalConditions.tsx", "utf8")).toMatch(/check: \(cur\) => goalSaveError\(cur\.goals, goal\.id, openedAt, parentId\)/);
    expect(readFileSync("src/components/StudyShelf.tsx", "utf8")).toMatch(/check: \(cur\) => subjectExistsError\(cur, s\.id\)/);
  });
});

describe("そのほか", () => {
  it("メモも選んだ日で始める（再点検 L-1）", () => {
    expect(readFileSync("src/app/notes/page.tsx", "utf8")).toContain('newDateField: "date"');
  });
  it("カレンダーの週・一覧は自分用だけで遅れて読む（反証 4）", () => {
    const src = readFileSync("src/app/calendar/page.tsx", "utf8");
    expect(src).not.toMatch(/import \{[^}]*\bWeekView\b[^}]*\} from "@\/components\/CalendarViews"/);
    expect(src).toMatch(/const WeekView = PERSONAL_BUILD \? dynamic\(/);
  });
});
