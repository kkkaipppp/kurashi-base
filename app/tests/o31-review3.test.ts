import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { LocalStorageRepository } from "@/lib/repository";
import { StoreCore } from "@/lib/storeCore";
import { goalSaveError, toNumber } from "@/lib/goalCond";
import { STUDY_LOG_EXISTS, addStudyLogOnce, bookPlan, studyLogExistsError } from "@/lib/studyCore";
import type { KV } from "@/lib/storage";
import type { AppData, StudyLog, StudySubject } from "@/lib/types";

// o31 3回目の点検（kurashi-qa、13756a7）の低-1〜4 と「足りない試験」1・3・4・7。期待値は手で決めた
const ts = "2026-11-27T00:00:00.000Z";
const memKV = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } } as KV;
};
const subj = (o: Partial<StudySubject> = {}): StudySubject => ({ id: "s1", name: "簿記", examDate: "", targetHours: null, archived: false, createdAt: ts, updatedAt: ts, ...o });

describe("保存の列の中の確かめ（足りない試験 1）：check が文字を返したら保存しない", () => {
  it("同じタイマーの記録を2つの画面で保存しても1件。2回目は理由を返し、中身は1回目のまま", async () => {
    const core = new StoreCore(new LocalStorageRepository(memKV()));
    await core.reload();
    expect((await core.commit((d) => ({ ...d, studySubjects: [subj()] }))).ok).toBe(true);
    const log: StudyLog = { id: "sl_timer_op1", subjectId: "s1", date: "2026-11-27", minutes: 30, note: "", createdAt: ts, updatedAt: ts };
    const save = (l: StudyLog) => core.commit((d) => addStudyLogOnce(d, l), { check: (cur) => studyLogExistsError(cur, l.id) });
    expect((await save(log)).ok).toBe(true);
    const r2 = await save({ ...log, minutes: 99 });
    expect(r2).toMatchObject({ ok: false, error: STUDY_LOG_EXISTS });
    expect(core.snapshot.data!.studyLogs).toHaveLength(1);
    expect(core.snapshot.data!.studyLogs[0].minutes).toBe(30);
  });
  it("目標がほかの画面で変わっていたら保存しない（保存したものは残る）", async () => {
    const core = new StoreCore(new LocalStorageRepository(memKV()));
    await core.reload();
    const goal = { ...(emptyData(ts).goals[0] ?? {}), id: "g1", title: "貯金", kind: "check", target: null, current: 0, unit: "", deadline: "", note: "", done: false, createdAt: ts, updatedAt: ts } as unknown as AppData["goals"][number];
    expect((await core.commit((d) => ({ ...d, goals: [goal] }))).ok).toBe(true);
    // 別の画面が先に保存した
    expect((await core.commit((d) => ({ ...d, goals: d.goals.map((g) => ({ ...g, note: "向こう", updatedAt: "t2" })) }))).ok).toBe(true);
    const r = await core.commit((d) => ({ ...d, goals: d.goals.map((g) => ({ ...g, note: "こちら", updatedAt: "t3" })) }), { check: (cur) => goalSaveError(cur.goals, "g1", ts, "") });
    expect(r.ok).toBe(false);
    expect(core.snapshot.data!.goals[0].note).toBe("向こう");
  });
});

describe("数の読み取り（低-1・足りない試験 3）", () => {
  it("今まで読めた形（+5・.5・5.）は読む", () => {
    expect([toNumber("+5"), toNumber(".5"), toNumber("5."), toNumber("＋５"), toNumber("-.5")]).toEqual([5, 0.5, 5, 5, -0.5]);
  });
  it("崩れたカンマ・記号だけは読まない", () => {
    expect([toNumber("1234,567"), toNumber("1,2,3"), toNumber("."), toNumber("-"), toNumber("+")]).toEqual([null, null, null, null, null]);
  });
});

describe("開いたあとに消えた親（低-2）", () => {
  it("保存のときに親がもう無ければ保存しない", () => {
    expect(goalSaveError([{ id: "a", updatedAt: "t1" }], "a", "t1", "gone")).toContain("削除");
    expect(goalSaveError([{ id: "a", updatedAt: "t1" }, { id: "b", updatedAt: "t1" }], "a", "t1", "b")).toBeNull();
  });
});

describe("資格の編集で、フォームにない項目（復習の日数・受験の回）を残す（足りない試験 4）", () => {
  it("編集の保存と同じ作り（keep に残して置き換える）で、reviewDays と exams が残る", async () => {
    const core = new StoreCore(new LocalStorageRepository(memKV()));
    await core.reload();
    const before = subj({ reviewDays: 7, exams: [{ id: "e1", date: "2026-06-01", result: "failed" }] });
    expect((await core.commit((d) => ({ ...d, studySubjects: [before] }))).ok).toBe(true);
    // app/src/app/study/page.tsx の SubjectForm の保存と同じ分け方
    const { id: _id, name: _n, examDate: _e, targetHours: _t, archived: _a, catalogId: _c, books: _b, createdAt: _ca, updatedAt: _ua, ...keep } = before; // eslint-disable-line @typescript-eslint/no-unused-vars
    const item = { ...keep, name: "簿記2級", examDate: "2026-12-27", targetHours: 200, archived: false };
    expect((await core.commit((d) => ({ ...d, studySubjects: d.studySubjects.map((x) => (x.id === "s1" ? { ...item, id: x.id, createdAt: x.createdAt, updatedAt: "t2" } : x)) }))).ok).toBe(true);
    const after = core.snapshot.data!.studySubjects[0];
    expect(after.name).toBe("簿記2級");
    expect(after.reviewDays).toBe(7);
    expect(after.exams).toHaveLength(1);
  });
});

describe("教材の計画の崩れた入力（足りない試験 7）", () => {
  it("形の崩れた試験日は数を出さない・負の復習の日数は0として扱う", () => {
    expect(bookPlan(100, 0, "2026-11-27", "2026-13-40")).toEqual({ kind: "past" });
    expect(bookPlan(100, 0, "2026-11-27", "あした")).toEqual({ kind: "past" });
    expect(bookPlan(100, 0, "2026-11-27", "2026-12-07", -5)).toEqual({ kind: "ok", perDay: 10, workDays: 10, remaining: 100 });
  });
});
