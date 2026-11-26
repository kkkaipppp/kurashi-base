"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useData } from "@/lib/store";
import { sortTxDesc, summarizeMonth, txInMonth } from "@/lib/aggregate";
import { sumEntries, txEntries } from "@/lib/ledgerCore";
import { addMonthsToKey, formatDateJa, formatMonthJa, monthKey, todayStr } from "@/lib/date";
import { formatSignedYen, formatYen } from "@/lib/money";
import { PAYMENT_METHODS } from "@/lib/types";
import Link from "next/link";
import { FEATURES } from "@/lib/edition";
import { useUI } from "@/components/UIContext";
import { TxRow } from "@/components/Rows";
import { Card, Empty, IconChevronL, IconChevronR, IconSearch, PageHeader, inputCls } from "@/components/ui";

/** 振り返りなどからの ?m=YYYY-MM&cat=<id> を、絞り込みに反映する */
function QuerySync({ onApply }: { onApply: (m: string | null, cat: string | null) => void }) {
  const sp = useSearchParams();
  const m = sp.get("m");
  const cat = sp.get("cat");
  useEffect(() => {
    if (m || cat) onApply(m, cat);
  }, [m, cat, onApply]);
  return null;
}

export default function HistoryPage() {
  const data = useData();
  const ui = useUI();
  const pathname = usePathname();
  const lastPath = useRef(pathname);
  const [month, setMonth] = useState(monthKey(todayStr()));
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | "expense" | "income">("all");
  const [cat, setCat] = useState("");
  const [pay, setPay] = useState("all");

  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setMonth(monthKey(todayStr()));
    setQ(""); setType("all"); setCat(""); setPay("all");
  }, [pathname]);

  const sum = summarizeMonth(data.transactions, month);
  const applyQuery = useMemo(
    () => (m: string | null, c: string | null) => {
      if (m && /^\d{4}-\d{2}$/.test(m)) setMonth(m);
      setCat(c ?? "");
      setType("all");
      setQ("");
      setPay("all");
    },
    [],
  );
  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? "（不明）";

  const list = useMemo(() => {
    const needle = q.trim().normalize("NFKC").toLowerCase();
    return sortTxDesc(txInMonth(data.transactions, month)).filter((t) => {
      if (type !== "all" && t.type !== type) return false;
      if (cat && t.categoryId !== cat) return false;
      if (pay !== "all" && t.paymentMethod !== pay) return false;
      if (needle) {
        const hay = `${t.merchant} ${t.note} ${catName(t.categoryId)}`.normalize("NFKC").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, month, q, type, cat, pay]);

  // 絞り込んだ記録の支出・収入（共通台帳の数え方。o11 A06）
  const listSum = useMemo(() => sumEntries(txEntries(list), () => true), [list]);

  const byDate = useMemo(() => {
    const m = new Map<string, typeof list>();
    for (const t of list) m.set(t.date, [...(m.get(t.date) ?? []), t]);
    return [...m.entries()];
  }, [list]);

  const filtered = q !== "" || type !== "all" || cat !== "" || pay !== "all";

  return (
    <main>
      <PageHeader title="取引履歴" />
      <Suspense fallback={null}>
        <QuerySync onApply={applyQuery} />
      </Suspense>

      <Card className="py-3">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setMonth(addMonthsToKey(month, -1))} aria-label="前の月" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
            <IconChevronL />
          </button>
          <h2 className="text-[17px] font-bold">{formatMonthJa(month)}</h2>
          <button type="button" onClick={() => setMonth(addMonthsToKey(month, 1))} aria-label="次の月" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2">
            <IconChevronR />
          </button>
        </div>
        <dl className="num mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-expense-soft py-2">
            <dt className="text-[12px] font-semibold text-expense">支出</dt>
            <dd className="text-[15px] font-bold">{formatYen(sum.expense)}</dd>
          </div>
          <div className="rounded-xl bg-income-soft py-2">
            <dt className="text-[12px] font-semibold text-income">収入</dt>
            <dd className="text-[15px] font-bold">{formatYen(sum.income)}</dd>
          </div>
          <div className="rounded-xl bg-surface-2 py-2">
            <dt className="text-[12px] font-semibold text-ink-2">収支</dt>
            <dd className={`text-[15px] font-bold ${sum.balance < 0 ? "text-expense" : ""}`}>{formatSignedYen(sum.balance)}</dd>
          </div>
        </dl>
        {sum.byCategory.length > 0 && (
          <details className="mt-3">
            <summary className="flex min-h-11 cursor-pointer items-center text-[13px] font-semibold text-ink-2">支出の内訳</summary>
            <ul className="mt-1 space-y-1.5">
              {sum.byCategory.map((c) => (
                <li key={c.categoryId} className="text-[13px]">
                  <div className="flex justify-between">
                    <span>{catName(c.categoryId)}</span>
                    <span className="num font-semibold">{formatYen(c.total)}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-expense/70" style={{ width: `${Math.round((c.total / sum.expense) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <div className="mt-3 space-y-2">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-3" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="この月の店名・メモで検索" aria-label="この月の店名・メモで検索" className={`${inputCls} pl-10`} />
        </div>
        {/* 検索は、表示している月の中だけ。ほかの月は「さがす」へ（2026-11-26 承認5の5） */}
        <p className="flex flex-wrap items-center gap-x-2 px-1 text-[12px] text-ink-3">
          <span>この月の記録だけを探します。</span>
          {FEATURES.search && (
            <Link href={q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search"} className="inline-flex min-h-11 items-center rounded-lg px-1 font-semibold text-brand hover:bg-brand-soft">
              すべての月から探す
            </Link>
          )}
        </p>
        <div className="grid grid-cols-3 gap-2">
          <label className="sr-only" htmlFor="f-type">種類</label>
          <select id="f-type" value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="種類で絞り込み" className={`${inputCls} px-2 text-[14px]`}>
            <option value="all">種類：すべて</option>
            <option value="expense">支出</option>
            <option value="income">収入</option>
          </select>
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="カテゴリで絞り込み" className={`${inputCls} px-2 text-[14px]`}>
            <option value="">カテゴリ：すべて</option>
            {data.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={pay} onChange={(e) => setPay(e.target.value)} aria-label="支払方法で絞り込み" className={`${inputCls} px-2 text-[14px]`}>
            <option value="all">支払方法：すべて</option>
            {PAYMENT_METHODS.map((p) => (
              <option key={p.id || "none"} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {filtered && (
          <div className="num mt-2 flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-1.5 text-[13px]">
            <span>
              {list.length}件・<span className="text-expense">支出 {formatYen(listSum.expense)}</span>・
              <span className="text-income">収入 {formatYen(listSum.income)}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setQ("");
                setType("all");
                setCat("");
                setPay("all");
              }}
              className="min-h-11 shrink-0 rounded-lg px-2 font-semibold text-brand hover:bg-brand-soft"
            >
              絞り込みを解除
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {byDate.length === 0 ? (
          <Empty
            action={
              !filtered && (
                <button type="button" onClick={() => ui.openTx({ mode: "new", type: "expense" })} className="min-h-11 rounded-xl bg-brand px-4 text-[14px] font-semibold text-brand-ink">
                  支出を追加
                </button>
              )
            }
          >
            {filtered ? "条件に合う記録はありません" : `${formatMonthJa(month)}の記録はまだありません`}
          </Empty>
        ) : (
          byDate.map(([date, txs]) => (
            <Card key={date} className="py-2">
              <h3 className="px-0 pt-1 text-[13px] font-semibold text-ink-2">{formatDateJa(date)}</h3>
              <ul className="-mx-2">
                {txs.map((t) => (
                  <TxRow key={t.id} tx={t} />
                ))}
              </ul>
            </Card>
          ))
        )}
      </div>
    </main>
  );
}
