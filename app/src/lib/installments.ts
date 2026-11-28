import { clampDay, parseDateStr } from "./date";
import type { Installment } from "./types";

/**
 * 分割払い（To-Be 02 家計簿「分割払い」。2026-11-28。自分用）：支払いの予定を見るための控え。
 * 買ったときの支出は家計簿に1回だけ記録する（ここの額は収支に数えない。二重に数えない）。
 * 毎月の額＝総額 ÷ 回数（切り捨て）。割り切れない分は1回目に足す（カード会社の明細と違うときは、明細を見てください）
 */
export function installmentPlan(x: Pick<Installment, "total" | "count" | "firstDate">): { date: string; amount: number }[] {
  if (!x.firstDate || x.count < 1 || x.total < 1) return [];
  const per = Math.floor(x.total / x.count);
  const first = x.total - per * (x.count - 1);
  const f = parseDateStr(x.firstDate);
  const out: { date: string; amount: number }[] = [];
  for (let i = 0; i < x.count; i++) {
    const m0 = f.m - 1 + i;
    out.push({ date: clampDay(f.y + Math.floor(m0 / 12), (m0 % 12) + 1, f.d), amount: i === 0 ? first : per });
  }
  return out;
}

/** 今日までに払った回・残りの額・次の支払い */
export function installmentStatus(x: Pick<Installment, "total" | "count" | "firstDate">, today: string) {
  const plan = installmentPlan(x);
  const paid = plan.filter((p) => p.date <= today);
  const paidAmount = paid.reduce((s, p) => s + p.amount, 0);
  const next = plan.find((p) => p.date > today) ?? null;
  return { paidCount: paid.length, left: x.total - paidAmount, next };
}
