import type { CalendarEvent } from "./types";

/**
 * 編集を始めたときの記録（JSON）と、保存しようとしている今の記録が同じかを確かめる。
 * 違えば、ほかのタブ（または別の操作）でその記録が変わっているので、古い入力で上書きしない。
 * 予定・取引・旅行・固定費・タスクなど、id を持つ記録すべてに使う。
 */
export function recordMatchesSnapshot(current: object, snapshot: string): boolean {
  return JSON.stringify(current) === snapshot;
}

/** 予定用の名前（受領パックのテストとの互換） */
export function eventMatchesSnapshot(current: CalendarEvent, snapshot: string): boolean {
  return recordMatchesSnapshot(current, snapshot);
}

/** 競合したときの案内（入力は画面に残る） */
export const RECORD_CONFLICT_ERROR = "ほかのタブ（または別の画面）でこの記録が変わっていたため、保存をやめました。入力した内容を控えてから、いったん閉じて最新の内容を開き直してください";

/**
 * 保存してよいかを確かめる。snapshot が無ければ（新規・古い呼び出し）確かめない。
 * 記録が消えていれば・変わっていれば、保存しない理由を返す（null なら保存してよい）
 */
export function staleRecordError(list: readonly { id: string }[] | undefined, id: string, snapshot?: string): string | null {
  if (snapshot === undefined) return null;
  const current = (list ?? []).find((x) => x.id === id);
  if (!current) return "この記録は、ほかのタブなどで削除されています。入力した内容を控えてから、画面を閉じてください";
  return recordMatchesSnapshot(current, snapshot) ? null : RECORD_CONFLICT_ERROR;
}
