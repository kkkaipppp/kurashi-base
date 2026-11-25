import { addDays, toDateStr } from "./date";
import { COLLECTION_KEYS, type AppData } from "./types";

/**
 * 続けて使えているか（CHARTER の成功1：4週間続けて、週5日以上、記録または確認に使う）。論点 Q15 は B
 * 「記録した日をアプリの中で数えて振り返りに出す（外部送信なし）」（2026-11-25 決定）。
 *
 * - 「使った日」＝その日に、何かの記録を作ったか直した日（記録の createdAt・updatedAt を、端末の現地の日付にしたもの）
 * - 見るだけで記録しなかった日は数えない（アプリは開いた日を保存していない。保存の形を変えないため）。そのため実際より少なめに出る
 * - 直近28日を、今日を含む7日ずつ4つに分けて数える（いちばん右が今週）
 * - 保存の形は変えない（記録の日時から数えるだけ）。外へは送らない
 */
export interface UsageWeeks {
  /** 古い順に4つ。from〜to（7日）と、その中で使った日の数 */
  weeks: { from: string; to: string; days: number }[];
  /** 4つとも5日以上か */
  meetsGoal: boolean;
  /** 直近28日で使った日の数 */
  total: number;
}

export const GOAL_DAYS_PER_WEEK = 5;

/** 記録を作った日・直した日の集合（端末の現地の日付） */
export function activeDays(d: AppData): Set<string> {
  const out = new Set<string>();
  const add = (iso: unknown) => {
    if (typeof iso !== "string" || !iso) return;
    const t = new Date(iso);
    if (!Number.isNaN(t.getTime())) out.add(toDateStr(t));
  };
  const lists: { createdAt?: string; updatedAt?: string }[][] = [d.transactions, d.events, d.recurring, d.trips ?? [], ...COLLECTION_KEYS.map((k) => d[k] as { createdAt?: string; updatedAt?: string }[])];
  for (const list of lists)
    for (const x of list) {
      add(x.createdAt);
      add(x.updatedAt);
    }
  return out;
}

export function usageWeeks(d: AppData, today: string): UsageWeeks {
  const days = activeDays(d);
  const weeks = [3, 2, 1, 0].map((w) => {
    const to = addDays(today, -7 * w);
    const from = addDays(to, -6);
    let n = 0;
    for (let i = 0; i < 7; i++) if (days.has(addDays(from, i))) n++;
    return { from, to, days: n };
  });
  return { weeks, meetsGoal: weeks.every((w) => w.days >= GOAL_DAYS_PER_WEEK), total: weeks.reduce((s, w) => s + w.days, 0) };
}
