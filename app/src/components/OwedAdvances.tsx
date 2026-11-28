"use client";

import { formatDateJa } from "@/lib/date";
import { formatYen } from "@/lib/money";
import { openAdvances, owedTotal } from "@/lib/advance";
import { useData } from "@/lib/store";
import { useUI } from "./UIContext";

/** 家計簿の「支払い」：立替で返してもらう分（自分用。To-Be 2026-11-28）。押すと立替の記録を開き、そこで「返してもらった」 */
export function OwedAdvances() {
  const data = useData();
  const ui = useUI();
  const list = openAdvances(data);
  if (list.length === 0) return null;
  return (
    <section aria-labelledby="owed-adv" className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="owed-adv" className="text-[16px] font-bold">
          返してもらう分<span className="ml-1 text-[13px] font-medium text-ink-3">立替・経費</span>
        </h2>
        <span className="num text-[16px] font-bold">{formatYen(owedTotal(data))}</span>
      </div>
      <ul className="divide-y divide-line border-y border-line">
        {list.map(({ tx, left }) => (
          <li key={tx.id}>
            <button type="button" onClick={() => ui.openTx({ mode: "edit", id: tx.id })} className="flex min-h-12 w-full items-center gap-3 text-left text-[15px]">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{tx.merchant || tx.note || "立替"}</span>
                <span className="block text-[13px] text-ink-3">
                  {tx.claim ? `${formatDateJa(tx.date)}・経費 ${formatYen(tx.amount)}` : `${formatDateJa(tx.date)}・払った ${formatYen(tx.advanceGross as number)}・自分の分 ${formatYen(tx.amount)}`}
                </span>
              </span>
              <span className="num shrink-0 font-semibold">{formatYen(left)}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-ink-3">収支には数えません。現金・預金の残高の目安では、払った総額が出ていき、返してもらった額が入ります。</p>
    </section>
  );
}
