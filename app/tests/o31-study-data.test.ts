import { describe, expect, it } from "vitest";
import { validateAppData } from "@/lib/schema";
import { emptyData } from "@/lib/defaults";
import { buildBackup, parseBackup } from "@/lib/backup";
import type { AppData, StudyLog, StudySubject } from "@/lib/types";

// o31 P3 のデータ（足すだけの任意の項目）：古いデータはそのまま読める・新しい項目は形を確かめる・バックアップの往復で失わない（o31 04・D002・T024）
const ts = "2026-11-27T00:00:00.000Z";
const subj = (o: Partial<StudySubject> = {}): StudySubject => ({ id: "s1", name: "簿記2級", examDate: "", targetHours: null, archived: false, createdAt: ts, updatedAt: ts, ...o });
const log = (o: Partial<StudyLog> = {}): StudyLog => ({ id: "l1", subjectId: "s1", date: "2026-11-27", minutes: 30, note: "", createdAt: ts, updatedAt: ts, ...o });
const withStudy = (s: StudySubject[], l: StudyLog[]): AppData => ({ ...emptyData(ts), studySubjects: s, studyLogs: l });

describe("o31 勉強のデータの形（足すだけ）", () => {
  it("古い形（教材 id/title/url/note・記録の時間とメモだけ）は、そのまま読める", () => {
    const d = withStudy([subj({ books: [{ id: "b1", title: "テキスト", url: "", note: "" }] })], [log()]);
    expect(validateAppData(d).ok).toBe(true);
  });
  it("新しい項目（範囲・問題数・タイマーの時刻・復習・教材・受験の回・教材の状態と版）を読める", () => {
    const d = withStudy(
      [
        subj({
          books: [{ id: "b1", title: "テキスト", url: "", note: "", status: "studying", edition: "2026年版", total: 320, unit: "page", alsoSubjectIds: ["s2"], txId: "tx1" }],
          exams: [
            { id: "e1", date: "2026-06-01", result: "failed", score: 55, maxScore: 100 },
            { id: "e2", date: "", result: "planned" },
          ],
        }),
      ],
      [log({ bookId: "b1", startedAt: ts, endedAt: "2026-11-27T00:30:00.000Z", range: { from: 181, to: 196, unit: "page" }, questions: 20, correct: 14, review: true })],
    );
    expect(validateAppData(d)).toMatchObject({ ok: true });
  });
  it("壊れた値は受け付けない（正解が問題より多い・片方だけ・範囲が逆・満点より高い点・知らない状態）", () => {
    const bad: AppData[] = [
      withStudy([subj()], [log({ questions: 5, correct: 6 })]),
      withStudy([subj()], [log({ correct: 3 })]),
      withStudy([subj()], [log({ range: { from: 10, to: 9, unit: "page" } })]),
      withStudy([subj({ exams: [{ id: "e", date: "", result: "failed", score: 120, maxScore: 100 }] })], []),
      withStudy([subj({ books: [{ id: "b", title: "x", url: "", note: "", status: "lost" as never }] })], []),
      withStudy([subj()], [log({ startedAt: "きのう" })]),
    ];
    for (const d of bad) expect(validateAppData(d).ok).toBe(false);
  });
  it("バックアップを書き出して読み直しても、新しい項目は同じ（ID・時間・範囲・問題数）", () => {
    const d = withStudy([subj({ exams: [{ id: "e1", date: "2026-06-01", result: "failed", score: 55, maxScore: 100 }] })], [log({ range: { from: 1, to: 16, unit: "page" }, questions: 10, correct: 9 })]);
    const back = parseBackup(JSON.stringify(buildBackup(d)));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.preview.data.studyLogs).toEqual(d.studyLogs);
    expect(back.preview.data.studySubjects).toEqual(d.studySubjects);
  });
});
