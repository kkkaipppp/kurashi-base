"use client";

import Link from "next/link";
import { useMemo } from "react";
import { TxRow } from "./Rows";
import { formatDateJa, todayStr } from "@/lib/date";
import { formatSignedYen, formatYen } from "@/lib/money";
import { monthLedger } from "@/lib/ledger";
import { daySummary, txInMonth, sortTxDesc } from "@/lib/aggregate";
import { BUDGET_EXCLUDES_INVEST } from "@/lib/ledgerCore";
import { useData } from "@/lib/store";
import { useUI } from "./UIContext";

/**
 * 家計簿のタブの上（o29 D 案の中身を A のタブに入れる）：月の支出・収入・収支・予算の残りと、日ごとの明細。
 * 数字はホーム・ウィジェットと同じ monthLedger から作る（o29：日週月年の集計は同じ正本から）。
 * - 予算が無いときは 0 と出さず「予算なし」（o29 T007）。予算を超えたらマイナスのまま出す
 * - 予算の残りと、まだ記録していない固定費を引いた残りは、別の行に出す（o29 FIN02・C007）
 */
export function MoneySummary({ month }: { month: string }) {
  const data = useData();
  const today = todayStr();
  const l = monthLedger(data, month, today);
  const expense = l.lifeExpense + l.investMove;
  const net = l.income - expense;
  const thisMonth = month === today.slice(0, 7);
  return (
    <section aria-label="この月のお金" className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 py-1">
        <span className="text-[14px] text-ink-2">支出</span>
        <span className="num text-[30px] leading-tight font-bold">{formatYen(expense)}</span>
      </div>
      <dl className="divide-y divide-line border-y border-line text-[15px]">
        <Row label="収入" value={<span className="text-income">{formatYen(l.income)}</span>} />
        <Row label="収支" value={formatSignedYen(net)} />
        {l.budget === null ? (
          <Row
            label="予算の残り"
            value={
              <Link href="/settings#budget" className="text-[14px] font-semibold text-brand">
                予算なし（設定する）
              </Link>
            }
          />
        ) : (
          <Row label={BUDGET_EXCLUDES_INVEST ? "予算の残り（投資を除く）" : "予算の残り"} value={<span className={l.lifeBudgetLeft !== null && l.lifeBudgetLeft < 0 ? "text-danger" : ""}>{formatYen(l.lifeBudgetLeft ?? 0)}</span>} />
        )}
        {thisMonth && l.budget !== null && l.unpaidFixed > 0 && l.freeLeft !== null && (
          <Row label={`固定費の支払予定（${formatYen(l.unpaidFixed)}）を引くと`} value={formatYen(l.freeLeft)} />
        )}
      </dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className="num text-right font-semibold">{value}</dd>
    </div>
  );
}

/** その月の明細を、日ごと（新しい日が上）に並べる。押すと編集 */
export function MonthTxList({ month }: { month: string }) {
  const data = useData();
  const ui = useUI();
  const days = useMemo(() => {
    const m = new Map<string, typeof data.transactions>();
    for (const t of sortTxDesc(txInMonth(data.transactions, month))) {
      const a = m.get(t.date) ?? [];
      a.push(t);
      m.set(t.date, a);
    }
    return [...m.entries()];
  }, [data, month]);
  if (days.length === 0)
    return (
      <div className="py-6 text-center">
        <p className="text-[14px] text-ink-3">この月の記録はまだありません。</p>
        <button type="button" onClick={() => ui.openTx({ mode: "new", type: "expense", date: month === todayStr().slice(0, 7) ? undefined : `${month}-01` })} className="mt-2 min-h-11 text-[15px] font-semibold text-brand">
          支出を追加
        </button>
      </div>
    );
  return (
    <div className="space-y-3">
      {days.map(([day, txs]) => {
        // 日の支出はカレンダーと同じ数え方（共通の台帳。移動・返金の扱いを画面ごとに作らない）
        const out = daySummary(txs, day).expense;
        return (
          <section key={day} aria-label={formatDateJa(day)}>
            <h3 className="flex items-baseline justify-between border-b border-line px-1 pb-1 text-[14px] font-semibold text-ink-2">
              <span>{formatDateJa(day)}</span>
              {out > 0 && <span className="num text-[13px] font-normal">支出 {formatYen(out)}</span>}
            </h3>
            <ul>
              {txs.map((t) => (
                <TxRow key={t.id} tx={t} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
