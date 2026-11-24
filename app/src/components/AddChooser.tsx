"use client";

import { Sheet } from "./Sheet";
import { formatDateJa, todayStr } from "@/lib/date";

export type AddKind = "expense" | "income" | "event" | "task";

const CHOICES: { kind: AddKind; label: string; desc: string; cls: string; mark: string }[] = [
  { kind: "expense", label: "支出", desc: "使ったお金", cls: "bg-expense-soft text-expense", mark: "¥" },
  { kind: "income", label: "収入", desc: "入ったお金", cls: "bg-income-soft text-income", mark: "¥" },
  { kind: "event", label: "予定", desc: "日時の決まった用事", cls: "bg-event-soft text-event", mark: "◷" },
  { kind: "task", label: "タスク", desc: "期限までにやること", cls: "bg-brand-soft text-brand", mark: "✓" },
];

/** ＋ボタンから「何を追加するか」を選ぶ。支出・収入・予定・タスクを同じ並びで出す */
export function AddChooser({ date, onClose, onPick }: { date?: string; onClose: () => void; onPick: (k: AddKind) => void }) {
  const d = date ?? todayStr();
  return (
    <Sheet title="何を記録しますか？" open onRequestClose={onClose}>
      <p className="mb-3 text-[13px] text-ink-3">{formatDateJa(d, true)}の記録として入力を始めます（日付は入力の画面で変えられます）。</p>
      <div className="grid grid-cols-2 gap-3">
        {CHOICES.map((c) => (
          <button
            key={c.kind}
            type="button"
            onClick={() => onPick(c.kind)}
            className="flex min-h-20 flex-col items-start justify-center gap-1 rounded-2xl border border-line bg-surface px-4 py-3 text-left hover:bg-surface-2"
          >
            <span className="flex items-center gap-2">
              <span className={`inline-flex size-8 items-center justify-center rounded-full text-[15px] font-bold ${c.cls}`} aria-hidden="true">
                {c.mark}
              </span>
              <span className="text-[16px] font-bold">{c.label}</span>
            </span>
            <span className="text-[12px] text-ink-3">{c.desc}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
