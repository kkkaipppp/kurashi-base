import type { AppData, LifeChange, LifeItem, RecurringCycle } from "./types";

/**
 * 生活変化（NEXT v21 VALUE_DEPTH B03：引っ越し・転職など。適用日・変更前後・影響・項目別に確認・履歴を残す・取り消せる）。
 * 変えるのは「これからの設定」（固定費の金額・やめる・月の予算）だけ。過去の記録は書き換えない。
 * 適用は、本人が押したときだけ（適用日が来ても、自動では変えない）。変更前の値が今と違う項目は、ずれているので変えない。
 */
// 型は types.ts に置く（types.ts と、この部品の読み込みの輪をなくす。o11 A01）
export type { LifeChange, LifeItem } from "./types";

const PER_MONTH: Record<RecurringCycle, number> = { monthly: 1, weekly: 52 / 12, yearly: 1 / 12 };

/** 1か月あたりの影響（マイナスは、支出が減る）。予算は、固定費ではないので数えない */
export function monthlyImpact(d: Pick<AppData, "recurring">, item: LifeItem): number {
  if (item.kind === "budget") return 0;
  const r = d.recurring.find((x) => x.id === item.recurringId);
  if (!r) return 0;
  const f = PER_MONTH[r.cycle];
  const delta = item.kind === "recurringStop" ? -r.amount : item.after - item.before;
  return Math.round(delta * f);
}

export function totalMonthlyImpact(d: Pick<AppData, "recurring">, c: Pick<LifeChange, "items">): number {
  return c.items.reduce((a, it) => a + monthlyImpact(d, it), 0);
}

export const listChanges = (d: AppData): LifeChange[] => d.meta.lifeChanges ?? [];

export function addLifeChange(d: AppData, c: LifeChange): AppData {
  return { ...d, meta: { ...d.meta, lifeChanges: [...listChanges(d), c] } };
}

/** 項目が、いまの設定と合っているか（変更前の値が今と同じか） */
function matches(d: AppData, it: LifeItem): boolean {
  if (it.kind === "budget") return d.budget.monthly === it.before;
  const r = d.recurring.find((x) => x.id === it.recurringId);
  if (!r) return false;
  return it.kind === "recurringAmount" ? r.amount === it.before : r.active;
}

export interface ApplyResult {
  next: AppData;
  applied: number;
  /** ずれていて、変えなかった項目の数 */
  skipped: number;
}

export function applyLifeChange(d: AppData, id: string, ts: string): ApplyResult {
  const c = listChanges(d).find((x) => x.id === id);
  if (!c || c.status !== "planned") return { next: d, applied: 0, skipped: 0 };
  let cur = d;
  let applied = 0;
  const items = c.items.map((it): LifeItem => {
    if (!matches(cur, it)) return { ...it, applied: false };
    applied++;
    if (it.kind === "budget") cur = { ...cur, budget: { monthly: it.after } };
    else if (it.kind === "recurringAmount") cur = { ...cur, recurring: cur.recurring.map((r) => (r.id === it.recurringId ? { ...r, amount: it.after, updatedAt: ts } : r)) };
    else cur = { ...cur, recurring: cur.recurring.map((r) => (r.id === it.recurringId ? { ...r, active: false, updatedAt: ts } : r)) };
    return { ...it, applied: true };
  });
  const status: LifeChange["status"] = applied > 0 ? "applied" : "planned";
  const changes = listChanges(cur).map((x) => (x.id === id ? { ...x, items, status, ...(applied > 0 ? { appliedAt: ts } : {}) } : x));
  return { next: { ...cur, meta: { ...cur.meta, lifeChanges: changes } }, applied, skipped: c.items.length - applied };
}

/** 取り消す：適用した項目のうち、いまの値が「変更後」のままのものだけ、元に戻す（その後に本人が変えたものは触らない）。履歴は残す */
export function undoLifeChange(d: AppData, id: string, ts: string): AppData {
  const c = listChanges(d).find((x) => x.id === id);
  if (!c || c.status !== "applied") return d;
  let cur = d;
  for (const it of c.items) {
    if (!it.applied) continue;
    if (it.kind === "budget") {
      if (cur.budget.monthly === it.after) cur = { ...cur, budget: { monthly: it.before } };
    } else if (it.kind === "recurringAmount") {
      cur = { ...cur, recurring: cur.recurring.map((r) => (r.id === it.recurringId && r.amount === it.after ? { ...r, amount: it.before, updatedAt: ts } : r)) };
    } else {
      cur = { ...cur, recurring: cur.recurring.map((r) => (r.id === it.recurringId && !r.active ? { ...r, active: true, updatedAt: ts } : r)) };
    }
  }
  const changes = listChanges(cur).map((x) => (x.id === id ? { ...x, status: "undone" as const, undoneAt: ts } : x));
  return { ...cur, meta: { ...cur.meta, lifeChanges: changes } };
}

/** 計画のまま、消す（適用前だけ。履歴を残したいときは取り消し） */
export function removePlanned(d: AppData, id: string): AppData {
  const c = listChanges(d).find((x) => x.id === id);
  if (!c || c.status === "applied") return d;
  return { ...d, meta: { ...d.meta, lifeChanges: listChanges(d).filter((x) => x.id !== id) } };
}

/** 適用日が来ていて、まだ適用していない計画（本人に知らせる用。自動では適用しない） */
export const dueChanges = (d: AppData, today: string): LifeChange[] => listChanges(d).filter((c) => c.status === "planned" && c.date <= today);
