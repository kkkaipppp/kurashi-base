import { addDays } from "./date";
import type { CalendarEvent } from "./types";

/**
 * 予定の完了・延期・出発の目安（NEXT v21 X06・MAP_NAVIGATION M：予定とタスクの共通の属性。ID は変えない）。
 * - 完了は「日付ごと」に持つ（doneDates）。1回きりの予定は開始日、繰り返しの予定は、その回の日付。1回だけ完了できる
 * - 延期は、繰り返さない予定だけ（日付をずらす。ほかの項目・ID はそのまま。期限などは暗黙に変えない）
 * - 出発の目安は、開始時刻 − 移動時間（登録した値からの計算で、地図の推計ではない）
 */
export const isDoneOn = (e: Pick<CalendarEvent, "doneDates">, date: string) => !!e.doneDates?.includes(date);

export function toggleDoneOn(e: CalendarEvent, date: string, ts: string): CalendarEvent {
  const has = isDoneOn(e, date);
  const list = has ? (e.doneDates ?? []).filter((d) => d !== date) : [...(e.doneDates ?? []), date].sort();
  const { doneDates: _drop, ...rest } = e; // eslint-disable-line @typescript-eslint/no-unused-vars
  return list.length ? { ...rest, doneDates: list, updatedAt: ts } : { ...rest, updatedAt: ts };
}

export const canShift = (e: Pick<CalendarEvent, "repeat">) => !e.repeat || e.repeat === "none";

/** 日付を days 日ずらす（繰り返す予定は null）。完了の記録も同じだけずらす */
export function shiftEvent(e: CalendarEvent, days: number, ts: string): CalendarEvent | null {
  if (!canShift(e) || !Number.isInteger(days) || days === 0) return null;
  const next: CalendarEvent = { ...e, startDate: addDays(e.startDate, days), endDate: addDays(e.endDate, days), updatedAt: ts };
  if (e.doneDates?.length) next.doneDates = e.doneDates.map((d) => addDays(d, days));
  return next;
}

/** 出発の目安（HH:mm）。時刻つきで、移動時間があり、開始時刻から引いても日付が変わらないときだけ */
export function departureTime(e: Pick<CalendarEvent, "allDay" | "startTime" | "travelMinutes">): string | null {
  if (e.allDay || !e.travelMinutes || e.travelMinutes <= 0 || !/^\d{2}:\d{2}$/.test(e.startTime)) return null;
  const [h, m] = e.startTime.split(":").map(Number);
  const t = h * 60 + m - e.travelMinutes;
  if (t < 0) return null; // 前の日になる：目安は出さない（日付をまたぐ計算はしない）
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
