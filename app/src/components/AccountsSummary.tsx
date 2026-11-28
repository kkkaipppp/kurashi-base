"use client";

import Link from "next/link";
import { accountView, nextCardPayment } from "@/lib/accounts";
import { formatDateJa, todayStr } from "@/lib/date";
import { formatYen } from "@/lib/money";
import { useData } from "@/lib/store";
import { IconChevronR } from "./ui";

/** 家計簿の「支払い」（自分用）：口座ごとの残高の目安と、カードの次の引き落とし */
export function AccountsSummary() {
  const data = useData();
  const today = todayStr();
  const list = (data.accounts ?? []).filter((a) => !a.archived);
  if (list.length === 0) return null;
  return (
    <section aria-labelledby="acct-sum" className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <h2 id="acct-sum" className="text-[16px] font-bold">
          口座・カード
        </h2>
        <Link href="/accounts" className="inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold text-brand">
          合わせる
          <IconChevronR className="size-4" />
        </Link>
      </div>
      <ul className="divide-y divide-line border-y border-line">
        {list.map((a) => {
          const v = accountView(data, a, today);
          const next = nextCardPayment(data, a, today);
          return (
            <li key={a.id} className="flex min-h-12 items-center justify-between gap-3 text-[15px]">
              <span className="min-w-0">
                <span className="block truncate">{a.name}</span>
                {next && (
                  <span className="block text-[13px] text-ink-3">
                    {formatDateJa(next.pay)}に {formatYen(next.amount)} 引き落とし
                  </span>
                )}
              </span>
              <span className="num shrink-0 font-semibold">
                {v.value === null ? <span className="text-[13px] font-medium text-ink-3">未入力</span> : a.kind === "card" ? `待ち ${formatYen(Math.max(0, -v.value))}` : v.value < 0 ? `−${formatYen(-v.value)}` : formatYen(v.value)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
