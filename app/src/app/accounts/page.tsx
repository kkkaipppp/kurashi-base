"use client";

import { useState } from "react";
import { CollectionPage, numberFromDraft, type CollectionConfig } from "@/components/CollectionPage";
import { NotAvailable } from "@/components/NotAvailable";
import { Sheet } from "@/components/Sheet";
import { Button, Card, Field, inputCls } from "@/components/ui";
import { useUI } from "@/components/UIContext";
import { accountView, nextCardPayment, reconcile } from "@/lib/accounts";
import { formatDateJa, todayStr } from "@/lib/date";
import { bool, str } from "@/lib/draft";
import { formatYen } from "@/lib/money";
import { useData, useStore } from "@/lib/store";
import type { Account } from "@/lib/types";

// 自分用だけ（版の値を直接比べる。公開版で直接開いたら「使えません」）
const PERSONAL_BUILD = process.env.NEXT_PUBLIC_KB_EDITION === "personal";

const KINDS = [
  { value: "bank", label: "銀行口座" },
  { value: "card", label: "クレジットカード" },
  { value: "emoney", label: "電子マネー・QR" },
  { value: "cash", label: "財布（現金）" },
];
const kindLabel = (k: string) => KINDS.find((x) => x.value === k)?.label ?? k;
const isCard = (d: Parameters<typeof str>[0]) => str(d, "kind") === "card";
const signed = (v: number) => (v < 0 ? `−${formatYen(-v)}` : formatYen(v));

/** 残高を合わせる（照合）。実際の残高を入れると、目安との差を見せてから保存する */
function ReconcileButton({ a }: { a: Account }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");
  const [err, setErr] = useState<string | undefined>();
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const save = async () => {
    // マイナス（借り越し・払い過ぎ）と 0、全角の数字も入れられる
    const s = v.normalize("NFKC").replace(/[,，¥￥円\s]/g, "").replace(/^[−ー]/, "-");
    if (!/^-?\d{1,12}$/.test(s)) return setErr("金額を入れてください（マイナスは前に −）");
    setErr(undefined);
    const actual = Number(s);
    const today = todayStr();
    const { diff } = reconcile(data, a.id, actual, today, "");
    const ts = new Date().toISOString();
    const r = await store.commit((d) => reconcile(d, a.id, actual, today, ts).next);
    if (!r.ok) return ui.toast(r.error, "error");
    ui.toast(diff === null ? "残高を合わせました" : diff === 0 ? "目安と同じでした。残高を合わせました" : `目安との差は ${signed(diff)} でした。残高を合わせました`);
    setOpen(false);
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="min-h-11 shrink-0 rounded-lg px-2 text-[14px] font-semibold text-brand hover:bg-surface-2">
        合わせる
      </button>
      {open && (
        <Sheet
          title={`${a.name}の残高を合わせる`}
          open
          onRequestClose={() => setOpen(false)}
          footer={
            <Button className="w-full" onClick={save}>
              合わせる
            </Button>
          }
        >
          <Field label={a.kind === "card" ? "今日の引き落とし待ちの額（円）" : "今日の実際の残高（円）"} htmlFor="rec-v" error={err} hint="通帳・アプリ・明細の今の額を入れます。これより前の記録は、この口座の残高の目安に数えなくなります（記録は消えません）">
            <input id="rec-v" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} className={`${inputCls} num`} />
          </Field>
        </Sheet>
      )}
    </>
  );
}

