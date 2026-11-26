"use client";

import { Card, SectionTitle } from "./ui";
import { todayStr } from "@/lib/date";
import { formatDiffYen, formatSignedYen, formatYen } from "@/lib/money";
import { monthBreakdown } from "@/lib/monthBreakdown";
import { investCategoryNames } from "@/lib/ledger";
import { useData } from "@/lib/store";

/** 月の振り返りに足す「生活と投資」「固定費と変動費」「先月より増えたもの」（自分用だけ） */
export function MonthBreakdownCard({ month }: { month: string }) {
  const data = useData();
  const today = todayStr();
  const b = monthBreakdown(data, month, today);
  const catName = (id: string) =>
    data.categories.find((c) => c.id === id)?.name ?? "（不明なカテゴリ）";
  const total = b.fixed + b.variable;
  const fixedPct = total > 0 ? Math.round((b.fixed / total) * 100) : 0;
  return (
    <>
      <Card>
        <SectionTitle>生活と投資</SectionTitle>
        <dl className="num grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-surface-2 py-2">
            <dt className="text-[12px] font-semibold text-ink-2">生活の収支</dt>
            <dd
              className={`text-[15px] font-bold ${b.lifeBalance < 0 ? "text-expense" : ""}`}
            >
              {formatSignedYen(b.lifeBalance)}
            </dd>
          </div>
          <div className="rounded-xl bg-event/10 py-2">
            <dt className="text-[12px] font-semibold text-event">
              投資に回した額
            </dt>
            <dd className="text-[15px] font-bold">{formatYen(b.invest)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[12px] text-ink-3">
          生活の収支＝収入 − 投資を除いた支出。投資として数えているカテゴリ：
          {investCategoryNames(data).join("・") ||
            "なし（名前に「投資」が入ったカテゴリがありません）"}
          。
          {b.nisaBuy > 0 &&
            `この月の NISA の買付は ${formatYen(b.nisaBuy)}（投資への入金と重なることがあるので、足していません）。`}
        </p>
      </Card>
      <Card>
        <SectionTitle>固定費と変動費</SectionTitle>
        {total > 0 ? (
          <>
            <div
              className="flex h-3 overflow-hidden rounded-full bg-surface-2"
              aria-hidden="true"
            >
              <div className="bg-ink-3" style={{ width: `${fixedPct}%` }} />
              <div
                className="bg-expense"
                style={{ width: `${100 - fixedPct}%` }}
              />
            </div>
            <dl className="num mt-2 grid grid-cols-2 gap-2 text-[13px]">
              <div>
                <dt className="text-ink-2">固定費（{fixedPct}%）</dt>
                <dd className="text-[15px] font-bold">{formatYen(b.fixed)}</dd>
              </div>
              <div>
                <dt className="text-ink-2">変動費（{100 - fixedPct}%）</dt>
                <dd className="text-[15px] font-bold text-expense">
                  {formatYen(b.variable)}
                </dd>
              </div>
            </dl>
            <p className="mt-1 text-[12px] text-ink-3">
              固定費は、固定費の画面で選んだカテゴリの支出です。
            </p>
          </>
        ) : (
          <p className="text-[14px] text-ink-3">この月の支出はまだありません</p>
        )}
      </Card>
      <Card>
        <SectionTitle>先月の同じ日と比べて</SectionTitle>
        {!b.hasPrev ? (
          <p className="text-[14px] text-ink-3">
            先月の記録がないので比べられません
          </p>
        ) : (
          <>
            <p className="num mb-1 text-[13px] text-ink-2">
              生活費の差：
              <strong
                className={b.diffTotal > 0 ? "text-expense" : "text-brand"}
              >
                {formatDiffYen(b.diffTotal)}
              </strong>
              （投資を除く）
            </p>
            {b.increases.length === 0 && b.decreases.length === 0 && (
              <p className="text-[14px] text-ink-3">
                カテゴリごとの増減はありません
              </p>
            )}
            <ul className="divide-y divide-line">
              {[...b.increases, ...b.decreases].map((x) => (
                <li
                  key={x.categoryId}
                  className="num flex min-h-11 items-center justify-between gap-2 text-[14px]"
                >
                  <span>{catName(x.categoryId)}</span>
                  <span className="text-right">
                    <strong
                      className={x.diff > 0 ? "text-expense" : "text-brand"}
                    >
                      {x.diff > 0
                        ? `+${formatYen(x.diff)}`
                        : `−${formatYen(-x.diff)}`}
                    </strong>
                    <span className="block text-[12px] text-ink-3">
                      {formatYen(x.prev)} → {formatYen(x.now)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}
