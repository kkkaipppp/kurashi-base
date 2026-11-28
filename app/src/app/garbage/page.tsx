"use client";

import { CollectionPage, type CollectionConfig } from "@/components/CollectionPage";
import { NotAvailable } from "@/components/NotAvailable";
import { addDays } from "@/lib/date";
import { str } from "@/lib/draft";
import { WEEKDAYS, garbageLabel, garbageOn, parseWeekdays, parseWeeks } from "@/lib/household";

// 自分用だけ（版の値を直接比べる。公開版で直接開いたら「使えません」）
const PERSONAL_BUILD = process.env.NEXT_PUBLIC_KB_EDITION === "personal";

/** ゴミ出し（To-Be 2026-11-28）。曜日と第何週を入れると、今日・明日の分をホームの「確認すること」に出す */
const config: CollectionConfig<"garbage"> = {
  key: "garbage",
  title: "ゴミ出し",
  noun: "ゴミ出しの日",
  intro: "ゴミの種類と曜日を入れると、今日と明日の分をホームの「確認すること」に出します。祝日・年末年始の変更は入っていないので、お住まいの地域の案内で確かめてください。",
  emptyText: "まだありません。",
  fields: [
    { name: "name", label: "種類", type: "text", required: true, placeholder: "例：燃えるゴミ" },
    { name: "weekdays", label: "曜日", type: "text", required: true, half: true, placeholder: "例：月・木、月〜金" },
    { name: "weeks", label: "第何週（その月の何回目か。毎週なら空）", optional: true, type: "text", half: true, placeholder: "例：2・4" },
    { name: "note", label: "メモ", optional: true, type: "textarea" },
  ],
  initial: () => ({ name: "", weekdays: "", weeks: "", note: "" }),
  toDraft: (g) => ({ name: g.name, weekdays: g.weekdays.map((w) => WEEKDAYS[w]).join("・"), weeks: g.weeks.join("・"), note: g.note }),
  fromDraft: (d) => ({ name: str(d, "name"), weekdays: parseWeekdays(str(d, "weekdays")), weeks: parseWeeks(str(d, "weeks")), note: str(d, "note") }),
  validate: (d) => {
    const e: Record<string, string> = {};
    if (str(d, "weekdays").trim() && parseWeekdays(str(d, "weekdays")).length === 0) e.weekdays = "日〜土の曜日を入れてください（例：月・木、月〜金、平日）";
    if (str(d, "weeks").trim() && parseWeeks(str(d, "weeks")).length === 0) e.weeks = "1〜5 の数を入れてください（例：2・4）";
    return e;
  },
  sort: (a, b) => (a.weekdays[0] ?? 7) - (b.weekdays[0] ?? 7),
  row: (g, { today }) => ({
    title: g.name,
    sub: [garbageLabel(g), g.note].filter(Boolean).join("・"),
    badge: garbageOn(g, today) ? { text: "今日", tone: "warn" } : garbageOn(g, addDays(today, 1)) ? { text: "明日", tone: "ok" } : undefined,
  }),
};

export default function GarbagePage() {
  if (!PERSONAL_BUILD) return <NotAvailable />;
  return <CollectionPage config={config} />;
}
