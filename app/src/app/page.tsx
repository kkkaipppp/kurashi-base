"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useData } from "@/lib/store";
import { daySummary, eventsOnDay, remainingBudget, sortTxDesc, summarizeMonth } from "@/lib/aggregate";
import { formatDateJa, monthKey, todayStr } from "@/lib/date";
import { formatSignedYen, formatYen } from "@/lib/money";
import { nextRecurring } from "@/lib/recurring";
import { buildNavi } from "@/lib/navi";
import { useUI } from "@/components/UIContext";
import { EventRow, TxRow } from "@/components/Rows";
import { Card, DevBadge, Empty, IconChevronR, IconImage, IconPlus, SectionTitle } from "@/components/ui";

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

export default function HomePage() {
  const data = useData();
  const ui = useUI();
  const today = useToday();
  const month = monthKey(today);
  const sum = summarizeMonth(data.transactions, month);
  const remaining = remainingBudget(data.budget.monthly, sum.expense);
  const todayEvents = eventsOnDay(data.events, today);
  const todaySpent = daySummary(data.transactions, today).expense;
  const next = nextRecurring(data.recurring);
  const recent = sortTxDesc(data.transactions).slice(0, 5);
  const pct = data.budget.monthly ? Math.min(100, Math.round((sum.expense / data.budget.monthly) * 100)) : 0;

  // 「今日のナビ」は記録されたデータからだけ作る。何もなければ出さない
  const navi = buildNavi(data, today);

  const prefs = data.prefs.home;

  return (
    <main className="space-y-4 pt-3">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-medium text-ink-3">{formatDateJa(today, true)}</p>
          <h1 className="text-xl font-bold tracking-tight">暮らしベース</h1>
        </div>
        <DevBadge />
      </header>

      {/* 今月の残り */}
      <section className="rounded-2xl bg-brand p-4 text-brand-ink shadow-sm">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[14px] font-semibold opacity-90">今月の残り</h2>
          <span className="text-[12px] opacity-80">予算 − 今月の支出</span>
        </div>
        {remaining === null ? (
          <div className="mt-2">
            <p className="text-2xl font-bold">未設定</p>
            <p className="mt-1 text-[13px] opacity-90">予算を決めると、今月あといくら使えるかが分かります。</p>
            <Link href="/settings#budget" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-white/15 px-4 text-[14px] font-semibold hover:bg-white/25">
              予算を設定する
            </Link>
            <p className="num mt-3 text-[13px] opacity-90">今月の支出 {formatYen(sum.expense)}</p>
          </div>
        ) : (
          <div className="mt-1">
            <p className={`num text-[34px] leading-tight font-bold ${remaining < 0 ? "text-[#ffd9d2]" : ""}`}>{formatSignedYen(remaining)}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="予算の使用率">
              <div className={`h-full rounded-full ${remaining < 0 ? "bg-[#ffb4a6]" : "bg-white"}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="num mt-2 text-[13px] opacity-90">
              予算 {formatYen(data.budget.monthly ?? 0)} ／ 支出 {formatYen(sum.expense)}
              {sum.income > 0 && ` ／ 収入 ${formatYen(sum.income)}`}
            </p>
          </div>
        )}
      </section>

      {/* 主要操作 */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => ui.openTx({ mode: "new", type: "expense" })}
          className="flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-surface text-[15px] font-bold shadow-sm ring-1 ring-line hover:bg-surface-2"
        >
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-expense-soft text-expense">
            <IconPlus />
          </span>
          支出を追加
        </button>
        <Link
          href="/import"
          className="flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-surface text-[15px] font-bold shadow-sm ring-1 ring-line hover:bg-surface-2"
        >
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-brand-soft text-brand">
            <IconImage />
          </span>
          画像を取り込む
        </Link>
      </div>

      {/* 今日の予定 */}
      <Card>
        <SectionTitle
          action={
            <button type="button" onClick={() => ui.openEvent({ mode: "new", date: today })} className="min-h-9 rounded-lg px-2 text-[13px] font-semibold text-brand hover:bg-brand-soft">
              ＋ 予定
            </button>
          }
        >
          今日の予定
        </SectionTitle>
        {todayEvents.length ? (
          <ul className="-mx-2">
            {todayEvents.map((e) => (
              <EventRow key={e.id} ev={e} day={today} />
            ))}
          </ul>
        ) : (
          <p className="py-2 text-[14px] text-ink-3">今日の予定はありません</p>
        )}
      </Card>

      {/* 補助情報（設定でON/OFF、データがない時は出さない） */}
      {(prefs.todaySpent || (prefs.nextRecurring && next) || (prefs.needsReview && navi.length > 0)) && (
        <div className="grid gap-3">
          {prefs.todaySpent && (
            <Card className="flex items-center justify-between py-3">
              <h2 className="text-[14px] font-semibold text-ink-2">今日の支出</h2>
              <p className="num text-lg font-bold">{formatYen(todaySpent)}</p>
            </Card>
          )}
          {prefs.nextRecurring && next && (
            <Link href="/recurring" className="block">
              <Card className="flex items-center justify-between py-3 hover:bg-surface-2">
                <div>
                  <h2 className="text-[14px] font-semibold text-ink-2">固定費の次回予定</h2>
                  <p className="text-[13px] text-ink-3">
                    {formatDateJa(next.nextDueDate)} {next.name}
                  </p>
                </div>
                <p className="num text-lg font-bold">{formatYen(next.amount)}</p>
              </Card>
            </Link>
          )}
          {prefs.needsReview && navi.length > 0 && (
            <Card className="order-first py-3">
              <h2 className="mb-1 text-[15px] font-bold">今日のナビ</h2>
              <ul className="-mx-2">
                {navi.slice(0, 6).map((n) => (
                  <li key={n.key}>
                    <Link href={n.href} className="flex min-h-12 items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface-2">
                      <span
                        className={`size-2 shrink-0 rounded-full ${n.tone === "warn" ? "bg-warn" : n.tone === "today" ? "bg-brand" : "bg-ink-3"}`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[14px] font-semibold ${n.tone === "warn" ? "text-warn" : ""}`}>{n.title}</span>
                        {n.sub && <span className="block truncate text-[12px] text-ink-3">{n.sub}</span>}
                      </span>
                      <IconChevronR className="size-4 shrink-0 text-ink-3" />
                    </Link>
                  </li>
                ))}
              </ul>
              {navi.length > 6 && <p className="px-1 text-[12px] text-ink-3">ほか{navi.length - 6}件</p>}
            </Card>
          )}
        </div>
      )}

      {/* 最近の取引 */}
      <Card>
        <SectionTitle
          action={
            data.transactions.length > 0 && (
              <Link href="/history" className="min-h-9 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-brand hover:bg-brand-soft">
                すべて見る
              </Link>
            )
          }
        >
          最近の取引
        </SectionTitle>
        {recent.length ? (
          <ul className="-mx-2">
            {recent.map((t) => (
              <TxRow key={t.id} tx={t} showDate />
            ))}
          </ul>
        ) : (
          <Empty
            action={
              <div className="flex justify-center gap-2">
                <button type="button" onClick={() => ui.openTx({ mode: "new", type: "expense" })} className="min-h-11 rounded-xl bg-brand px-4 text-[14px] font-semibold text-brand-ink">
                  支出を追加
                </button>
                <button type="button" onClick={() => ui.openTx({ mode: "new", type: "income" })} className="min-h-11 rounded-xl border border-line bg-surface px-4 text-[14px] font-semibold">
                  収入を追加
                </button>
              </div>
            }
          >
            まだ取引がありません。最初の1件を登録しましょう。
          </Empty>
        )}
      </Card>
    </main>
  );
}
