"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/store";
import { useUI } from "@/components/UIContext";
import { Card, Empty, IconChevronR, IconSearch, PageHeader, inputCls } from "@/components/ui";
import { FEATURES } from "@/lib/edition";
import { searchAll, SEARCH_PER_KIND, type SearchHit } from "@/lib/search";
import { queryFromSearch, searchWithQuery } from "@/lib/searchState";

/** 横断検索（自分用。NEXT v21 Phase 2）：記録・予定・固定費・旅行・タスク・メモ・契約・書類などを、1つの言葉で探す */
export default function SearchPage() {
  const data = useData();
  const ui = useUI();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // 検索語は、アドレスの ?q= に残す（検索 → 別の画面 → 戻る、で、検索語が戻る。履歴は増やさない）
  useEffect(() => {
    const first = queryFromSearch(window.location.search);
    if (first) setQ(first);
  }, []);
  useEffect(() => {
    const next = searchWithQuery(window.location.search, q);
    if (next !== window.location.search) window.history.replaceState(window.history.state, "", `${window.location.pathname}${next}`);
  }, [q]);
  const groups = useMemo(() => searchAll(data, q, 200), [data, q]);
  if (!FEATURES.search) {
    return (
      <main>
        <PageHeader title="さがす" />
        <Empty>この版では、まだ使えません</Empty>
      </main>
    );
  }
  const total = groups.reduce((a, g) => a + g.total, 0);
  const row = (h: SearchHit) => {
    const body = (
      <>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{h.title}</span>
          {h.sub && <span className="block truncate text-[12px] text-ink-3">{h.sub}</span>}
        </span>
        <IconChevronR className="size-4 shrink-0 text-ink-3" />
      </>
    );
    const cls = "flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2";
    if (h.href)
      return (
        <Link href={h.href} className={cls}>
          {body}
        </Link>
      );
    return (
      <button type="button" className={cls} onClick={() => (h.kind === "tx" ? ui.openTx({ mode: "edit", id: h.id }) : ui.openEvent({ mode: "view", id: h.id }))}>
        {body}
      </button>
    );
  };
  return (
    <main className="space-y-3">
      <PageHeader title="さがす" />
      <div className="relative">
        <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-3" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="店名・予定・メモ・金額など"
          aria-label="記録・予定・メモなどを探す"
          enterKeyHint="search"
          className={`${inputCls} pl-10`}
        />
      </div>
      <p className="px-1 text-[12px] text-ink-3">端末の中の記録だけを探します。スペースで区切ると「すべて含む」ものを探します。数字だけを入れると、金額が同じものも出ます。</p>
      {q.trim() === "" ? null : groups.length === 0 ? (
        <Empty>「{q.trim()}」に合うものは見つかりません</Empty>
      ) : (
        <>
          <p className="num px-1 text-[13px] font-semibold text-ink-2">{total}件</p>
          {groups.map((g) => {
            const showAll = open[g.kind];
            const hits = showAll ? g.hits : g.hits.slice(0, SEARCH_PER_KIND);
            return (
              <Card key={g.kind} className="py-2">
                <h2 className="px-1 pt-1 text-[13px] font-semibold text-ink-2">
                  {g.label}
                  <span className="num ml-1 font-medium text-ink-3">{g.total}件</span>
                </h2>
                <ul className="-mx-2">
                  {hits.map((h) => (
                    <li key={`${h.kind}-${h.id}`}>{row(h)}</li>
                  ))}
                </ul>
                {g.total > SEARCH_PER_KIND && !showAll && (
                  <button type="button" onClick={() => setOpen({ ...open, [g.kind]: true })} className="mt-1 min-h-11 w-full rounded-lg text-[13px] font-semibold text-brand hover:bg-brand-soft">
                    ほか{g.total - SEARCH_PER_KIND}件を見る
                  </button>
                )}
              </Card>
            );
          })}
        </>
      )}
    </main>
  );
}
