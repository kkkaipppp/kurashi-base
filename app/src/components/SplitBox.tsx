"use client";

import { useState } from "react";
import { Button, Field, inputCls } from "./ui";
import { useUI } from "./UIContext";
import { formatYen } from "@/lib/money";
import { isAdvance, splitShare, splitTx } from "@/lib/advance";
import type { AppData, Transaction } from "@/lib/types";

type Save = (fn: (d: AppData) => AppData, ok?: string, extra?: (cur: AppData) => string | null) => Promise<boolean>;

/** 計画の割り勘：つないだ支出を人数で割り、自分の分だけを支出に、残りを「返してもらう分」にする（家計簿の「支払い」に出る） */
export function SplitBox({ txs, save }: { txs: Transaction[]; save: Save }) {
  const ui = useUI();
  const [people, setPeople] = useState("2");
  const n = Number(people.normalize("NFKC"));
  const cands = txs.filter((t) => t.type === "expense" && t.countAs !== "transfer" && !t.refundOf && t.refundGross === undefined && !isAdvance(t) && !t.recurringId);
  const split = async (t: Transaction) => {
    const r = splitTx({ transactions: [t] } as AppData, t.id, n, "");
    if (!r.ok) return ui.toast(r.error, "error");
    const ok = await ui.confirm({ title: `${n}人で割りますか？`, body: `自分の分 ${formatYen(splitShare(t.amount, n))} を支出に数え、残り ${formatYen(t.amount - splitShare(t.amount, n))} を「返してもらう分」にします（家計簿の「支払い」に出ます）。`, ok: "割り勘にする" });
    if (!ok) return;
    const ts = new Date().toISOString();
    await save((d) => {
      const x = splitTx(d, t.id, n, ts);
      return x.ok ? x.next : d;
    }, "割り勘にしました", (cur) => {
      const x = splitTx(cur, t.id, n, ts);
      return x.ok ? null : x.error;
    });
  };
  if (cands.length === 0) return null;
  return (
    <details className="mt-2 rounded-xl border border-line px-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-[14px] font-semibold">割り勘にする</summary>
      <Field label="人数（自分を含む）" htmlFor="split-n">
        <input id="split-n" inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value)} className={inputCls} maxLength={2} />
      </Field>
      <ul className="my-2 divide-y divide-line">
        {cands.map((t) => (
          <li key={t.id} className="flex min-h-12 items-center justify-between gap-2 text-[14px]">
            <span className="min-w-0">
              <span className="block truncate">{t.merchant || "支出"} {formatYen(t.amount)}</span>
              {Number.isInteger(n) && n >= 2 && n <= 50 && <span className="num block text-[12px] text-ink-3">1人 {formatYen(splitShare(t.amount, n))}</span>}
            </span>
            <Button variant="secondary" className="shrink-0 px-3 text-[13px]" onClick={() => split(t)}>
              割る
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
