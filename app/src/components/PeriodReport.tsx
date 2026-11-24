"use client";

import { useState } from "react";
import { Card, IconChevronL, IconChevronR, SectionTitle } from "./ui";
import { addDays, formatDateJa, todayStr } from "@/lib/date";
import { formatSignedYen, formatYen } from "@/lib/money";
import { dailyInWeek, monthlyInYear, summarizePeriod, weekRange, weeklyTrend, yearRange } from "@/lib/periods";
import { TrendChart } from "./TrendChart";
import { useData } from "@/lib/store";

const WD = ["月", "火", "水", "木", "金", "土", "日"];

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
          <h2 className="text-center text-[15px] font-bold">
            {formatDateJa(from)}〜{formatDateJa(to)}
            {isThisWeek && <span className="ml-1 text-[12px] font-semibold text-brand">今週</span>}
          </h2>
          <button type="button" onClick={() => setAnchor(addDays(from, 7))} aria-label="次の週" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
            <IconChevronR />
          </button>
        </div>
      </Card>
      <Card>
        <p className="text-[13px] font-semibold text-ink-2">この週の収支</p>
        <Totals expense={s.expense} income={s.income} balance={s.balance} />
      </Card>
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
      <TopCategories list={s.byCategory} catName={catName} />
    </>
  );
}
