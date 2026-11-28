"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Card, SectionTitle } from "./ui";
import { formatDateJa } from "@/lib/date";
import { formatMinutes } from "@/lib/life";
import { weekAhead, yearReview } from "@/lib/lookAhead";
import { formatYen } from "@/lib/money";
import { useData } from "@/lib/store";

/** ホーム（自分用）：明日から7日の見通し */
export function WeekAheadCard({ today }: { today: string }) {
  const data = useData();
  const days = useMemo(() => weekAhead(data, today), [data, today]);
  return (
    <Card>
      <SectionTitle
        action={
          <Link href="/calendar" className="inline-flex min-h-11 items-center rounded-lg px-2 text-[13px] font-semibold text-brand hover:bg-brand-soft">
            カレンダー
          </Link>
        }
      >
        この先7日
      </SectionTitle>
      {days.length === 0 ? (
        <p className="py-1 text-[14px] text-ink-3">明日から7日のあいだに、予定・支払い・期限はありません。</p>
      ) : (
        <ul className="divide-y divide-line">
          {days.map((x) => (
            <li key={x.date}>
              <Link href={`/calendar?d=${x.date}`} className="flex min-h-11 items-center gap-2 py-1 hover:bg-surface-2">
                <span className="w-24 shrink-0 text-[13px] font-semibold">{formatDateJa(x.date)}</span>
                <span className="num min-w-0 flex-1 truncate text-[13px] text-ink-2">
                  {[x.events ? `予定 ${x.events}件` : "", x.payCount ? `支払い ${formatYen(x.pay)}` : "", x.deadlines ? `期限 ${x.deadlines}件` : ""].filter(Boolean).join("・")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** 目標（自分用）：その年のふりかえり。たたんで出す */
export function YearReviewCard({ year }: { year: string }) {
  const data = useData();
  const r = useMemo(() => yearReview(data, year), [data, year]);
  const rows: [string, string][] = [
    ["達成した目標", `${r.goalsMet}件`],
    ["勉強した時間", r.studyMinutes ? formatMinutes(r.studyMinutes) : "0分"],
    ["旅行", `${r.trips}回`],
    ["支出（投資を除く）", formatYen(r.expense)],
    ...(r.invest ? ([["投資", formatYen(r.invest)]] as [string, string][]) : []),
    ["収入", formatYen(r.income)],
  ];
  return (
    <Card className="py-2">
      <details>
        <summary className="flex min-h-11 cursor-pointer items-center text-[15px] font-bold">{Number(year)}年のふりかえり</summary>
        <dl className="divide-y divide-line text-[14px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex min-h-11 items-center justify-between gap-2">
              <dt className="text-ink-2">{k}</dt>
              <dd className="num font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-1 text-[12px] text-ink-3">記録から数えた数です。</p>
      </details>
    </Card>
  );
}
