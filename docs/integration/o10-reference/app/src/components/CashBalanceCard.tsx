"use client";

import Link from "next/link";
import { Card, SectionTitle } from "./ui";
import { cashBalance } from "@/lib/balance";
import { todayStr, formatDateJa } from "@/lib/date";
import { formatYen } from "@/lib/money";
import { useData } from "@/lib/store";

/**
 * 現金・預金の残高の目安（自分用。今月を見ているときだけ。NEXT v21 X03・X05）。
 * 基準の残高（資産の「現金」）がないときは、残高を出さない（0円とは出さない）。確定した残高ではない
 */
export function CashBalanceCard({ month }: { month: string }) {
  const data = useData();
  const today = todayStr();
  if (month !== today.slice(0, 7)) return null;
  const r = cashBalance(data, today);
  return (
    <Card>
      <SectionTitle>現金・預金の残高の目安</SectionTitle>
      {!r.ok ? (
        <p className="text-[13px] text-ink-3">
          基準になる残高がないので、残高は出しません。<Link href="/assets" className="font-semibold text-brand underline">資産</Link>に、種類「現金」で、残高と評価日を入れてください（口座が複数あるときは、合計を1件に）。
        </p>
      ) : (
        <>
          <p className="num text-[24px] font-bold">
            約{formatYen(r.balance)}
            <span className="ml-1 text-[12px] font-medium text-ink-3">（目安）</span>
          </p>
          {r.cardPending > 0 && (
            <p className="num mt-0.5 text-[14px] font-semibold">
              引き落とし前のカード払い {formatYen(r.cardPending)} → 引き落とし後 約{formatYen(r.afterCard)}
            </p>
          )}
          <dl className="num mt-2 space-y-0.5 rounded-xl border border-dashed border-line px-3 py-2 text-[12px] text-ink-2">
            <div className="flex justify-between">
              <dt>基準（{r.base.name}・{formatDateJa(r.base.asOf)}）</dt>
              <dd>{formatYen(r.base.value)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>それからの収入</dt>
              <dd>＋{formatYen(r.income)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>現金・口座などで払った支出</dt>
              <dd>−{formatYen(r.spend)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>カードの引き落とし</dt>
              <dd>−{formatYen(r.cardSettled)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-[12px] text-ink-3">
            確定した残高ではありません。現金は基準の日より後、カード未払いは全記録期間の差額から計算しています。記録開始前の債務やカード別の請求は反映できません（口座間の移動は数えません。カード払いは、引き落としの記録をしたときに減ります）。実際の残高と合わないときは、資産の残高を入れ直してください。
          </p>
        </>
      )}
    </Card>
  );
}
