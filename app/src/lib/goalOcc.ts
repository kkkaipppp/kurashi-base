import { addDays } from "./date";
import { occursOn } from "./aggregate";
import type { CalendarEvent } from "./types";

/** from から days 日のうち、予定が起きる日（古い順）。1回きりは開始日〜終了日、繰り返しはその回の日 */
export function occurrencesIn(e: CalendarEvent, from: string, days: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    if (occursOn(e, d)) out.push(d);
  }
  return out;
}
