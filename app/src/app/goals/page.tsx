"use client";

import { CollectionPage, numberFromDraft, type CollectionConfig } from "@/components/CollectionPage";
import { formatDateJa } from "@/lib/date";
import { bool, numStr, str } from "@/lib/draft";
import { daysLeft, dueLabel, goalProgress } from "@/lib/life";

const config: CollectionConfig<"goals"> = {
  key: "goals",
  title: "目標",
  noun: "目標",
  intro: "「100万円ためる」のような数字の目標も、「引っ越しする」のような達成したかどうかの目標も登録できます。進み具合は、自分で更新します。",
  emptyText: "まだ目標がありません。",
  fields: [
    { name: "title", label: "目標", type: "text", required: true, placeholder: "例：旅行のために30万円ためる" },
    { name: "kind", label: "目標の形", type: "select", options: [{ value: "number", label: "数字で進み具合を記録する" }, { value: "check", label: "達成したかどうかだけ" }] },
    { name: "current", label: "今の値", type: "number", decimal: true, half: true, hint: "数字の目標のとき" },
    { name: "target", label: "目標の値", type: "number", decimal: true, half: true },
    { name: "unit", label: "単位（任意）", type: "text", half: true, placeholder: "例：円、冊、kg" },
    { name: "deadline", label: "期限（任意）", type: "date", half: true },
    { name: "note", label: "メモ（任意）", type: "textarea" },
    { name: "done", label: "達成した", type: "checkbox" },
  ],
  initial: () => ({ title: "", kind: "number", current: "0", target: "", unit: "", deadline: "", note: "", done: false }),
  toDraft: (g) => ({ title: g.title, kind: g.kind, current: String(g.current), target: numStr(g.target), unit: g.unit, deadline: g.deadline, note: g.note, done: g.done }),
  fromDraft: (d) => ({
    title: str(d, "title"),
    kind: str(d, "kind") as "number" | "check",
    current: numberFromDraft(str(d, "current")) ?? 0,
    target: numberFromDraft(str(d, "target")),
    unit: str(d, "unit"),
    deadline: str(d, "deadline"),
    note: str(d, "note"),
    done: bool(d, "done"),
  }),
  validate: (d) => {
    if (str(d, "kind") !== "number") return {} as Record<string, string>;
    const t = numberFromDraft(str(d, "target"));
    return t === null || t <= 0 ? { target: "数字の目標は、目標の値（0より大きい数）を入力してください" } : ({} as Record<string, string>);
  },
  sort: (a, b) => Number(a.done) - Number(b.done) || (a.deadline || "9999").localeCompare(b.deadline || "9999"),
  row: (g, { today }) => {
    const p = goalProgress(g);
    const d = daysLeft(g.deadline, today);
    const fmt = (n: number) => n.toLocaleString("ja-JP");
    return {
      title: g.title,
      sub:
        (g.kind === "number" && g.target !== null ? `${fmt(g.current)} / ${fmt(g.target)}${g.unit}・` : "") +
        (g.deadline ? `${formatDateJa(g.deadline, true)}まで` : "期限なし"),
      muted: g.done,
      badge: g.done ? { text: "達成", tone: "ok" } : d !== null && d < 0 ? { text: dueLabel(d), tone: "warn" } : undefined,
      right: (
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
            <span className="block h-full rounded-full bg-brand" style={{ width: `${p}%` }} />
          </span>
          {p}%
        </span>
      ),
    };
  },
};

export default function GoalsPage() {
  return <CollectionPage config={config} />;
}
