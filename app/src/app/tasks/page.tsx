"use client";

import { CollectionPage, type CollectionConfig } from "@/components/CollectionPage";
import { useUI } from "@/components/UIContext";
import { Card } from "@/components/ui";
import { formatDateJa } from "@/lib/date";
import { bool, str } from "@/lib/draft";
import { dueLabel, daysLeft } from "@/lib/life";
import { newId } from "@/lib/defaults";
import { PERSONAL_BUILD_TASKS } from "./personal";
import { makeEventFromTask, setTaskDone, taskIsEvent } from "@/lib/taskEvent";
import { todayStr } from "@/lib/date";
import { useData, useStore } from "@/lib/store";
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
      onClick={async () => {
        // 予定にしたタスクは、予定の完了も同じに揃える
        const ts = new Date().toISOString();
        const r = await store.commit((d) => setTaskDone(d, task.id, !task.done, ts));
        if (!r.ok) ui.toast(r.error, "error");
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

/** 「予定にする」（自分用）。押したときだけ、終日の予定を1つ作る。作ったあとは「予定あり」と出る */
function ToEventButton({ task }: { task: Task }) {
  const store = useStore();
  const data = useData();
  const ui = useUI();
  if (taskIsEvent(data, task)) return <span className="px-1 text-[11px] font-semibold text-brand">カレンダーに入っています</span>;
  return (
    <button
      type="button"
      aria-label={`「${task.title}」をカレンダーに入れる`}
      onClick={async () => {
        const ts = new Date().toISOString();
        const r = await store.commit((d) => makeEventFromTask(d, task.id, newId("ev"), todayStr(), ts));
        ui.toast(r.ok ? "カレンダーに入れました" : r.error, r.ok ? "ok" : "error");
      }}
      className="min-h-11 rounded-lg px-2 text-[12px] font-semibold text-brand hover:bg-brand-soft"
    >
      カレンダーに入れる
    </button>
  );
}

const config: CollectionConfig<"tasks"> = {
  key: "tasks",
  title: "タスク",
  noun: "タスク",
  emptyText: "まだタスクがありません。やることを追加しましょう。",
  fields: [
    { name: "title", label: "内容", type: "text", required: true, placeholder: "例：住民票を取りに行く" },
    { name: "due", label: "期限", optional: true, type: "date" },
    { name: "note", label: "メモ", optional: true, type: "textarea" },
    { name: "done", label: "完了", type: "checkbox" },
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
  rowAction: (t) => (
    <span className="flex items-center">
      {PERSONAL_BUILD_TASKS && <ToEventButton task={t} />}
      <DoneToggle task={t} />
    </span>
  ),
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
