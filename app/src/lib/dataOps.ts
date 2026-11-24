import { categoryIsInvest } from "./classify";
import { advanceDueDate } from "./recurring";
import type { AppData, RecurringExpense, Transaction } from "./types";

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
    recurring: link ? applyRecurringPayment(d.recurring, link, t.amount, !!t.recurringPartial, ts) : d.recurring,
    transactions: d.transactions.map((x) => {
      if (x.id !== id) return x;
      const merged: Transaction = { ...x, ...t, id, updatedAt: ts };
      // 空にした任意の項目は残さない
      for (const k of ["countAs", "tripId", "recurringId", "recurringPartial"] as const) if (merged[k] === undefined || merged[k] === false) delete merged[k];
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
  // 元と先で数え方（生活費・投資）が違うときは、移す記録に元の数え方を残す（まとめても予算の数字が黙って変わらない）
  const keep = categoryIsInvest(from) !== categoryIsInvest(to) ? (categoryIsInvest(from) ? "invest" : "life") : null;
  const next: AppData = {
    ...d,
    transactions: d.transactions.map((x) => {
      if (x.categoryId !== fromId) return x;
      moved++;
      return { ...x, categoryId: toId, ...(keep && x.type === "expense" && !x.countAs ? { countAs: keep } : {}), updatedAt: ts };
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

/**
 * 固定費の支払いを記録したときの、固定費の更新（NEXT v21 X02：予定と実績を別の値で持つ）。
 * - 全額（partial なし）：次の支払日を進め、一部払いの記録を消す
 * - 一部（partial）：次の支払日は進めず、払った額を足す。足した額が予定額に届いたら、全額と同じ（次の支払日を進める）
 * 返金・取り消しは別の処理（支払いの記録を消すと、一部の分は戻す。次の支払日を進めた分は戻さない＝今までと同じ）
 */
export function applyRecurringPayment(list: RecurringExpense[], rcId: string, amount: number, partial: boolean, ts: string): RecurringExpense[] {
  return list.map((rc) => {
    if (rc.id !== rcId) return rc;
    const prev = rc.partialPaid && rc.partialPaid.due === rc.nextDueDate ? rc.partialPaid.paid : 0;
    const paid = partial ? prev + amount : rc.amount;
    if (paid >= rc.amount) {
      const { partialPaid: _drop, ...rest } = rc; // eslint-disable-line @typescript-eslint/no-unused-vars
      return { ...rest, nextDueDate: advanceDueDate(rc.nextDueDate, rc.cycle, rc.anchorDay), updatedAt: ts };
    }
    return { ...rc, partialPaid: { due: rc.nextDueDate, paid }, updatedAt: ts };
  });
}

/** 一部の支払いの記録を消したとき、その分を戻す（0 になったら一部払いの記録を消す） */
export function revertPartialPayment(list: RecurringExpense[], tx: Pick<Transaction, "recurringId" | "recurringPartial" | "amount">, ts: string): RecurringExpense[] {
  if (!tx.recurringId || !tx.recurringPartial) return list;
  return list.map((rc) => {
    if (rc.id !== tx.recurringId || !rc.partialPaid) return rc;
    const paid = Math.max(0, rc.partialPaid.paid - tx.amount);
    if (paid === 0) {
      const { partialPaid: _drop, ...rest } = rc; // eslint-disable-line @typescript-eslint/no-unused-vars
      return { ...rest, updatedAt: ts };
    }
    return { ...rc, partialPaid: { ...rc.partialPaid, paid }, updatedAt: ts };
  });
}
