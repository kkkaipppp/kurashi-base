import { daysBetween } from "./date";
import type { Goal } from "./types";

/**
 * 数値目標の「ペース」（NEXT v21 GOAL_PLANNING・DOMAIN_DEPTH：差額÷残りの期間、端数は切り上げ。
 * 期限が過ぎている・今日まで・入力が足りない・すでに達成のときは、無理に出さず理由を返す）。
 * 目標の値や今の値は本人が入れたものをそのまま使い、記録から推測しない。達成を保証する数字ではなく、目安。
 */
export type GoalPace =
  | {
      ok: true;
      /** 残り（目標 − 今の値）。マイナスにならない */
      remaining: number;
      /** 今日から期限までの日数（期限の日を含む） */
      days: number;
      /** 1か月（30日）あたり必要な量（切り上げ） */
      perMonth: number;
      /** 1週間あたり必要な量（切り上げ） */
      perWeek: number;
    }
  | { ok: false; reason: "done" | "reached" | "notNumber" | "noTarget" | "noDeadline" | "pastDue" };

export function goalPace(g: Goal, today: string): GoalPace {
  if (g.done) return { ok: false, reason: "done" };
  if (g.kind !== "number") return { ok: false, reason: "notNumber" };
  if (g.target === null || g.target <= 0) return { ok: false, reason: "noTarget" };
  if (g.current >= g.target) return { ok: false, reason: "reached" };
  if (!g.deadline) return { ok: false, reason: "noDeadline" };
  const days = daysBetween(today, g.deadline) + 1;
  if (days <= 0) return { ok: false, reason: "pastDue" };
  const remaining = g.target - g.current;
  return { ok: true, remaining, days, perMonth: Math.ceil((remaining * 30) / days), perWeek: Math.ceil((remaining * 7) / days) };
}

export function goalPaceText(p: GoalPace, unit: string, fmt: (n: number) => string): string {
  if (p.ok) {
    // 期限が近いとき（30日未満）は、月あたりより、残り全部のほうが分かりやすい
    return p.days < 30 ? `あと${p.days}日で${fmt(p.remaining)}${unit}（1週間あたり約${fmt(p.perWeek)}${unit}）` : `1か月あたり約${fmt(p.perMonth)}${unit}のペース（残り${fmt(p.remaining)}${unit}・${p.days}日）`;
  }
  return p.reason === "pastDue" ? "期限を過ぎています。期限を見直すと、ペースを出せます" : p.reason === "noDeadline" ? "期限を決めると、必要なペースを出せます" : "";
}
