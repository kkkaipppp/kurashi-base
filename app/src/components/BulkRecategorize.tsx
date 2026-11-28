"use client";

import { useState } from "react";
import { Sheet } from "./Sheet";
import { Button, Field, inputCls } from "./ui";
import { useUI } from "./UIContext";
import { txIsInvest } from "@/lib/classify";
import { keepCategory, recategorize } from "@/lib/inbox";
import { useData, useStore } from "@/lib/store";
import type { Transaction } from "@/lib/types";

/**
 * 絞り込んだ記録のカテゴリを、まとめて変える（To-Be 02 家計簿「記録検索・一括編集」。2026-11-28。自分用）。
 * 支出だけ・収入だけに絞ったときに出す。変えるのはカテゴリだけ（金額・日付はそのまま）。直前の操作の取り消しで戻せる
 */
export function BulkRecategorize({ list }: { list: Transaction[] }) {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  // 収支に数えない記録（カードの引き落とし・振替・経費・返金・精算）は、カテゴリの意味が違うので変えない（点検 中2）
  const skip = list.filter(keepCategory);
  const kinds = new Set(list.map((t) => t.type));
  if (list.length - skip.length < 2 || kinds.size !== 1) return null;
  const kind = list[0].type;
  const targets = list.filter((t) => !skip.includes(t));
  const cats = data.categories.filter((c) => c.kind === kind && !c.archived);
  const apply = async () => {
    const target = cats.find((c) => c.id === to);
    if (!target) return ui.toast("変える先のカテゴリを選んでください", "error");
    const moving = targets.filter((t) => t.categoryId !== target.id);
    const ids = moving.map((t) => t.id);
    if (ids.length === 0) return ui.toast(`どれも「${target.name}」です`);
    // 記録の数え方（countAs が先）で、投資かどうかが変わるものがあるか（点検 中3）
    const byId = new Map(data.categories.map((c) => [c.id, c]));
    const differ = moving.some((t) => txIsInvest(t, byId) !== txIsInvest({ ...t, categoryId: target.id }, byId));
    // 固定費と同じカテゴリ・金額の記録は、カテゴリを変えると固定費として数えなくなる（または数えるようになる）
    const fixedMove = moving.some((t) => !t.recurringId && data.recurring.some((r) => r.active && r.amount === t.amount && (r.categoryId === t.categoryId || r.categoryId === target.id)));
    const ok = await ui.confirm({
      title: `${ids.length}件のカテゴリを「${target.name}」にしますか？`,
      body: `カテゴリだけが変わります（金額・日付はそのまま）。${skip.length ? `収支に数えない記録（引き落とし・振替・経費・返金・精算）${skip.length}件は変えません。` : ""}${differ ? "投資に数えるかどうかが変わる記録があるので、予算と比べる額が変わります。" : ""}${fixedMove ? "固定費と同じ金額の記録があるので、月の内訳の固定費・変動費の分け方が変わることがあります。" : ""}戻したいときは、設定の「直前の操作を取り消す」を使います。`,
      ok: "変える",
    });
    if (!ok) return;
    const base = store.data ?? data;
    const r = recategorize(base, ids, target.id, new Date().toISOString());
    if (!r.ok) return ui.toast(r.error, "error");
    const s = await store.replaceAll(r.next, `${ids.length}件のカテゴリを「${target.name}」に変える`, base);
    ui.toast(s.ok ? `${r.changed}件を「${target.name}」にしました` : s.error, s.ok ? "ok" : "error");
    if (s.ok) setOpen(false);
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="min-h-11 shrink-0 rounded-lg px-2 font-semibold text-brand hover:bg-brand-soft">
        カテゴリをまとめて変える
      </button>
      {open && (
        <Sheet
          title={`${targets.length}件のカテゴリを変える`}
          open
          onRequestClose={() => setOpen(false)}
          footer={
            <Button className="w-full" onClick={apply}>
              変える
            </Button>
          }
        >
          <p className="text-[13px] text-ink-3">
            いま絞り込んでいる{kind === "expense" ? "支出" : "収入"}の{targets.length}件を、同じカテゴリにします。{skip.length > 0 && `収支に数えない記録${skip.length}件は変えません。`}
          </p>
          <Field label="変える先のカテゴリ" htmlFor="bulk-cat">
            <select id="bulk-cat" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls}>
              <option value="">選んでください</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </Sheet>
      )}
    </>
  );
}
