import { daysInMonth, monthKey, parseDateStr } from "./date";
import { advanceDueDate } from "./recurring";
import type { RecurringExpense } from "./types";

/**
 * 今月あと使える生活費（レビュー o1 の「家計を良くする機能」1）。
 * 予算 − 今月の支出 − 今日から月末までにまだ来る固定費、を月末までの日数（今日を含む）で割る。
 * 予算がなければ出さない（null）。固定費は、次の支払日が今月の中にあるもの（支払日を過ぎてまだ記録していないものも）を引く。
 * 固定費の画面から記録すると次の支払日が来月へ進むので、払って記録した分を二重に引くことはない。
 * 支出は「生活の支出」（名前に「投資」が入ったカテゴリを除く。月の振り返りと同じ考え方）を渡す。
 */
/** exclude：数えない固定費（例：投資の積立。生活費の予算と比べる額には入れない） */
/** staleBefore：これより前の支払日のままの固定費は「古い」として数えない（既定は、その月の1日。来月の分を見るときは、今月の1日を渡す） */
export function unpaidRecurringOccurrences(list: RecurringExpense[], today: string, exclude?: (r: RecurringExpense) => boolean, staleBefore?: string): { date: string; amount: number }[] {
  const start = `${monthKey(today)}-01`;
  const end = `${monthKey(today)}-${String(daysInMonth(parseDateStr(today).y, parseDateStr(today).m)).padStart(2, "0")}`;
  const occurrences: { date: string; amount: number }[] = [];
  for (const r of list) {
    if (!r.active || exclude?.(r)) continue;
    let d = r.nextDueDate;
    // 次の支払日が先月以前のまま（古い）の固定費は、数えない（2026-11-25 平尾さんの決定 Q30＝C）。
    // 固定費の画面を通さずに払っていると、二重に引いてしまうため。かわりに「確認したいこと」で「予定日を過ぎています」と知らせる（navi.ts）
    if (d < (staleBefore ?? start)) continue;
    // 有効な日付範囲 (1900–2200) の月次・年次を十分にカバーする。
    for (let guard = 0; d <= end && guard < 3620; guard++) {
      // 一部だけ払った分は、残りだけ数える（予定と実績を別の値で持つ。NEXT v21 X02）
      if (d >= start) occurrences.push({ date: d, amount: r.partialPaid && r.partialPaid.due === d ? Math.max(0, r.amount - r.partialPaid.paid) : r.amount });
      d = advanceDueDate(d, r.cycle, r.anchorDay);
    }
  }
  return occurrences;
}

export function unpaidRecurringThisMonth(list: RecurringExpense[], today: string, exclude?: (r: RecurringExpense) => boolean, staleBefore?: string): number {
  return unpaidRecurringOccurrences(list, today, exclude, staleBefore).reduce((sum, x) => sum + x.amount, 0);
}

export interface Allowance {
  perDay: number; // 1日あたり（0 未満は 0）
  daysLeft: number; // 今日を含む月末までの日数
  unpaidFixed: number; // まだ来る今月の固定費
  left: number; // 予算 − 支出 − まだ来る固定費
}

export function dailyAllowance(budget: number | null, monthExpense: number, recurring: RecurringExpense[], today: string): Allowance | null {
  if (budget === null) return null;
  const { y, m, d } = parseDateStr(today);
  const daysLeft = daysInMonth(y, m) - d + 1;
  const unpaidFixed = unpaidRecurringThisMonth(recurring, today);
  const left = budget - monthExpense - unpaidFixed;
  return { perDay: Math.max(0, Math.floor(left / daysLeft)), daysLeft, unpaidFixed, left };
}
