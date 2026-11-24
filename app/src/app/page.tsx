"use client";

import Link from "next/link";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useData, useStore } from "@/lib/store";
import { daySummary, eventsOnDay, remainingBudget, sortTxDesc, summarizeMonth } from "@/lib/aggregate";
import { addDays, daysBetween, formatDateJa, monthKey, todayStr } from "@/lib/date";
import { formatSignedYen, formatYen } from "@/lib/money";
import { nextRecurring } from "@/lib/recurring";
import { buildNavi } from "@/lib/navi";
import { buildTodayItems, TODAY_SHOWN } from "@/lib/todayItems";
import { buildInsights } from "@/lib/report";
import { useUI } from "@/components/UIContext";
import { AddFromQuery } from "@/components/AddFromQuery";
import { EventRow, TxRow } from "@/components/Rows";
import { LogoLockup } from "@/components/Logo";
import { Card, DevBadge, IconChevronR, IconSearch, SectionTitle } from "@/components/ui";
import { STORAGE_TEXT, useIsNativeApp } from "@/lib/platform";
import { monthLedger } from "@/lib/ledger";
import { addMonthsToKey } from "@/lib/date";
import dynamic from "next/dynamic";
import { currentLayout, layoutFor, saveLayout, type HomeCardId, type LayoutDraft } from "@/lib/homeLayout";

// 自分用（personal）だけの新しい機能（レビュー o1 の家計の機能。公開するかは平尾さんが決める）
const PERSONAL = process.env.NEXT_PUBLIC_KB_EDITION === "personal";
/** 予算を決める案内を出すまでの記録の数（はじめは記録を優先。レビュー o1 の P08） */
const BUDGET_HINT_AFTER = 10;
// ホームの編集と「今日のまとめ」は自分用だけ（公開版では読み込まない）
const HomeEditor = PERSONAL ? dynamic(() => import("@/components/HomeLayout").then((m) => m.HomeEditor)) : null;
const TodayAll = PERSONAL ? dynamic(() => import("@/components/HomeLayout").then((m) => m.TodayAll)) : null;

