"use client";

import Link from "next/link";
import { Card } from "./ui";
import { undatedItems } from "@/lib/undated";
import { useData } from "@/lib/store";

/** カレンダーの下：日程未定（日にちの無い計画・やること）。たたんで出す */
export function UndatedCard() {
  const data = useData();
  const list = undatedItems(data);
  if (list.length === 0) return null;
  return (
    <Card>
      <details>
        <summary className="flex min-h-11 cursor-pointer items-center text-[15px] font-bold">日程未定（{list.length}件）</summary>
        <p className="mb-1 text-[12px] text-ink-3">日にちが決まっていない計画と、期限もやる日も無いやることです。開いて日にちを入れると、カレンダーに出ます。</p>
        <ul className="space-y-1 text-[14px]">
          {list.map((x) => (
            <li key={x.key}>
              <Link href={x.href} className="flex min-h-11 items-center gap-2 rounded-lg px-1 hover:bg-surface-2">
                <span className="w-14 shrink-0 text-[12px] text-ink-3">{x.kind}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{x.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}
