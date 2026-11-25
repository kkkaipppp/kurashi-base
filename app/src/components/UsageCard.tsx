"use client";

import { Card, SectionTitle } from "./ui";
import { useData } from "@/lib/store";
import { todayStr } from "@/lib/date";
import { GOAL_DAYS_PER_WEEK, usageWeeks } from "@/lib/usageDays";

/**
 * 続けて使えているか（自分用。CHARTER の成功1、論点 Q15 は B）。直近4週間の、記録した日の数。
 * 見るだけの日は数えない（保存の形を変えないため）ので、実際より少なめに出ることを書いておく
 */
export function UsageCard() {
  const data = useData();
  const u = usageWeeks(data, todayStr());
  const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
  return (
    <Card>
      <SectionTitle>続けて使えているか</SectionTitle>
      <p className="text-[14px]">
        {u.meetsGoal ? "直近4週間、どの週も5日以上記録しています。" : `目安は、4週続けて週${GOAL_DAYS_PER_WEEK}日以上の記録です。`}
      </p>
      <ol className="mt-2 grid grid-cols-4 gap-2" aria-label="直近4週間の、記録した日の数">
        {u.weeks.map((w, i) => (
          <li key={w.from} className={`rounded-xl px-2 py-2 text-center ${w.days >= GOAL_DAYS_PER_WEEK ? "bg-brand-soft" : "bg-surface-2"}`}>
            <span className="block text-[12px] text-ink-2">{i === 3 ? "今週" : `${md(w.from)}〜`}</span>
            <span className="num block text-[18px] font-bold">
              {w.days}
              <span className="text-[12px] font-medium">日</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[12px] text-ink-2">記録を作った日・直した日を数えています（見るだけの日は数えません）。今週は今日までの7日です。</p>
    </Card>
  );
}
