import type { AppData, StudyLog } from "./types";

/**
 * 勉強の計算（o31 P3：F012・F015・F016・F017、o30 D020〜D024）。画面から切り離した純粋な関数だけを置く。
 * - 時間（分）と範囲（ページなど）は別に数える（o31 C016：ページ位置と学習済範囲を区別）
 * - 正答率は 正解の合計 ÷ 問題の合計（回ごとの率を平均しない。o31 X003）。問題が0なら「算出できない」＝ null
 * - タイマーは開始時刻・休止の区間を持ち、終わるときに時間を確かめる（壁時計の差だけで決めない。o31 C015）
 * - 計画は目安で、合格の保証ではない（C017）。足りないときは不足の量を出し、決めるのは本人
 */

export type RangeUnit = "page" | "problem" | "chapter" | "lecture";

export const UNIT_LABEL: Record<RangeUnit, string> = { page: "ページ", problem: "問", chapter: "章", lecture: "講義" };

export interface StudyRange {
  from: number;
  to: number;
  unit: RangeUnit;
}

/** 範囲の検査：1以上の整数で from ≦ to。上限は 100,000（ページ数などとして十分大きい） */
export function validRange(r: StudyRange | undefined | null): boolean {
  if (!r) return false;
  return Number.isInteger(r.from) && Number.isInteger(r.to) && r.from >= 1 && r.to >= r.from && r.to <= 100_000 && r.unit in UNIT_LABEL;
}

/** 範囲の和集合の大きさ（同じ所を2回やっても1回分）。例 181〜196 を2回 → 16 */
export function coveredUnits(ranges: { from: number; to: number }[]): number {
  const rs = ranges.filter((r) => Number.isInteger(r.from) && Number.isInteger(r.to) && r.to >= r.from).sort((a, b) => a.from - b.from);
  let total = 0;
  let curFrom = -1;
  let curTo = -2;
  for (const r of rs) {
    if (r.from > curTo + 1) {
      if (curTo >= curFrom && curFrom >= 0) total += curTo - curFrom + 1;
      curFrom = r.from;
      curTo = r.to;
    } else curTo = Math.max(curTo, r.to);
  }
  if (curFrom >= 0) total += curTo - curFrom + 1;
  return total;
}

/** 新しく進んだ量：これまでの範囲に入っていない分だけ（復習は新しい読了に数えない。o30 D020） */
export function newUnits(before: { from: number; to: number }[], add: { from: number; to: number }): number {
  return coveredUnits([...before, add]) - coveredUnits(before);
}

export interface Score {
  questions?: number;
  correct?: number;
}

/** 問題数と正解数の検査（0 ≦ 正解 ≦ 問題、整数） */
export function validScore(s: Score): boolean {
  if (s.questions === undefined && s.correct === undefined) return true;
  const q = s.questions;
  const c = s.correct;
  return Number.isInteger(q) && Number.isInteger(c) && (q as number) >= 0 && (c as number) >= 0 && (c as number) <= (q as number) && (q as number) <= 100_000;
}

/** 正答率（%、小数1桁）。問題が0・記録なしは null（0% と出さない） */
export function accuracy(logs: Score[]): { correct: number; questions: number; pct: number | null } {
  let q = 0;
  let c = 0;
  for (const l of logs) {
    if (!validScore(l) || l.questions === undefined) continue;
    q += l.questions;
    c += l.correct ?? 0;
  }
  return { correct: c, questions: q, pct: q === 0 ? null : Math.round((c / q) * 1000) / 10 };
}

/* ---------------- タイマー ---------------- */

export interface TimerState {
  /** 操作の ID（終わらせるときに作る記録の ID の元。二重に終わらせても記録は1件） */
  opId: string;
  subjectId: string;
  bookId?: string;
  startedAt: string; // ISO
  /** 休止を始めた時刻。動いているときは null */
  pausedAt: string | null;
  /** これまでの休止の合計（ミリ秒） */
  pausedMs: number;
}

export const TIMER_KEY = "kurashi-base:study-timer";
/** 1回の記録の上限（記録の形と同じ 1,440 分）。これを超える・時計が戻っているときは、本人に確かめる */
export const TIMER_MAX_MIN = 1440;

export function startTimer(opId: string, subjectId: string, now: Date, bookId?: string): TimerState {
  return { opId, subjectId, ...(bookId ? { bookId } : {}), startedAt: now.toISOString(), pausedAt: null, pausedMs: 0 };
}

export function pauseTimer(t: TimerState, now: Date): TimerState {
  return t.pausedAt ? t : { ...t, pausedAt: now.toISOString() };
}

export function resumeTimer(t: TimerState, now: Date): TimerState {
  if (!t.pausedAt) return t;
  const add = Math.max(0, now.getTime() - Date.parse(t.pausedAt));
  return { ...t, pausedAt: null, pausedMs: t.pausedMs + add };
}

/**
 * 今までの勉強時間（分、切り捨て）と、確かめが要るか。
 * - 時計が開始より前に戻っている → 0分・確かめが要る（端末の時刻が変わった）
 * - 上限を超える → 確かめが要る（終わらせ忘れの可能性）
 */
