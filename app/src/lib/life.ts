import { addDays, daysBetween } from "./date";
import type { Goal, StudyLog, StudySubject } from "./types";

// 勉強・目標の計算

export interface StudyStats {
  totalMinutes: number;
  weekMinutes: number; // 今日を含む直近7日
  todayMinutes: number;
  daysToExam: number | null; // 試験日まで（当日 0、過ぎたら負）
  targetPct: number | null; // 目標時間に対する割合（0..100）
}

export function studyStats(subject: StudySubject, logs: StudyLog[], today: string): StudyStats {
  const mine = logs.filter((l) => l.subjectId === subject.id);
  const weekFrom = addDays(today, -6);
  const totalMinutes = mine.reduce((s, l) => s + l.minutes, 0);
  return {
    totalMinutes,
    weekMinutes: mine.filter((l) => l.date >= weekFrom && l.date <= today).reduce((s, l) => s + l.minutes, 0),
    todayMinutes: mine.filter((l) => l.date === today).reduce((s, l) => s + l.minutes, 0),
    daysToExam: subject.examDate ? daysBetween(today, subject.examDate) : null,
    targetPct: subject.targetHours ? Math.min(100, Math.round((totalMinutes / (subject.targetHours * 60)) * 100)) : null,
  };
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

/** 目標の進み具合（0..100）。数値目標は 目標値に対する現在値、チェック目標は 達成=100 */
export function goalProgress(g: Goal): number {
  if (g.done) return 100;
  if (g.kind === "check") return 0;
  if (!g.target || g.target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((g.current / g.target) * 100)));
}

export function daysLeft(deadline: string, today: string): number | null {
  return deadline ? daysBetween(today, deadline) : null;
}

export function dueLabel(days: number | null): string {
  if (days === null) return "期限なし";
  if (days < 0) return `期限を${-days}日過ぎています`;
  if (days === 0) return "今日まで";
  return `あと${days}日`;
}
