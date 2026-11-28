"use client";

import { isDoneOn, occurrenceKey } from "@/lib/eventOps";
import { formatDateJa } from "@/lib/date";
import { eventLabel } from "@/lib/aggregate";
import { formatYen } from "@/lib/money";
import { formatForeign } from "@/lib/fxFormat";
import { useData } from "@/lib/store";
import { paymentLabel, type CalendarEvent, type Transaction } from "@/lib/types";
import { useUI } from "./UIContext";

const SOURCE_LABEL = { manual: "", image: "画像から", recurring: "固定費" } as const;

export function TxRow({ tx, showDate = false }: { tx: Transaction; showDate?: boolean }) {
  const data = useData();
  const ui = useUI();
  const cat = data.categories.find((c) => c.id === tx.categoryId)?.name ?? "（不明なカテゴリ）";
  const exp = tx.type === "expense";
  const moveOnly = tx.countAs === "transfer";
  const sub = [showDate ? formatDateJa(tx.date) : "", moveOnly ? "収支に数えない" : "", tx.merchant ? cat : "", tx.paymentMethod ? paymentLabel(tx.paymentMethod) : "", SOURCE_LABEL[tx.source], process.env.NEXT_PUBLIC_KB_EDITION === "personal" && tx.fx ? formatForeign(tx.fx) : ""]
    .filter(Boolean)
    .join("・");
  return (
    <li>
      <button
        type="button"
        onClick={() => ui.openTx({ mode: "edit", id: tx.id })}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2"
      >
        <span
          className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
            exp ? "bg-expense-soft text-expense" : "bg-income-soft text-income"
          }`}
          aria-hidden="true"
        >
          {exp ? "支" : "収"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-base font-semibold">{tx.merchant || cat}</span>
          <span className="block break-words text-[13px] text-ink-3">{sub}</span>
        </span>
        <span className={`num max-w-[48%] break-all text-right text-base font-bold ${exp ? "text-ink" : "text-income"}`}>
          <span className="sr-only">{exp ? "支出" : "収入"}</span>
          {exp ? "−" : "+"}
          {formatYen(tx.amount)}
        </span>
      </button>
    </li>
  );
}

const REPEAT_LABEL = { none: "", weekly: "毎週", monthly: "毎月", yearly: "毎年" } as const;

export function eventTimeLabel(e: CalendarEvent, day?: string): string {
  const rep = REPEAT_LABEL[e.repeat ?? "none"];
  if (rep && e.startDate === e.endDate) return `${rep}・${e.allDay ? "終日" : `${e.startTime}〜${e.endTime}`}`;
  if (e.allDay) return e.startDate === e.endDate ? "終日" : `終日（${formatDateJa(e.startDate)}〜${formatDateJa(e.endDate)}）`;
  const multi = e.startDate !== e.endDate;
  if (!multi) return `${e.startTime}〜${e.endTime}`;
  if (day && day !== e.startDate && day !== e.endDate) return "終日（期間中）";
  if (day === e.endDate && day !== e.startDate) return `〜${e.endTime}`;
  return `${e.startTime}〜（${formatDateJa(e.endDate)} ${e.endTime}まで）`;
}

export function EventRow({ ev, day }: { ev: CalendarEvent; day?: string }) {
  const ui = useUI();
  // 完了した回は、取り消し線と ✓（色だけに頼らない）
  const done = isDoneOn(ev, occurrenceKey(ev, day));
  return (
    <li>
      <button
        type="button"
        onClick={() => ui.openEvent({ mode: "view", id: ev.id, day })}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2"
      >
        <span className={`h-9 w-1.5 shrink-0 rounded-full ${done ? "bg-ink-3" : "bg-event"}`} aria-hidden="true" />
        <span className={`min-w-0 flex-1 ${done ? "" : ""}`}>
          <span className={`block break-words text-base font-semibold ${done ? "line-through" : ""}`}>
            {done && <span className="sr-only">完了：</span>}
            {done && "✓ "}
            {eventLabel(ev)}
          </span>
          <span className="block break-words text-[13px] text-ink-3">
            {eventTimeLabel(ev, day)}
            {ev.location ? `・${ev.location}` : ""}
          </span>
        </span>
      </button>
    </li>
  );
}
