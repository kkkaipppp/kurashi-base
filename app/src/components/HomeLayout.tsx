"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Sheet } from "./Sheet";
import { Button, Card, IconChevronR, SectionTitle } from "./ui";
import { useUI } from "./UIContext";
import { useData } from "@/lib/store";
import { eventsOnDay } from "@/lib/aggregate";
import { addDays, daysBetween, formatDateJa } from "@/lib/date";
import { buildTodayItems, TODAY_SHOWN } from "@/lib/todayItems";
import { eventTimeLabel } from "./Rows";
import { HOME_CARDS, defaultLayout, moveCard, toggleCard, type LayoutDraft } from "@/lib/homeLayout";

/* ---------------- ホームの編集（自分用。100点化の指示 E） ---------------- */

export function HomeEditor({
  layout,
  onChange,
  onCancel,
  onSave,
}: {
  layout: LayoutDraft;
  onChange: (l: LayoutDraft) => void;
  onCancel: () => void;
  onSave: (l: LayoutDraft) => void;
}) {
  const label = (id: string) => HOME_CARDS.find((c) => c.id === id);
  return (
    <Sheet
      title="ホームを編集"
      open
      onRequestClose={onCancel}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onCancel}>
            やめる
          </Button>
          <Button onClick={() => onSave(layout)}>保存する</Button>
        </div>
      }
    >
      <p className="mb-2 text-[13px] text-ink-3">↑↓で並べ替え、「表示」で出す・隠すを選びます。保存するまでは、ホームはこの並びで見えます（閉じると元に戻ります）。「＋」とデータを守る大事な案内は、いつも出ます。</p>
      <ol className="divide-y divide-line" aria-label="ホームのカードの並び">
        {layout.order.map((id, i) => {
          const c = label(id);
          const on = !layout.hidden.includes(id);
          return (
            <li key={id} className="flex min-h-14 items-center gap-2 py-1">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                <input type="checkbox" checked={on} onChange={() => onChange(toggleCard(layout, id))} className="size-5 shrink-0 accent-[var(--brand)]" aria-label={`${c?.label ?? id}を表示`} />
                <span className="min-w-0">
                  <span className={`block text-[14px] font-semibold ${on ? "" : "text-ink-3"}`}>
                    {c?.label ?? id}
                    {!on && <span className="ml-1 text-[12px] font-normal">（隠す）</span>}
                  </span>
                  <span className="block truncate text-[12px] text-ink-3">{c?.desc}</span>
                </span>
              </label>
              <button
                type="button"
                onClick={() => onChange(moveCard(layout, id, -1))}
                disabled={i === 0}
                aria-label={`${c?.label ?? id}を上へ`}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-line text-[16px] disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => onChange(moveCard(layout, id, 1))}
                disabled={i === layout.order.length - 1}
                aria-label={`${c?.label ?? id}を下へ`}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-line text-[16px] disabled:opacity-30"
              >
                ↓
              </button>
            </li>
          );
        })}
      </ol>
      <button type="button" onClick={() => onChange(defaultLayout())} className="mt-3 min-h-11 w-full rounded-xl border border-line text-[14px] font-semibold text-ink-2">
        はじめの並びに戻す
      </button>
    </Sheet>
  );
}

/* ---------------- 今日のまとめ（自分用。100点化の指示 F） ---------------- */

export function TodayAll({ today }: { today: string }) {
  const data = useData();
  const ui = useUI();
  const items = useMemo(() => buildTodayItems(data, today), [data, today]);

  // 何もないときは、次の予定を1件
  let next: { day: string; title: string; id: string } | null = null;
  if (items.length === 0) {
    for (let i = 1; i <= 60 && !next; i++) {
      const day = addDays(today, i);
      const ev = eventsOnDay(data.events, day)[0];
      if (ev) next = { day, title: ev.title.trim() || "（名前なし）", id: ev.id };
    }
  }

  return (
    <Card>
      <SectionTitle
        action={
          <Link href="/calendar" className="inline-flex min-h-11 items-center rounded-lg px-2 text-[13px] font-semibold text-brand hover:bg-brand-soft">
            カレンダー
          </Link>
        }
      >
        今日のまとめ
        {items.length > 0 && <span className="ml-1 text-[13px] font-medium text-ink-3">{items.length}件</span>}
      </SectionTitle>
      {items.length > 0 ? (
        <ul className="-mx-2">
          {items.slice(0, TODAY_SHOWN).map((it) => {
            // 予定は、時間帯などの補足を出す（以前と同じ）
            const ev = it.eventId ? data.events.find((e) => e.id === it.eventId) : undefined;
            const sub = ev ? eventTimeLabel(ev, today) : it.sub;
            const body = (
              <>
                <span className={`num w-14 shrink-0 text-[12px] font-semibold ${it.warn ? "text-warn" : "text-ink-3"}`}>{it.time}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[14px] font-semibold ${it.warn ? "text-warn" : ""}`}>{it.title}</span>
                  {sub && <span className="block truncate text-[12px] text-ink-3">{sub}</span>}
                </span>
                <IconChevronR className="size-4 shrink-0 text-ink-3" />
              </>
            );
            const cls = "flex min-h-12 w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-surface-2";
            return (
              <li key={it.key}>
                {it.href ? (
                  <Link href={it.href} className={cls}>
                    {body}
                  </Link>
                ) : (
                  <button type="button" onClick={() => it.eventId && ui.openEvent({ mode: "view", id: it.eventId, day: today })} className={cls}>
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="py-1">
          <p className="text-[14px] text-ink-3">今日の予定・支払い・期限はありません</p>
          {next && (
            <button type="button" onClick={() => ui.openEvent({ mode: "view", id: next.id, day: next.day })} className="mt-1 flex min-h-11 w-full items-center justify-between rounded-xl px-1 text-left text-[13px] hover:bg-surface-2">
              <span>
                次は{daysBetween(today, next.day) === 1 ? "明日" : formatDateJa(next.day)}：{next.title}
              </span>
              <IconChevronR className="size-4 text-ink-3" />
            </button>
          )}
        </div>
      )}
      {items.length > TODAY_SHOWN && <p className="mt-1 text-center text-[12px] text-ink-3">ほか{items.length - TODAY_SHOWN}件（「確認したいこと」にも出ます）</p>}
      <button type="button" onClick={() => ui.openEvent({ mode: "new", date: today })} className="mt-1 min-h-11 w-full rounded-lg text-[13px] font-semibold text-brand hover:bg-brand-soft">
        ＋ 今日の予定を追加
      </button>
    </Card>
  );
}
