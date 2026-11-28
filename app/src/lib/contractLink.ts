import type { Contract, RecurringExpense } from "./types";

/**
 * 契約と固定費のつなぎ（To-Be 03「契約・固定費：正本を共有し重複生成禁止。既存の独立記録は推測で結合しない」。決定 2026-11-28 S3-3 ①）。
 * つなぐのは本人が選んだときだけ（名前が似ていても自動でつながない）。つないだ契約の金額・周期は、固定費の側を正本にする。
 */
export type ContractMoney = { amount: number | null; per: "month" | "year" | "week" | "once"; source: "recurring" | "contract" };

export function linkedRecurring(c: Pick<Contract, "recurringId">, recurring: RecurringExpense[]): RecurringExpense | null {
  if (!c.recurringId) return null;
  return recurring.find((r) => r.id === c.recurringId) ?? null;
}

/** 契約の画面に出す金額（つないだ固定費があれば、その金額と周期） */
export function contractMoney(c: Pick<Contract, "amount" | "cycle" | "recurringId">, recurring: RecurringExpense[]): ContractMoney {
  const r = linkedRecurring(c, recurring);
  if (r) return { amount: r.amount, per: r.cycle === "weekly" ? "week" : r.cycle === "yearly" ? "year" : "month", source: "recurring" };
  return { amount: c.amount, per: c.cycle === "monthly" ? "month" : c.cycle === "yearly" ? "year" : "once", source: "contract" };
}

/** 月あたりの目安（週は 52/12、年は 12 で割って四捨五入。一括は 0） */
export function monthlyOf(m: ContractMoney): number {
  if (m.amount === null) return 0;
  if (m.per === "month") return m.amount;
  if (m.per === "year") return Math.round(m.amount / 12);
  if (m.per === "week") return Math.round((m.amount * 52) / 12);
  return 0;
}

/** つなぎ先の固定費が見つからない契約（固定費を消した可能性。契約は残す） */
export const danglingContracts = (contracts: Contract[], recurring: RecurringExpense[]) => contracts.filter((c) => c.recurringId && !recurring.some((r) => r.id === c.recurringId));
