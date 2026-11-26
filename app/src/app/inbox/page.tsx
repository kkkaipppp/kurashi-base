"use client";

import { useMemo, useState } from "react";
import { useData, useStore } from "@/lib/store";
import { useUI } from "@/components/UIContext";
import { Button, Card, Empty, PageHeader, inputCls } from "@/components/ui";
import { FEATURES } from "@/lib/edition";
import { inboxGroups, recategorize, UNSORTED_NAMES } from "@/lib/inbox";
import { categoryIsInvest } from "@/lib/classify";
import { formatDateJa } from "@/lib/date";
import { formatYen } from "@/lib/money";

/** 未整理の記録（自分用。NEXT v21 Phase 2）：「その他」に入っている記録を、店名ごとにまとめて整理する */
export default function InboxPage() {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const groups = useMemo(() => inboxGroups(data), [data]);
  const [pick, setPick] = useState<Record<string, string>>({});
  if (!FEATURES.inbox) {
    return (
      <main>
        <PageHeader title="未分類の記録" />
        <Empty>この版では、まだ使えません</Empty>
      </main>
    );
  }
  const apply = async (ids: string[], merchant: string, toId: string) => {
    const to = data.categories.find((c) => c.id === toId);
    if (!to) return ui.toast("移すカテゴリを選んでください", "error");
    // 「その他」から、投資として数えるカテゴリへ移すと、予算と比べる額（生活費）が減る
    const from = data.categories.find((c) => c.name === UNSORTED_NAMES[to.kind] && c.kind === to.kind);
    const differ = from ? categoryIsInvest(from) !== categoryIsInvest(to) : false;
    const ok = await ui.confirm({
      title: `「${merchant}」の${ids.length}件を「${to.name}」にしますか？`,
      body: `カテゴリだけが変わります（金額・日付はそのまま）。${differ ? `「${to.name}」は${categoryIsInvest(to) ? "投資に数えるカテゴリ（予算と比べる額から外れる）" : "生活費に数えるカテゴリ"}なので、ホームの「使った額」が変わります。` : ""}戻したいときは、設定の「直前の操作を取り消す」を使います。`,
      ok: "変える",
    });
    if (!ok) return;
    // 作るときに使ったデータ（base）を保存に渡す（o11 A06 点検 中-1）
    const base = store.data ?? data;
    const r = recategorize(base, ids, toId, new Date().toISOString());
    if (!r.ok) return ui.toast(r.error, "error");
    const s = await store.replaceAll(r.next, `「${merchant}」の${ids.length}件のカテゴリを「${to.name}」に変える`, base);
    ui.toast(s.ok ? `${r.changed}件を「${to.name}」にしました` : s.error, s.ok ? "ok" : "error");
  };
  const cats = (type: "expense" | "income") => data.categories.filter((c) => c.kind === type && !c.archived);
  return (
    <main className="space-y-3">
      <PageHeader title="未分類の記録" />
      <p className="px-1 text-[13px] text-ink-3">
        「その他」に入っている記録を、店名ごとにまとめています。同じ店名が、ほかのカテゴリに入っているときは、候補を出します（押したときだけ変わります）。
      </p>
      {groups.length === 0 ? (
        <Empty>整理が必要な記録は、ありません</Empty>
      ) : (
        groups.map((g) => {
          const sel = pick[g.key] ?? "";
          const suggest = g.suggest;
          return (
            <Card key={g.key} className="space-y-2 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-[17px] font-bold">{g.merchant}</h2>
                <p className="num text-[12px] text-ink-3">
                  {g.type === "expense" ? "支出" : "収入"} {g.ids.length}件・{formatYen(g.total)}・{formatDateJa(g.firstDate, true)}
                  {g.firstDate !== g.lastDate ? `〜${formatDateJa(g.lastDate, true)}` : ""}
                </p>
              </div>
              {suggest && (
                <Button variant="secondary" className="w-full" onClick={() => apply(g.ids, g.merchant, suggest.categoryId)}>
                  「{suggest.name}」にする
                </Button>
              )}
              <div className="flex gap-2">
                <select aria-label={`${g.merchant}のカテゴリ`} value={sel} onChange={(e) => setPick({ ...pick, [g.key]: e.target.value })} className={inputCls}>
                  <option value="">カテゴリを選ぶ</option>
                  {cats(g.type).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <Button variant="secondary" disabled={!sel} onClick={() => apply(g.ids, g.merchant, sel)} className="shrink-0">
                  変える
                </Button>
              </div>
            </Card>
          );
        })
      )}
    </main>
  );
}