/** 日付の変わり目（0時）でホームの「今日」を更新する */
function useToday(): string {
  const [t, setT] = useState(todayStr());
  useEffect(() => {
    const id = setInterval(() => setT(todayStr()), 60_000);
    const onVis = () => setT(todayStr());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return t;
}

const EVENTS_SHOWN = 2;
const TASKS_SHOWN = 2;
const NAVI_SHOWN = 3;
const NEXT_EVENT_DAYS = 60; // 今日の予定がないとき、この日数先までの次の予定を出す

export default function HomePage() {
  const nativeApp = useIsNativeApp();
  const data = useData();
  const ui = useUI();
  const store = useStore();
  const today = useToday();
  // ホームの編集中の並び（保存するまで、ホームはこの並びで見える＝プレビュー）
  const [editLayout, setEditLayout] = useState<LayoutDraft | null>(null);
  const month = monthKey(today);
  const sum = summarizeMonth(data.transactions, month);
  // 自分用は、予算と比べるのを「投資を除いた生活費」に。ホーム・振り返り・1日あたりで同じ計算（lib/ledger.ts。100点化の指示 D）。
  // 公開版は今までどおり、すべての支出と比べる
  const ledger = PERSONAL ? monthLedger(data, month, today) : null;
  const spentForBudget = ledger ? ledger.lifeExpense : sum.expense;
  const remaining = remainingBudget(data.budget.monthly, spentForBudget);
  const todayEvents = eventsOnDay(data.events, today);
  const todaySpent = daySummary(data.transactions, today).expense;
  const prefs = data.prefs.home;
  const pct = data.budget.monthly ? Math.min(100, Math.round((spentForBudget / data.budget.monthly) * 100)) : 0;

  // 今日の予定がなければ、次の予定を1件
  let nextEvent: { day: string; ev: (typeof data.events)[number] } | null = null;
  if (todayEvents.length === 0) {
    for (let i = 1; i <= NEXT_EVENT_DAYS && !nextEvent; i++) {
      const day = addDays(today, i);
      const evs = eventsOnDay(data.events, day);
      if (evs.length) nextEvent = { day, ev: evs[0] };
    }
  }

  // 今日やること：期限が今日まで（過ぎたものを先に）の未完了タスク
  const todo = data.tasks.filter((t) => !t.done && t.due && t.due <= today).sort((a, b) => a.due.localeCompare(b.due));

  // 確認したいこと：タスクは「今日やること」に出すので除く
  // 「今日のまとめ」を出しているとき（自分用）は、同じものを「確認したいこと」に二重に出さない
  const todayShown = PERSONAL && layoutFor(prefs, editLayout).includes("todayAll");
  // 除くのは、まとめに実際に出る分だけ（8件を超えた分は、確認したいことに残す）
  const dup = todayShown ? new Set(buildTodayItems(data, today).slice(0, TODAY_SHOWN).map((i) => i.key)) : null;
  const navi = buildNavi(data, today).filter((n) => !n.key.startsWith("task-") && !dup?.has(n.key));
  const [naviOpen, setNaviOpen] = useState(false);
  const insight = buildInsights(data, month, today)[0];
  const next = nextRecurring(data.recurring);
  const recent = sortTxDesc(data.transactions).slice(0, 3);
  const firstUse = data.transactions.length === 0 && data.events.length === 0;
  const allowance = ledger && ledger.perDay !== null ? { perDay: ledger.perDay, daysLeft: ledger.daysLeft, unpaidFixed: ledger.unpaidFixed, freeLeft: ledger.freeLeft ?? 0 } : null;
  const lastMonthExpense = summarizeMonth(data.transactions, addMonthsToKey(month, -1)).expense;

  // ホームのカード（100点化の指示 E：自分用は並び替え・隠すができる。公開版は今までの並びのまま）
  const cards: Record<HomeCardId | "firstUse", ReactNode> = {
    budget: (
    <>
        {/* 1. 今月の残り予算 */}
        <section className="rounded-2xl bg-brand p-4 text-brand-ink shadow-sm" aria-labelledby="home-budget">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="home-budget" className="text-[14px] font-semibold opacity-90">
                {remaining === null ? "今月の支出" : "今月の残り予算"}
              </h2>
              {remaining === null ? (
                <p className="num mt-1 text-[32px] leading-tight font-bold">{formatYen(sum.expense)}</p>
              ) : (
                <p className={`num text-[32px] leading-tight font-bold ${remaining < 0 ? "text-[#ffd9d2]" : ""}`}>
                  {remaining < 0 ? `予算を${formatYen(-remaining)}超過` : formatSignedYen(remaining)}
                </p>
              )}
            </div>
            {prefs.todaySpent && (
              <div className="shrink-0 text-right">
                <p className="text-[12px] font-semibold opacity-90">今日の支出</p>
                <p className="num text-[20px] font-bold">{formatYen(todaySpent)}</p>
              </div>
            )}
          </div>
          {remaining === null ? (
            data.transactions.length >= BUDGET_HINT_AFTER && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] opacity-90">
                {lastMonthExpense > 0 ? `先月の支出は${formatYen(lastMonthExpense)}でした。` : ""}予算を決めると残りの金額も表示できます（任意）
              </p>
              <Link href="/settings#budget" className="inline-flex min-h-11 items-center rounded-xl bg-white/15 px-4 text-[14px] font-semibold hover:bg-white/25">
                予算を設定する
              </Link>
            </div>
            )
          ) : (
            <>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="予算の使用率">
                <div className={`h-full rounded-full ${remaining < 0 ? "bg-[#ffb4a6]" : "bg-white"}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="num text-[12px] opacity-90">
                  予算 {formatYen(data.budget.monthly ?? 0)}・使った額{ledger ? "（投資を除く）" : ""} {formatYen(spentForBudget)}
                </p>
                <Link href="/report" className="inline-flex min-h-9 shrink-0 items-center rounded-lg bg-white/15 px-3 text-[12px] font-semibold hover:bg-white/25">
                  振り返り
                </Link>
              </div>
              {allowance && (
                <p className="num mt-2 rounded-xl bg-white/15 px-3 py-2 text-[13px]">
                  {allowance.freeLeft < 0 ? (
                    // 自由に使える残りがマイナスのときは「¥0 使えます」ではなく、どれだけ超えるかを出す（指示書 D）
                    <>
                      月末まで（{allowance.daysLeft}日）<strong className="text-[16px]">{formatYen(-allowance.freeLeft)} 足りません</strong>
                    </>
                  ) : (
                    <>
                      月末まで（{allowance.daysLeft}日）<strong className="text-[16px]">1日あたり {formatYen(allowance.perDay)}</strong> 使えます
                    </>
                  )}
                  <span className="block text-[11px] opacity-90">
                    {allowance.unpaidFixed > 0 ? `まだ記録していない今月の固定費 ${formatYen(allowance.unpaidFixed)} を引いた額です` : "今月の固定費は記録済みです"}
                  </span>
                </p>
              )}
            </>
          )}
        </section>
    </>
  ),
    today: (
    <>
        {/* 2. 今日の予定（なければ次の予定） */}
        <Card>
          <SectionTitle
            action={
              <Link href="/calendar" className="min-h-9 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-brand hover:bg-brand-soft">
                カレンダー
              </Link>
            }
          >
            {todayEvents.length > 0 || !nextEvent ? "今日の予定" : "次の予定"}
            {todayEvents.length > 0 && <span className="ml-1 text-[13px] font-medium text-ink-3">{todayEvents.length}件</span>}
          </SectionTitle>
          {todayEvents.length > 0 ? (
            <>
              <ul className="-mx-2">
                {todayEvents.slice(0, EVENTS_SHOWN).map((e) => (
                  <EventRow key={e.id} ev={e} day={today} />
                ))}
              </ul>
              {todayEvents.length > EVENTS_SHOWN && (
                <Link href="/calendar" className="mt-1 flex min-h-10 items-center justify-center rounded-lg text-[13px] font-semibold text-brand hover:bg-brand-soft">
                  ほか{todayEvents.length - EVENTS_SHOWN}件をカレンダーで見る
                </Link>
              )}
            </>
          ) : nextEvent ? (
            <>
              <p className="text-[12px] text-ink-3">
                今日の予定はありません。次は{daysBetween(today, nextEvent.day) === 1 ? "明日" : formatDateJa(nextEvent.day)}です
              </p>
              <ul className="-mx-2">
                <EventRow ev={nextEvent.ev} day={nextEvent.day} />
              </ul>
            </>
          ) : (
            <div className="flex items-center justify-between gap-2 py-1">
              <p className="text-[14px] text-ink-3">予定はありません</p>
              <button type="button" onClick={() => ui.openEvent({ mode: "new", date: today })} className="min-h-10 rounded-lg px-2 text-[13px] font-semibold text-brand hover:bg-brand-soft">
                ＋ 予定を追加
              </button>
            </div>
          )}
        </Card>
    </>
  ),
    nextFixed: (
    <>
        {/* 次の固定費（今日の予定の近くに。レビュー o1 の P09） */}
        {(PERSONAL || prefs.nextRecurring) && next && (
          <Link href={`/recurring?open=${next.id}`} className="block">
            <Card className="flex items-center justify-between py-3 hover:bg-surface-2">
              <div>
                <h2 className="text-[14px] font-semibold text-ink-2">次の固定費</h2>
                <p className="text-[13px] text-ink-3">
                  {formatDateJa(next.nextDueDate)} {next.name}
                </p>
              </div>
              <p className="num text-lg font-bold">{formatYen(next.amount)}</p>
            </Card>
          </Link>
        )}
    </>
  ),
    todo: (
    <>
        {/* 3. 今日やること（あるときだけ） */}
        {todo.length > 0 && (
          <Card className="py-3">
            <h2 className="mb-1 text-[15px] font-bold">
              今日やること<span className="ml-1 text-[13px] font-medium text-ink-3">{todo.length}件</span>
            </h2>
            <ul className="-mx-2">
              {todo.slice(0, TASKS_SHOWN).map((t) => {
                const late = t.due < today;
                return (
                  <li key={t.id}>
                    <Link href={`/tasks?open=${t.id}`} className="flex min-h-12 items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface-2">
                      <span className={`size-2 shrink-0 rounded-full ${late ? "bg-warn" : "bg-brand"}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold">{t.title}</span>
                        <span className={`block text-[12px] ${late ? "text-warn" : "text-ink-3"}`}>
                          {late ? `期限を${daysBetween(t.due, today)}日過ぎています` : "今日が期限"}
                        </span>
                      </span>
                      <IconChevronR className="size-4 shrink-0 text-ink-3" />
                    </Link>
                  </li>
                );
              })}
            </ul>
            {todo.length > TASKS_SHOWN && (
              <Link href="/tasks" className="mt-1 flex min-h-10 items-center justify-center rounded-lg text-[13px] font-semibold text-brand hover:bg-brand-soft">
                ほか{todo.length - TASKS_SHOWN}件を見る
              </Link>
            )}
          </Card>
        )}
    </>
  ),
    firstUse: (
    <>
        {/* はじめにやること（記録が1件もない間だけ） */}
        {firstUse && (
          <Card>
            <h2 className="text-[15px] font-bold">はじめにやること</h2>
            <ol className="mt-2 space-y-1">

              <li>
                <button type="button" onClick={() => ui.openAdd()} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-1 text-left text-[14px] hover:bg-surface-2">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">1</span>
                  <span className="flex-1">画面下の「＋」から、支出か予定を1件追加する</span>
                  <IconChevronR className="size-4 shrink-0 text-ink-3" />
                </button>
              </li>
              <li>
                <Link href="/calendar" className="flex min-h-11 items-center gap-2 rounded-xl px-1 text-[14px] hover:bg-surface-2">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">2</span>
                  <span className="flex-1">カレンダーで、その日の記録を見る</span>
                  <IconChevronR className="size-4 shrink-0 text-ink-3" />
                </Link>
              </li>
              <li>
                <Link href="/settings#budget" className="flex min-h-11 items-center gap-2 rounded-xl px-1 text-[14px] hover:bg-surface-2">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">3</span>
                  <span className="flex-1">1か月の予算を決める<span className="ml-1 text-[12px] text-ink-3">あとでも大丈夫</span></span>
                  <IconChevronR className="size-4 shrink-0 text-ink-3" />
                </Link>
              </li>
            </ol>
            <p className="mt-2 text-[13px] text-ink-2">{STORAGE_TEXT[nativeApp ? "app" : "web"].short}</p>
            <Link href="/guide" className="mt-1 inline-flex min-h-11 items-center text-[14px] font-semibold text-brand">
              使い方とデータの守り方
              <IconChevronR className="ml-1 size-4" />
            </Link>
          </Card>
        )}
    </>
  ),
    navi: (
    <>
        {/* ここから下は補足（あるときだけ） */}
        {(PERSONAL || prefs.needsReview) && navi.length > 0 && (
          <Card className="py-3">
            <h2 className="mb-1 text-[15px] font-bold">
              確認したいこと<span className="ml-1 text-[13px] font-medium text-ink-3">{navi.length}件</span>
            </h2>
            <ul className="-mx-2">
              {(naviOpen ? navi : navi.slice(0, NAVI_SHOWN)).map((n) => (
                <li key={n.key}>
                  <Link href={n.href} className="flex min-h-12 items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface-2">
                    <span className={`size-2 shrink-0 rounded-full ${n.tone === "warn" ? "bg-warn" : n.tone === "today" ? "bg-brand" : "bg-ink-3"}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[14px] font-semibold ${n.tone === "warn" ? "text-warn" : ""}`}>{n.title}</span>
                      {n.sub && <span className="block truncate text-[12px] text-ink-3">{n.sub}</span>}
                    </span>
                    <IconChevronR className="size-4 shrink-0 text-ink-3" />
                  </Link>
                </li>
              ))}
            </ul>
            {navi.length > NAVI_SHOWN && (
              <button
                type="button"
                onClick={() => setNaviOpen(!naviOpen)}
                aria-expanded={naviOpen}
                className="mt-1 flex min-h-10 w-full items-center justify-center rounded-lg text-[13px] font-semibold text-brand hover:bg-brand-soft"
              >
                {naviOpen ? "閉じる" : `すべて見る（ほか${navi.length - NAVI_SHOWN}件）`}
              </button>
            )}
          </Card>
        )}
    </>
  ),
    insight: (
    <>
        {insight && (
          <Link href="/report" className="block">
            <section className="rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-[13px] font-semibold text-warn">支出の変化</h2>
                  <p className="text-[14px]">{insight.text}</p>
                </div>
                <IconChevronR className="size-4 shrink-0 text-ink-3" />
              </div>
            </section>
          </Link>
        )}
    </>
  ),
    recent: (
    <>
        {recent.length > 0 && (
          <Card>
            <SectionTitle
              action={
                <Link href="/history" className="min-h-9 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-brand hover:bg-brand-soft">
                  すべて見る
                </Link>
              }
            >
              最近の記録
            </SectionTitle>
            <ul className="-mx-2">
              {recent.map((t) => (
                <TxRow key={t.id} tx={t} showDate />
              ))}
            </ul>
          </Card>
        )}
    </>
  ),
    todayAll: TodayAll ? <TodayAll today={today} /> : null,
  };
  const shown = layoutFor(prefs, editLayout);

  return (
    <main className="space-y-4 pt-3">
      <AddFromQuery />
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <LogoLockup size={30} />
          <p className="mt-1 text-[13px] font-medium text-ink-3">{formatDateJa(today, true)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <DevBadge />
          {/* ホームの編集（右上。自分用だけ。100点化の指示 E） */}
          {PERSONAL && (
            <div className="flex items-center gap-0.5">
              <Link href="/search" aria-label="さがす" className="inline-flex size-11 items-center justify-center rounded-lg text-brand hover:bg-brand-soft">
                <IconSearch className="size-5" />
              </Link>
              <button type="button" aria-label="ホームを編集" onClick={() => setEditLayout(currentLayout(prefs))} className="min-h-11 rounded-lg px-2 text-[13px] font-semibold text-brand hover:bg-brand-soft">
                編集
              </button>
            </div>
          )}
        </div>
      </header>

      {shown.map((id, i) => (
        <Fragment key={id}>
          {cards[id]}
          {/* はじめにやること（隠せない）：自分用は最初のカードのすぐ下、公開版は今までどおり「今日やること」の下 */}
          {(PERSONAL ? i === 0 : id === "todo") && cards.firstUse}
        </Fragment>
      ))}
      {HomeEditor && editLayout && (
        <HomeEditor
          layout={editLayout}
          onChange={setEditLayout}
          onCancel={() => setEditLayout(null)}
          onSave={(l) => {
            const r = saveLayout(store, l);
            if (!r.ok) return ui.toast(r.error, "error");
            setEditLayout(null);
            ui.toast("ホームの並びを保存しました");
          }}
        />
      )}
    </main>
  );
}