export function timerMinutes(t: TimerState, now: Date): { minutes: number; needsConfirm: null | "clock" | "tooLong" } {
  const start = Date.parse(t.startedAt);
  const end = t.pausedAt ? Date.parse(t.pausedAt) : now.getTime();
  if (Number.isNaN(start) || end < start || now.getTime() < start) return { minutes: 0, needsConfirm: "clock" };
  const ms = Math.max(0, end - start - t.pausedMs);
  const minutes = Math.floor(ms / 60000);
  return { minutes, needsConfirm: minutes > TIMER_MAX_MIN ? "tooLong" : null };
}

export function parseTimer(raw: string | null | undefined): TimerState | null {
  try {
    const t = raw ? (JSON.parse(raw) as TimerState) : null;
    if (!t || typeof t.opId !== "string" || typeof t.subjectId !== "string" || Number.isNaN(Date.parse(t.startedAt)) || typeof t.pausedMs !== "number") return null;
    if (t.pausedAt !== null && Number.isNaN(Date.parse(t.pausedAt))) return null;
    return t;
  } catch {
    return null;
  }
}

/** タイマーから作る記録の ID（同じ操作なら同じ ID。保存し直しても2件にならない） */
export function timerLogId(t: TimerState): string {
  return `sl_timer_${t.opId}`;
}

/* ---------------- 計画 ---------------- */

/**
 * 残りの量を、使える日に割る（1日あたり、切り上げ）。復習の日は進める日から除く。
 * 例 残り200ページ・使える30日・復習10日 → 20日で割って 10ページ/日。進める日が0以下なら null（調整が要る）
 */
export function perDayPlan(remaining: number, availableDays: number, reviewDays = 0): { perDay: number | null; workDays: number } {
  const workDays = availableDays - reviewDays;
  if (remaining <= 0) return { perDay: 0, workDays: Math.max(0, workDays) };
  if (workDays <= 0) return { perDay: null, workDays: 0 };
  return { perDay: Math.ceil(remaining / workDays), workDays };
}

/** 時間の計画：必要な時間と、週ごとに使える時間から、足りない時間を出す。例 60時間・8週・週6時間 → 48時間で12時間足りない */
export function hoursShortage(needHours: number, weeks: number, hoursPerWeek: number): { capacity: number; shortage: number } {
  const capacity = Math.max(0, weeks) * Math.max(0, hoursPerWeek);
  return { capacity, shortage: Math.max(0, needHours - capacity) };
}

/* ---------------- 受験の回 ---------------- */

export type ExamResult = "planned" | "passed" | "failed" | "absent";

export const EXAM_RESULT_LABEL: Record<ExamResult, string> = { planned: "受験予定", passed: "合格", failed: "不合格", absent: "欠席" };

export interface ExamAttempt {
  id: string;
  date: string; // "" = 未定
  result: ExamResult;
  /** 点数と満点（任意）。満点が違う回どうしは平均しない */
  score?: number | null;
  maxScore?: number | null;
  note?: string;
}

export function validAttempt(a: ExamAttempt): boolean {
  if (!(a.result in EXAM_RESULT_LABEL)) return false;
  const s = a.score ?? null;
  const m = a.maxScore ?? null;
  if (s !== null && (!Number.isFinite(s) || s < 0)) return false;
  if (m !== null && (!Number.isFinite(m) || m <= 0)) return false;
  if (s !== null && m !== null && s > m) return false;
  return true;
}

/** 合格は、本人が結果を「合格」にしたときだけ（勉強時間などで自動に合格にしない。o31 C012・X12） */
export function isPassed(attempts: ExamAttempt[] | undefined): boolean {
  return (attempts ?? []).some((a) => a.result === "passed");
}

/* ---------------- 記録を足す（同じ ID は1回だけ） ---------------- */


/** 勉強の記録を足す。同じ ID がもうあれば何もしない（タイマーの終了を2回押しても1件。o30 T021） */
export function addStudyLogOnce(d: AppData, log: StudyLog): AppData {
  if (d.studyLogs.some((l) => l.id === log.id)) return d;
  return { ...d, studyLogs: [...d.studyLogs, log] };
}

/** 前回の続き：いちばん新しい記録（日付→作った時刻）。終了した資格・消えた資格は除く */
export function lastStudy(d: AppData): StudyLog | null {
  const open = new Set(d.studySubjects.filter((s) => !s.archived).map((s) => s.id));
  let best: StudyLog | null = null;
  for (const l of d.studyLogs) {
    if (!open.has(l.subjectId)) continue;
    if (!best || l.date > best.date || (l.date === best.date && l.createdAt > best.createdAt)) best = l;
  }
  return best;
}

/** その日の勉強時間の合計（分）。記録ごとに1回だけ数える */
export function minutesOn(d: AppData, day: string): number {
  return d.studyLogs.filter((l) => l.date === day).reduce((s, l) => s + l.minutes, 0);
}
