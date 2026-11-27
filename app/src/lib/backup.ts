import { checksum, CURRENT_SCHEMA, validateAppData, validateRelationships } from "./schema";
import { COLLECTION_KEYS, type AppData, type Category, type CollectionKey } from "./types";
import { DEFAULT_CATEGORY_IDS } from "./defaults";

export const BACKUP_FORMAT = "kurashi-base-backup";

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  counts: Counts;
  checksum: string;
  data: AppData;
}

export type Counts = Record<"transactions" | "events" | "recurring" | "categories" | "trips" | CollectionKey, number>;

export function countData(d: AppData): Counts {
  const c = {
    transactions: d.transactions.length,
    events: d.events.length,
    recurring: d.recurring.length,
    categories: d.categories.length,
    trips: (d.trips ?? []).length,
  } as Counts;
  for (const k of COLLECTION_KEYS) c[k] = d[k].length;
  return c;
}

/** 復元プレビューで見せる件数の名前 */
export const COUNT_LABELS: Record<keyof Counts, string> = {
  transactions: "支出・収入",
  events: "予定",
  recurring: "固定費",
  categories: "カテゴリ",
  trips: "旅行",
  nisa: "NISAの記録",
  notes: "生活記録・メモ",
  tasks: "やること",
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
    return { ok: false, error: "バックアップファイルとして読み込めません。ファイルが壊れている可能性があります" };
  }
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "バックアップ形式ではありません" };
  const f = raw as Partial<BackupFile>;
  if (f.format !== BACKUP_FORMAT) return { ok: false, error: "くらしベースのバックアップファイルではありません" };
  if (f.schemaVersion !== 1 && f.schemaVersion !== CURRENT_SCHEMA) return { ok: false, error: "対応していないバックアップのバージョンです" };
  if (!f.data || typeof f.data !== "object" || Array.isArray(f.data) || typeof f.checksum !== "string")
    return { ok: false, error: "バックアップの中身が足りません。ファイルが壊れている可能性があります" };
  // チェックサムはファイルに書かれたままの中身で確かめてから、今の形式に移行する
  if (f.checksum !== checksum(JSON.stringify(f.data))) return { ok: false, error: "ファイルが壊れているか、書き出したあとに変更されています" };
  const v = validateAppData(f.data);
  if (!v.ok) return { ok: false, error: v.error };
  const references = validateRelationships(v.data);
  if (!references.ok) return { ok: false, error: references.error };
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

export type RestoreResult =
  | {
      ok: true;
      data: AppData;
      added: number; // 新しく取り込む記録
      duplicates: number; // まったく同じ記録（取り込まない）
      conflicts: number; // 同じIDで中身が違う記録（今のものを残す）
      dependentSkipped: number; // 参照先（カテゴリ・資格）が食い違うため取り込まない記録
    }
  | { ok: false; error: string };

type WithId = { id: string };
// 取り込み（CSV）の記録は、取り込みの印（importBatchId）が付く。印と、取り込んだ時刻（createdAt・updatedAt）は記録の中身ではないので、
// 取り込みの記録を比べるときは外す（同じ ID の CSV の行は同じ内容。取り込み直しで全件が「内容が違う」にならないように）。
// 取り込み以外（バックアップなど）は、今までどおり全部を比べる
const strip = (x: unknown, drop: boolean) => {
  if (!drop || !x || typeof x !== "object") return x;
  const { importBatchId: _a, createdAt: _b, updatedAt: _c, ...rest } = x as Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest;
};
const same = (a: unknown, b: unknown) => {
  const imp = !!b && typeof b === "object" && "importBatchId" in (b as object);
  return JSON.stringify(strip(a, imp)) === JSON.stringify(strip(b, imp));
};

/**
 * 復元。replace = 全置き換え。merge = 今のデータに追加する。
 * merge の規則：
 *  - 同じIDで中身も同じ → 取り込まない（同じ記録）
 *  - 同じIDで中身が違う → 今の記録を残す（競合）
 *  - カテゴリは「名前と種別」（初期カテゴリは名前を変えられるので種別だけ）、資格は「名前」が同じなら同じものとみなす。意味が違えば競合とし、
 *    それを参照する取引・固定費・勉強記録は取り込まない（別の意味のものへ紐づくのを防ぐ）
 *  - 最後に結果全体を検証し、通らなければ何も返さない（呼び出し側は保存しない）
 * 新しいオブジェクトを返すだけで、保存は呼び出し側がまとめて1回行う。
 */
