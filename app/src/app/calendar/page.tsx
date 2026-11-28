"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { IS_PERSONAL } from "@/lib/edition";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { dayFromSearch, searchWithDay } from "@/lib/searchState";
import { deadlineDays, deadlinesOn } from "@/lib/deadlines";
import { formatMinutes } from "@/lib/life";
import { useData } from "@/lib/store";
import { daySummary, eventLabel, eventsOnDay, summarizeMonth } from "@/lib/aggregate";
import { addMonthsToKey, formatDateJa, formatMonthJa, monthGrid, monthKey, todayStr } from "@/lib/date";
import { formatYen } from "@/lib/money";
import { holidayName } from "@/lib/holidays";
import { useUI } from "@/components/UIContext";
import { EventRow, TxRow } from "@/components/Rows";
import { Card, IconChevronL, IconChevronR, PageHeader, SectionTitle } from "@/components/ui";
import { CAL_VIEWS, CAL_VIEW_KEY, parseCalView, type CalendarView } from "@/components/CalendarViews";
import { addDays } from "@/lib/date";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
/** マスに名前を出す予定の数（それより多い日は「+n」） */
const EVENT_TITLES_IN_CELL = 2;

// 組み立てのときに決まる値を、このファイルの中で直接比べる（別ファイルの定数だと、公開版のビルドから自分用の部品の塊が取り除かれない）
const PERSONAL_BUILD = process.env.NEXT_PUBLIC_KB_EDITION === "personal";
// 週・一覧の表示は自分用だけ。公開版の組み立てに入れないよう、遅れて読む（反証 4）
const WeekView = PERSONAL_BUILD ? dynamic(() => import("@/components/CalendarViews").then((m) => m.WeekView)) : () => null;
const ListView = PERSONAL_BUILD ? dynamic(() => import("@/components/CalendarViews").then((m) => m.ListView)) : () => null;
const YearView = PERSONAL_BUILD ? dynamic(() => import("@/components/CalendarViews").then((m) => m.YearView)) : () => null;
// 予定のない時間帯（自分用。NEXT v21 X10）
const FreeTimeCard = PERSONAL_BUILD ? dynamic(() => import("@/components/FreeTimeCard").then((m) => m.FreeTimeCard)) : null;

const SHOW_KEY = "kurashi-base:ui:calendar-show:v1";

/** 色と印の見方。自分用は畳む（開けば見える）。公開版は今までどおり、いつも出す（点検 中-1：公開版の見た目を変えない） */
function Legend({ personal, children }: { personal: boolean; children: React.ReactNode }) {
  if (!personal) return <>{children}</>;
  return (
    <details className="mt-1">
      <summary className="flex min-h-11 cursor-pointer items-center justify-center text-[14px] font-semibold text-ink-3">色と印の見方</summary>
      {children}
    </details>
  );
}

