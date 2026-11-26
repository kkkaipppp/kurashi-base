import { categoryIsInvest, categoryMap, isMoveOnly, txIsFixed, txIsInvest } from "@/lib/classify";
import { unpaidRecurringOccurrences, unpaidRecurringThisMonth } from "@/lib/allowance";
import { addDays, daysBetween, daysInMonth, parseDateStr } from "@/lib/date";
import type { AppData } from "@/lib/types";

/**
 * 月末の支出の見込み（NEXT v21 DECISION_SUPPORT・FINANCIAL_CHARTS G05・X23：予測と確定を区別し、根拠と不足を示す）。
 * 見込み＝今月の生活費（投資を除く）＋ まだ来る今月の固定費 ＋ 変動費の1日あたり × 残りの日数。
 * - 変動費の1日あたり：過去28日（今日を含まない）の、固定費でも投資でもない支出 ÷ 日数。記録が始まった日より前は数えない
 * - 記録が少ない（その窓の日数が7日未満・変動費の記録が3件未満）ときは、見込みを出さない（「記録なし」と「0円」を取り違えない）
 * - 確定した記録ではない。画面では「見込み」と書き、破線などで確定と区別する
 */
export const FORECAST_WINDOW_DAYS = 28;
export const FORECAST_MIN_DAYS = 7;
export const FORECAST_MIN_TX = 3;

export type Forecast =
  | {
      ok: true;
      /** 今月これまでの生活費 */
      spent: number;
      /** まだ来る今月の固定費 */
      unpaidFixed: number;
      /** 変動費の1日あたり（四捨五入せず切り捨て） */
      dailyVariable: number;
      /** 今日の次の日から月末までの日数（今日は、今日の記録がすでに入っているので数えない） */
      daysAhead: number;
      /** 月末の見込み（生活費） */
      projected: number;
      /** 見込みを出すのに使った日数と件数 */
      basisDays: number;
      basisTx: number;
      /** 予算がある場合：予算 − 見込み（マイナスは超える見込み） */
      vsBudget: number | null;
    }
  | { ok: false; reason: "tooFewDays" | "tooFewRecords" | "noData" };

export function forecastMonthEnd(data: AppData, today: string): Forecast {
  const { y, m, d } = parseDateStr(today);
  const month = today.slice(0, 7);
  const cats = categoryMap(data);
  const expenses = data.transactions.filter((t) => t.type === "expense" && !isMoveOnly(t) && !txIsInvest(t, cats));
  if (expenses.length === 0) return { ok: false, reason: "noData" };

  // 2026-11-26 平尾さん「全部おすすめで」（承認待ち⑤）で意図して変えた：今日より後の日付の記録も数える（本体の lib/forecast.ts と同じ変更。この比べの元も合わせる）
  const spent = expenses.filter((t) => t.date.slice(0, 7) === month).reduce((a, t) => a + t.amount, 0);
  // 投資の固定費（積立など）は、生活費の見込みに入れない
  const unpaidFixed = unpaidRecurringThisMonth(data.recurring, today, (r) => categoryIsInvest(cats.get(r.categoryId)));

  // 変動費の窓：今日の前日から28日さかのぼる。いちばん古い記録より前は、記録がなかっただけかもしれないので数えない
  const first = expenses.reduce((a, t) => (t.date < a ? t.date : a), expenses[0].date);
  const winEnd = addDays(today, -1);
  const winStart = addDays(today, -FORECAST_WINDOW_DAYS);
  const from = first > winStart ? first : winStart;
  const basisDays = from > winEnd ? 0 : daysBetween(from, winEnd) + 1;
  if (basisDays < FORECAST_MIN_DAYS) return { ok: false, reason: "tooFewDays" };
  const variable = expenses.filter((t) => t.date >= from && t.date <= winEnd && !txIsFixed(t, data.recurring));
  if (variable.length < FORECAST_MIN_TX) return { ok: false, reason: "tooFewRecords" };
  const dailyVariable = Math.floor(variable.reduce((a, t) => a + t.amount, 0) / basisDays);

  const daysAhead = daysInMonth(y, m) - d;
  const projected = spent + unpaidFixed + dailyVariable * daysAhead;
  const vsBudget = data.budget.monthly === null ? null : data.budget.monthly - projected;
  return { ok: true, spent, unpaidFixed, dailyVariable, daysAhead, projected, basisDays, basisTx: variable.length, vsBudget };
}

export function forecastReasonText(r: "tooFewDays" | "tooFewRecords" | "noData"): string {
  return r === "noData"
    ? "まだ支出の記録がないので、見込みは出せません"
    : r === "tooFewDays"
      ? `記録が始まって${FORECAST_MIN_DAYS}日たつと、月末の見込みを出します`
      : `変動費の記録が${FORECAST_MIN_TX}件以上になると、月末の見込みを出します`;
}

/** グラフ用：実績（実線）と見込み（破線）。見込みの終わりは、月末の見込みと同じ額になる（X23） */
export interface ForecastCurve {
  daysInMonth: number;
  /** 今日までの、日ごとの生活費の累計（1日目〜今日） */
  actual: number[];
  /** 今日から月末までの累計の見込み（今日の分から始まり、月末で終わる。長さ＝月末 − 今日 + 1） */
  projected: number[];
}

export function forecastCurve(data: AppData, today: string): ForecastCurve | null {
  const f = forecastMonthEnd(data, today);
  if (!f.ok) return null;
  const { y, m, d } = parseDateStr(today);
  const dim = daysInMonth(y, m);
  const month = today.slice(0, 7);
  const cats = categoryMap(data);
  const perDay = new Array<number>(dim).fill(0);
  const laterOn = new Array<number>(dim + 1).fill(0); // 承認待ち⑤で意図して変えた（上と同じ）
  for (const t of data.transactions) {
    if (t.type !== "expense" || isMoveOnly(t) || txIsInvest(t, cats)) continue;
    if (t.date.slice(0, 7) !== month) continue;
    if (t.date > today) laterOn[Number(t.date.slice(8, 10))] += t.amount;
    else perDay[Number(t.date.slice(8, 10)) - 1] += t.amount;
  }
  const actual: number[] = [];
  let acc = 0;
  for (let i = 0; i < d; i++) actual.push((acc += perDay[i]));

  // 固定費：まだ来る日に載せる。すでに過ぎた分・今日の分は、明日にまとめる（合計は月末の見込みと同じ）
  const fixedOn = new Array<number>(dim + 1).fill(0);
  for (const occurrence of unpaidRecurringOccurrences(data.recurring, today, (r) => categoryIsInvest(cats.get(r.categoryId)))) {
    const day = Math.max(d + 1, Number(occurrence.date.slice(8, 10)));
    if (day <= dim) fixedOn[day] += occurrence.amount;
  }
  const projected: number[] = [actual[d - 1]];
  let cur = actual[d - 1];
  for (let day = d + 1; day <= dim; day++) {
    cur += f.dailyVariable + fixedOn[day] + laterOn[day];
    projected.push(cur);
  }
  // 月末の日が今日なら、固定費の残りを今日に足す
  if (d === dim) projected[0] += f.unpaidFixed;
  return { daysInMonth: dim, actual, projected };
}
