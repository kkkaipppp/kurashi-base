"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, Empty, IconChevronL, IconChevronR, PageHeader, SectionTitle } from "@/components/ui";
import { addMonthsToKey, formatMonthJa, monthKey, todayStr } from "@/lib/date";
import { formatSignedYen, formatYen } from "@/lib/money";
import { buildInsights, monthReport, weeklyBuckets } from "@/lib/report";
import { budgetSpent } from "@/lib/ledger";
import { cycleLabel } from "@/lib/recurring";
import { useData } from "@/lib/store";
import { useUI } from "@/components/UIContext";
import dynamic from "next/dynamic";
import { FEATURES } from "@/lib/edition";

// 週・年の振り返りは自分用（personal）だけ（lib/edition.ts の periodReport）。
// 組み立てるときに決まる値で分けるので、公開版（public）には週・年の画面のコードが入らない
// 週・年の振り返り：2026-11-25 から、自分用と公開版（友達用）の両方で出す（FEATURE_EDITIONS.periodReport）
const PERIOD_REPORT = FEATURES.periodReport;
// 投資を除いた額で予算と比べるのは、自分用だけ（公開版は今までどおり、すべての支出で比べる。lib/ledger.ts の budgetSpent）
const LIFE_BUDGET = process.env.NEXT_PUBLIC_KB_EDITION === "personal";
const WeekReport = PERIOD_REPORT ? dynamic(() => import("@/components/PeriodReport").then((m) => m.WeekReport)) : () => null;
const YearReport = PERIOD_REPORT ? dynamic(() => import("@/components/PeriodReport").then((m) => m.YearReport)) : () => null;
// 月の「固定費と変動費・生活と投資・増えたカテゴリ」も自分用だけ（レビュー o1 の P11、家計の機能 2・3）
// 週・年とは別に公開を決められるよう、自分の条件にする（今はどちらも自分用だけ）
const MONTH_BREAKDOWN = process.env.NEXT_PUBLIC_KB_EDITION === "personal";
// 月末の見込み：2026-11-25 から公開版でも出す（FEATURE_EDITIONS.forecast）
const ForecastCard = FEATURES.forecast ? dynamic(() => import("@/components/ForecastCard").then((m) => m.ForecastCard)) : () => null;
// 続けて使えているか（自分用だけ。公開版の組み立てには入れない）
const UsageCard = FEATURES.usageDays && process.env.NEXT_PUBLIC_KB_EDITION === "personal" ? dynamic(() => import("@/components/UsageCard").then((m) => m.UsageCard)) : () => null;
const CashBalanceCard = MONTH_BREAKDOWN ? dynamic(() => import("@/components/CashBalanceCard").then((m) => m.CashBalanceCard)) : () => null;
const MonthBreakdownCard = MONTH_BREAKDOWN ? dynamic(() => import("@/components/MonthBreakdownCard").then((m) => m.MonthBreakdownCard)) : () => null;

// 円グラフの色（カテゴリの順に使う。意味は持たせず、凡例と金額で読めるようにする）
const PIE = ["#2f6f5e", "#c9853a", "#7a5ab3", "#2f6f9e", "#b4503c", "#6b8f3a", "#9aa19c"];

function Donut({ parts, total }: { parts: { value: number; color: string }[]; total: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" className="size-32 shrink-0" role="img" aria-label="支出の内訳の円グラフ">
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="16" />
      {total > 0 &&
        parts.map((p, i) => {
          const len = (p.value / total) * c;
          const el = (
            <circle
              key={i}
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={p.color}
              strokeWidth="16"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 60 60)"
            />
          );
          offset += len;
          return el;
        })}
    </svg>
  );
}

type Span = "week" | "month" | "year";
const SPANS: { key: Span; label: string }[] = [
  { key: "week", label: "週" },
  { key: "month", label: "月" },
  { key: "year", label: "年" },
];

