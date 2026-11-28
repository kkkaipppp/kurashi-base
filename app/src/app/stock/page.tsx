"use client";

import { CollectionPage, type CollectionConfig } from "@/components/CollectionPage";
import { NotAvailable } from "@/components/NotAvailable";
import { useUI } from "@/components/UIContext";
import { bool, str } from "@/lib/draft";
import { useStore } from "@/lib/store";
import type { StockItem } from "@/lib/types";

// 自分用だけ（版の値を直接比べる。公開版で直接開いたら「使えません」）
const PERSONAL_BUILD = process.env.NEXT_PUBLIC_KB_EDITION === "personal";

/** 買い足す ⇄ 足りている を切り替える */
function NeedToggle({ s }: { s: StockItem }) {
  const store = useStore();
  const ui = useUI();
  return (
    <button
      type="button"
      aria-label={s.need ? `「${s.name}」を買った（足りている）にする` : `「${s.name}」を買い足すにする`}
      onClick={async () => {
        const r = await store.updateItem("stock", s.id, { need: !s.need });
        if (!r.ok) ui.toast(r.error, "error");
      }}
      className="min-h-11 shrink-0 rounded-lg px-2 text-[14px] font-semibold text-brand hover:bg-surface-2"
    >
      {s.need ? "買った" : "切れた"}
    </button>
  );
}

/** 買い足すもの（To-Be 2026-11-28）。よく買うものを残しておき、切れたら「切れた」、買ったら「買った」 */
const config: CollectionConfig<"stock"> = {
  key: "stock",
  title: "買い足すもの",
  noun: "買い足すもの",
  intro: "洗剤・トイレットペーパーなど、よく買うものを残しておけます。切れたら「切れた」、買ったら「買った」を押します。買ったときの支出は家計簿に記録してください。",
  emptyText: "まだありません。",
  fields: [
    { name: "name", label: "名前", type: "text", required: true, placeholder: "例：洗剤" },
    { name: "need", label: "買い足す", type: "checkbox" },
    { name: "note", label: "メモ（お店・銘柄など）", optional: true, type: "textarea" },
  ],
  initial: () => ({ name: "", need: true, note: "" }),
  toDraft: (s) => ({ name: s.name, need: s.need, note: s.note }),
  fromDraft: (d) => ({ name: str(d, "name"), need: bool(d, "need"), note: str(d, "note") }),
  sort: (a, b) => Number(b.need) - Number(a.need) || a.name.localeCompare(b.name, "ja"),
  groupBy: (s) => (s.need ? "need" : "ok"),
  groupLabel: (k) => (k === "need" ? "買い足す" : "足りている"),
  row: (s) => ({ title: s.name, sub: s.note || undefined, muted: !s.need }),
  rowAction: (s) => <NeedToggle s={s} />,
};

export default function StockPage() {
  if (!PERSONAL_BUILD) return <NotAvailable />;
  return <CollectionPage config={config} />;
}
