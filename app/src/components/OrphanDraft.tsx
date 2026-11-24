"use client";

import { useState } from "react";
import { Button } from "./ui";
import { useUI } from "./UIContext";
import { clearSheetDraft, draftTimeLabel, loadSheetDraft, moveSheetDraftToNew, type DraftKind } from "@/lib/sheetDraft";

/**
 * 編集していた記録が消えていたとき、その記録の書きかけを取り出せるようにする（100点化の指示 B：
 * 「編集元が消えた場合は、新しい記録として保存するかを確かめる」）。
 * 「新しい記録として入れ直す」は、書きかけを新しい入力の書きかけに移して、新しい入力を開く（そこで「続きから」を押す）。
 */
export function OrphanDraft({ kind, id, onNew, onDone }: { kind: DraftKind; id: string; onNew: () => void; onDone: () => void }) {
  const ui = useUI();
  const [d] = useState(() => loadSheetDraft<unknown>(kind, id));
  if (!d) return null;
  const asNew = async () => {
    const ok = await ui.confirm({
      title: "新しい記録として入れ直しますか？",
      body: "書きかけの中身で、新しい入力を開きます。開いた画面で「続きから」を押してから保存してください。",
      ok: "入れ直す",
    });
    if (!ok) return;
    const r = moveSheetDraftToNew(kind, id);
    if (r === "busy") return ui.toast("新しい入力に別の書きかけがあります。先にそちらを保存するか捨ててください", "error");
    if (r !== "ok") return ui.toast("書きかけを移せませんでした", "error");
    onNew();
  };
  const discard = async () => {
    const ok = await ui.confirm({ title: "書きかけを捨てますか？", body: "この記録の書きかけを端末から消します。", ok: "捨てる", danger: true });
    if (!ok) return;
    clearSheetDraft(kind, id);
    onDone();
  };
  return (
    <div className="mt-3 rounded-xl border border-brand/30 bg-brand-soft p-3" role="status">
      <p className="text-[14px] font-semibold">{draftTimeLabel(d.savedAt)} の書きかけが残っています</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={discard}>
          捨てる
        </Button>
        <Button onClick={asNew}>新しい記録として入れ直す</Button>
      </div>
    </div>
  );
}
