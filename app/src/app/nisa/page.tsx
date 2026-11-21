"use client";

import { useState } from "react";
import { CollectionPage, type CollectionConfig } from "@/components/CollectionPage";
import { Card, IconChevronL, IconChevronR } from "@/components/ui";
import { formatDateJa, todayStr } from "@/lib/date";
import { str } from "@/lib/draft";
import { formatYen, parseAmount } from "@/lib/money";
import { FRAME_LABEL, NISA_LIMITS, nisaWarnings, summarizeNisa } from "@/lib/nisa";
import type { AppData, NisaFrame } from "@/lib/types";

function Meter({ label, used, limit, left }: { label: string; used: number; limit: number; left: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="font-semibold text-ink-2">{label}</span>
        <span className="num text-ink-3">上限 {formatYen(limit)}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${label}の使用率`}>
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
      <div className="num mt-1 flex justify-between text-[13px]">
        <span>使用 {formatYen(used)}</span>
        <span className="font-bold">残り {formatYen(left)}</span>
      </div>
    </div>
  );
}

function Summary({ data }: { data: AppData }) {
  const [year, setYear] = useState(Number(todayStr().slice(0, 4)));
  const s = summarizeNisa(data.nisa, year);
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setYear(year - 1)} aria-label="前の年" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
          <IconChevronL />
        </button>
        <h2 className="text-[17px] font-bold">{year}年の枠</h2>
        <button type="button" onClick={() => setYear(year + 1)} aria-label="次の年" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
          <IconChevronR />
        </button>
      </div>
      <Meter label="つみたて投資枠（年間）" used={s.annualUsed.tsumitate} limit={NISA_LIMITS.annual.tsumitate} left={s.annualLeft.tsumitate} />
      <Meter label="成長投資枠（年間）" used={s.annualUsed.growth} limit={NISA_LIMITS.annual.growth} left={s.annualLeft.growth} />
      <Meter label="生涯の非課税保有限度額" used={s.lifetimeUsed} limit={NISA_LIMITS.lifetime} left={s.lifetimeLeft} />
      <p className="num text-[12px] text-ink-3">
        うち成長投資枠：使用 {formatYen(s.lifetimeGrowthUsed)}（上限 {formatYen(NISA_LIMITS.lifetimeGrowth)}）
        {s.restoreNextYear > 0 && ` ／ ${year}年に売却した ${formatYen(s.restoreNextYear)} 分は、翌年に生涯の枠へ戻ります`}
      </p>
    </Card>
  );
}

const FRAMES = [
  { value: "tsumitate", label: FRAME_LABEL.tsumitate },
  { value: "growth", label: FRAME_LABEL.growth },
];

const config: CollectionConfig<"nisa"> = {
  key: "nisa",
  title: "NISAの枠",
  noun: "記録",
  intro: (
    <>
      買った金額と売った金額（買ったときの金額＝簿価）を記録すると、2024年からの制度の上限（年間：つみたて120万円・成長240万円、生涯1,800万円・うち成長1,200万円）に対して、使った枠と残りの枠を計算します。証券会社とはつながっていません。
      <strong className="font-semibold">投資の助言ではありません。</strong>制度が変わった場合は、アプリの更新が必要です。
    </>
  ),
  emptyText: "まだ記録がありません。買付を記録すると、残りの枠が分かります。",
  fields: [
    { name: "kind", label: "種類", type: "select", half: true, options: [{ value: "buy", label: "買付" }, { value: "sell", label: "売却" }] },
    { name: "frame", label: "枠", type: "select", half: true, options: FRAMES },
    { name: "amount", label: "金額（円）", type: "number", required: true, half: true, hint: "売却は、売った分を買ったときの金額（簿価）" },
    { name: "date", label: "日付", type: "date", required: true, half: true },
    { name: "name", label: "銘柄（任意）", type: "text", placeholder: "例：全世界株式インデックス" },
    { name: "note", label: "メモ（任意）", type: "textarea" },
  ],
  initial: ({ today }) => ({ kind: "buy", frame: "tsumitate", amount: "", date: today, name: "", note: "" }),
  toDraft: (e) => ({ kind: e.kind, frame: e.frame, amount: String(e.amount), date: e.date, name: e.name, note: e.note }),
  fromDraft: (d) => {
    const a = parseAmount(str(d, "amount"));
    return {
      kind: str(d, "kind") as "buy" | "sell",
      frame: str(d, "frame") as NisaFrame,
      amount: a.ok ? a.value : 0,
      date: str(d, "date"),
      name: str(d, "name"),
      note: str(d, "note"),
    };
  },
  validate: (d) => {
    const a = parseAmount(str(d, "amount"));
    return a.ok ? ({} as Record<string, string>) : { amount: a.error };
  },
  sort: (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  row: (e, { data }) => {
    const warn = nisaWarnings(data.nisa, e, e.id);
    return {
      title: e.name || FRAME_LABEL[e.frame],
      sub: `${formatDateJa(e.date, true)}・${FRAME_LABEL[e.frame]}${warn.length ? `・${warn[0]}` : ""}`,
      badge: e.kind === "buy" ? { text: "買付", tone: "info" } : { text: "売却", tone: "ok" },
      right: `${e.kind === "sell" ? "-" : ""}${formatYen(e.amount)}`,
    };
  },
  header: ({ data }) => <Summary data={data} />,
};

export default function NisaPage() {
  return <CollectionPage config={config} />;
}
