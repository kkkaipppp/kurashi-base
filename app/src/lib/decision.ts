import { unpaidRecurringThisMonth } from "./allowance";
import { categoryIsInvest, categoryMap } from "./classify";
import { forecastMonthEnd } from "./forecast";
import { monthLedger } from "./ledger";
import { BUDGET_EXCLUDES_INVEST } from "./ledgerCore";
import { parseDateStr, daysInMonth } from "./date";
import type { AppData } from "./types";

/**
 * 買い物の判断（NEXT v21 DECISION_SUPPORT：購入の影響を、根拠つきで並べる。「買うべき／買わないべき」とは言わない）。
 * 「今月買ったら」の影響：
 * - 自由に使える残り（予算 − 今月の生活費 − まだ来る固定費）と、1日あたり
 * - 月末の見込み（あれば）と、予算との差
 * 来月に回したら：来月の予算（あれば）と、来月に来る固定費の合計（予定額。今ある固定費の登録から）に対する、その買い物の割合
 * 予算が決まっていなければ、予算との比較は出さない（「余る」と言い切らない）。
 */
export interface PurchaseAssessment {
  amount: number;
  budget: number | null;
  /** 今月：買う前・買ったあと */
  freeLeft: { before: number | null; after: number | null };
  perDay: { before: number | null; after: number | null };
  daysLeft: number;
  /** 月末の見込み（予算と同じ範囲の支出）。記録が少ないと null */
  projected: { before: number; after: number } | null;
  /** 予算 − 月末の見込み（買う前・買ったあと）。予算か見込みがなければ null */
  vsBudget: { before: number; after: number } | null;
  /** 来月に回したとき */
  nextMonth: { budget: number | null; fixed: number; amountShareOfBudget: number | null };
  /** 買ったあとに、今月の予算を超えるか（自由に使える残りがマイナスになるか） */
  overFree: boolean;
}

export function assessPurchase(d: AppData, amount: number, today: string, excludeInvest: boolean = BUDGET_EXCLUDES_INVEST): PurchaseAssessment {
  const led = monthLedger(d, today.slice(0, 7), today, excludeInvest);
  const cats = categoryMap(d);
  const budget = d.budget.monthly;
  const before = led.freeLeft;
  const after = before === null ? null : before - amount;
  const { y, m, d: day } = parseDateStr(today);
  const daysLeft = daysInMonth(y, m) - day + 1;
  const perDayOf = (left: number | null) => (left === null ? null : Math.max(0, Math.floor(left / daysLeft)));
  const f = forecastMonthEnd(d, today, undefined, excludeInvest);
  const projected = f.ok ? { before: f.projected, after: f.projected + amount } : null;
  const vsBudget = projected && budget !== null ? { before: budget - projected.before, after: budget - projected.after } : null;
  // 来月の固定費：来月 1 日を今日として、その月に来る固定費の合計（投資の積立は生活費に入れない）
  const nm = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  // 「古い」の判定は、今月を基準にする（今月に払う予定の固定費は、来月も来る。Q30 の直しで来月の分が 0 にならないように）
  const fixed = unpaidRecurringThisMonth(d.recurring, nm, excludeInvest ? (r) => categoryIsInvest(cats.get(r.categoryId)) : undefined, `${today.slice(0, 7)}-01`);
  return {
    amount,
    budget,
    freeLeft: { before, after },
    perDay: { before: perDayOf(before), after: perDayOf(after) },
    daysLeft,
    projected,
    vsBudget,
    nextMonth: { budget, fixed, amountShareOfBudget: budget ? Math.round((amount / budget) * 100) : null },
    overFree: after !== null && after < 0,
  };
}

