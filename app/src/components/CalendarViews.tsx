"use client";

import { addDays, formatDateJa, monthGrid } from "@/lib/date";
import { daySummary, eventsOnDay } from "@/lib/aggregate";
import { deadlinesOn } from "@/lib/deadlines";
import { formatYen } from "@/lib/money";
import { holidayName } from "@/lib/holidays";
import { eventTimeLabel } from "./Rows";
import { useData } from "@/lib/store";

/**
 * 自分用のカレンダーの表示形式（o31 F008・C008）：月（マス）・週・一覧。
 * - 一覧は期間ではなく表示の形：見ている月の、記録や予定がある日だけを順に並べる
 * - 週は、選んだ日を含む日曜〜土曜の7日
 * - どれも押すとその日を選ぶ（下の明細が変わる）。表示を変えても記録・集計は変わらない
 */
export type CalendarView = "month" | "week" | "list";
export const CAL_VIEW_KEY = "kurashi-base:ui:calendar-view:v1";
export const CAL_VIEWS: [CalendarView, string][] = [
  ["month", "月"],
  ["week", "週"],
  ["list", "一覧"],
];

export function parseCalView(v: string | null): CalendarView {
  return v === "week" || v === "list" ? v : "month";
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
