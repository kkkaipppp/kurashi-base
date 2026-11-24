import type { AppData, ImportBatch, Transaction } from "./types";

/**
 * 取り込みの履歴と取り消し（NEXT v21 CSV:C08：バッチ ID・取込履歴・取消時は後続の編集を検知して差分を確認）。
 * - CSV を取り込むとき、その取り込みで「実際に足した」取引に、取り込みの ID（importBatchId）を付け、履歴に1行足す
 * - 取り消し：その取り込みで足した取引のうち、あとから変えていないもの（updatedAt が最初のまま・旅行や固定費につないでいない）だけを消す。
 *   変えたもの・つないだものは残して、件数を知らせる（本人の編集を黙って消さない）
 * - 履歴は消さず、取り消した日時を付ける。取り消しの控え（replaceAll の undo）も別に残る
 */
export function newBatchId(nowIso: string): string {
  return `imp_${nowIso.replace(/[-:.TZ]/g, "").slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** 取り込む記録に、取り込みの ID を付ける（新しく足されるものだけが、あとで取り消しの対象になる） */
export function stampBatch(txs: Transaction[], batchId: string): Transaction[] {
  return txs.map((t) => ({ ...t, importBatchId: batchId }));
}

/**
 * 取り込んだ結果（merged）のうち、この取り込みの ID が付いて実際に足された取引の件数を数え、履歴に1行足す。
 * （同じ ID の記録がすでにあった場合は、追加されず、今の記録のまま残る＝その記録には ID が付かない）
 */
export function recordBatch(merged: AppData, batch: Omit<ImportBatch, "added">): { data: AppData; added: number } {
  const added = merged.transactions.filter((t) => t.importBatchId === batch.id).length;
  const imports = [...(merged.meta.imports ?? []), { ...batch, added }];
  return { data: { ...merged, meta: { ...merged.meta, imports } }, added };
}

export interface UndoBatchResult {
  next: AppData;
  removed: number;
  /** あとから変えた・つないだので、残した件数 */
  kept: number;
}

const touched = (t: Transaction) => t.updatedAt !== t.createdAt || !!t.tripId || !!t.recurringId || !!t.countAs;

export function undoBatch(d: AppData, batchId: string, nowIso: string): { ok: true; result: UndoBatchResult } | { ok: false; error: string } {
  const b = (d.meta.imports ?? []).find((x) => x.id === batchId);
  if (!b) return { ok: false, error: "この取り込みが見つかりません" };
  if (b.undoneAt) return { ok: false, error: "この取り込みは、すでに取り消しています" };
  const mine = d.transactions.filter((t) => t.importBatchId === batchId);
  const removeIds = new Set(mine.filter((t) => !touched(t)).map((t) => t.id));
  const next: AppData = {
    ...d,
    transactions: d.transactions.filter((t) => !removeIds.has(t.id)),
    meta: { ...d.meta, imports: (d.meta.imports ?? []).map((x) => (x.id === batchId ? { ...x, undoneAt: nowIso } : x)) },
  };
  return { ok: true, result: { next, removed: removeIds.size, kept: mine.length - removeIds.size } };
}

/** 取り消せる取り込み（新しい順。取り消し済みは除く） */
export function undoableBatches(d: AppData): ImportBatch[] {
  return [...(d.meta.imports ?? [])].filter((b) => !b.undoneAt).sort((a, b) => b.at.localeCompare(a.at));
}
