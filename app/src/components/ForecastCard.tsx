"use client";

import { Card, SectionTitle } from "./ui";
import { todayStr } from "@/lib/date";
import { forecastMonthEnd, forecastReasonText } from "@/lib/forecast";
import { formatYen } from "@/lib/money";
import { useData } from "@/lib/store";

/**
 * 月末の見込み（自分用。今月を見ているときだけ。NEXT v21 G05・X23）。
 * 確定した記録ではない：「見込み」と書き、根拠（使った日数・件数・1日あたり）を出す。足りないときは理由を書く（0円とは出さない）
 */
export function ForecastCard({ month }: { month: string }) {
  const data = useData();
  const today = todayStr();
  if (month !== today.slice(0, 7)) return null;
  const f = forecastMonthEnd(data, today);
  return (
    <Card>
      <SectionTitle>月末の見込み</SectionTitle>
      {!f.ok ? (
        <p className="text-[13px] text-ink-3">{forecastReasonText(f.reason)}</p>
      ) : (
        <>
          <p className="num text-[24px] font-bold">
            約{formatYen(f.projected)}
            <span className="ml-1 text-[12px] font-medium text-ink-3">（生活費・見込み）</span>
          </p>
          {f.vsBudget !== null && (
            <p className={`num mt-0.5 text-[14px] font-semibold ${f.vsBudget < 0 ? "text-expense" : "text-income"}`}>
              {f.vsBudget < 0 ? `予算を約${formatYen(-f.vsBudget)}超える見込み` : `予算まで約${formatYen(f.vsBudget)}余る見込み`}
            </p>
          )}
          <dl className="num mt-2 space-y-0.5 rounded-xl border border-dashed border-line px-3 py-2 text-[12px] text-ink-2">
            <div className="flex justify-between">
              <dt>今月これまでの生活費</dt>
              <dd>{formatYen(f.spent)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>まだ来る今月の固定費</dt>
              <dd>＋{formatYen(f.unpaidFixed)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>変動費 {formatYen(f.dailyVariable)}／日 × 残り{f.daysAhead}日</dt>
              <dd>＋{formatYen(f.dailyVariable * f.daysAhead)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-[12px] text-ink-3">
            確定ではありません。変動費は、直近{f.basisDays}日の記録（{f.basisTx}件。固定費と投資を除く）の1日あたりで計算しています。
          </p>
        </>
      )}
    </Card>
  );
}
