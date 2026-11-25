import type { CalendarEvent } from "./types";

/**
 * 予定編集は編集フォームが全項目を返す「完全な置き換え」。
 * 古い任意項目を spread で残すと、入力欄で空にした場所・URL・旅行などが復活する。
 * id と createdAt だけは元の記録を保ち、更新日時を置き換える。
 */
export type EventEditable = Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">;

export function replaceEventEditableFields(existing: CalendarEvent, next: EventEditable, updatedAt: string): CalendarEvent {
  return {
    ...next,
    // 完了の記録は、編集の入力にないので、そのまま引き継ぐ（編集で消さない）
    ...(existing.doneDates ? { doneDates: existing.doneDates } : {}),
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt,
  };
}
