/**
 * 保存先（IndexedDB）が空になっていた端末の説明（o11 A07 点検 高-1）。
 * 読み込めない画面（components/AppShell.tsx）からも使うので、IndexedDB の部品とは別のファイルに置く（公開版の読み込みを増やさない）
 */
/** 保存先が空になっていたときの説明の書き出し（読み込めない画面が、この場面かを見分ける） */
export const LOST_STORE_PREFIX = "記録の保存先が空になっていました";
/** 元の場所に古い記録がないとき、読み込めない画面に渡す中身（「ファイルに保存」は出さない） */
export const NO_OLD_RECORDS = '{"note":"元の場所に古い記録はありません"}';

/** IndexedDB が空になっていたときの説明（読み込めない画面に出す）。日付は端末の現地の日付（点検2回目 低-5） */
export function lostStoreMessage(movedAt: string, hasOld: boolean): string {
  const d = new Date(movedAt);
  const day = Number.isNaN(d.getTime()) ? "以前" : `${d.getMonth() + 1}月${d.getDate()}日`;
  const old = hasOld
    ? `元の場所には、${day}に保存先を移す前の古い記録だけが残っています。古い記録で続けると、それより後の記録が戻らないため、ここでは開きません（古い記録は消しません）。`
    : `${day}に保存先を移したあとの記録が、見つかりません。`;
  return `${LOST_STORE_PREFIX}（iPhone が容量を空けるために消した可能性があります）。${old}最新の記録は、iPhone アプリなら「ファイル」→ このiPhone内 → くらしベース → 自動バックアップ にあります（日付のいちばん新しいファイル。記録がいちばん多かったときの控えは kurashi-base_largest_backup.json）。Safari で使っていたなら、書き出したバックアップのファイルです。下の「記録がない状態から始める」を押してから、設定の「バックアップから復元」で戻してください`;
}
