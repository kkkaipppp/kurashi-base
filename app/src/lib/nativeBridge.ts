import { registerPlugin } from "@capacitor/core";

/**
 * iPhone アプリの中だけにある部品（ios/App/App/WidgetBridgePlugin.swift）。
 * Web 版（Safari・ホーム画面のアイコン）では使わない（呼ぶ前に Capacitor.isNativePlatform() を確かめる）。
 */
export interface NativeBridge {
  /** ウィジェット用の要約を App Group に置く */
  setSummary(options: { json: string }): Promise<void>;
  /** その日のバックアップを、アプリの書類フォルダ（「ファイル」アプリ → このiPhone内 → くらしベース）に書く */
  writeBackup(options: { day: string; json: string; records: number }): Promise<{ name: string; kept: number }>;
  /** iPhone のカレンダーの「くらしベース」カレンダーに、from〜to の予定を書き直す（初回はカレンダーへのアクセスを聞く） */
  syncCalendar(options: { from: string; to: string; json: string }): Promise<{ written: number; disabled?: boolean; skipped?: number }>;
  /** くらしベースの通知を、いま必要なものに入れ替える（空なら全部消す。許可がなければ聞く／拒否なら denied） */
  scheduleReminders(options: { json: string }): Promise<{ scheduled: number; removed?: number; denied?: boolean; failed?: number }>;
  /** 画像（base64）から、文字を上から下の順に読み取る（iPhone の Vision。端末の中だけ。候補で、確認は本人） */
  recognizeText(options: { image: string }): Promise<{ lines: string[] }>;
  /** iPhone のカレンダーの予定を読む（A5。「くらしベース」カレンダーは除く。端末の中だけ。lib/nativeCalendar.ts） */
  readCalendarEvents(options: { from: string; to: string }): Promise<{ items: import("./nativeCalendar").NativeCalendarItem[]; overLimit: number; ownSkipped: number }>;
}

export const NativeBridge = registerPlugin<NativeBridge>("WidgetBridge");

/** 自動バックアップのファイル名（YYYYMMDD）。プレイブック 12-7 の名前の決まり */
export function autoBackupDay(today: string): string {
  return today.replaceAll("-", "");
}

/** バックアップに入る記録の件数（カテゴリは数えない）。0件のときは自動バックアップを書かない */
export function backupRecordCount(counts: Record<string, number>): number {
  return Object.entries(counts).reduce((s, [k, n]) => (k === "categories" ? s : s + n), 0);
}

/** 自動バックアップを残す日数（古いものから消す） */
export const AUTO_BACKUP_KEEP_DAYS = 14;
