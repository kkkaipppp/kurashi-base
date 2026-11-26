import type { AppData, CalendarEvent } from "./types";

/**
 * 予定の「費用の目安」から、支出の入力を始める（A2：入力を減らす。2026-11-26 平尾さん「全部おすすめで」の 6）。
 * - 入れるのは候補だけ（金額・内容・日付）。保存は本人が入力の画面で押す（勝手に記録しない）
 * - 日付は、その回の日（繰り返しの予定は、見ている回の日。回が分からなければ出さない）
 * - 同じ日に同じ額の支出がすでにあれば、二重かもしれないと知らせる（止めはしない）
 */
export function eventExpenseStart(ev: Pick<CalendarEvent, "title" | "startDate" | "cost" | "repeat">, day?: string): { date: string; amount: string; merchant: string } | null {
  if (typeof ev.cost !== "number" || ev.cost <= 0) return null;
  // 繰り返しの予定で、どの回か分からない（さがすから開いたなど）ときは出さない（最初の回の日で記録してしまわないように。点検 中-2）
  if (ev.repeat && ev.repeat !== "none" && !day) return null;
  return { date: day ?? ev.startDate, amount: String(ev.cost), merchant: ev.title.trim().slice(0, 100) };
}

export function similarExpenseOn(d: Pick<AppData, "transactions">, date: string, amount: number): boolean {
  return d.transactions.some((t) => t.type === "expense" && t.date === date && t.amount === amount);
}
