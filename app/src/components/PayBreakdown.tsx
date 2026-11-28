"use client";

import { formatYen } from "@/lib/money";
import { payBreakdown } from "@/lib/payBreakdown";
import { useData } from "@/lib/store";
import { Card } from "./ui";

/** 家計簿の「予算」：支払方法ごとの支出（自分用） */
export function PayBreakdown({ month }: { month: string }) {
  const data = useData();
  const rows = payBreakdown(data, month);
  if (rows.length === 0) return null;
  return (
    <Card>
      <h2 className="text-[15px] font-bold">支払方法ごと</h2>
      <ul className="mt-1 divide-y divide-line text-[14px]">
        {rows.map((r) => (
          <li key={r.id || "none"} className="flex min-h-11 items-center justify-between gap-3">
            <span>{r.label}</span>
            <span className="num font-semibold">{formatYen(r.amount)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[12px] text-ink-3">カード払いは、買った日の月に入ります（引き落としの日ではありません）。</p>
    </Card>
  );
}
