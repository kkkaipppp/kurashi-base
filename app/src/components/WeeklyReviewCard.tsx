"use client";

import { Card, SectionTitle } from "./ui";
import { weeklyReview } from "@/lib/weeklyReview";
import { formatDateJa } from "@/lib/date";
import { formatYen } from "@/lib/money";
import { useData } from "@/lib/store";

/** 週の見直し（自分用。NEXT v21 Phase 4）：記録されたことだけを並べる。原因は推測しない */
export function WeeklyReviewCard({ from, today, isThisWeek }: { from: string; today: string; isThisWeek: boolean }) {
  const data = useData();
  const r = weeklyReview(data, from, today);
  const cat = r.topCategory ? data.categories.find((c) => c.id === r.topCategory!.categoryId)?.name ?? "（不明なカテゴリ）" : null;
  const diff = r.prevSpent === null ? null : r.spent - r.prevSpent;
  const hasNext = r.next.events + r.next.fixed.length + r.next.tasks + r.next.renewals > 0;
  return (
    <>
      <Card>
        <SectionTitle>この週のふりかえり</SectionTitle>
        <dl className="num space-y-1 text-[14px]">
          <div className="flex justify-between gap-2">
            <dt className="text-ink-2">使ったお金（生活費・投資を除く）</dt>
            <dd className="font-semibold">{formatYen(r.spent)}</dd>
          </div>
          {r.topCategory && (
            <div className="flex justify-between gap-2">
              <dt className="text-ink-2">いちばん多かったカテゴリ</dt>
              <dd className="font-semibold">
                {cat}（{formatYen(r.topCategory.total)}）
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <dt className="text-ink-2">予定</dt>
            <dd className="font-semibold">{r.events}件</dd>
          </div>
        </dl>
        <p className="mt-2 text-[13px] text-ink-2">
          {diff === null
            ? "前の週は記録がないので、比べません。"
            : diff === 0
              ? "前の週の同じ曜日までと、同じ額でした。"
              : `前の週の同じ曜日までより、${formatYen(Math.abs(diff))}${diff > 0 ? "多い" : "少ない"}です。`}
        </p>
        <p className="mt-1 text-[12px] text-ink-3">記録されたことだけを並べています。理由は推測しません。</p>
      </Card>
      {isThisWeek && (
        <Card>
          <SectionTitle>次の週（{formatDateJa(r.next.from)}〜{formatDateJa(r.next.to)}）にあるもの</SectionTitle>
          {hasNext ? (
            <ul className="space-y-1 text-[14px]">
              {r.next.events > 0 && <li>予定が{r.next.events}件あります</li>}
              {r.next.fixed.map((f) => (
                <li key={`${f.name}-${f.date}`} className="num">
                  固定費：{f.name} {formatYen(f.amount)}（{formatDateJa(f.date)}）
                </li>
              ))}
              {r.next.tasks > 0 && <li>期限のタスクが{r.next.tasks}件あります</li>}
              {r.next.renewals > 0 && <li>契約の更新日が{r.next.renewals}件あります</li>}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-3">予定されているものは、まだありません。</p>
          )}
          <p className="mt-2 text-[12px] text-ink-3">登録されているものだけです（これから変わることがあります）。</p>
        </Card>
      )}
    </>
  );
}
