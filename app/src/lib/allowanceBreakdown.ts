import { unpaidRecurringOccurrences } from "./allowance";
import { eventsOnDay } from "./aggregate";
import { categoryIsInvest, categoryMap } from "./classify";
import { addDays, daysInMonth, parseDateStr } from "./date";
import { monthLedger } from "./ledger";
import { BUDGET_EXCLUDES_INVEST } from "./ledgerCore";
import type { AppData } from "./types";

/**
 * 「今月あといくら使えるか」の根拠（A3。2026-11-26 平尾さん「全部おすすめで」＝更新案の方針 A1〜A5 を先に）。
 * ホームの「1日あたり」と同じ計算（lib/ledger.ts の monthLedger）を、1行ずつの内訳にする。新しい数字は作らない。
 *   予算 − 使った額 − これから払う固定費（1件ずつ） ＝ 自由に使える残り。÷ 月末までの日数（今日を含む） ＝ 1日あたり
 * あわせて、今日から月末までの予定に入れた「費用の目安」を出す（引いてはいない。引いた場合の1日あたりも参考に出す）。
 */
export interface AllowanceBreakdown {
  budget: number;
  spent: number;
  fixed: { name: string; date: string; amount: number }[];
  unpaidFixed: number;
  freeLeft: number;
  daysLeft: number;
  perDay: number;
  /** 予定の費用の目安（今日〜月末。引いていない） */
  eventCosts: { title: string; date: string; cost: number }[];
  eventCostTotal: number;
  /** 予定の費用の目安も引いた場合の1日あたり（目安がなければ null） */
  perDayWithEvents: number | null;
}

export function allowanceBreakdown(d: AppData, today: string, excludeInvest: boolean = BUDGET_EXCLUDES_INVEST): AllowanceBreakdown | null {
  const month = today.slice(0, 7);
  const led = monthLedger(d, month, today, excludeInvest);
  if (led.budget === null || led.freeLeft === null || led.perDay === null) return null;
  const cats = categoryMap(d);
  const fixed: AllowanceBreakdown["fixed"] = [];
  for (const r of d.recurring) {
    if (excludeInvest && categoryIsInvest(cats.get(r.categoryId))) continue;
    for (const o of unpaidRecurringOccurrences([r], today)) if (o.amount > 0) fixed.push({ name: r.name, date: o.date, amount: o.amount });
  }
  fixed.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const { y, m } = parseDateStr(today);
  const end = `${month}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
  const eventCosts: AllowanceBreakdown["eventCosts"] = [];
  // 何日かにまたがる予定は1回だけ（繰り返しは回ごと）。終わった回は数えない
  const seen = new Set<string>();
  for (let day = today; day <= end; day = addDays(day, 1))
    for (const e of eventsOnDay(d.events, day)) {
      if (typeof e.cost !== "number" || e.cost <= 0 || (e.doneDates ?? []).includes(day)) continue;
      const k = (e.repeat ?? "none") === "none" ? e.id : `${e.id}|${day}`;
      if (seen.has(k)) continue;
      seen.add(k);
      eventCosts.push({ title: e.title, date: day, cost: e.cost });
    }
  const eventCostTotal = eventCosts.reduce((s, e) => s + e.cost, 0);
  return {
    budget: led.budget,
    spent: led.spent,
    fixed,
    unpaidFixed: led.unpaidFixed,
    freeLeft: led.freeLeft,
    daysLeft: led.daysLeft,
    perDay: led.perDay,
    eventCosts,
    eventCostTotal,
    perDayWithEvents: eventCostTotal > 0 ? Math.max(0, Math.floor((led.freeLeft - eventCostTotal) / led.daysLeft)) : null,
  };
}
