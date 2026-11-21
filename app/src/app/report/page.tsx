"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, Empty, IconChevronL, IconChevronR, PageHeader, SectionTitle } from "@/components/ui";
import { addMonthsToKey, formatMonthJa, monthKey, todayStr } from "@/lib/date";
import { formatSignedYen, formatYen } from "@/lib/money";
import { buildInsights, monthReport, weeklyBuckets } from "@/lib/report";
import { cycleLabel } from "@/lib/recurring";
import { useData } from "@/lib/store";

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

export default function ReportPage() {
  const data = useData();
  const today = todayStr();
  const [month, setMonth] = useState(monthKey(today));
  const r = monthReport(data, month);
  const weeks = weeklyBuckets(data.transactions, month);
  const insights = buildInsights(data, month, today);
  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? "（不明なカテゴリ）";
  const budget = data.budget.monthly;
  const pct = budget ? Math.round((r.expense / budget) * 100) : null;
  const maxWeek = Math.max(1, ...weeks.map((w) => w.expense));

  // 内訳：上位6件＋その他
  const top = r.byCategory.slice(0, 6);
  const rest = r.byCategory.slice(6).reduce((s, c) => s + c.total, 0);
  const parts = [...top.map((c, i) => ({ id: c.categoryId, name: catName(c.categoryId), value: c.total, color: PIE[i] })), ...(rest > 0 ? [{ id: "", name: "その他", value: rest, color: PIE[6] }] : [])];

  const fixed = data.recurring.filter((x) => x.active);
  const fixedMonthly = Math.round(fixed.reduce((s, x) => s + (x.cycle === "weekly" ? (x.amount * 52) / 12 : x.cycle === "yearly" ? x.amount / 12 : x.amount), 0));

  return (
    <main className="space-y-4">
      <PageHeader title="振り返り" />

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
            <Link href="/history" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 text-[14px] font-semibold">
              取引履歴を見る
            </Link>
          }
        >
          {formatMonthJa(month)}の支出・収入の記録がないため、振り返りはありません。
        </Empty>
      ) : (
        <>
          <Card>
            <p className="text-[13px] font-semibold text-ink-2">この月の支出</p>
            <p className="num text-[30px] leading-tight font-bold">
              {formatYen(r.expense)}
              {budget !== null && <span className="ml-1 text-[14px] font-medium text-ink-3">／ 予算 {formatYen(budget)}</span>}
            </p>
            {pct !== null && (
              <div className="mt-2">
                <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.min(pct, 100)} aria-valuemin={0} aria-valuemax={100} aria-label="予算の使用率">
                  <div className={`h-full rounded-full ${pct > 100 ? "bg-expense" : "bg-brand"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <p className="num mt-1 text-right text-[12px] text-ink-3">予算の{pct}%</p>
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

          {insights.length > 0 && (
            <Card className="border-warn/30 bg-warn-soft">
              <SectionTitle>くらしの気づき</SectionTitle>
              <ul className="space-y-1">
                {insights.map((i) => (
                  <li key={i.key} className="text-[14px]">
                    {i.href ? (
                      <Link href={i.href} className="flex min-h-10 items-center justify-between gap-2 underline-offset-2 hover:underline">
                        <span>{i.text}</span>
                        <IconChevronR className="size-4 shrink-0 text-ink-3" />
                      </Link>
                    ) : (
                      <p className="py-2">{i.text}</p>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-ink-3">記録された金額から計算しています。理由までは分かりません。</p>
            </Card>
          )}

          <Card>
            <SectionTitle>何に使った？</SectionTitle>
            {r.expense === 0 ? (
              <p className="text-[14px] text-ink-3">この月の支出はありません。</p>
            ) : (
              <div className="flex items-center gap-4">
                <Donut parts={parts} total={r.expense} />
                <ul className="min-w-0 flex-1 space-y-0.5">
                  {parts.map((p) => (
                    <li key={p.id || "rest"}>
                      <Link
                        href={p.id ? `/history?m=${month}&cat=${p.id}` : `/history?m=${month}`}
                        className="flex min-h-9 items-center gap-2 rounded-lg px-1 text-[13px] hover:bg-surface-2"
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
            <Link href="/recurring" className="min-h-9 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-brand hover:bg-brand-soft">
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
    </main>
  );
}
