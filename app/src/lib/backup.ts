import { checksum, CURRENT_SCHEMA, validateAppData } from "./schema";
import { COLLECTION_KEYS, type AppData, type CollectionKey } from "./types";

export const BACKUP_FORMAT = "kurashi-base-backup";

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  counts: Counts;
  checksum: string;
  data: AppData;
}

export type Counts = Record<"transactions" | "events" | "recurring" | "categories" | CollectionKey, number>;

export function countData(d: AppData): Counts {
  const c = {
    transactions: d.transactions.length,
    events: d.events.length,
    recurring: d.recurring.length,
    categories: d.categories.length,
  } as Counts;
  for (const k of COLLECTION_KEYS) c[k] = d[k].length;
  return c;
}

/** 復元プレビューで見せる件数の名前 */
export const COUNT_LABELS: Record<keyof Counts, string> = {
  transactions: "取引",
  events: "予定",
  recurring: "固定費",
  categories: "カテゴリ",
  nisa: "NISAの記録",
  notes: "生活記録・メモ",
  tasks: "タスク",
  assets: "資産",
  contracts: "契約",
  health: "健康記録",
  documents: "書類",
  studySubjects: "勉強（資格）",
  studyLogs: "勉強の記録",
  goals: "目標",
};

export function buildBackup(data: AppData, nowIso: string = new Date().toISOString()): BackupFile {
  const body = JSON.stringify(data);
  return {
    format: BACKUP_FORMAT,
    schemaVersion: data.schemaVersion,
    exportedAt: nowIso,
    counts: countData(data),
    checksum: checksum(body),
    data,
  };
}

export interface RestorePreview {
  exportedAt: string;
  counts: BackupFile["counts"];
  period: { from: string; to: string } | null;
  data: AppData;
  warnings: string[];
}

/** バックアップファイルを検証してプレビューを作る。既存データには触れない */
export function parseBackup(text: string): { ok: true; preview: RestorePreview } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "JSONとして読み込めません。ファイルが壊れている可能性があります" };
  }
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "バックアップ形式ではありません" };
  const f = raw as Partial<BackupFile>;
  if (f.format !== BACKUP_FORMAT) return { ok: false, error: "暮らしベースのバックアップファイルではありません" };
  if (f.schemaVersion !== 1 && f.schemaVersion !== CURRENT_SCHEMA) return { ok: false, error: "対応していないバックアップのバージョンです" };
  // チェックサムはファイルに書かれたままの中身で確かめてから、今の形式に移行する
  if (f.checksum !== checksum(JSON.stringify(f.data))) return { ok: false, error: "チェックサムが一致しません。ファイルが壊れているか、変更されています" };
  const v = validateAppData(f.data);
  if (!v.ok) return { ok: false, error: v.error };
  const d = v.data;
  const counts = countData(d);
  const warnings: string[] = [];
  // ファイルに記録された件数（古い形式では一部の項目だけ）と中身を比べる
  if (f.counts && Object.entries(f.counts).some(([k, n]) => counts[k as keyof Counts] !== n))
    warnings.push("記録された件数と中身の件数が一致しません");
  if (f.schemaVersion === 1) warnings.push("古い形式（v1）のバックアップです。今の形式に変換して読み込みます");
  const dates = [...d.transactions.map((t) => t.date), ...d.events.map((e) => e.startDate)].sort();
  return {
    ok: true,
    preview: {
      exportedAt: String(f.exportedAt ?? ""),
      counts,
      period: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
      data: d,
      warnings,
    },
  };
}

/**
 * 復元。replace = 全置き換え。merge = 既存に追加（同じIDは既存を優先してスキップ）。
 * 新しいオブジェクトを返すだけで、保存は呼び出し側がまとめて1回行う（途中失敗で半端な状態を残さない）。
 */
export function applyRestore(current: AppData, incoming: AppData, mode: "replace" | "merge"): { data: AppData; added: number; skipped: number } {
  if (mode === "replace") {
    const c = countData(incoming);
    const total = Object.entries(c).filter(([k]) => k !== "categories").reduce((s, [, n]) => s + n, 0);
    return { data: structuredClone(incoming), added: total, skipped: 0 };
  }
  let added = 0;
  let skipped = 0;
  const mergeList = <T extends { id: string }>(a: T[], b: T[]): T[] => {
    const ids = new Set(a.map((x) => x.id));
    const out = [...a];
    for (const x of b) {
      if (ids.has(x.id)) skipped++;
      else {
        out.push(x);
        ids.add(x.id);
        added++;
      }
    }
    return out;
  };
  const catIds = new Set(current.categories.map((c) => c.id));
  const data: AppData = {
    ...current,
    transactions: mergeList(current.transactions, incoming.transactions),
    events: mergeList(current.events, incoming.events),
    recurring: mergeList(current.recurring, incoming.recurring),
    categories: [...current.categories, ...incoming.categories.filter((c) => !catIds.has(c.id))],
  };
  for (const k of COLLECTION_KEYS) {
    (data as unknown as Record<string, { id: string }[]>)[k] = mergeList(current[k] as { id: string }[], incoming[k] as { id: string }[]);
  }
  return { data, added, skipped };
}

export function backupFileName(nowIso: string): string {
  const d = new Date(nowIso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `kurashi-base-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}
