import { addDays } from "./date";
import type { RecurringExpense } from "./types";

export interface UpcomingPayment {
  id: string;
  name: string;
  due: string;
  /** 払う額（一部だけ払ったときは残り。カレンダーの支払予定と同じ数え方） */
  amount: number;
  partial: boolean;
}

/**
 * 家計簿の「支払い」のタブ（To-Be 02。自分用）：止めていない固定費の次の支払日が、今日から days 日のうちのもの。
 * 予定日を過ぎてまだ記録していないもの（次の支払日が今日より前）も先頭に出す。残りが0円のものは出さない
 */
export function upcomingPayments(recurring: RecurringExpense[], today: string, days: number): UpcomingPayment[] {
  const end = addDays(today, days);
  const out: UpcomingPayment[] = [];
  for (const r of recurring) {
    if (!r.active || !r.nextDueDate || r.nextDueDate > end) continue;
    const partial = !!r.partialPaid && r.partialPaid.due === r.nextDueDate;
    const amount = partial ? Math.max(0, r.amount - r.partialPaid!.paid) : r.amount;
    if (amount <= 0) continue;
    out.push({ id: r.id, name: r.name, due: r.nextDueDate, amount, partial });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name, "ja"));
}
