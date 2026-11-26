import { describe, expect, it } from "vitest";
import {
  accuracy,
  coveredUnits,
  hoursShortage,
  isPassed,
  newUnits,
  parseTimer,
  pauseTimer,
  perDayPlan,
  resumeTimer,
  startTimer,
  timerLogId,
  timerMinutes,
  validAttempt,
  validRange,
  validScore,
} from "@/lib/studyCore";

// o31 P3 の受入（T012・T015・T016・T017、o30 T020・T021・T022・T024、X003）。期待値は o31 05・o30 05 から手で作った
const at = (min: number) => new Date(Date.UTC(2026, 10, 27, 0, min, 0));

describe("o31 T015 勉強タイマー", () => {
  it("45分経過のうち10分休止 → 35分", () => {
    let t = startTimer("op1", "s1", at(0));
    t = pauseTimer(t, at(20));
    t = resumeTimer(t, at(30));
    expect(timerMinutes(t, at(45))).toEqual({ minutes: 35, needsConfirm: null });
  });
  it("休止中は時間が進まない。二重の休止・二重の再開は変えない", () => {
    let t = startTimer("op1", "s1", at(0));
    t = pauseTimer(t, at(10));
    expect(pauseTimer(t, at(15))).toBe(t);
    expect(timerMinutes(t, at(50)).minutes).toBe(10);
    const r = resumeTimer(t, at(20));
    expect(resumeTimer(r, at(25))).toBe(r);
  });
  it("端末の時刻が開始より前に戻ったら0分・確かめが要る。上限を超えたら確かめが要る", () => {
    const t = startTimer("op1", "s1", at(60));
    expect(timerMinutes(t, at(30))).toEqual({ minutes: 0, needsConfirm: "clock" });
    expect(timerMinutes(t, new Date(at(60).getTime() + 25 * 3600_000)).needsConfirm).toBe("tooLong");
  });
  it("終わらせる記録の ID は操作ごとに1つ（再送しても1件。o30 T021）。壊れた保存は読まない", () => {
    const t = startTimer("op1", "s1", at(0));
    expect(timerLogId(t)).toBe(timerLogId({ ...t }));
    expect(parseTimer(JSON.stringify(t))).toEqual(t);
    expect(parseTimer("{x")).toBeNull();
    expect(parseTimer(JSON.stringify({ ...t, startedAt: "x" }))).toBeNull();
  });
});

describe("o31 T016 学習の範囲と正答率", () => {
  it("181〜196 を2回 → 新しい範囲は16ページ（時間は別に両方数える）", () => {
    expect(coveredUnits([{ from: 181, to: 196 }, { from: 181, to: 196 }])).toBe(16);
    expect(newUnits([{ from: 181, to: 196 }], { from: 181, to: 196 })).toBe(0);
  });
  it("ページ 180→186 で 6ページ進む。前に戻る復習は新しく数えない（o30 T020）", () => {
    // 181〜186 を読んだ＝6ページ
    expect(newUnits([{ from: 1, to: 180 }], { from: 181, to: 186 })).toBe(6);
    expect(newUnits([{ from: 1, to: 186 }], { from: 100, to: 120 })).toBe(0);
    expect(coveredUnits([{ from: 1, to: 5 }, { from: 10, to: 12 }, { from: 6, to: 9 }])).toBe(12);
  });
  it("正答率は 正解の合計 ÷ 問題の合計。1/2 と 9/10 → 10/12（83.3%）、単純平均（70%）にしない（X003）", () => {
    expect(accuracy([{ questions: 2, correct: 1 }, { questions: 10, correct: 9 }])).toEqual({ correct: 10, questions: 12, pct: 83.3 });
    expect(accuracy([{ questions: 20, correct: 14 }]).pct).toBe(70);
  });
  it("問題が0・記録なしは「算出できない」（null。0% にしない）。正解が問題より多いのは受け付けない", () => {
    expect(accuracy([]).pct).toBeNull();
    expect(accuracy([{ questions: 0, correct: 0 }]).pct).toBeNull();
    expect(validScore({ questions: 5, correct: 6 })).toBe(false);
    expect(validScore({ questions: 5, correct: 5 })).toBe(true);
    expect(validScore({})).toBe(true);
  });
  it("範囲の検査", () => {
    expect(validRange({ from: 181, to: 196, unit: "page" })).toBe(true);
    expect(validRange({ from: 10, to: 9, unit: "page" })).toBe(false);
    expect(validRange({ from: 0, to: 9, unit: "page" })).toBe(false);
  });
});

describe("o31 T017・o30 T024 学習計画（目安。決めるのは本人）", () => {
  it("残り200ページ・使える30日・復習10日 → 10ページ/日", () => {
    expect(perDayPlan(200, 30, 10)).toEqual({ perDay: 10, workDays: 20 });
  });
  it("進める日が0以下 → 調整が要る（null）。残り0 → 0", () => {
    expect(perDayPlan(200, 10, 10).perDay).toBeNull();
    expect(perDayPlan(0, 10).perDay).toBe(0);
  });
  it("60時間・8週・週6時間 → 48時間で12時間足りない", () => {
    expect(hoursShortage(60, 8, 6)).toEqual({ capacity: 48, shortage: 12 });
  });
});

describe("o31 T012 受験の回（学習の記録と別）", () => {
  it("不合格のあとに再受験を足しても、前の結果は残る。合格は結果を入れたときだけ", () => {
    const a = [{ id: "a1", date: "2026-06-01", result: "failed" as const, score: 55, maxScore: 100 }];
    const b = [...a, { id: "a2", date: "2026-12-01", result: "planned" as const }];
    expect(b[0]).toEqual(a[0]);
    expect(isPassed(b)).toBe(false);
    expect(isPassed([...b.slice(0, 1), { ...b[1], result: "passed" as const }])).toBe(true);
  });
  it("点数は満点以下。満点は0より大きい", () => {
    expect(validAttempt({ id: "x", date: "", result: "failed", score: 120, maxScore: 100 })).toBe(false);
    expect(validAttempt({ id: "x", date: "", result: "failed", score: 80, maxScore: 100 })).toBe(true);
    expect(validAttempt({ id: "x", date: "", result: "planned", maxScore: 0 })).toBe(false);
  });
});