export function applyRestore(current: AppData, incoming: AppData, mode: "replace" | "merge"): RestoreResult {
  if (mode === "replace") {
    const data = structuredClone(incoming);
    const v = validateAppData(data);
    if (!v.ok) return { ok: false, error: `復元できませんでした。バックアップの中身に問題があります（${v.error}）` };
    const rel = validateRelationships(v.data);
    if (!rel.ok) return { ok: false, error: `復元できませんでした。${rel.error}` };
    const c = countData(data);
    const total = Object.entries(c).filter(([k]) => k !== "categories").reduce((s, [, n]) => s + n, 0);
    return { ok: true, data: v.data, added: total, duplicates: 0, conflicts: 0, dependentSkipped: 0 };
  }

  let added = 0;
  let duplicates = 0;
  let conflicts = 0;
  let dependentSkipped = 0;

  // 意味が食い違うカテゴリ・資格のID
  const curCat = new Map(current.categories.map((c) => [c.id, c]));
  // 初期カテゴリ（exp-1 など）は、どの端末でも同じ ID の同じ枠。名前を変えていても、種別が同じなら同じものとみなす
  const sameCategory = (a: Category, b: Category) => a.kind === b.kind && (a.name === b.name || DEFAULT_CATEGORY_IDS.has(a.id));
  const badCat = new Set(incoming.categories.filter((c) => curCat.has(c.id) && !sameCategory(curCat.get(c.id)!, c)).map((c) => c.id));
  const curSubj = new Map(current.studySubjects.map((s) => [s.id, s]));
  const badSubj = new Set(incoming.studySubjects.filter((s) => curSubj.has(s.id) && curSubj.get(s.id)!.name !== s.name).map((s) => s.id));
  // 旅行IDが一致していても行き先・期間・名前が異なるなら、別の旅行の可能性がある。
  // この旅行を指す予定を取り込むと、別の旅程に紐づいてしまうため安全側でスキップする。
  const curTrip = new Map((current.trips ?? []).map((t) => [t.id, t]));
  const badTrip = new Set((incoming.trips ?? []).filter((t) => {
    const existing = curTrip.get(t.id);
    return existing && (existing.title !== t.title || existing.destination !== t.destination ||
      existing.startDate !== t.startDate || existing.endDate !== t.endDate);
  }).map((t) => t.id));

  /** 一覧を合成する。sameMeaning は「IDが同じとき、同じものとみなすか」（既定：中身が完全に同じ） */
  const mergeList = <T extends WithId>(a: T[], b: T[], opts: { skipIf?: (x: T) => boolean; sameMeaning?: (x: T, y: T) => boolean } = {}): T[] => {
    const byId = new Map(a.map((x) => [x.id, x]));
    const out = [...a];
    for (const x of b) {
      const cur = byId.get(x.id);
      if (cur) {
        if (same(cur, x) || opts.sameMeaning?.(cur, x)) duplicates++;
        else conflicts++;
        continue;
      }
      if (opts.skipIf?.(x)) {
        dependentSkipped++;
        continue;
      }
      out.push(x);
      byId.set(x.id, x);
      added++;
    }
    return out;
  };

  const categories = mergeList(current.categories, incoming.categories, { sameMeaning: sameCategory });
  // 初期カテゴリはどのバックアップにも入っているので、「同じ記録」の件数には数えない
  duplicates = 0;
  const data: AppData = {
    ...current,
    categories,
    transactions: mergeList(current.transactions, incoming.transactions, { skipIf: (t) => badCat.has(t.categoryId) || (!!t.tripId && badTrip.has(t.tripId)) }),
    events: mergeList(current.events, incoming.events, { skipIf: (e) => !!e.tripId && badTrip.has(e.tripId) }),
    trips: mergeList(current.trips ?? [], incoming.trips ?? []),
    recurring: mergeList(current.recurring, incoming.recurring, { skipIf: (r) => badCat.has(r.categoryId) }),
    studySubjects: mergeList(current.studySubjects, incoming.studySubjects, { sameMeaning: (x, y) => x.name === y.name }),
    studyLogs: mergeList(current.studyLogs, incoming.studyLogs, { skipIf: (l) => badSubj.has(l.subjectId) }),
  };
  for (const k of COLLECTION_KEYS) {
    if (k === "studySubjects" || k === "studyLogs") continue;
    (data as unknown as Record<string, WithId[]>)[k] = mergeList(current[k] as WithId[], incoming[k] as WithId[]);
  }
  // カテゴリは件数の数え方から外す（合計の「記録」にカテゴリを含めない）
  const catAdded = categories.length - current.categories.length;
  added -= catAdded;

  const v = validateAppData(data);
  if (!v.ok) return { ok: false, error: `復元できませんでした。合わせた結果に問題があります（${v.error}）。今のデータは変更していません` };
  const rel = validateRelationships(v.data);
  if (!rel.ok) return { ok: false, error: `復元できませんでした。${rel.error}。今のデータは変更していません` };
  return { ok: true, data: v.data, added, duplicates, conflicts, dependentSkipped };
}

export function backupFileName(nowIso: string): string {
  const d = new Date(nowIso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `kurashi-base-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

// 復元で読むファイルの上限。書き出しも同じ値で確かめる（ADR-002「守ること」1：書き出せたファイルは必ず戻せる）。
// 自分用で上げるのは、iPhone 実機で大きな復元を試してから（ADR-002 決定 2026-11-27）
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

// 書き出すファイルが上限の 8 割を超えたら知らせる（止めはしない。記録を守る手段を減らさないため）
export function backupSizeNotice(bytes: number, max: number = MAX_BACKUP_BYTES): string | null {
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
  if (bytes > max) return `このバックアップは ${mb(bytes)}MB で、このアプリで戻せる大きさ（${mb(max)}MB）を超えています。このファイルは消さずに残してください`;
  if (bytes > max * 0.8) return `このバックアップは ${mb(bytes)}MB で、戻せる大きさ（${mb(max)}MB）に近づいています`;
  return null;
}
