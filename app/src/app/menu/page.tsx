"use client";

import Link from "next/link";
import { Card, IconChevronR, PageHeader } from "@/components/ui";
import { useData } from "@/lib/store";
import { IS_PERSONAL } from "@/lib/edition";
import { GROUPS } from "@/lib/menuGroups";
import dynamic from "next/dynamic";

// 自分用の「メニュー」（o31 F003）は遅れて読む。版をこのファイルで直接比べるので、公開版の組み立てに入らない（点検 中-2）
const PersonalMenu = process.env.NEXT_PUBLIC_KB_EDITION === "personal" ? dynamic(() => import("@/components/PersonalMenu").then((m) => m.PersonalMenu)) : null;

export default function MenuPage() {
  const data = useData();
  // 自分用：お気に入り・最近・検索・すべての機能（o31 F003）。公開版は今までどおり
  if (PersonalMenu) return <PersonalMenu />;
  return (
    <main className="space-y-4">
      <PageHeader title="すべての機能" />
      {GROUPS.map((g) => {
        // 自分用：本人が隠した機能は出さない（記録は消えていない。設定の「メニューに出す機能」でいつでも戻せる）
        const hidden = IS_PERSONAL ? new Set(data.prefs.menuHidden ?? []) : null;
        const items = hidden ? g.items.filter((i) => !hidden.has(i.href)) : g.items;
        if (items.length === 0) return null;
        const soon = items.every((i) => i.soon);
        const list = (
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {items.map((i) => {
                const n = i.count?.(data);
                return (
                  <li key={i.href}>
                    <Link href={i.href} className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-surface-2">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                          {i.label}
                          {i.soon && <span className="rounded-full bg-warn-soft px-1.5 py-0.5 text-[12px] font-semibold text-warn">準備中</span>}
                        </span>
                        <span className="block truncate text-[12px] text-ink-3">{i.desc}</span>
                      </span>
                      {n !== undefined && n > 0 && <span className="num text-[13px] text-ink-3">{n}件</span>}
                      <IconChevronR className="size-4 shrink-0 text-ink-3" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
        // まだ使えないもの（準備中）は、ふだんのメニューに出さない（100点化の指示 F。開けば見られる。2026-11-26 公開版も同じにした＝承認5の4）
        if (soon)
          return (
            <details key={g.title} className="rounded-xl">
              <summary className="flex min-h-11 cursor-pointer items-center px-1 text-[13px] font-semibold text-ink-3">準備中のもの（{items.length}件）を見る</summary>
              {list}
            </details>
          );
        return (
          <section key={g.title}>
            <h2 className="mb-1.5 px-1 text-[13px] font-semibold text-ink-3">{g.title}</h2>
            {list}
          </section>
        );
      })}
    </main>
  );
}
