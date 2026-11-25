import { forecastMonthEnd } from "./forecast";
import type { AppData } from "./types";

/**
 * 月末までのシナリオ比較（NEXT v21 T08・X23：比較は同じ範囲＝今月の月末まで。見込みは確定にしない）。
 * 基準は「今のペース」（月末の見込み）。ほかは、残りの日の変動費だけを増減させる／大きな支出を1つ足す。
 * すでに使った額と、これから来る固定費は、どのシナリオでも同じ（変えない）。
 */
export interface Scenario {
  key: string;
  label: string;
  /** 月末の生活費の見込み */
  projected: number;
  /** 今のペースとの差（マイナス＝少ない） */
  diff: number;
  /** 予算 − 見込み（予算がなければ null。マイナス＝超える） */
  vsBudget: number | null;
}

export const CUT_PCT = 20;
export const UP_PCT = 20;

export type ScenarioResult = { ok: true; basis: { spent: number; unpaidFixed: number; variableAhead: number; daysAhead: number }; items: Scenario[] } | { ok: false };

export function compareScenarios(d: AppData, today: string, extraPurchase: number | null): ScenarioResult {
  const f = forecastMonthEnd(d, today);
  if (!f.ok) return { ok: false };
  const variableAhead = f.dailyVariable * f.daysAhead;
  const fixedPart = f.spent + f.unpaidFixed;
  const mk = (key: string, label: string, projected: number): Scenario => ({
    key,
    label,
    projected,
    diff: projected - f.projected,
    vsBudget: d.budget.monthly === null ? null : d.budget.monthly - projected,
  });
  const items = [
    mk("pace", "今のまま", f.projected),
    mk("cut", `残りの日の出費を${CUT_PCT}%減らす`, fixedPart + Math.round((variableAhead * (100 - CUT_PCT)) / 100)),
    mk("up", `残りの日の出費が${UP_PCT}%増える`, fixedPart + Math.round((variableAhead * (100 + UP_PCT)) / 100)),
  ];
  if (extraPurchase !== null && extraPurchase > 0) items.push(mk("buy", `今のままで、${extraPurchase.toLocaleString("ja-JP")}円の買い物をする`, f.projected + extraPurchase));
  return { ok: true, basis: { spent: f.spent, unpaidFixed: f.unpaidFixed, variableAhead, daysAhead: f.daysAhead }, items };
}
