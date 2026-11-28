"use client";

import { CollectionPage, type CollectionConfig } from "@/components/CollectionPage";
import { NotAvailable } from "@/components/NotAvailable";
import { useUI } from "@/components/UIContext";
import { daysBetween, formatDateJa, todayStr } from "@/lib/date";
import { str } from "@/lib/draft";
import { choreNext } from "@/lib/household";
import { useStore } from "@/lib/store";
import type { Chore } from "@/lib/types";

// 自分用だけ（版の値を直接比べる。公開版で直接開いたら「使えません」）
const PERSONAL_BUILD = process.env.NEXT_PUBLIC_KB_EDITION === "personal";

const CYCLES = [
  { value: "daily", label: "毎日" },
  { value: "weekly", label: "毎週" },
  { value: "monthly", label: "毎月" },
  { value: "none", label: "決めない" },
];
const label = (v: string) => CYCLES.find((x) => x.value === v)?.label ?? v;

/** 「やった」：やった日を今日にする */
function DidButton({ c }: { c: Chore }) {
  const store = useStore();
  const ui = useUI();
  const today = todayStr();
  if (c.lastDone === today) return <span className="px-2 text-[12px] font-semibold text-ink-3">今日やった</span>;
  return (
    <button
      type="button"
      aria-label={`「${c.name}」を今日やった`}
      onClick={async () => {
        const r = await store.updateItem("chores", c.id, { lastDone: today });
        ui.toast(r.ok ? `「${c.name}」を今日やったにしました` : r.error, r.ok ? "ok" : "error");
      }}
      className="min-h-11 shrink-0 rounded-lg px-2 text-[14px] font-semibold text-brand hover:bg-surface-2"
    >
      やった
    </button>
  );
}

/** 家事分担（To-Be 2026-11-28）。誰がやるか・どのくらいおきか・最後にやった日 */
const config: CollectionConfig<"chores"> = {
  key: "chores",
  title: "家事分担",
  noun: "家事",
  intro: "家事と、誰がやるか・どのくらいおきかを残しておけます。「やった」を押すと、やった日を今日にして、次の目安を出します。",
  emptyText: "まだありません。",
  fields: [
    { name: "name", label: "家事", type: "text", required: true, placeholder: "例：お風呂そうじ" },
    { name: "who", label: "誰がやる", optional: true, type: "text", half: true, placeholder: "例：自分" },
    { name: "cycle", label: "どのくらいおき", type: "select", half: true, options: CYCLES },
    { name: "lastDone", label: "最後にやった日", optional: true, type: "date" },
    { name: "note", label: "メモ", optional: true, type: "textarea" },
  ],
  initial: () => ({ name: "", who: "", cycle: "weekly", lastDone: "", note: "" }),
  toDraft: (c) => ({ name: c.name, who: c.who, cycle: c.cycle, lastDone: c.lastDone, note: c.note }),
  fromDraft: (d) => ({ name: str(d, "name"), who: str(d, "who"), cycle: str(d, "cycle") as Chore["cycle"], lastDone: str(d, "lastDone"), note: str(d, "note") }),
  // 次の目安が近い順（目安なしは後ろ）
  sort: (a, b) => (choreNext(a) || "9999").localeCompare(choreNext(b) || "9999"),
  groupBy: (c) => c.who || "決めていない",
  row: (c, { today }) => {
    const next = choreNext(c);
    const d = next ? daysBetween(today, next) : null;
    return {
      title: c.name,
      sub: [label(c.cycle), c.lastDone ? `${formatDateJa(c.lastDone)}にやった` : "まだやっていない", next ? `次は${formatDateJa(next)}` : ""].filter(Boolean).join("・"),
      badge: d !== null && d < 0 ? { text: `${-d}日過ぎ`, tone: "warn" } : d === 0 ? { text: "今日", tone: "warn" } : undefined,
    };
  },
  rowAction: (c) => <DidButton c={c} />,
};

export default function ChoresPage() {
  if (!PERSONAL_BUILD) return <NotAvailable />;
  return <CollectionPage config={config} />;
}
