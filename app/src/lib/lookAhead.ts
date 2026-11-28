import { eventsOnDay } from "./aggregate";
import { addDays } from "./date";
import { deadlinesOn } from "./deadlines";
import { ledgerEntries } from "./ledgerCore";
import { advanceDueDate } from "./recurring";
import type { AppData } from "./types";

/**
 * 週の見通し（To-Be 02 ホーム「週の見通し」。2026-11-28。自分用）：明日から7日の、予定の数・固定費の支払い・期限の数。
 * 何もない日は出さない。固定費は「期限」の数に重ねない（支払いで出す）
 */
export interface WeekDay {
  date: string;
  events: number;
  pay: number;
  payCount: number;
  deadlines: number;
}

export function weekAhead(d: AppData, today: string, days = 7): WeekDay[] {
  const out: WeekDay[] = [];
  const last = addDays(today, days);
  // 固定費の支払い：次の支払日から、期間の中の回をすべて（毎週なら2回目も。点検 低1）。一部払いは、その回だけ残り
  const pays = new Map<string, number[]>();
  for (const r of d.recurring) {
    if (!r.active) continue;
    let due = r.nextDueDate;
    for (let n = 0; n < 60 && due <= last; n++) {
      if (due > today) {
        const amt = r.partialPaid && r.partialPaid.due === due ? Math.max(0, r.amount - r.partialPaid.paid) : r.amount;
        pays.set(due, [...(pays.get(due) ?? []), amt]);
      }
      due = advanceDueDate(due, r.cycle, r.anchorDay);
    }
  }
  for (let i = 1; i <= days; i++) {
    const date = addDays(today, i);
    const events = eventsOnDay(d.events, date).length;
    const due = pays.get(date) ?? [];
    const pay = due.reduce((s, a) => s + a, 0);
    // 期限の数：固定費（支払いで出す）とやる日（期限ではない。点検 低2）は数えない
    const deadlines = deadlinesOn(d, date).filter((x) => x.kind !== "固定費" && x.kind !== "やる日" && !x.done).length;
    if (events || due.length || deadlines) out.push({ date, events, pay, payCount: due.length, deadlines });
  }
  return out;
}

/**
 * 年のふりかえり（To-Be 02 目標「年間振り返り」。2026-11-28。自分用）：その年に達成した目標・勉強の時間・旅行・支出と収入。
 * 記録から数えるだけ（評価や励ましの言葉は付けない）
 */
export interface YearReview {
  year: string;
  goalsMet: number;
  studyMinutes: number;
  trips: number;
  /** 支出（投資を除く。特別支出は入る） */
  expense: number;
  /** 投資（積立など） */
  invest: number;
  income: number;
}

export function yearReview(d: AppData, year: string): YearReview {
  const inYear = (s: string | undefined) => !!s && s.startsWith(`${year}-`);
  // 達成の記録（条件を満たした）がその年にあるか、達成の記録なしで完了にしたのがその年（更新日。点検 低3）
  const goalsMet = d.goals.filter((g) => g.achievements?.some((a) => a.verdict === "met" && inYear(a.at)) || (g.done && !g.achievements?.some((a) => a.verdict === "met") && inYear(g.updatedAt))).length;
  const studyMinutes = d.studyLogs.filter((l) => inYear(l.date)).reduce((s, l) => s + l.minutes, 0);
  const trips = (d.trips ?? []).filter((t) => inYear(t.startDate)).length;
  // 台帳の数え方（振替・返金・精算は数えない）。投資は支出と分ける（点検 中1。ホーム・予算・前からの年の振り返りと同じ）
  let expense = 0;
  let invest = 0;
  let income = 0;
  for (const e of ledgerEntries(d)) {
    if (!inYear(e.date)) continue;
    if (e.kind === "income") income += e.amount;
    else if (e.invest) invest += e.amount;
    else expense += e.amount;
  }
  return { year, goalsMet, studyMinutes, trips, expense, invest, income };
}
