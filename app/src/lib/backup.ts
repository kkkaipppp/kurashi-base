import { checksum, validateAppData } from "./schema";
import type { AppData } from "./types";

export const BACKUP_FORMAT = "kurashi-base-backup";

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: 1;
  exportedAt: string;
  counts: { transactions: number; events: number; recurring: number; categories: number };
  checksum: string;
  data: AppData;
}

export function buildBackup(data: AppData, nowIso: string = new Date().toISOString()): BackupFile {
  const body = JSON.stringify(data);
  return {
    format: BACKUP_FORMAT,
    schemaVersion: 1,
    exportedAt: nowIso,
    counts: {
      transactions: data.transactions.length,
      events: data.events.length,
      recurring: data.recurring.length,
      categories: data.categories.length,
    },
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
  if (f.schemaVersion !== 1) return { ok: false, error: "対応していないバックアップのバージョンです" };
  const v = validateAppData(f.data);
  if (!v.ok) return { ok: false, error: v.error };
  if (f.checksum !== checksum(JSON.stringify(f.data))) return { ok: false, error: "チェックサムが一致しません。ファイルが壊れているか、変更されています" };
  const d = v.data;
  const counts = {
    transactions: d.transactions.length,
    events: d.events.length,
    recurring: d.recurring.length,
    categories: d.categories.length,
  };
  const warnings: string[] = [];
  if (f.counts && JSON.stringify(f.counts) !== JSON.stringify(counts)) warnings.push("記録された件数と中身の件数が一致しません");
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
    const total = incoming.transactions.length + incoming.events.length + incoming.recurring.length;
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
  return {
    data: {
      ...current,
      transactions: mergeList(current.transactions, incoming.transactions),
      events: mergeList(current.events, incoming.events),
      recurring: mergeList(current.recurring, incoming.recurring),
      categories: [...current.categories, ...incoming.categories.filter((c) => !catIds.has(c.id))],
    },
    added,
    skipped,
  };
}

export function backupFileName(nowIso: string): string {
  const d = new Date(nowIso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `kurashi-base-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}
