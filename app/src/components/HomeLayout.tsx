"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Sheet } from "./Sheet";
import { Button, Card, IconChevronR, SectionTitle } from "./ui";
import { useUI } from "./UIContext";
import { eventTimeLabel } from "./Rows";
import { useData } from "@/lib/store";
import { eventsOnDay } from "@/lib/aggregate";
import { addDays, daysBetween, formatDateJa } from "@/lib/date";
import { formatYen } from "@/lib/money";
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

type Item = { key: string; sort: string; time: string; title: string; sub?: string; warn?: boolean; href?: string; onOpen?: () => void };

export function TodayAll({ today }: { today: string }) {
  const data = useData();
  const ui = useUI();
  const items = useMemo(() => {
    const out: Item[] = [];
    // 0：過ぎたもの、1：終日、2：時刻つき、3：今日が期限
    for (const r of data.recurring) {
      if (!r.active || r.nextDueDate > today) continue;
      const late = r.nextDueDate < today;
      out.push({
        key: `rc-${r.id}`,
        sort: late ? `0${r.nextDueDate}` : "1",
        time: late ? "未記録" : "今日",
        title: `固定費 ${r.name} ${formatYen(r.amount)}`,
        sub: late ? `${formatDateJa(r.nextDueDate)}の支払いがまだ記録されていません` : "今日が支払日",
        warn: late,
        href: `/recurring?open=${r.id}`,
      });
    }
    for (const e of eventsOnDay(data.events, today)) {
      const allDay = e.allDay || (e.startDate < today && e.startDate !== e.endDate);
      out.push({ key: `ev-${e.id}`, sort: allDay ? "1" : `2${e.startTime}`, time: allDay ? "終日" : e.startTime, title: e.title.trim() || "（名前なし）", sub: eventTimeLabel(e, today), onOpen: () => ui.openEvent({ mode: "view", id: e.id }) });
    }
    for (const t of data.tasks) {
      if (t.done || !t.due || t.due > today) continue;
      const late = t.due < today;
      out.push({ key: `task-${t.id}`, sort: late ? `0${t.due}` : "3", time: late ? "期限切れ" : "期限", title: t.title, sub: late ? `期限を${daysBetween(t.due, today)}日過ぎています` : "今日が期限のタスク", warn: late, href: `/tasks?open=${t.id}` });
    }
    for (const c of data.contracts)
      if (c.status === "active" && c.renewalDate === today) out.push({ key: `ct-${c.id}`, sort: "3", time: "期限", title: `${c.name}の更新日`, sub: "契約", href: `/contracts?open=${c.id}` });
    for (const d of data.documents) if (d.expiry === today) out.push({ key: `doc-${d.id}`, sort: "3", time: "期限", title: `${d.title}の期限`, sub: "書類", href: `/documents?open=${d.id}` });
    for (const g of data.goals) if (!g.done && g.deadline === today) out.push({ key: `goal-${g.id}`, sort: "3", time: "期限", title: g.title, sub: "目標の期限", href: `/goals?open=${g.id}` });
    for (const s of data.studySubjects) if (!s.archived && s.examDate === today) out.push({ key: `st-${s.id}`, sort: "1", time: "試験", title: `${s.name}の試験日`, sub: "資格", href: `/study?open=${s.id}` });
    return out.sort((a, b) => a.sort.localeCompare(b.sort));
  }, [data, today, ui]);

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
          <Link href="/calendar" className="min-h-9 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-brand hover:bg-brand-soft">
            カレンダー
          </Link>
        }
      >
        今日のまとめ
        {items.length > 0 && <span className="ml-1 text-[13px] font-medium text-ink-3">{items.length}件</span>}
      </SectionTitle>
      {items.length > 0 ? (
        <ul className="-mx-2">
          {items.slice(0, 8).map((it) => {
            const body = (
              <>
                <span className={`num w-14 shrink-0 text-[12px] font-semibold ${it.warn ? "text-warn" : "text-ink-3"}`}>{it.time}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[14px] font-semibold ${it.warn ? "text-warn" : ""}`}>{it.title}</span>
                  {it.sub && <span className="block truncate text-[12px] text-ink-3">{it.sub}</span>}
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
                  <button type="button" onClick={it.onOpen} className={cls}>
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
            <button type="button" onClick={() => ui.openEvent({ mode: "view", id: next.id })} className="mt-1 flex min-h-11 w-full items-center justify-between rounded-xl px-1 text-left text-[13px] hover:bg-surface-2">
              <span>
                次は{daysBetween(today, next.day) === 1 ? "明日" : formatDateJa(next.day)}：{next.title}
              </span>
              <IconChevronR className="size-4 text-ink-3" />
            </button>
          )}
        </div>
      )}
      {items.length > 8 && <p className="mt-1 text-center text-[12px] text-ink-3">ほか{items.length - 8}件</p>}
      <button type="button" onClick={() => ui.openEvent({ mode: "new", date: today })} className="mt-1 min-h-10 w-full rounded-lg text-[13px] font-semibold text-brand hover:bg-brand-soft">
        ＋ 今日の予定を追加
      </button>
    </Card>
  );
}
