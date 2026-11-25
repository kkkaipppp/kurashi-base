"use client";

import { useState } from "react";
import { Card, IconChevronL, IconChevronR, SectionTitle } from "./ui";
import { addDays, todayStr } from "@/lib/date";
import { formatSignedYen, formatYen } from "@/lib/money";
import { dailyInWeek, monthlyInYear, summarizePeriod, weekRange, weeklyTrend, yearRange } from "@/lib/periods";
import { TrendChart } from "./TrendChart";
import { WeeklyReviewCard } from "./WeeklyReviewCard";
import { monthBreakdown } from "@/lib/monthBreakdown";
import { BUDGET_EXCLUDES_INVEST } from "@/lib/ledgerCore";
import { useData } from "@/lib/store";

const WD = ["月", "火", "水", "木", "金", "土", "日"];
const WD_SUN = ["日", "月", "火", "水", "木", "金", "土"];

/** 週の見出しの日付「11/23(月)」。今年でなければ「2025/12/29(月)」 */
export function weekLabel(date: string, today: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const wd = WD_SUN[new Date(y, m - 1, d).getDay()];
  return `${date.slice(0, 4) === today.slice(0, 4) ? "" : `${y}/`}${m}/${d}(${wd})`;
}

function Totals({ expense, income, balance }: { expense: number; income: number; balance: number }) {
  return (
    <dl className="num mt-1 grid grid-cols-3 gap-2 text-center">
      <div className="rounded-xl bg-expense-soft py-2">
        <dt className="text-[11px] font-semibold text-expense">支出</dt>
        <dd className="text-[14px] font-bold">{formatYen(expense)}</dd>
      </div>
      <div className="rounded-xl bg-income-soft py-2">
        <dt className="text-[11px] font-semibold text-income">収入</dt>
        <dd className="text-[14px] font-bold">{formatYen(income)}</dd>
      </div>
      <div className="rounded-xl bg-surface-2 py-2">
        <dt className="text-[11px] font-semibold text-ink-2">収支</dt>
        <dd className={`text-[14px] font-bold ${balance < 0 ? "text-expense" : ""}`}>{formatSignedYen(balance)}</dd>
      </div>
    </dl>
  );
}

