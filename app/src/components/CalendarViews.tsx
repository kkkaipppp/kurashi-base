"use client";

import { addDays, formatDateJa, monthGrid } from "@/lib/date";
import { useMemo } from "react";
import { daySummary, eventsOnDay, summarizeMonth } from "@/lib/aggregate";
import { deadlinesOn } from "@/lib/deadlines";
import { formatYen } from "@/lib/money";
import { holidayName } from "@/lib/holidays";
import { eventTimeLabel } from "./Rows";
import { useData } from "@/lib/store";

/**
 * 自分用のカレンダーの表示形式（o31 F008・C008、To-Be 02「月/週/日/年」2026-11-28）：日・週・月（マス）・年・一覧。
 * - 日は、選んだ日の明細だけ（上のマスを出さない）。年は12か月の支出・収入・予定のある日の数で、押すとその月を開く
 * - 一覧は期間ではなく表示の形：見ている月の、記録や予定がある日だけを順に並べる
 * - 週は、選んだ日を含む日曜〜土曜の7日
 * - どれも押すとその日を選ぶ（下の明細が変わる）。表示を変えても記録・集計は変わらない
 */
export type CalendarView = "day" | "month" | "week" | "year" | "list";
export const CAL_VIEW_KEY = "kurashi-base:ui:calendar-view:v1";
export const CAL_VIEWS: [CalendarView, string][] = [
  ["day", "日"],
  ["week", "週"],
  ["month", "月"],
  ["year", "年"],
  ["list", "一覧"],
];

export function parseCalView(v: string | null): CalendarView {
  return v === "day" || v === "week" || v === "year" || v === "list" ? v : "month";
}

/** その年の12か月（"YYYY-01"〜"YYYY-12"） */
export function yearMonths(year: string): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

/** 年の表示：12か月のマス。支出・収入は家計簿と同じ月の集計、予定は予定のある日の数（繰り返しの予定も数える） */
export function YearView(p: { year: string; month: string; today: string; showEv: boolean; showMoney: boolean; onPickMonth: (m: string) => void }) {
  const data = useData();
  // 12か月の集計は、記録・年が変わったときだけ作り直す（点検 低-6）
  const rows = useMemo(
    () =>
      yearMonths(p.year).map((m) => ({
        m,
        s: summarizeMonth(data.transactions, m),
        evDays: monthGrid(m).flat().filter((d): d is string => !!d && eventsOnDay(data.events, d).length > 0).length,
      })),
    [p.year, data.transactions, data.events],
  );
  return (
    <ul className="grid grid-cols-3 gap-1" aria-label={`${p.year}年の月ごとの予定とお金`}>
      {rows.map(({ m, s, evDays }) => {
        const isNow = m === p.today.slice(0, 7);
        return (
          <li key={m}>
            <button type="button" onClick={() => p.onPickMonth(m)} aria-current={m === p.month ? "date" : undefined} className={`flex min-h-20 w-full flex-col items-start rounded-lg border px-2 py-1.5 text-left ${m === p.month ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2"}`}>
              <span className={`text-[15px] font-bold ${isNow ? "text-brand" : ""}`}>{Number(m.slice(5))}月</span>
              {p.showEv && <span className="text-[12px] text-ink-2">{evDays > 0 ? `予定 ${evDays}日` : "予定なし"}</span>}
              {p.showMoney && s.expense > 0 && <span className="num text-[12px] text-expense">−{formatYen(s.expense)}</span>}
              {p.showMoney && s.income > 0 && <span className="num text-[12px] text-income">+{formatYen(s.income)}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** 選んだ日を含む週（日曜はじまり）の7日 */
export function weekDays(day: string): string[] {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  const start = addDays(day, -dow);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** 見ている月のうち、予定・支出・収入・期限のある日（一覧の形） */
export function listDays(month: string, has: (d: string) => boolean): string[] {
  return monthGrid(month)
    .flat()
    .filter((d): d is string => !!d && has(d));
}

function DayRow({ d, selected, today, showEv, showMoney, onPick }: { d: string; selected: string; today: string; showEv: boolean; showMoney: boolean; onPick: (d: string) => void }) {
  const data = useData();
  const evs = showEv ? eventsOnDay(data.events, d) : [];
  const s = daySummary(data.transactions, d);
  const dl = deadlinesOn(data, d);
  const hol = holidayName(d);
  const isSel = d === selected;
  return (
    <li>
      <button type="button" onClick={() => onPick(d)} aria-pressed={isSel} className={`flex min-h-14 w-full items-start gap-3 px-1 py-2 text-left ${isSel ? "bg-brand-soft" : "hover:bg-surface-2"}`}>
        <span className="w-20 shrink-0">
          <span className={`block text-[15px] font-semibold ${d === today ? "text-brand" : ""}`}>
            {formatDateJa(d)}
            {d === today && <span className="ml-1 text-[14px]">今日</span>}
          </span>
          {hol && <span className="block text-[14px] text-ink-3">{hol}</span>}
        </span>
        <span className="min-w-0 flex-1 space-y-0.5">
          {evs.map((e) => (
            <span key={e.id} className="block truncate text-[14px]">
              <span className="num mr-1 text-ink-3">{eventTimeLabel(e, d)}</span>
              {e.title.trim() || "（名前なし）"}
            </span>
          ))}
          {dl.map((x) => (
            <span key={x.key} className="block truncate text-[14px] text-warn">
              {x.kind}：{x.title}
            </span>
          ))}
          {evs.length === 0 && dl.length === 0 && !(showMoney && (s.expense || s.income)) && <span className="block text-[14px] text-ink-3">なし</span>}
        </span>
        {showMoney && (s.expense > 0 || s.income > 0) && (
          <span className="num shrink-0 text-right text-[14px]">
            {s.expense > 0 && <span className="block text-expense">−{formatYen(s.expense)}</span>}
            {s.income > 0 && <span className="block text-income">+{formatYen(s.income)}</span>}
          </span>
        )}
      </button>
    </li>
  );
}

export function WeekView(p: { selected: string; today: string; showEv: boolean; showMoney: boolean; onPick: (d: string) => void }) {
  return (
    <ul className="divide-y divide-line border-y border-line" aria-label="週の予定とお金">
      {weekDays(p.selected).map((d) => (
        <DayRow key={d} d={d} {...p} />
      ))}
    </ul>
  );
}

export function ListView(p: { month: string; selected: string; today: string; showEv: boolean; showMoney: boolean; onPick: (d: string) => void }) {
  const data = useData();
  const days = listDays(p.month, (d) => (p.showEv && eventsOnDay(data.events, d).length > 0) || deadlinesOn(data, d).length > 0 || (p.showMoney && daySummary(data.transactions, d).list.length > 0));
  if (days.length === 0) return <p className="py-6 text-center text-[14px] text-ink-3">この月の予定・記録はまだありません。</p>;
  return (
    <ul className="divide-y divide-line border-y border-line" aria-label="月の予定とお金の一覧">
      {days.map((d) => (
        <DayRow key={d} d={d} selected={p.selected} today={p.today} showEv={p.showEv} showMoney={p.showMoney} onPick={p.onPick} />
      ))}
    </ul>
  );
}
