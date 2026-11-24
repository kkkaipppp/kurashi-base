import { advanceDueDate } from "./recurring";
import type { AppData, Transaction } from "./types";

/**
 * 保存の前の計算だけ（store.tsx から使う。テストできるように分けた。100点化の指示 D・E・F）。
 * どれも元のデータは変えず、新しいデータを返す。
 */

type TxPatch = Omit<Transaction, "id" | "createdAt" | "updatedAt" | "currency">;

/** 取引を編集する。固定費の支払いとして新しくつないだときだけ、その固定費の次の支払日を進める */
export function applyTxUpdate(d: AppData, id: string, t: TxPatch, ts: string): AppData {
  const before = d.transactions.find((x) => x.id === id);
  const link = t.recurringId && before && !before.recurringId ? t.recurringId : null;
  return {
    ...d,
    recurring: link ? d.recurring.map((rc) => (rc.id === link ? { ...rc, nextDueDate: advanceDueDate(rc.nextDueDate, rc.cycle, rc.anchorDay), updatedAt: ts } : rc)) : d.recurring,
    transactions: d.transactions.map((x) => {
      if (x.id !== id) return x;
      const merged: Transaction = { ...x, ...t, id, updatedAt: ts };
      // 空にした任意の項目は残さない
      for (const k of ["countAs", "tripId", "recurringId"] as const) if (merged[k] === undefined) delete merged[k];
      return merged;
    }),
  };
}

/** カテゴリをまとめる：記録と固定費を移して、元のカテゴリを非表示にする（消さない） */
export function mergeCategoryData(d: AppData, fromId: string, toId: string, ts: string): { ok: true; next: AppData; moved: number; label: string } | { ok: false; error: string } {
  const from = d.categories.find((c) => c.id === fromId);
  const to = d.categories.find((c) => c.id === toId);
  if (!from || !to || fromId === toId || from.kind !== to.kind || to.archived) return { ok: false, error: "まとめる先のカテゴリを選び直してください" };
  let moved = 0;
  const next: AppData = {
    ...d,
    transactions: d.transactions.map((x) => {
      if (x.categoryId !== fromId) return x;
      moved++;
      return { ...x, categoryId: toId, updatedAt: ts };
    }),
    recurring: d.recurring.map((x) => (x.categoryId === fromId ? { ...x, categoryId: toId, updatedAt: ts } : x)),
    categories: d.categories.map((c) => (c.id === fromId ? { ...c, archived: true } : c)),
  };
  return { ok: true, next, moved, label: `カテゴリ「${from.name}」を「${to.name}」にまとめる` };
}

/** 支出を旅行につなぐ（tripId が null なら外す） */
export function setTxTripData(d: AppData, txIds: string[], tripId: string | null, ts: string): AppData {
  const set = new Set(txIds);
  return {
    ...d,
    transactions: d.transactions.map((x) => {
      if (!set.has(x.id)) return x;
      const { tripId: _drop, ...rest } = x; // eslint-disable-line @typescript-eslint/no-unused-vars
      return tripId ? { ...rest, tripId, updatedAt: ts } : { ...rest, updatedAt: ts };
    }),
  };
}

/** 旅行を消すとき：つないだ支出は消さずに、旅行から外すだけ */
export function unlinkTripFromTx(d: AppData, tripId: string, ts: string): Transaction[] {
  return d.transactions.map((x) => {
    if (x.tripId !== tripId) return x;
    const { tripId: _drop, ...rest } = x; // eslint-disable-line @typescript-eslint/no-unused-vars
    return { ...rest, updatedAt: ts };
  });
}
