import { addDays, daysBetween } from "./date";
import type { CalendarEvent } from "./types";

/**
 * 予定編集は編集フォームが全項目を返す「完全な置き換え」。
 * 古い任意項目を spread で残すと、入力欄で空にした場所・URL・旅行などが復活する。
 * id と createdAt だけは元の記録を保ち、更新日時を置き換える。
 */
export type EventEditable = Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">;

const movedDone = (existing: CalendarEvent, next: EventEditable): string[] => {
  const once = !existing.repeat || existing.repeat === "none";
  if (!once || !existing.doneDates || existing.startDate === next.startDate) return existing.doneDates ?? [];
  const delta = daysBetween(existing.startDate, next.startDate);
  return existing.doneDates.map((d) => addDays(d, delta));
};

export function replaceEventEditableFields(existing: CalendarEvent, next: EventEditable, updatedAt: string): CalendarEvent {
  return {
    ...next,
    // 完了の記録は、編集の入力にないので、そのまま引き継ぐ（編集で消さない）
    // 1回きりの予定で開始日を変えたときは、完了の日付も同じだけずらす（古い日付が残って、未完了なのに数えられるのを防ぐ）
    ...(existing.doneDates ? { doneDates: movedDone(existing, next) } : {}),
    // 計画とのつながりも編集の入力に無いので引き継ぐ（直すたびに計画から外れて、予定が二重にできるのを防ぐ。To-Be 反証 高-1）
    ...(existing.planId && next.planId === undefined ? { planId: existing.planId } : {}),
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt,
  };
}
