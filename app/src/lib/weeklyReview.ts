import { eventsOnDay } from "./aggregate";
import { categoryMap, isMoveOnly, txIsInvest } from "./classify";
import { addDays } from "./date";
import type { AppData } from "./types";

/**
 * 週ごとの見直し（NEXT v21 Phase 4「週次の振り返り」。GOAL_PLANNING 5：行動実績と成果を分け、断定しない）。
 * その週（月曜〜日曜）について、記録されたことだけを並べる：
 * - 使ったお金（生活費。投資を除く）と、前の週の同じ曜日までとの差
 * - いちばん使ったカテゴリ
 * - 予定の件数
 * - 次の週にあるもの：予定・固定費の支払い・期限のタスク・契約の更新日（まだ起きていないので「予定」と書く）
 * 原因は推測しない。タスクの完了は、完了した日を記録していないので数えない。
 */
export interface WeeklyReview {
  from: string;
  to: string;
  /** 今週これまでの生活費（今日まで） */
  spent: number;
  /** 前の週の、同じ曜日までの生活費。前の週に記録がまったくなければ null（0円と区別する） */
  prevSpent: number | null;
  topCategory: { categoryId: string; total: number } | null;
  events: number;
  next: { from: string; to: string; events: number; fixed: { name: string; amount: number; date: string }[]; tasks: number; renewals: number };
}

export function weeklyReview(data: AppData, from: string, today: string): WeeklyReview {
  const to = addDays(from, 6);
  const upTo = today < to ? today : to; // 今週は、今日まで
  const cats = categoryMap(data);
  const life = (a: string, b: string) => data.transactions.filter((t) => t.type === "expense" && !isMoveOnly(t) && !txIsInvest(t, cats) && t.date >= a && t.date <= b);
  const cur = life(from, upTo);
  const spent = cur.reduce((s, t) => s + t.amount, 0);
  const span = Math.max(0, Math.round((Date.parse(`${upTo}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
  const prevFrom = addDays(from, -7);
  const prevTo = addDays(prevFrom, span);
  const prevAny = data.transactions.some((t) => t.date >= prevFrom && t.date <= addDays(prevFrom, 6));
  const prevSpent = prevAny ? life(prevFrom, prevTo).reduce((s, t) => s + t.amount, 0) : null;
  const byCat = new Map<string, number>();
  for (const t of cur) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amount);
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
  let events = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) events += eventsOnDay(data.events, d).length;

  const nf = addDays(to, 1);
  const nt = addDays(nf, 6);
  let nEvents = 0;
  for (let d = nf; d <= nt; d = addDays(d, 1)) nEvents += eventsOnDay(data.events, d).length;
  const fixed = data.recurring
    .filter((r) => r.active && r.nextDueDate >= nf && r.nextDueDate <= nt)
    .map((r) => ({ name: r.name, amount: r.amount, date: r.nextDueDate }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const tasks = data.tasks.filter((t) => !t.done && t.due && t.due >= nf && t.due <= nt).length;
  const renewals = data.contracts.filter((c) => c.status === "active" && c.renewalDate >= nf && c.renewalDate <= nt).length;
  return { from, to, spent, prevSpent, topCategory: top ? { categoryId: top[0], total: top[1] } : null, events, next: { from: nf, to: nt, events: nEvents, fixed, tasks, renewals } };
}
