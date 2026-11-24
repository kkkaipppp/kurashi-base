"use client";

import { useState } from "react";
import { Button, inputCls } from "./ui";
import { useUI } from "./UIContext";
import { useData, useStore } from "@/lib/store";
import { categoryIsInvest, isInvestByName } from "@/lib/classify";
import type { TxType } from "@/lib/types";

/**
 * 自分用だけ：カテゴリの「数え方」（生活費・投資）と「まとめる」（100点化の指示 D・E）。
 * - 数え方は名前と別に持つ。決めていないカテゴリは、今までどおり名前（「投資」が入っているか）で数える
 * - まとめるは、記録と固定費を移して、元のカテゴリを非表示にする（消さない。取り消しの控えを残す）
 */
export function CategoryTools({ kind }: { kind: TxType }) {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const cats = data.categories.filter((c) => c.kind === kind);
  const count = (id: string) => data.transactions.filter((t) => t.categoryId === id).length;
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const active = cats.filter((c) => !c.archived);
  const fromCat = cats.find((c) => c.id === from);
  const toCat = active.find((c) => c.id === to);

  const merge = async () => {
    if (!fromCat || !toCat || fromCat.id === toCat.id) return ui.toast("まとめる元と先を選んでください", "error");
    const n = count(fromCat.id);
    const rc = data.recurring.filter((r) => r.categoryId === fromCat.id).length;
    const ok = await ui.confirm({
      title: `「${fromCat.name}」を「${toCat.name}」にまとめますか？`,
      body: `記録${n}件${rc ? `と固定費${rc}件` : ""}を「${toCat.name}」に移し、「${fromCat.name}」は非表示にします（消しません）。設定の「直前の操作を取り消す」で戻せます。`,
      ok: "まとめる",
    });
    if (!ok) return;
    const r = store.mergeCategory(fromCat.id, toCat.id);
    if (!r.ok) return ui.toast(r.error, "error");
    ui.toast(`${r.moved ?? 0}件を「${toCat.name}」に移しました`);
    setFrom("");
    setTo("");
  };

  return (
    <details className="mt-3 rounded-xl border border-line p-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-[14px] font-semibold text-ink-2">数え方とまとめる</summary>
      {kind === "expense" && (
        <div className="mt-2">
          <p className="text-[12px] text-ink-3">投資として数えたカテゴリは、予算と比べる「生活費」に入れません。決めていないものは名前（「投資」が入っているか）で数えます。</p>
          <ul className="mt-2 divide-y divide-line">
            {active.map((c) => (
              <li key={c.id} className="flex min-h-12 items-center justify-between gap-2 py-1">
                <span className="min-w-0 flex-1 truncate text-[14px]">
                  {c.name}
                  <span className="num ml-1 text-[12px] text-ink-3">{count(c.id)}件</span>
                </span>
                <select
                  aria-label={`${c.name}の数え方`}
                  value={c.role ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    const r = store.setCategoryRole(c.id, v === "life" || v === "invest" ? v : null);
                    if (!r.ok) ui.toast(r.error, "error");
                  }}
                  className={`${inputCls} w-auto shrink-0`}
                >
                  <option value="">名前から（{isInvestByName(c.name) ? "投資" : "生活費"}）</option>
                  <option value="life">生活費</option>
                  <option value="invest">投資</option>
                </select>
              </li>
            ))}
          </ul>
          {active.some((c) => !c.role && categoryIsInvest(c)) && (
            <p className="mt-1 text-[12px] text-warn">「名前から（投資）」のカテゴリは、名前を変えると生活費に変わります。投資のままにするなら「投資」を選んでください。</p>
          )}
        </div>
      )}
      <div className="mt-3 space-y-2">
        <p className="text-[13px] font-semibold text-ink-2">カテゴリをまとめる</p>
        <div className="grid grid-cols-2 gap-2">
          <select aria-label="まとめる元のカテゴリ" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls}>
            <option value="">まとめる元</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}（{count(c.id)}件{c.archived ? "・非表示" : ""}）
              </option>
            ))}
          </select>
          <select aria-label="まとめる先のカテゴリ" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls}>
            <option value="">まとめる先</option>
            {active
              .filter((c) => c.id !== from)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>
        <Button variant="secondary" className="w-full" onClick={merge} disabled={!fromCat || !toCat}>
          まとめる
        </Button>
      </div>
    </details>
  );
}
