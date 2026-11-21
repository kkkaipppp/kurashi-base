"use client";

import { CollectionPage, type CollectionConfig } from "@/components/CollectionPage";
import { useUI } from "@/components/UIContext";
import { Card } from "@/components/ui";
import { formatDateJa } from "@/lib/date";
import { bool, str } from "@/lib/draft";
import { dueLabel, daysLeft } from "@/lib/life";
import { useStore } from "@/lib/store";
import type { Task } from "@/lib/types";

function DoneToggle({ task }: { task: Task }) {
  const store = useStore();
  const ui = useUI();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={task.done}
      aria-label={task.done ? `「${task.title}」を未完了に戻す` : `「${task.title}」を完了にする`}
      onClick={() => {
        const r = store.updateItem("tasks", task.id, { done: !task.done });
        if (!r.ok) ui.toast(`保存できませんでした。${r.error}`, "error");
      }}
      className="inline-flex size-11 shrink-0 items-center justify-center"
    >
      <span className={`inline-flex size-6 items-center justify-center rounded-full border-2 ${task.done ? "border-brand bg-brand text-white" : "border-line bg-surface"}`}>
        {task.done && (
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden="true">
            <path d="m5 12 5 5 9-10" />
          </svg>
        )}
      </span>
    </button>
  );
}

const config: CollectionConfig<"tasks"> = {
  key: "tasks",
  title: "タスク",
  noun: "タスク",
  emptyText: "まだタスクがありません。やることを追加しましょう。",
  fields: [
    { name: "title", label: "やること", type: "text", required: true, placeholder: "例：住民票を取りに行く" },
    { name: "due", label: "期限（任意）", type: "date" },
    { name: "note", label: "メモ（任意）", type: "textarea" },
    { name: "done", label: "完了した", type: "checkbox" },
  ],
  initial: () => ({ title: "", due: "", note: "", done: false }),
  toDraft: (t) => ({ title: t.title, due: t.due, note: t.note, done: t.done }),
  fromDraft: (d) => ({ title: str(d, "title"), due: str(d, "due"), note: str(d, "note"), done: bool(d, "done") }),
  // 未完了を先に。期限が近い順、期限なしは後ろ
  sort: (a, b) => Number(a.done) - Number(b.done) || (a.due || "9999").localeCompare(b.due || "9999") || a.createdAt.localeCompare(b.createdAt),
  row: (t, { today }) => {
    const d = daysLeft(t.due, today);
    return {
      title: t.title,
      sub: t.due ? `${formatDateJa(t.due)}まで` : "期限なし",
      muted: t.done,
      badge: t.done ? { text: "完了", tone: "ok" } : d !== null && d < 0 ? { text: dueLabel(d), tone: "warn" } : d === 0 ? { text: "今日まで", tone: "warn" } : undefined,
    };
  },
  rowAction: (t) => <DoneToggle task={t} />,
  header: ({ list, today }) => {
    const open = list.filter((t) => !t.done);
    const overdue = open.filter((t) => t.due && t.due < today).length;
    if (list.length === 0) return null;
    return (
      <Card className="flex items-center justify-between py-3">
        <span className="text-[14px] font-semibold text-ink-2">未完了 {open.length}件</span>
        {overdue > 0 && <span className="text-[13px] font-semibold text-warn">期限切れ {overdue}件</span>}
      </Card>
    );
  },
};

export default function TasksPage() {
  return <CollectionPage config={config} />;
}
