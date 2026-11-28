"use client";

import { allowanceBreakdown } from "@/lib/allowanceBreakdown";
import { formatDateJa } from "@/lib/date";
import { formatSignedYen, formatYen } from "@/lib/money";
import { useData } from "@/lib/store";

/**
 * ホームの「1日あたり」の内訳（A3。自分用だけ）。ホームの数字と同じ計算を、1行ずつ見せる。
 * ホームの上の色の帯の中に置くので、文字は白・背景は半透明の白
 */
export function AllowanceDetails({ today }: { today: string }) {
  const data = useData();
  const b = allowanceBreakdown(data, today);
  if (!b) return null;
  return (
    <details className="mt-2 rounded-xl bg-white/15 px-3 text-[13px]">
      <summary className="flex min-h-11 cursor-pointer items-center font-semibold">{process.env.NEXT_PUBLIC_KB_EDITION === "personal" ? "計算の内訳（予算・使った額・固定費）" : "この数字の内訳を見る"}</summary>
      <dl className="num space-y-1 pb-2">
        <div className="flex justify-between gap-2">
          <dt>今月の予算</dt>
          <dd>{formatYen(b.budget)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>使った額（投資を除く）</dt>
          <dd>{b.spent > 0 ? "−" : ""}{formatYen(b.spent)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>これから払う固定費</dt>
          <dd>{b.unpaidFixed > 0 ? "−" : ""}{formatYen(b.unpaidFixed)}</dd>
        </div>
        {b.fixed.length > 0 && (
          <ul className="space-y-0.5 pl-3 text-[12px] opacity-90">
            {b.fixed.map((f, i) => (
              <li key={`${i}-${f.name}-${f.date}`} className="flex justify-between gap-2">
                <span className="min-w-0 break-words">
                  {formatDateJa(f.date)} {f.name}
                </span>
                <span className="shrink-0">{formatYen(f.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-between gap-2 border-t border-white/30 pt-1 font-semibold">
          <dt>予算の残り（固定費を引いたあと）</dt>
          <dd>{formatSignedYen(b.freeLeft)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>÷ 月末までの日数（今日を含む）</dt>
          <dd>{b.daysLeft}日</dd>
        </div>
        <div className="flex justify-between gap-2 font-semibold">
          <dt>1日あたり</dt>
          <dd>{formatYen(b.perDay)}</dd>
        </div>
      </dl>
      {b.eventCosts.length > 0 && (
        <div className="border-t border-white/30 py-2">
          <p className="font-semibold">予定に入れた費用の目安（上では引いていません）</p>
          <ul className="num mt-1 space-y-0.5 pl-3 text-[12px] opacity-90">
            {b.eventCosts.map((e, i) => (
              <li key={`${i}-${e.title}-${e.date}`} className="flex justify-between gap-2">
                <span className="min-w-0 break-words">
                  {formatDateJa(e.date)} {e.title}
                </span>
                <span className="shrink-0">{formatYen(e.cost)}</span>
              </li>
            ))}
          </ul>
          {b.perDayWithEvents !== null && (
            <p className="num mt-1">
              これも引くと、1日あたり <strong>{formatYen(b.perDayWithEvents)}</strong>
            </p>
          )}
        </div>
      )}
      <p className="pb-2 text-[12px] opacity-90">記録していない固定費は、支払日が今月のものだけを引いています。予定の費用は目安で、記録ではありません。</p>
    </details>
  );
}
