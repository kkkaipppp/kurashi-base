import { countData } from "./backup";
import { backupRecordCount } from "./nativeBridge";
import type { AppData } from "./types";

/**
 * iPhone アプリへの受け渡し（components/WidgetSync.tsx）で、何をするかの決め方（o11 A07 点検）。
 * 画面の部品から切り出して、試験で動きを確かめられるようにしている
 */

/** 記録が1件以上あるか（カテゴリは数えない） */
export const hasRecords = (d: AppData) => backupRecordCount(countData(d)) > 0;

/**
 * カレンダー：記録が0件（新しい端末・読み込めなかったあと・すべて削除の直後）のときは書き直さない。
 * もう書いた予定は、設定の「入れた予定を消す」で消せる（点検 中-1）
 */
export const shouldSyncCalendar = (d: AppData) => hasRecords(d);

/**
 * 通知：記録が0件でも、いつも入れ替える（消した予定・タスクの通知を残さない。点検2回目 中-A）。
 * 0件なら、くらしベースの通知を全部消すことになる
 */
export const shouldSyncReminders = (): boolean => true;

/** 通知の入れ替えの結果から、「登録した」とするか（次に同じ中身なら呼ばない）と、残す結果を決める */
export function reminderOutcome(r: { denied?: boolean; failed?: number }, settingsOn: boolean, count: number): { done: boolean; ok: boolean; detail?: string } {
  // オフのときは、許可がなくても困らない（警告を残さない。点検2回目 低-1）
  if (!settingsOn) return { done: true, ok: true }; // 空の一覧を渡したので、くらしベースの通知は消えている（拒否でも同じ）
  // 登録するものが無いときは、拒否されていても困らない（記録0件など。点検3回目 低-4）
  if (r.denied && count === 0) return { done: true, ok: true };
  if (r.denied) return { done: false, ok: false, detail: "通知が許可されていません（iPhone の設定 → くらしベース → 通知）" };
  const failed = Number(r.failed ?? 0);
  // 一部を登録できなかったときは、次の機会にもう一度入れ替える
  if (failed > 0) return { done: false, ok: false, detail: `${failed}件の通知を登録できませんでした` };
  return { done: true, ok: true };
}

/** カレンダーの書き直しの結果から、残す結果を決める */
export function calendarOutcome(r: { skipped?: number }): { ok: boolean; detail?: string } {
  const skipped = Number(r.skipped ?? 0);
  return skipped ? { ok: false, detail: `日時を読めなかった予定が${skipped}件あり、書いていません` } : { ok: true };
}
