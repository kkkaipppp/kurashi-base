"use client";

import { Button, Card, SectionTitle } from "./ui";
import { useUI } from "./UIContext";
import { useData, useStore } from "@/lib/store";
import { formatDateJa } from "@/lib/date";
import { undoBatch, undoableBatches } from "@/lib/importBatch";

/**
 * 取り込みの履歴と取り消し（自分用。NEXT v21 CSV:C08）。
 * 取り消しは、その取り込みで足した記録のうち、あとから変えていないものだけを消す（変えたものは残して知らせる）。
 */
export function ImportHistoryCard() {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const list = undoableBatches(data).slice(0, 5);
  if (list.length === 0) return null;
  const undo = async (id: string, label: string) => {
    const r = undoBatch(store.data ?? data, id, new Date().toISOString());
    if (!r.ok) return ui.toast(r.error, "error");
    const ok = await ui.confirm({
      title: `「${label}」の取り込みを取り消しますか？`,
      body: `この取り込みで足した記録のうち、${r.result.removed}件を消します。${r.result.kept > 0 ? `あとから変えた・旅行や固定費につないだ${r.result.kept}件は、残します。` : ""}設定の「直前の操作を取り消す」でも戻せます。`,
      ok: "取り消す",
      danger: true,
    });
    if (!ok) return;
    const s = store.replaceAll(r.result.next, `「${label}」の取り込みを取り消す`);
    ui.toast(s.ok ? `${r.result.removed}件を取り消しました${r.result.kept ? `（${r.result.kept}件は残しました）` : ""}` : s.error, s.ok ? "ok" : "error");
  };
  return (
    <Card>
      <SectionTitle>取り込みの履歴</SectionTitle>
      <ul className="divide-y divide-line">
        {list.map((b) => (
          <li key={b.id} className="flex min-h-14 items-center justify-between gap-2 py-1">
            <span className="min-w-0 text-[13px]">
              <span className="block truncate font-semibold">{b.source}</span>
              <span className="num block text-[12px] text-ink-3">
                {formatDateJa(b.at.slice(0, 10), true)}・{b.added}件を追加{b.from ? `（${formatDateJa(b.from, true)}〜${formatDateJa(b.to ?? b.from, true)}）` : ""}
              </span>
            </span>
            <Button variant="secondary" className="shrink-0" onClick={() => undo(b.id, b.source)}>
              取り消す
            </Button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-ink-3">取り消せるのは、その取り込みで足した記録のうち、あとから変えていないものだけです。</p>
    </Card>
  );
}
