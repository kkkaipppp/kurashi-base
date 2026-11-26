import { countData, COUNT_LABELS } from "./backup";
import type { AppData } from "./types";

/**
 * 困ったときに、開発者（Claude や友人）へ伝えるための「診断情報」（NEXT v21 HELP_AND_RECOVERY H10）。
 * 記録の中身（店名・メモ・金額・予定の名前）は一切入れない。件数・日付の範囲・保存の大きさ・版・端末の種類だけ。
 * 画面に出して、本人が読んでから、自分でコピーする（自動では送らない）。
 */
export interface DiagnosticsInput {
  data: AppData;
  edition: "personal" | "public";
  native: boolean;
  /** localStorage の本体の文字数（読めなければ null） */
  storedChars: number | null;
  /** 取り消しの控えがあるか */
  hasUndo: boolean;
  userAgent: string;
  nowIso: string;
}

export function buildDiagnostics(i: DiagnosticsInput): string {
  const c = countData(i.data);
  const dates = i.data.transactions.map((t) => t.date).sort();
  const lines = [
    "くらしベース 診断情報（記録の中身は入っていません）",
    `作成：${i.nowIso}`,
    `版：${i.edition === "personal" ? "自分用" : "公開"}・${i.native ? "iPhone アプリ" : "ブラウザ（Web）"}`,
    `保存の形式：schemaVersion ${i.data.schemaVersion}`,
    `保存の大きさ：${i.storedChars === null ? "読めません" : `${i.storedChars.toLocaleString("ja-JP")} 文字（約${Math.round((i.storedChars * 2) / 1024).toLocaleString("ja-JP")} KB）`}`,
    `支出・収入の期間：${dates.length ? `${dates[0]}〜${dates[dates.length - 1]}` : "なし"}`,
    `最後のバックアップ：${i.data.meta.lastBackupAt ? i.data.meta.lastBackupAt.slice(0, 10) : "まだ"}`,
    `直前の操作の取り消し：${i.hasUndo ? "あり" : "なし"}`,
    "件数：" + (Object.entries(c) as [keyof typeof c, number][]).filter(([, n]) => n > 0).map(([k, n]) => `${COUNT_LABELS[k as keyof typeof COUNT_LABELS] ?? k}${n}`).join("・"),
    `端末：${i.userAgent}`,
  ];
  return lines.join("\n");
}
