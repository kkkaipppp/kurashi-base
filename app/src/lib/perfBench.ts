import { applyRestore, buildBackup, parseBackup } from "./backup";
import { emptyData } from "./defaults";
import { buildInsights } from "./report";
import { daySummary, eventsOnDay, sortTxDesc, summarizeMonth } from "./aggregate";
import { buildCalendarItems } from "./calendarExport";
import { addDays, monthKey } from "./date";
import { dataHealth } from "./dataHealth";
import { forecastCurve } from "./forecast";
import { inboxGroups } from "./inbox";
import { monthLedger } from "./ledger";
import { monthBreakdown } from "./monthBreakdown";
import { monthlyInYear, summarizePeriod } from "./periods";
import { buildReminders, DEFAULT_REMINDERS } from "./reminders";
import { validateAppData, validateRelationships } from "./schema";
import { searchAll } from "./search";
import { suggestions } from "./suggestions";
import { weeklyReview } from "./weeklyReview";
import type { AppData } from "./types";

/**
 * 性能の測定（o11 A08）。画面を開いたとき・保存するときに走る主な計算を、同じデータで順に測る。
 * 記録は読むだけで、保存も外への送信もしない（試験と、自分用の「性能を測る」画面の両方で使う）
 */
export interface BenchRow {
  name: string;
  /** 3回測ったうちの真ん中（ミリ秒） */
  ms: number;
}
export interface BenchResult {
  rows: BenchRow[];
  /** 保存する形（JSON）の大きさ（バイト。UTF-8） */
  dataBytes: number;
  /** バックアップのファイルの大きさ（バイト） */
  backupBytes: number;
  /** 記録の件数（カテゴリを除く） */
  records: number;
}

const bytes = (s: string) => new TextEncoder().encode(s).length;

export function benchCases(d: AppData, today: string): [string, () => unknown][] {
  const mk = monthKey(today);
  const year = Number(today.slice(0, 4));
  // 測る前に1回だけ作るもの（測る時間に入れない）
  const json = JSON.stringify(d);
  const backupText = JSON.stringify(buildBackup(d));
  const parsed = parseBackup(backupText);
  const incoming = parsed.ok ? parsed.preview.data : d;
  return [
    ["起動：保存の形から戻す（JSON）", () => JSON.parse(json)],
    ["起動：読み込みの検査", () => validateAppData(d)],
    ["保存の形にする（保存のたび）", () => JSON.stringify(d)],
    ["ホームの今月", () => monthLedger(d, mk, today)],
    ["ホーム・履歴の並べ替え（全件）", () => sortTxDesc(d.transactions)],
    ["振り返りの気づき", () => buildInsights(d, mk, today)],
    ["カレンダーの1か月（31日）", () => {
      for (let i = 0; i < 31; i++) {
        const day = addDays(`${mk}-01`, i);
        daySummary(d.transactions, day);
        eventsOnDay(d.events, day);
      }
    }],
    ["振り返りの月", () => [summarizeMonth(d.transactions, mk), monthBreakdown(d, mk, today)]],
    ["振り返りの年（月の内訳×12）", () => {
      for (let m = 1; m <= 12; m++) monthBreakdown(d, `${year}-${String(m).padStart(2, "0")}`, today);
      monthlyInYear(d.transactions, year);
    }],
    ["全期間の合計", () => summarizePeriod(d.transactions, "1900-01-01", today)],
    ["週の見直し", () => weeklyReview(d, addDays(today, -6), today)],
    ["月末の見込みとグラフ", () => forecastCurve(d, today)],
    ["検索（店名）", () => searchAll(d, "店12")],
    ["データの点検", () => dataHealth(d, today)],
    ["提案", () => suggestions(d, today, { inbox: true })],
    ["未整理の記録", () => inboxGroups(d)],
    ["バックアップを作る", () => JSON.stringify(buildBackup(d))],
    ["復元：ファイルを読む（プレビュー）", () => parseBackup(backupText)],
    ["復元：関係の検査", () => validateRelationships(incoming)],
    ["復元：置き換え", () => applyRestore(d, incoming, "replace")],
    ["復元：空の端末へ追加", () => applyRestore(emptyData(), incoming, "merge")],
    ["カレンダーへの反映の一覧", () => buildCalendarItems(d, today)],
    ["通知の一覧", () => buildReminders(d, `${today}T09:00:00`, { ...DEFAULT_REMINDERS, on: true })],
  ];
}

/**
 * 1つずつ runs 回測る。pick が "median" なら真ん中、"min" ならいちばん短い時間（一時的な負荷やメモリの掃除の影響を受けにくい。比べる試験で使う）。
 * 端末で30年分を測るときは、runs を減らして固まる時間を短くする
 */
export function runBench(d: AppData, today: string, opts: { runs?: number; pick?: "median" | "min"; now?: () => number } = {}): BenchResult {
  const { runs = 3, pick = "median", now = () => performance.now() } = opts;
  const rows: BenchRow[] = [];
  for (const [name, f] of benchCases(d, today)) {
    const ts: number[] = [];
    for (let i = 0; i < runs; i++) {
      const t0 = now();
      f();
      ts.push(now() - t0);
    }
    ts.sort((a, b) => a - b);
    rows.push({ name, ms: pick === "min" ? ts[0] : ts[Math.floor(ts.length / 2)] });
  }
  const json = JSON.stringify(d);
  const backup = JSON.stringify(buildBackup(d));
  const parsed = parseBackup(backup);
  const records = parsed.ok ? Object.entries(parsed.preview.counts).filter(([k]) => k !== "categories").reduce((s, [, n]) => s + n, 0) : 0;
  return { rows, dataBytes: bytes(json), backupBytes: bytes(backup), records };
}

/** 結果を、貼り付けやすい文にする（記録の中身は入らない。合成データの件数と時間だけ） */
export function benchText(label: string, r: BenchResult, env: string): string {
  const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)}MB`;
  return [
    `【${label}】記録 ${r.records.toLocaleString("ja-JP")}件・保存の大きさ ${mb(r.dataBytes)}・バックアップ ${mb(r.backupBytes)}`,
    ...r.rows.map((x) => `- ${x.name}：${x.ms.toFixed(1)}ms`),
    `（${env}）`,
  ].join("\n");
}
