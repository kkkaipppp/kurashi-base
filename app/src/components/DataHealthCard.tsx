"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, SectionTitle } from "./ui";
import { dataHealth, type HealthFinding } from "@/lib/dataHealth";
import { todayStr } from "@/lib/date";
import { useData } from "@/lib/store";

/** データの点検（自分用。NEXT v21 Q09）。読むだけ。何も書き換えない */
export function DataHealthCard() {
  const data = useData();
  const [found, setFound] = useState<HealthFinding[] | null>(null);
  return (
    <Card>
      <SectionTitle>データの点検</SectionTitle>
      <p className="text-[13px] text-ink-2">記録の欠け・二重かもしれない記録・古い固定費・バックアップの間隔を調べます。調べるだけで、何も変えません。</p>
      <div className="mt-3">
        <Button variant="secondary" className="w-full" onClick={() => setFound(dataHealth(data, todayStr()))}>
          点検する
        </Button>
      </div>
      {found && (
        <div className="mt-3" role="status">
          {found.length === 0 ? (
            <p className="rounded-xl bg-income-soft px-3 py-2 text-[13px] font-semibold text-income">気になるところは見つかりませんでした</p>
          ) : (
            <ul className="space-y-2">
              {found.map((f) => (
                <li key={f.id} className={`rounded-xl px-3 py-2 text-[13px] ${f.level === "warn" ? "bg-warn-soft text-warn" : "bg-surface-2 text-ink-2"}`}>
                  <span className="font-semibold">{f.level === "warn" ? "確認：" : "お知らせ："}</span>
                  {f.text}
                  {f.count > 1 && <span className="num">（{f.count}件）</span>}
                  {f.href && (
                    <Link href={f.href} className="ml-2 inline-flex min-h-11 items-center font-semibold underline">
                      見る
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