function TopCategories({ list, catName }: { list: { categoryId: string; total: number }[]; catName: (id: string) => string }) {
  if (list.length === 0) return null;
  return (
    <Card>
      <SectionTitle>支出の多いカテゴリ</SectionTitle>
      <ul className="divide-y divide-line">
        {list.slice(0, 6).map((c) => (
          <li key={c.categoryId} className="flex min-h-10 items-center justify-between text-[14px]">
            <span>{catName(c.categoryId)}</span>
            <span className="num font-semibold">{formatYen(c.total)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function WeekReport() {
  const data = useData();
  const today = todayStr();
  const [anchor, setAnchor] = useState(today);
  const { from, to } = weekRange(anchor);
  const s = summarizePeriod(data.transactions, from, to);
  const days = dailyInWeek(data.transactions, from);
  const trend = weeklyTrend(data.transactions, from, 12);
  const thisWeekFrom = weekRange(today).from;
  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? "（不明なカテゴリ）";
  const isThisWeek = from === weekRange(today).from;
  return (
    <>
      <Card className="py-2">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setAnchor(addDays(from, -7))} aria-label="前の週" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
            <IconChevronL />
          </button>
          <div className="text-center">
            {/* 1行に収まる短い書き方（レビュー o1 の P06）。年をまたぐ週・今年でない週は年も出す */}
            <h2 className="num text-[16px] font-bold">
              {weekLabel(from, today)}〜{weekLabel(to, today)}
            </h2>
            {isThisWeek && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">今週</span>}
          </div>
          <button type="button" onClick={() => setAnchor(addDays(from, 7))} aria-label="次の週" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
            <IconChevronR />
          </button>
        </div>
      </Card>
      <Card>
        <p className="text-[13px] font-semibold text-ink-2">この週の収支</p>
        <Totals expense={s.expense} income={s.income} balance={s.balance} />
      </Card>
      <WeeklyReviewCard from={from} today={today} isThisWeek={isThisWeek} />
      <Card>
        <SectionTitle>曜日ごと</SectionTitle>
        <TrendChart title="この週の曜日ごと" rows={days.map((d, i) => ({ label: `${WD[i]}${Number(d.date.slice(8))}`, expense: d.expense, income: d.income, strong: d.date === today, future: d.date > today }))} lineLabel="この週の収支の累計" />
      </Card>
      <Card>
        <SectionTitle>12週の推移</SectionTitle>
        <TrendChart
          title="直近12週"
          rows={trend.map((w) => ({ label: `${Number(w.from.slice(5, 7))}/${Number(w.from.slice(8))}`, expense: w.expense, income: w.income, strong: w.from === thisWeekFrom, future: w.from > thisWeekFrom }))}
          lineLabel="12週の収支の累計"
        />
      </Card>
      <TopCategories list={s.byCategory} catName={catName} />
    </>
  );
}

export function YearReport() {
  const data = useData();
  const today = todayStr();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const { from, to } = yearRange(year);
  const s = summarizePeriod(data.transactions, from, to);
  const months = monthlyInYear(data.transactions, year);
  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? "（不明なカテゴリ）";
  const thisMonth = Number(today.slice(5, 7));
  const thisYear = Number(today.slice(0, 4));
  const monthsWithData = months.filter((m) => m.expense > 0 || m.income > 0).length;
  // 生活と投資（年）：月ごとの計算を足す（レビュー o1 の家計の機能 3）。自分用だけ（公開版は投資の考え方を持ち込まない。2026-11-26）
  const yb = !BUDGET_EXCLUDES_INVEST ? null : months.reduce(
    (acc, m) => {
      const b = monthBreakdown(data, `${year}-${String(m.month).padStart(2, "0")}`, today);
      return { life: acc.life + b.lifeBalance, invest: acc.invest + b.invest, nisa: acc.nisa + b.nisaBuy, fixed: acc.fixed + b.fixed, variable: acc.variable + b.variable };
    },
    { life: 0, invest: 0, nisa: 0, fixed: 0, variable: 0 },
  );
  return (
    <>
      <Card className="py-2">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setYear(year - 1)} aria-label="前の年" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
            <IconChevronL />
          </button>
          <h2 className="text-[17px] font-bold">{year}年</h2>
          <button type="button" onClick={() => setYear(year + 1)} aria-label="次の年" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
            <IconChevronR />
          </button>
        </div>
      </Card>
      <Card>
        <p className="text-[13px] font-semibold text-ink-2">この年の収支</p>
        <Totals expense={s.expense} income={s.income} balance={s.balance} />
        {monthsWithData > 0 && (
          <p className="num mt-2 text-[12px] text-ink-3">
            記録のある{monthsWithData}か月の平均：支出 {formatYen(Math.round(s.expense / monthsWithData))}・収入 {formatYen(Math.round(s.income / monthsWithData))}
          </p>
        )}
      </Card>
      <Card>
        <SectionTitle>月ごとの推移</SectionTitle>
        <TrendChart title={`${year}年の月ごと`} rows={months.map((m) => ({ label: `${m.month}月`, expense: m.expense, income: m.income, strong: year === thisYear && m.month === thisMonth, future: year > thisYear || (year === thisYear && m.month > thisMonth) }))} lineLabel="この年の収支の累計" />
      </Card>
      {yb && (
        <Card>
        <SectionTitle>生活と投資（この年）</SectionTitle>
        <dl className="num grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-surface-2 py-2">
            <dt className="text-[11px] font-semibold text-ink-2">生活の収支</dt>
            <dd className={`text-[15px] font-bold ${yb.life < 0 ? "text-expense" : ""}`}>{formatSignedYen(yb.life)}</dd>
          </div>
          <div className="rounded-xl bg-event/10 py-2">
            <dt className="text-[11px] font-semibold text-event">投資に回した額</dt>
            <dd className="text-[15px] font-bold">{formatYen(yb.invest)}</dd>
          </div>
        </dl>
        <p className="num mt-2 text-[12px] text-ink-3">
          固定費 {formatYen(yb.fixed)}・変動費 {formatYen(yb.variable)}
          {yb.nisa > 0 && `・NISA の買付 ${formatYen(yb.nisa)}（投資への入金と重なることがあるので、足していません）`}
        </p>
        </Card>
      )}
      <TopCategories list={s.byCategory} catName={catName} />
    </>
  );
}