const config: CollectionConfig<"accounts"> = {
  key: "accounts",
  title: "口座・カード",
  noun: "口座・カード",
  intro: "銀行口座・クレジットカード・電子マネーを登録すると、支出・収入の「詳細」で、どこから払ったかを選べます。残高は「合わせる」で今の額を入れると、その後の記録から目安を出します。銀行やカード会社とはつながっていません。",
  emptyText: "まだありません。",
  fields: [
    { name: "name", label: "名前", type: "text", required: true, placeholder: "例：〇〇銀行・〇〇カード" },
    { name: "kind", label: "種類", type: "select", options: KINDS },
    { name: "closingDay", label: "締め日（日）", optional: true, type: "number", half: true, placeholder: "例：15（月末は31）", showWhen: isCard },
    { name: "payDay", label: "引き落とし日（翌月の日）", optional: true, type: "number", half: true, placeholder: "例：10", showWhen: isCard },
    { name: "note", label: "メモ", optional: true, type: "textarea" },
    { name: "archived", label: "使っていない（選ぶ一覧に出さない）", type: "checkbox" },
  ],
  initial: () => ({ name: "", kind: "bank", closingDay: "", payDay: "", note: "", archived: false }),
  toDraft: (a) => ({ name: a.name, kind: a.kind, closingDay: a.closingDay === null ? "" : String(a.closingDay), payDay: a.payDay === null ? "" : String(a.payDay), note: a.note, archived: a.archived }),
  fromDraft: (d) => {
    const day = (k: string) => {
      const n = numberFromDraft(str(d, k));
      return str(d, "kind") === "card" && n !== null && Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
    };
    return { name: str(d, "name"), kind: str(d, "kind") as Account["kind"], closingDay: day("closingDay"), payDay: day("payDay"), note: str(d, "note"), archived: bool(d, "archived"), baseBalance: null, baseDate: "" };
  },
  // 照合した残高は「合わせる」だけで変える（編集で消さない）
  beforeSave: (prev, next) => (prev ? { ...next, baseBalance: prev.baseBalance, baseDate: prev.baseDate } : next),
  validate: (d) => {
    if (str(d, "kind") !== "card") return {} as Record<string, string>;
    const bad = (k: string) => {
      const s = str(d, k);
      const n = numberFromDraft(s);
      return s !== "" && (n === null || !Number.isInteger(n) || n < 1 || n > 31);
    };
    return { ...(bad("closingDay") ? { closingDay: "1〜31 の日を入れてください" } : {}), ...(bad("payDay") ? { payDay: "1〜31 の日を入れてください" } : {}) };
  },
  sort: (a, b) => Number(a.archived) - Number(b.archived) || KINDS.findIndex((k) => k.value === a.kind) - KINDS.findIndex((k) => k.value === b.kind),
  row: (a, { data, today }) => {
    const v = accountView(data, a, today);
    const next = nextCardPayment(data, a, today);
    return {
      title: a.name,
      sub: [
        kindLabel(a.kind),
        a.baseDate ? `${formatDateJa(a.baseDate)}に合わせた` : "まだ合わせていない",
        next ? `${formatDateJa(next.pay)}に ${formatYen(next.amount)} 引き落とし（${formatDateJa(next.closing)}締め）` : "",
      ]
        .filter(Boolean)
        .join("・"),
      muted: a.archived,
      right: v.value === null ? <span className="text-[13px] text-ink-3">残高は未入力</span> : a.kind === "card" ? `待ち ${formatYen(Math.max(0, -v.value))}` : signed(v.value),
    };
  },
  rowAction: (a) => <ReconcileButton a={a} />,
  header: ({ list, data, today }) => {
    const live = list.filter((a) => !a.archived);
    if (live.length === 0) return null;
    let have = 0;
    let owe = 0;
    for (const a of live) {
      const v = accountView(data, a, today);
      if (v.value === null) continue;
      if (a.kind === "card") owe += Math.max(0, -v.value);
      else have += v.value;
    }
    return (
      <Card className="py-3">
        <p className="text-[13px] font-semibold text-ink-2">残高の目安（合わせた口座）</p>
        <p className="num text-2xl font-bold">{signed(have)}</p>
        {owe > 0 && <p className="num text-[13px] text-ink-3">カードの引き落とし待ち {formatYen(owe)}・引いたあと {signed(have - owe)}</p>}
      </Card>
    );
  },
};

export default function AccountsPage() {
  if (!PERSONAL_BUILD) return <NotAvailable />;
  return <CollectionPage config={config} />;
}