function shortYen(n: number): string {
  if (n >= 100_000) return `${Math.round(n / 10_000)}万`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`;
  return n.toLocaleString("ja-JP");
}

export default function CalendarPage() {
  // useSearchParams は、書き出し（静的）のとき Suspense の中で使う必要がある
  return (
    <Suspense fallback={null}>
      <CalendarInner />
    </Suspense>
  );
}

function CalendarInner() {
  const data = useData();
  const params = useSearchParams();
  const ui = useUI();
  const today = todayStr();
  // 選んだ日は、アドレスの ?d= に残す（日付の詳細 → 別の画面 → 戻る、で、選んだ日が戻る。履歴は増やさない）
  const initialDay = dayFromSearch(params.toString()) || today;
  const [month, setMonth] = useState(monthKey(initialDay));
  const [selected, setSelected] = useState(initialDay);
  // 自分用：月の表で日を押したら、その日の予定とお金の所まで動かす（表の下に隠れて変化が見えなかった。2026-11-28 洗い出し 4）
  const dayRef = useRef<HTMLElement>(null);
  const pickDay = (d: string) => {
    setSelected(d);
    if (PERSONAL_BUILD) requestAnimationFrame(() => dayRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  useEffect(() => {
    const next = searchWithDay(window.location.search, selected, today);
    if (next !== window.location.search) window.history.replaceState(window.history.state, "", `${window.location.pathname}${next}`);
  }, [selected, today]);
  // マスに出すもの（レビュー o1 の P10：狭いマスに予定と金額が混ざるので、見たいほうだけにもできる）
  const [show, setShow] = useState<"all" | "event" | "money">("all");
  // 見たいほうを覚える（表示だけの設定。記録とは別のキー。読めない・書けない端末でも動く。NEXT v21 CAL:C12）
  useEffect(() => {
    try {
      const v = localStorage.getItem(SHOW_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 開いたあとに、前回の選択を読む（最初の描画はサーバーと同じにそろえる）
      if (v === "event" || v === "money") setShow(v);
    } catch {
      /* 覚えられなくても使える */
    }
  }, []);
  // 表示の形（自分用：月・週・一覧。o31 F008）。表示だけの設定で、記録・集計は変わらない
  const [view, setView] = useState<CalendarView>("month");
  useEffect(() => {
    if (!PERSONAL_BUILD) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 開いたあとに、前回の表示の形を読む
      setView(parseCalView(localStorage.getItem(CAL_VIEW_KEY)));
    } catch {
      /* 覚えられなくても使える */
    }
  }, []);
  const pickView = (v: CalendarView) => {
    setView(v);
    try {
      localStorage.setItem(CAL_VIEW_KEY, v);
    } catch {
      /* 覚えられなくても使える */
    }
  };
  const pickShow = (k: "all" | "event" | "money") => {
    setShow(k);
    try {
      localStorage.setItem(SHOW_KEY, k);
    } catch {
      /* 覚えられなくても使える */
    }
  };
  const showEv = show !== "money";
  const showMoney = show !== "event";
  // 選んだ日を＋ボタンに引き継ぐ
  const { setCalendarDate } = ui;
  useEffect(() => {
    setCalendarDate(selected);
  }, [selected, setCalendarDate]);
  const weeks = useMemo(() => monthGrid(month), [month]);
  const sum = summarizeMonth(data.transactions, month);
  // 年の表示の合計（家計簿と同じ月の集計を12か月足す）
  const yearSum = useMemo(() => {
    if (view !== "year") return { expense: 0, income: 0 };
    let expense = 0;
    let income = 0;
    for (let i = 1; i <= 12; i++) {
      const s = summarizeMonth(data.transactions, `${month.slice(0, 4)}-${String(i).padStart(2, "0")}`);
      expense += s.expense;
      income += s.income;
    }
    return { expense, income };
  }, [view, month, data.transactions]);

  // 日ごとの支出・予定件数を前計算
  const perDay = useMemo(() => {
    const m = new Map<string, { exp: number; inc: number; ev: number; titles: string[] }>();
    for (const d of weeks.flat()) {
      if (!d) continue;
      const s = daySummary(data.transactions, d);
      const evs = eventsOnDay(data.events, d);
      m.set(d, { exp: s.expense, inc: s.income, ev: evs.length, titles: evs.slice(0, EVENT_TITLES_IN_CELL).map((e) => eventLabel(e)) });
    }
    return m;
  }, [weeks, data.transactions, data.events]);

  const dayEvents = eventsOnDay(data.events, selected);
  const day = daySummary(data.transactions, selected);
  const dayDeadlines = deadlinesOn(data, selected);
  // 選んだ日の固定費の支払い予定（実績の支出とは分ける。自分用だけ：公開版は友人β中なので今のまま）
  const dayFixed = IS_PERSONAL ? data.recurring.filter((r) => r.active && r.nextDueDate === selected).reduce((a, r) => a + (r.partialPaid && r.partialPaid.due === r.nextDueDate ? Math.max(0, r.amount - r.partialPaid.paid) : r.amount), 0) : 0;
  const dlDays = useMemo(() => deadlineDays(data, month), [data, month]);
  const dayNotes = data.notes.filter((n) => n.date === selected);
  const dayStudy = data.studyLogs.filter((l) => l.date === selected).reduce((s, l) => s + l.minutes, 0);

  const move = (delta: number) => {
    // 日の表示では前後の日へ、週の表示では前後の週へ（選んだ日をずらす）
    if (view === "week" || view === "day") {
      const d = addDays(selected, (view === "week" ? 7 : 1) * delta);
      setSelected(d);
      setMonth(monthKey(d));
      return;
    }
    const next = addMonthsToKey(month, view === "year" ? 12 * delta : delta);
    setMonth(next);
    setSelected(monthKey(today) === next ? today : `${next}-01`);
  };
  // 年月を選ぶ（自分用。To-Be 02「年月指定」）・年の表示で月を押す → その月を開く
  const jumpMonth = (m: string, openMonth = false) => {
    if (!/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(m)) return;
    setMonth(m);
    setSelected(monthKey(today) === m ? today : `${m}-01`);
    if (openMonth) pickView("month");
  };
  const unit = view === "day" ? "日" : view === "week" ? "週" : view === "year" ? "年" : "月";
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
          <button type="button" onClick={() => move(-1)} aria-label={`前の${unit}`} className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
            <IconChevronL />
          </button>
          <h2 className="relative flex min-h-11 items-center rounded-lg px-3 text-[17px] font-bold focus-within:ring-2 focus-within:ring-brand">
            <span aria-live="polite">{view === "year" ? `${month.slice(0, 4)}年` : view === "day" ? formatDateJa(selected, true) : formatMonthJa(month)}</span>
            {/* 見出しを押すと年月を選べる（自分用。見出しの上に透明の入力を重ねる。キーボードで移ったときは見出しに枠が出る。点検 中-3） */}
            {PERSONAL_BUILD && view !== "day" && (
              <input type="month" aria-label="年月を選ぶ" value={month} onChange={(e) => jumpMonth(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            )}
          </h2>
          <button type="button" onClick={() => move(1)} aria-label={`次の${unit}`} className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
            <IconChevronR />
          </button>
        </div>
        <p className="num mb-2 text-center text-[12px] text-ink-3">
          {/* 年・日の表示はその期間の合計（自分用だけ。公開版の組み立てに文字を残さない。点検 中-1：日の見出しの下に月の合計を出さない） */}
          {PERSONAL_BUILD && view === "year" ? "この年の" : PERSONAL_BUILD && view === "day" ? "この日の" : ""}支出 {formatYen(view === "year" ? yearSum.expense : view === "day" ? day.expense : sum.expense)} ・ 収入{" "}
          {formatYen(view === "year" ? yearSum.income : view === "day" ? day.income : sum.income)}
        </p>
        <div className="mb-2 grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="マスに出すもの">
          {(
            [
              ["all", "予定とお金"],
              ["event", "予定"],
              ["money", "お金"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={show === k} onClick={() => pickShow(k)} className={`min-h-11 rounded-lg text-[13px] font-semibold ${show === k ? "bg-surface shadow-sm" : "text-ink-2"}`}>
              {label}
            </button>
          ))}
        </div>
        {PERSONAL_BUILD && (
          <div className="mb-2 grid grid-cols-5 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="表示の形">
            {CAL_VIEWS.map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={view === k} onClick={() => pickView(k)} className={`min-h-11 rounded-lg text-[13px] font-semibold ${view === k ? "bg-surface shadow-sm" : "text-ink-2"}`}>
                {label}
              </button>
            ))}
          </div>
        )}
        {view === "week" && <WeekView selected={selected} today={today} showEv={showEv} showMoney={showMoney} onPick={setSelected} />}
        {view === "year" && <YearView year={month.slice(0, 4)} month={month} today={today} showEv={showEv} showMoney={showMoney} onPickMonth={(m) => jumpMonth(m, true)} />}
        {view === "list" && <ListView month={month} selected={selected} today={today} showEv={showEv} showMoney={showMoney} onPick={setSelected} />}
        {view === "month" && (
        <table className="w-full table-fixed border-separate border-spacing-0.5" aria-label={`${formatMonthJa(month)}のカレンダー`}>
          <thead>
            <tr>
              {WEEK.map((w) => (
                <th key={w} scope="col" className="pb-1 text-[12px] font-semibold text-ink-3">
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
                  const rest = i === 0 || !!hol; // 日曜と祝日は、薄い色（赤は支出、青は収入だけに使う）
                  const future = d > today; // 今日より後の日の金額は、薄い斜めの字（実際に使った額と区別する）
                  const label = `${isToday ? "今日 " : ""}${formatDateJa(d)}${hol ? ` ${hol}` : ""}${showEv && info.ev ? ` 予定${info.ev}件（${info.titles.join("、")}${info.ev > info.titles.length ? "ほか" : ""}）` : ""}${showMoney && info.exp ? ` 支出${formatYen(info.exp)}` : ""}${showMoney && info.inc ? ` 収入${formatYen(info.inc)}` : ""}${dlDays.has(d) ? " 期限あり" : ""}`;
                  return (
                    <td key={d} className="h-px p-0 align-top">
                      <button
                        type="button"
                        onClick={() => pickDay(d)}
                        aria-pressed={isSel}
                        aria-label={label}
                        className={`flex h-full min-h-[66px] w-full flex-col items-center rounded-xl pt-1 pb-1 transition ${
                          isSel ? "bg-brand text-brand-ink" : isToday ? "bg-brand-soft" : "hover:bg-surface-2"
                        }`}
                      >
                        <span className={`num text-[14px] font-semibold ${!isSel && rest ? "text-ink-3" : ""}`}>
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
                          <span className={`num mt-0.5 max-w-full truncate px-0.5 text-[10px] leading-tight font-semibold ${isSel ? "text-white" : "text-expense"} ${future ? "italic" : ""}`} aria-hidden="true">
                            −{shortYen(info.exp)}
                          </span>
                        )}
                        {showMoney && info.inc > 0 && (
                          <span className={`num max-w-full truncate px-0.5 text-[10px] leading-tight font-semibold ${isSel ? "text-white" : "text-income"} ${future ? "italic" : ""}`} aria-hidden="true">
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
        )}
        {view === "month" && (
        <Legend personal={PERSONAL_BUILD}>
        <div className="mt-2 flex justify-center gap-4 text-[11px] text-ink-3" aria-hidden="true">
          <span className="flex items-center gap-1">
            <span className="rounded bg-event-soft px-1 text-event">名前</span>予定
          </span>
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-warn" />期限・固定費の支払日
          </span>
        </div>
        {/* 凡例：1つずつ短く（赤＝支出、青＝収入、薄い斜め＝今日より後の日、薄い日付＝日曜・祝日） */}
        <ul className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-[12px] text-ink-3" aria-hidden="true">
          <li className="whitespace-nowrap">
            <span className="font-semibold text-expense">赤</span>：支出
          </li>
          <li className="whitespace-nowrap">
            <span className="font-semibold text-income">青</span>：収入
          </li>
          <li className="whitespace-nowrap">
            <span className="font-semibold italic">斜めの金額</span>：今日より後の日の分
          </li>
          <li className="whitespace-nowrap">
            <span className="font-semibold">灰色の日付</span>：日曜・祝日
          </li>
        </ul>
        </Legend>
        )}
      </Card>

      <section ref={dayRef} className="mt-4 scroll-mt-4 space-y-3" aria-label="選んだ日の予定とお金">
        <div className="space-y-2">
          <h2 className="text-[17px] font-bold">
            {formatDateJa(selected, true)}
            {holidayName(selected) && <span className="ml-2 text-[14px] font-semibold text-ink-2">{holidayName(selected)}</span>}
          </h2>
          <p className="num text-[13px] text-ink-2">
            予定 {dayEvents.length}件・<span className="text-expense">支出 {formatYen(day.expense)}</span>・<span className="text-income">収入 {formatYen(day.income)}</span>
            {/* 固定費の支払い予定（実績の支出とは分けて出す。100点化の指示 A） */}
            {dayFixed > 0 && <span className="text-warn">・この日に払う固定費 {formatYen(dayFixed)}</span>}
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

        {FreeTimeCard && showEv && <FreeTimeCard date={selected} />}

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
                  <Link href={x.href} className="flex min-h-11 items-center gap-2 rounded-lg px-1 hover:bg-surface-2">
                    <span className="w-12 shrink-0 text-[12px] text-warn">{x.kind}</span>
                    <span className={`min-w-0 flex-1 truncate ${x.done ? "text-ink-3 line-through" : "font-semibold"}`}>{x.title}</span>
                    {x.sub && <span className="num shrink-0 text-[13px]">{x.sub}</span>}
                  </Link>
                </li>
              ))}
              {dayNotes.map((n) => (
                <li key={n.id}>
                  <Link href={`/notes?open=${n.id}`} className="flex min-h-11 items-center gap-2 rounded-lg px-1 hover:bg-surface-2">
                    <span className="w-12 shrink-0 text-[12px] text-ink-3">メモ</span>
                    <span className="truncate">{n.title || n.body.slice(0, 30)}</span>
                  </Link>
                </li>
              ))}
              {dayStudy > 0 && (
                <li>
                  <Link href="/study" className="flex min-h-11 items-center gap-2 rounded-lg px-1 hover:bg-surface-2">
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
