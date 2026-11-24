"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { deadlineDays, deadlinesOn } from "@/lib/deadlines";
import { formatMinutes } from "@/lib/life";
import { useData } from "@/lib/store";
import { daySummary, eventsOnDay, summarizeMonth } from "@/lib/aggregate";
import { addMonthsToKey, formatDateJa, formatMonthJa, monthGrid, monthKey, todayStr } from "@/lib/date";
import { formatYen } from "@/lib/money";
import { holidayName } from "@/lib/holidays";
import { useUI } from "@/components/UIContext";
import { EventRow, TxRow } from "@/components/Rows";
import { Card, IconChevronL, IconChevronR, PageHeader, SectionTitle } from "@/components/ui";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
/** マスに名前を出す予定の数（それより多い日は「+n」） */
const EVENT_TITLES_IN_CELL = 2;

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
  // マスに出すもの（レビュー o1 の P10：狭いマスに予定と金額が混ざるので、見たいほうだけにもできる）
  const [show, setShow] = useState<"all" | "event" | "money">("all");
  const showEv = show !== "money";
  const showMoney = show !== "event";
  // 選んだ日を＋ボタンに引き継ぐ
  const { setCalendarDate } = ui;
  useEffect(() => {
    setCalendarDate(selected);
  }, [selected, setCalendarDate]);
  const weeks = useMemo(() => monthGrid(month), [month]);
  const sum = summarizeMonth(data.transactions, month);

  // 日ごとの支出・予定件数を前計算
  const perDay = useMemo(() => {
    const m = new Map<string, { exp: number; inc: number; ev: number; titles: string[] }>();
    for (const d of weeks.flat()) {
      if (!d) continue;
      const s = daySummary(data.transactions, d);
      const evs = eventsOnDay(data.events, d);
      m.set(d, { exp: s.expense, inc: s.income, ev: evs.length, titles: evs.slice(0, EVENT_TITLES_IN_CELL).map((e) => e.title.trim() || "（名前なし）") });
    }
    return m;
  }, [weeks, data.transactions, data.events]);

  const dayEvents = eventsOnDay(data.events, selected);
  const day = daySummary(data.transactions, selected);
  const dayDeadlines = deadlinesOn(data, selected);
  const dayFixed = data.recurring.filter((r) => r.active && r.nextDueDate === selected).reduce((a, r) => a + r.amount, 0);
  const dlDays = useMemo(() => deadlineDays(data, month), [data, month]);
  const dayNotes = data.notes.filter((n) => n.date === selected);
  const dayStudy = data.studyLogs.filter((l) => l.date === selected).reduce((s, l) => s + l.minutes, 0);

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
        <div className="mb-2 grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="マスに出すもの">
          {(
            [
              ["all", "予定とお金"],
              ["event", "予定"],
              ["money", "お金"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={show === k} onClick={() => setShow(k)} className={`min-h-11 rounded-lg text-[13px] font-semibold ${show === k ? "bg-surface shadow-sm" : "text-ink-2"}`}>
              {label}
            </button>
          ))}
        </div>
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
                  const hol = holidayName(d);
                  const red = i === 0 || !!hol; // 日曜と祝日は赤
                  const label = `${formatDateJa(d)}${hol ? ` ${hol}` : ""}${info.ev ? ` 予定${info.ev}件（${info.titles.join("、")}${info.ev > info.titles.length ? "ほか" : ""}）` : ""}${info.exp ? ` 支出${formatYen(info.exp)}` : ""}${info.inc ? ` 収入${formatYen(info.inc)}` : ""}${dlDays.has(d) ? " 期限あり" : ""}`;
                  return (
                    <td key={d} className="h-px p-0 align-top">
                      <button
                        type="button"
                        onClick={() => setSelected(d)}
                        aria-pressed={isSel}
                        aria-label={label}
                        className={`flex h-full min-h-[66px] w-full flex-col items-center rounded-xl pt-1 pb-1 transition ${
                          isSel ? "bg-brand text-brand-ink" : isToday ? "bg-brand-soft" : "hover:bg-surface-2"
                        }`}
                      >
                        <span className={`num text-[14px] font-semibold ${!isSel && red ? "text-expense" : !isSel && i === 6 ? "text-income" : ""}`}>
                          {Number(d.slice(8))}
                        </span>
                        <span className="mt-0.5 flex h-1.5 gap-0.5" aria-hidden="true">
                          {dlDays.has(d) && <span className={`size-1.5 rounded-full ${isSel ? "bg-white" : "bg-warn"}`} />}
                        </span>
                        {showEv && info.titles.map((t, k) => (
                          <span
                            key={k}
                            className={`mt-0.5 w-full truncate rounded px-0.5 text-left text-[10px] leading-[14px] font-semibold ${isSel ? "bg-white/20 text-white" : "bg-event-soft text-event"}`}
                            aria-hidden="true"
                          >
                            {t}
                          </span>
                        ))}
                        {showEv && info.ev > info.titles.length && (
                          <span className={`text-[10px] leading-tight font-semibold ${isSel ? "text-white" : "text-event"}`} aria-hidden="true">
                            +{info.ev - info.titles.length}
                          </span>
                        )}
                        {showMoney && info.exp > 0 && (
                          <span className={`num mt-0.5 max-w-full truncate px-0.5 text-[10px] leading-tight font-semibold ${isSel ? "text-white" : "text-expense"}`} aria-hidden="true">
                            −{shortYen(info.exp)}
                          </span>
                        )}
                        {showMoney && info.inc > 0 && (
                          <span className={`num max-w-full truncate px-0.5 text-[10px] leading-tight font-semibold ${isSel ? "text-white" : "text-income"}`} aria-hidden="true">
                            +{shortYen(info.inc)}
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
            <span className="rounded bg-event-soft px-1 text-event">名前</span>予定
          </span>
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-warn" />期限・固定費の支払日
          </span>
        </div>
        <p className="mt-1 text-center text-[11px] text-ink-3" aria-hidden="true">
          <span className="text-expense">赤い −数字＝支出</span>・<span className="text-income">青い＋数字＝収入</span>・赤い日付＝日曜と祝日
        </p>
      </Card>

      <section className="mt-4 space-y-3" aria-label="選んだ日の予定とお金">
        <div className="space-y-2">
          <h2 className="text-[17px] font-bold">
            {formatDateJa(selected, true)}
            {holidayName(selected) && <span className="ml-2 text-[14px] font-semibold text-expense">{holidayName(selected)}</span>}
          </h2>
          <p className="num text-[13px] text-ink-2">
            予定 {dayEvents.length}件・<span className="text-expense">支出 {formatYen(day.expense)}</span>・<span className="text-income">収入 {formatYen(day.income)}</span>
            {/* 固定費の支払い予定（実績の支出とは分けて出す。100点化の指示 A） */}
            {dayFixed > 0 && <span className="text-warn">・固定費の支払い予定 {formatYen(dayFixed)}</span>}
            {dayDeadlines.length > 0 && `・期限など ${dayDeadlines.length}件`}
          </p>
          <button
            type="button"
            onClick={() => ui.openAdd({ date: selected })}
            className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-brand-soft text-[14px] font-semibold text-brand"
          >
            ＋ この日に予定・支出・収入を追加
          </button>
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
            <p className="py-1 text-[14px] text-ink-3">この日の支出・収入はありません</p>
          )}
        </Card>
        {(dayDeadlines.length > 0 || dayNotes.length > 0 || dayStudy > 0) && (
          <Card>
            <SectionTitle>期限・記録</SectionTitle>
            <ul className="space-y-1 text-[14px]">
              {dayDeadlines.map((x) => (
                <li key={x.key}>
                  <Link href={x.href} className="flex min-h-10 items-center gap-2 rounded-lg px-1 hover:bg-surface-2">
                    <span className="w-12 shrink-0 text-[12px] text-warn">{x.kind}</span>
                    <span className={`min-w-0 flex-1 truncate ${x.done ? "text-ink-3 line-through" : "font-semibold"}`}>{x.title}</span>
                    {x.sub && <span className="num shrink-0 text-[13px]">{x.sub}</span>}
                  </Link>
                </li>
              ))}
              {dayNotes.map((n) => (
                <li key={n.id}>
                  <Link href={`/notes?open=${n.id}`} className="flex min-h-10 items-center gap-2 rounded-lg px-1 hover:bg-surface-2">
                    <span className="w-12 shrink-0 text-[12px] text-ink-3">メモ</span>
                    <span className="truncate">{n.title || n.body.slice(0, 30)}</span>
                  </Link>
                </li>
              ))}
              {dayStudy > 0 && (
                <li>
                  <Link href="/study" className="flex min-h-10 items-center gap-2 rounded-lg px-1 hover:bg-surface-2">
                    <span className="w-12 shrink-0 text-[12px] text-ink-3">勉強</span>
                    <span>{formatMinutes(dayStudy)}</span>
                  </Link>
                </li>
              )}
            </ul>
          </Card>
        )}
      </section>
    </main>
  );
}
