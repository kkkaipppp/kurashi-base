import { addDays, clampDay, parseDateStr } from "./date";
import type { RecurringCycle, RecurringExpense } from "./types";

/** 次の支払予定日（anchorDay を基準に、月末超過は月末日に丸める） */
export function advanceDueDate(current: string, cycle: RecurringCycle, anchorDay: number): string {
  if (cycle === "weekly") return addDays(current, 7);
  const { y, m } = parseDateStr(current);
  if (cycle === "monthly") {
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return clampDay(ny, nm, anchorDay);
  }
  return clampDay(y + 1, m, anchorDay);
}

/** 今日以降で最も早い有効な固定費 */
export function nextRecurring(list: RecurringExpense[]): RecurringExpense | null {
  const active = list.filter((r) => r.active).sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  return active[0] ?? null;
}

export function overdueRecurring(list: RecurringExpense[], today: string): RecurringExpense[] {
  return list.filter((r) => r.active && r.nextDueDate < today);
}

export function cycleLabel(c: RecurringCycle): string {
  return c === "weekly" ? "毎週" : c === "monthly" ? "毎月" : "毎年";
}
