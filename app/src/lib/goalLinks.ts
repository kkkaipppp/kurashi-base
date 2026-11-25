import { occurrenceKey } from "./eventOps";
import { occurrencesIn } from "./goalOcc";
import type { AppData } from "./types";

/**
 * 目標と予定のひも付け（NEXT v21 X07：複数の目標が同じ予定を参照してよい。時間・費用は、予定のまま一度だけ数える）。
 * 予定の完了と、目標の達成は別（X08）：予定を完了にしても、目標の値や達成は変わらない。
 */
export interface GoalActions {
  /** 目標につないだ予定の数 */
  events: number;
  /** 完了した回の数（繰り返す予定は、完了した回を数える） */
  doneCount: number;
  /** 今日以降でいちばん近い、まだ完了していない回 */
  next: { eventId: string; title: string; date: string } | null;
}

export function goalActions(d: AppData, goalId: string, today: string): GoalActions {
  const evs = d.events.filter((e) => e.goalId === goalId);
  let doneCount = 0;
  let next: GoalActions["next"] = null;
  for (const e of evs) {
    doneCount += e.doneDates?.length ?? 0;
    for (const date of occurrencesIn(e, today, 120)) {
      if (e.doneDates?.includes(occurrenceKey(e, date))) continue;
      if (!next || date < next.date) next = { eventId: e.id, title: e.title || "（名前なし）", date };
      break;
    }
  }
  return { events: evs.length, doneCount, next };
}
