"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Card, SectionTitle } from "./ui";
import { buildNavi } from "@/lib/navi";
import { suggestions } from "@/lib/suggestions";
import { useData } from "@/lib/store";

/** 提案（自分用。NEXT v21 X14）。多くても3件。何もなければ出さない。押すと、直す画面へ行くだけ（ここでは何も書き換えない） */
export function SuggestionsCard({ today }: { today: string }) {
  const data = useData();
  const list = useMemo(() => {
    // 「確認したいこと」にすでに出ている固定費（期限切れ・今日）は、ここでは出さない
    const skip = new Set(buildNavi(data, today).filter((n) => n.key.startsWith("rc-")).map((n) => n.key.slice(3)));
    return suggestions(data, today, { inbox: true, skipRecurringIds: skip });
  }, [data, today]);
  if (list.length === 0) return null;
  return (
    <Card>
      <SectionTitle>気にかけたいこと</SectionTitle>
      <ul className="divide-y divide-line">
        {list.map((s) => (
          <li key={s.key}>
            <Link href={s.href} className="flex min-h-11 flex-col justify-center py-2">
              <span className="text-[14px] font-semibold">{s.title}</span>
              <span className="text-[12px] text-ink-3">{s.why}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
