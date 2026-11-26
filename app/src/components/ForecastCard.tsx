"use client";

import { Card, SectionTitle } from "./ui";
import { todayStr } from "@/lib/date";
import { forecastCurve, forecastMonthEnd, forecastReasonText } from "@/lib/forecast";
import { formatYen } from "@/lib/money";
import { useData } from "@/lib/store";
import { BUDGET_EXCLUDES_INVEST } from "@/lib/ledgerCore";

// 支出の範囲は予算と同じ（自分用は投資を除いた生活費、公開版はすべての支出。2026-11-26）
const LIFE = BUDGET_EXCLUDES_INVEST;

/**
 * 月末の見込み（今月を見ているときだけ。NEXT v21 G05・X23。2026-11-25 から公開版にも出す）。
 * 確定した記録ではない：「見込み」と書き、根拠（使った日数・件数・1日あたり）を出す。足りないときは理由を書く（0円とは出さない）
 */
export function ForecastCard({ month }: { month: string }) {
  const data = useData();
  const today = todayStr();
  if (month !== today.slice(0, 7)) return null;
  const f = forecastMonthEnd(data, today);
  const curve = f.ok ? forecastCurve(data, today) : null;
  return (
    <Card>
      <SectionTitle>月末の見込み</SectionTitle>
      {!f.ok ? (
        <p className="text-[13px] text-ink-3">{forecastReasonText(f.reason)}</p>
      ) : (
        <>
          <p className="num text-[24px] font-bold">
            約{formatYen(f.projected)}
            <span className="ml-1 text-[12px] font-medium text-ink-3">{LIFE ? "（投資を除く・見込み）" : "（見込み）"}</span>
          </p>
          {f.vsBudget !== null && (
            <p className={`num mt-0.5 text-[14px] font-semibold ${f.vsBudget < 0 ? "text-expense" : "text-income"}`}>
              {f.vsBudget < 0 ? `予算を約${formatYen(-f.vsBudget)}超える見込み` : `予算まで約${formatYen(f.vsBudget)}余る見込み`}
            </p>
          )}
          {curve && <CurveChart curve={curve} budget={data.budget.monthly} />}
          <dl className="num mt-2 space-y-0.5 rounded-xl border border-dashed border-line px-3 py-2 text-[12px] text-ink-2">
            <div className="flex justify-between">
              <dt>{LIFE ? "今月記録した生活費" : "今月記録した支出"}</dt>
              <dd>{formatYen(f.spent)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>今月、これから払う固定費</dt>
              <dd>+{formatYen(f.unpaidFixed)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>ふだんの出費 1日{formatYen(f.dailyVariable)} × 残り{f.daysAhead}日</dt>
              <dd>+{formatYen(f.dailyVariable * f.daysAhead)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-[12px] text-ink-3">
            確定ではありません。ふだんの出費は、直近{f.basisDays}日の支出（{f.basisTx}件。{LIFE ? "固定費・投資は除く" : "固定費は除く"}）の、1日あたりです。
          </p>
        </>
      )}
    </Card>
  );
}

/** 実績（実線）と見込み（破線）。確定していない部分は、線の形と凡例の言葉で区別する（色だけに頼らない） */
function CurveChart({ curve, budget }: { curve: NonNullable<ReturnType<typeof forecastCurve>>; budget: number | null }) {
  const W = 300;
  const H = 110;
  const P = 6;
  const n = curve.daysInMonth;
  const endV = curve.projected[curve.projected.length - 1];
  const max = Math.max(endV, budget ?? 0, 1);
  const x = (day: number) => P + ((W - 2 * P) * (day - 1)) / Math.max(1, n - 1);
  const y = (v: number) => H - P - ((H - 2 * P) * v) / max;
  const today = curve.actual.length;
  const solid = curve.actual.map((v, i) => `${x(i + 1)},${y(v)}`).join(" ");
  const dashed = curve.projected.map((v, i) => `${x(today + i)},${y(v)}`).join(" ");
  return (
    <figure className="mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`月の${LIFE ? "生活費" : "支出"}の累計。今日までの実績は実線、月末までの見込みは破線で、月末は約${formatYen(endV)}の見込み`} className="w-full">
        {budget !== null && <line x1={P} x2={W - P} y1={y(budget)} y2={y(budget)} stroke="currentColor" strokeWidth="1" strokeDasharray="1 3" className="text-ink-3" />}
        <polyline points={solid} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-brand" />
        <polyline points={dashed} fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="6 4" className="text-ink-2" />
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-ink-3">
        <span>
          <span aria-hidden="true">━ </span>実績（今日まで）
        </span>
        <span>
          <span aria-hidden="true">┅ </span>見込み（確定ではありません）
        </span>
        {budget !== null && (
          <span>
            <span aria-hidden="true">··· </span>予算
          </span>
        )}
      </figcaption>
    </figure>
  );
}
