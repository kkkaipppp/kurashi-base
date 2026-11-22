import type { CalendarEvent } from "./types";

/** 編集開始時と現在の予定が一致する場合だけ保存できる。 */
export function eventMatchesSnapshot(current: CalendarEvent, snapshot: string): boolean {
  return JSON.stringify(current) === snapshot;
}
