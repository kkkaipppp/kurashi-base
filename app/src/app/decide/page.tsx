"use client";

import { useState } from "react";
import { useData } from "@/lib/store";
import { Card, Empty, Field, PageHeader, SectionTitle, inputCls } from "@/components/ui";
import { FEATURES, IS_PERSONAL } from "@/lib/edition";
import { assessPurchase } from "@/lib/decision";
import { compareScenarios } from "@/lib/scenarios";
import { todayStr } from "@/lib/date";
import { formatDiffYen, formatSignedYen, formatYen } from "@/lib/money";

/**
 * 買い物の判断（自分用。NEXT v21 DECISION_SUPPORT）。
 * 買うかどうかは言わない。今月と来月、それぞれに回したときの、予算・見込みへの影響を並べる。
 */
export default function DecidePage() {
  const data = useData();
  const [txt, setTxt] = useState("");
  if (!FEATURES.decide) {
    return (
      <main>
        <PageHeader title="買い物の判断" />
        <Empty>この版では、まだ使えません</Empty>
      </main>
    );
  }
  const clean = txt.normalize("NFKC").replace(/[¥,，円\s]/g, "");
  const amount = /^\d{1,10}$/.test(clean) ? Number(clean) : null;
  const bad = txt.trim() !== "" && (amount === null || amount <= 0);
  const a = amount && amount > 0 ? assessPurchase(data, amount, todayStr()) : null;
  const y = (n: number | null) => (n === null ? "—" : formatSignedYen(n));
  const sc = compareScenarios(data, todayStr(), amount && amount > 0 ? amount : null);
  return (
    <main className="space-y-3">
      <PageHeader title="買い物の判断" />
      <p className="px-1 text-[13px] text-ink-3">買いたいものの金額を入れると、今月に買った場合と、来月に回した場合の、予算や月末の見込みへの影響を並べます。買うかどうかは、決めません。</p>
      <Card>
        <Field label="買いたいものの金額（円）" htmlFor="decide-amount" error={bad ? "1円以上の整数で入力してください" : undefined}>
          <input id="decide-amount" inputMode="numeric" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="例：30000" className={inputCls} maxLength={14} aria-invalid={bad} />
        </Field>
      </Card>
      {sc.ok && (
        <Card>
          <SectionTitle>月末まで、ケース別に比べる</SectionTitle>
          <div className="overflow-x-auto">
          <table className="num w-full text-[13px]">
            <thead>
              <tr className="text-ink-3">
                <th className="py-1 text-left font-semibold">ケース</th>
                <th className="py-1 text-right font-semibold">月末の見込み</th>
                <th className="py-1 text-right font-semibold">今のままとの差</th>
                {data.budget.monthly !== null && <th className="py-1 text-right font-semibold">予算との差（−は超過）</th>}
              </tr>
            </thead>
            <tbody>
              {sc.items.map((s) => (
                <tr key={s.key} className="border-t border-line">
                  <td className="py-1.5 pr-2">{s.label}</td>
                  <td className="py-1.5 text-right font-semibold">約{formatYen(s.projected)}</td>
                  <td className="py-1.5 text-right">{s.diff === 0 ? "—" : formatDiffYen(s.diff)}</td>
                  {s.vsBudget !== null && <td className={`py-1.5 text-right ${s.vsBudget < 0 ? "text-expense" : ""}`}>{formatSignedYen(s.vsBudget)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p className="mt-2 text-[12px] text-ink-3">どれも、今月の月末までの見込みです（確定ではありません）。+は増える、−は減ります。使った額（{formatYen(sc.basis.spent)}）と、これから払う固定費（{formatYen(sc.basis.unpaidFixed)}）は、どの行でも同じです。変えているのは、残り{sc.basis.daysAhead}日の日々の出費（約{formatYen(sc.basis.variableAhead)}。食費・日用品など、月ごとに変わる出費）だけです。</p>
        </Card>
      )}
      {a && (
        <>
          <Card>
            <SectionTitle>今月に買ったら</SectionTitle>
            {a.budget === null ? (
              <p className="text-[13px] text-ink-3">予算が決まっていないので、予算との比べ方は出せません。月の予算を決めると、影響を出せます（設定の「毎月の予算」）。</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="num w-full text-[14px]">
                <thead>
                  <tr className="text-ink-3">
                    <th className="py-1 text-left font-semibold"> </th>
                    <th className="py-1 text-right font-semibold">買う前</th>
                    <th className="py-1 text-right font-semibold">買ったあと</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-1">予算の残り（固定費を引いたあと）</td>
                    <td className="py-1 text-right">{y(a.freeLeft.before)}</td>
                    <td className={`py-1 text-right font-semibold ${a.overFree ? "text-expense" : ""}`}>{y(a.freeLeft.after)}</td>
                  </tr>
                  <tr>
                    <td className="py-1">1日あたり（残り{a.daysLeft}日）</td>
                    <td className="py-1 text-right">{a.perDay.before === null ? "—" : formatYen(a.perDay.before)}</td>
                    <td className="py-1 text-right font-semibold">{a.perDay.after === null ? "—" : formatYen(a.perDay.after)}</td>
                  </tr>
                  {a.projected && a.vsBudget && (
                    <tr>
                      <td className="py-1">予算 − 月末の見込み（−は超過）</td>
                      <td className="py-1 text-right">{y(a.vsBudget.before)}</td>
                      <td className={`py-1 text-right font-semibold ${a.vsBudget.after < 0 ? "text-expense" : ""}`}>{y(a.vsBudget.after)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            )}
            {a.overFree && <p className="mt-2 rounded-xl bg-warn-soft px-3 py-2 text-[13px] text-warn">今月の予算の中では足りなくなります（予算の残りがマイナスになります）。</p>}
            {a.budget !== null && !a.projected && <p className="mt-2 text-[12px] text-ink-3">月末の見込みは、記録が足りないので出していません。</p>}
          </Card>
          <Card>
            <SectionTitle>来月に回したら</SectionTitle>
            <ul className="num space-y-1 text-[14px]">
              {a.nextMonth.budget !== null && a.nextMonth.amountShareOfBudget !== null ? (
                <li>
                  来月の予算 {formatYen(a.nextMonth.budget)} の約{a.nextMonth.amountShareOfBudget}%にあたります
                </li>
              ) : (
                <li className="text-ink-3">予算が決まっていないので、割合は出せません</li>
              )}
              <li>来月に払う固定費は、登録済みの分で合計 {formatYen(a.nextMonth.fixed)} です</li>
            </ul>
            <p className="mt-2 text-[12px] text-ink-3">来月の収入・ほかの支出は、まだ分からないので、入れていません。</p>
          </Card>
          <p className="px-1 text-[12px] text-ink-3">{IS_PERSONAL ? "今月の数字は、ホームと同じ計算です（予算から、使った額と、これから払う固定費を引いた残り。投資は含めません）。" : "今月の数字は、予算から、使った額（すべての支出）と、これから払う固定費を引いた残りです（ホームの「残り予算」は、これから払う固定費を引いていないので、少し違います）。"}見込みは確定ではありません。</p>
        </>
      )}
    </main>
  );
}