export default function ReportPage() {
  const [span, setSpan] = useState<Span>("month");
  if (!PERIOD_REPORT) return <MonthReportPage />;
  return (
    <main className="space-y-4">
      <PageHeader title="振り返り" />
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="振り返る期間">
        {SPANS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="radio"
            aria-checked={span === s.key}
            onClick={() => setSpan(s.key)}
            className={`min-h-11 rounded-lg text-[14px] font-semibold ${span === s.key ? "bg-surface shadow-sm" : "text-ink-2"}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {span === "week" ? <WeekReport /> : span === "year" ? <YearReport /> : <MonthReportPage embedded />}
    </main>
  );
}

/** 月の振り返り（今までの画面）。embedded のときは見出しと外側の main を付けない */
function MonthReportPage({ embedded = false }: { embedded?: boolean }) {
  const data = useData();
  const today = todayStr();
  const [month, setMonth] = useState(monthKey(today));
  const ui = useUI();
  const r = monthReport(data, month);
  const weeks = weeklyBuckets(data.transactions, month);
  const insights = buildInsights(data, month, today);
  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? "（不明なカテゴリ）";
  const budget = data.budget.monthly;
  // 予算と比べるのは、ホームと同じ額（自分用は投資を除いた生活費。lib/ledger.ts）
  const pct = budget ? Math.round((budgetSpent(data, month, today) / budget) * 100) : null;
  const maxWeek = Math.max(1, ...weeks.map((w) => w.expense));

  // 内訳：上位6件＋その他
  const top = r.byCategory.slice(0, 6);
  const rest = r.byCategory.slice(6).reduce((s, c) => s + c.total, 0);
  const parts = [...top.map((c, i) => ({ id: c.categoryId, name: catName(c.categoryId), value: c.total, color: PIE[i] })), ...(rest > 0 ? [{ id: "", name: "その他", value: rest, color: PIE[6] }] : [])];

  const fixed = data.recurring.filter((x) => x.active);
  const fixedMonthly = Math.round(fixed.reduce((s, x) => s + (x.cycle === "weekly" ? (x.amount * 52) / 12 : x.cycle === "yearly" ? x.amount / 12 : x.amount), 0));

  const Wrap = embedded ? "div" : "main";
  return (
    <Wrap className="space-y-4">
      {!embedded && <PageHeader title="振り返り" />}

      <Card className="py-2">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setMonth(addMonthsToKey(month, -1))} aria-label="前の月" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
            <IconChevronL />
          </button>
          <h2 className="text-[17px] font-bold">{formatMonthJa(month)}</h2>
          <button type="button" onClick={() => setMonth(addMonthsToKey(month, 1))} aria-label="次の月" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
            <IconChevronR />
          </button>
        </div>
      </Card>

      {r.count === 0 ? (
        <Empty
          action={
            // 空の月は、まず記録できるように（レビュー o1 の P16）
            // その場で入力を開く。今月以外を見ているときは、その月の1日から始める（ホームへ移らない。磨き込み 2026-11-26）
            <button
              type="button"
              onClick={() => ui.openTx({ mode: "new", type: "expense", date: month === monthKey(today) ? undefined : `${month}-01` })}
              className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-[14px] font-semibold text-brand-ink"
            >
              支出を追加
            </button>
          }
        >
          {formatMonthJa(month)}は、まだ支出・収入の記録がありません。「＋」から記録すると、ここに使い方の内訳が出ます。
        </Empty>
      ) : (
        <>
          <Card>
            <p className="text-[13px] font-semibold text-ink-2">この月の支出</p>
            <p className="num text-[30px] leading-tight font-bold">
              {formatYen(r.expense)}
              {budget !== null && <span className="ml-1 text-[14px] font-medium text-ink-3">／予算 {formatYen(budget)}</span>}
            </p>
            {pct !== null && (
              <div className="mt-2">
                <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.min(pct, 100)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`予算の${pct}%${pct > 100 ? "（超過）" : ""}`} aria-label="予算の使用率">
                  <div className={`h-full rounded-full ${pct > 100 ? "bg-expense" : "bg-brand"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <p className="num mt-1 text-right text-[12px] text-ink-3">予算の{pct}%{LIFE_BUDGET ? "（投資を除く）" : ""}</p>
              </div>
            )}
            <dl className="num mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-income-soft py-2">
                <dt className="text-[11px] font-semibold text-income">収入</dt>
                <dd className="text-[14px] font-bold">{formatYen(r.income)}</dd>
              </div>
              <div className="rounded-xl bg-surface-2 py-2">
                <dt className="text-[11px] font-semibold text-ink-2">収支</dt>
                <dd className={`text-[14px] font-bold ${r.balance < 0 ? "text-expense" : ""}`}>{formatSignedYen(r.balance)}</dd>
              </div>
              <div className="rounded-xl bg-surface-2 py-2">
                <dt className="text-[11px] font-semibold text-ink-2">{month === monthKey(today) ? "先月の支出" : "前月の支出"}</dt>
                <dd className="text-[14px] font-bold">{r.hasPrev ? formatYen(r.prevExpense) : "記録なし"}</dd>
              </div>
            </dl>
          </Card>

          <ForecastCard month={month} />
          {month === monthKey(today) && <UsageCard />}
          <CashBalanceCard month={month} />
          <MonthBreakdownCard month={month} />

          {insights.length > 0 && (
            <Card className="border-warn/30 bg-warn-soft">
              <SectionTitle>支出の変化</SectionTitle>
              <ul className="space-y-1">
                {insights.map((i) => (
                  <li key={i.key} className="text-[14px]">
                    {i.href ? (
                      <Link href={i.href} className="flex min-h-11 items-center justify-between gap-2 underline-offset-2 hover:underline">
                        <span>{i.text}</span>
                        <IconChevronR className="size-4 shrink-0 text-ink-3" />
                      </Link>
                    ) : (
                      <p className="py-2">{i.text}</p>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-ink-3">記録した金額からの計算です。</p>
            </Card>
          )}

          <Card>
            <SectionTitle>支出の内訳</SectionTitle>
            {r.expense === 0 ? (
              <p className="text-[14px] text-ink-3">この月の支出はありません。</p>
            ) : (
              // 狭いとき（文字を大きくしたときなど）は、円グラフの下に一覧を並べる（N03・N15 の画面幅の点検）
              <div className="flex flex-wrap items-center gap-4">
                <Donut parts={parts} total={r.expense} />
                <ul className="min-w-0 flex-1 basis-48 space-y-0.5">
                  {parts.map((p) => (
                    <li key={p.id || "rest"}>
                      <Link
                        href={p.id ? `/history?m=${month}&cat=${p.id}` : `/history?m=${month}`}
                        className="flex min-h-11 flex-wrap items-center gap-x-2 rounded-lg px-1 text-[13px] hover:bg-surface-2"
                      >
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        <span className="num font-semibold">{formatYen(p.value)}</span>
                        <span className="num w-9 text-right text-[11px] text-ink-3">{Math.round((p.value / r.expense) * 100)}%</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle>7日間ごとの支出</SectionTitle>
            <ul className="space-y-1.5">
              {weeks.map((w) => (
                <li key={w.from} className="flex items-center gap-2 text-[13px]">
                  <span className="num w-16 shrink-0 text-ink-2">{w.label}</span>
                  <span className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                    <span className="block h-full rounded-full bg-expense/70" style={{ width: `${(w.expense / maxWeek) * 100}%` }} />
                  </span>
                  <span className="num w-20 shrink-0 text-right font-semibold">{formatYen(w.expense)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <Card>
        <SectionTitle
          action={
            <Link href="/recurring" className="min-h-11 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-brand hover:bg-brand-soft">
              固定費を見る
            </Link>
          }
        >
          固定費
        </SectionTitle>
        {fixed.length === 0 ? (
          <p className="text-[14px] text-ink-3">登録されている固定費はありません。</p>
        ) : (
          <>
            <p className="num text-[13px] text-ink-2">
              月あたりの目安 <strong className="text-[16px] text-ink">{formatYen(fixedMonthly)}</strong>
            </p>
            <ul className="mt-1 divide-y divide-line">
              {fixed.slice(0, 5).map((x) => (
                <li key={x.id} className="flex min-h-10 items-center justify-between text-[14px]">
                  <span className="truncate">
                    {x.name}
                    <span className="ml-1 text-[12px] text-ink-3">{cycleLabel(x.cycle)}</span>
                  </span>
                  <span className="num font-semibold">{formatYen(x.amount)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Link href={`/history?m=${month}`} className="block">
        <Card className="flex items-center justify-between py-3 hover:bg-surface-2">
          <span className="text-[15px] font-semibold">{formatMonthJa(month)}の明細を見る</span>
          <IconChevronR className="size-5 text-ink-3" />
        </Card>
      </Link>
    </Wrap>
  );
}
