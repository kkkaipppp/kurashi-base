"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/store";
import { daySummary, eventsOnDay, summarizeMonth } from "@/lib/aggregate";
import { addMonthsToKey, formatDateJa, formatMonthJa, monthGrid, monthKey, todayStr } from "@/lib/date";
import { formatYen } from "@/lib/money";
import { useUI } from "@/components/UIContext";
import { EventRow, TxRow } from "@/components/Rows";
import { Card, IconChevronL, IconChevronR, PageHeader, SectionTitle } from "@/components/ui";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

function shortYen(n: number): string {
  if (n >= 100_000) return `${Math.round(n / 10_000)}万`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`;
  return n.toLocaleString("ja-JP");
}

export default function CalendarPage() {
  const data = useData();
  const ui = useUI();
  const today = todayStr();
  const [month, setMonth] = useState(monthKey(today));
  const [selected, setSelected] = useState(today);
  const weeks = useMemo(() => monthGrid(month), [month]);
  const sum = summarizeMonth(data.transactions, month);

  // 日ごとの支出・予定件数を前計算
  const perDay = useMemo(() => {
    const m = new Map<string, { exp: number; inc: number; ev: number }>();
    for (const d of weeks.flat()) {
      if (!d) continue;
      const s = daySummary(data.transactions, d);
      m.set(d, { exp: s.expense, inc: s.income, ev: eventsOnDay(data.events, d).length });
    }
    return m;
  }, [weeks, data.transactions, data.events]);

  const dayEvents = eventsOnDay(data.events, selected);
  const day = daySummary(data.transactions, selected);

  const move = (delta: number) => {
    const next = addMonthsToKey(month, delta);
    setMonth(next);
    setSelected(monthKey(today) === next ? today : `${next}-01`);
  };
  const goToday = () => {
    setMonth(monthKey(today));
    setSelected(today);
  };

  return (
    <main>
      <PageHeader
        title="カレンダー"
        right={
          <button type="button" onClick={goToday} className="min-h-11 rounded-xl border border-line bg-surface px-3 text-[14px] font-semibold hover:bg-surface-2">
            今日
          </button>
        }
      />

      <Card className="px-2 pt-2 pb-3">
        <div className="flex items-center justify-between px-1">
          <button type="button" onClick={() => move(-1)} aria-label="前の月" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
            <IconChevronL />
          </button>
          <h2 className="text-[17px] font-bold" aria-live="polite">
            {formatMonthJa(month)}
          </h2>
          <button type="button" onClick={() => move(1)} aria-label="次の月" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
            <IconChevronR />
          </button>
        </div>
        <p className="num mb-2 text-center text-[12px] text-ink-3">
          支出 {formatYen(sum.expense)} ・ 収入 {formatYen(sum.income)}
        </p>
        <table className="w-full table-fixed border-separate border-spacing-0.5" role="grid" aria-label={`${formatMonthJa(month)}のカレンダー`}>
          <thead>
            <tr>
              {WEEK.map((w, i) => (
                <th key={w} scope="col" className={`pb-1 text-[11px] font-semibold ${i === 0 ? "text-expense" : i === 6 ? "text-income" : "text-ink-3"}`}>
                  {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((w, wi) => (
              <tr key={wi}>
                {w.map((d, i) => {
                  if (!d) return <td key={i} />;
                  const info = perDay.get(d)!;
                  const isSel = d === selected;
                  const isToday = d === today;
                  const label = `${formatDateJa(d)}${info.ev ? ` 予定${info.ev}件` : ""}${info.exp ? ` 支出${formatYen(info.exp)}` : ""}${info.inc ? ` 収入${formatYen(info.inc)}` : ""}`;
                  return (
                    <td key={d} className="p-0 align-top">
                      <button
                        type="button"
                        onClick={() => setSelected(d)}
                        aria-pressed={isSel}
                        aria-label={label}
                        className={`flex h-[58px] w-full flex-col items-center rounded-xl pt-1 transition ${
                          isSel ? "bg-brand text-brand-ink" : isToday ? "bg-brand-soft" : "hover:bg-surface-2"
                        }`}
                      >
                        <span className={`num text-[14px] font-semibold ${!isSel && i === 0 ? "text-expense" : !isSel && i === 6 ? "text-income" : ""}`}>
                          {Number(d.slice(8))}
                        </span>
                        <span className="mt-0.5 flex h-1.5 gap-0.5" aria-hidden="true">
                          {info.ev > 0 && <span className={`size-1.5 rounded-full ${isSel ? "bg-white" : "bg-event"}`} />}
                          {info.inc > 0 && <span className={`size-1.5 rounded-full ${isSel ? "bg-white/70" : "bg-income"}`} />}
                        </span>
                        {info.exp > 0 && (
                          <span className={`num mt-0.5 max-w-full truncate px-0.5 text-[10px] leading-tight font-semibold ${isSel ? "text-white" : "text-expense"}`} aria-hidden="true">
                            {shortYen(info.exp)}
                          </span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex justify-center gap-4 text-[11px] text-ink-3" aria-hidden="true">
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-event" />予定
          </span>
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-income" />収入
          </span>
          <span className="flex items-center gap-1 text-expense">123 = 支出</span>
        </div>
      </Card>

      <section className="mt-4 space-y-3" aria-label="選択日の予定と支出">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-bold">{formatDateJa(selected, true)}</h2>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => ui.openEvent({ mode: "new", date: selected })} className="min-h-10 rounded-lg bg-event-soft px-3 text-[13px] font-semibold text-event">
              ＋予定
            </button>
            <button type="button" onClick={() => ui.openTx({ mode: "new", type: "expense", date: selected })} className="min-h-10 rounded-lg bg-expense-soft px-3 text-[13px] font-semibold text-expense">
              ＋支出
            </button>
            <button type="button" onClick={() => ui.openTx({ mode: "new", type: "income", date: selected })} className="min-h-10 rounded-lg bg-income-soft px-3 text-[13px] font-semibold text-income">
              ＋収入
            </button>
          </div>
        </div>

        <Card>
          <SectionTitle>予定</SectionTitle>
          {dayEvents.length ? (
            <ul className="-mx-2">
              {dayEvents.map((e) => (
                <EventRow key={e.id} ev={e} day={selected} />
              ))}
            </ul>
          ) : (
            <p className="py-1 text-[14px] text-ink-3">予定はありません</p>
          )}
        </Card>

        <Card>
          <SectionTitle
            action={
              (day.expense > 0 || day.income > 0) && (
                <span className="num text-[13px] text-ink-2">
                  支出 {formatYen(day.expense)}
                  {day.income > 0 && ` ・ 収入 ${formatYen(day.income)}`}
                </span>
              )
            }
          >
            お金
          </SectionTitle>
          {day.list.length ? (
            <ul className="-mx-2">
              {day.list.map((t) => (
                <TxRow key={t.id} tx={t} />
              ))}
            </ul>
          ) : (
            <p className="py-1 text-[14px] text-ink-3">この日の取引はありません</p>
          )}
        </Card>
      </section>
    </main>
  );
}
