"use client";

import { useRef, useState } from "react";
import { Button } from "./ui";
import { useUI } from "./UIContext";
import { useData, useStore } from "@/lib/store";
import { newId } from "@/lib/defaults";
import { MAX_ICS_BYTES, applyIcsImport, parseIcs, planIcsImport, type IcsParseResult } from "@/lib/icsImport";

/**
 * カレンダーのファイル（.ics）から予定を取り込む（自分用。Q31＝①）。
 * 端末の中だけで読む。1回の写しで、そのあとの変更は同期しない。取り込む前に件数を見せ、取り消しの控えを残して保存する
 */
export function IcsImportCard() {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ name: string; parsed: IcsParseResult; add: number; duplicates: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (f: File | undefined) => {
    setPreview(null);
    if (!f) return;
    if (f.size > MAX_ICS_BYTES) return ui.toast("ファイルが大きすぎます（5MBまで）", "error");
    const text = await f.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) return ui.toast("カレンダーのファイル（.ics）ではないようです", "error");
    const parsed = parseIcs(text);
    const plan = planIcsImport(store.data ?? data, parsed);
    setPreview({ name: f.name, parsed, add: plan.add.length, duplicates: plan.duplicates });
  };

  const run = async () => {
    if (!preview || busy) return;
    setBusy(true);
    try {
      // 作るときのデータ（base）を渡す。確認のあいだに変わっていたら、保存しない（o11 A06）
      const base = store.data ?? data;
      const plan = planIcsImport(base, preview.parsed);
      const next = applyIcsImport(base, plan.add, () => newId("ev"), new Date().toISOString());
      const r = await store.replaceAll(next, `カレンダーのファイル「${preview.name}」から予定を${plan.add.length}件取り込む`, base);
      if (!r.ok) return ui.toast(r.error, "error");
      ui.toast(`予定を${plan.add.length}件取り込みました（設定の「直前の操作を取り消す」で戻せます）`);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl bg-surface-2 px-3 py-3">
      <p className="text-[14px] font-semibold">カレンダーの予定を取り込む（.ics）</p>
      <p className="text-[13px] text-ink-3">
        ほかのカレンダーの予定を、1回だけ写します（そのあとの変更は、つながりません）。ファイルは、この端末の中だけで読みます。
      </p>
      <details className="text-[13px] text-ink-2">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">iPhone のカレンダーの予定を、ファイルにするには</summary>
        <ul className="list-disc space-y-1 pl-5 pb-2">
          <li>iPhone のカレンダーには、ファイルに書き出す機能がありません。</li>
          <li>Mac があれば：カレンダーで、写したいカレンダーを選び、「ファイル」→「書き出す」。いちばん安全です。</li>
          <li>iCloud の「公開カレンダー」のリンクからも作れますが、オンのあいだは、リンクを知っている人ならだれでも見られます。使うなら、終わったらすぐにオフにしてください。</li>
          <li>同じ名前・同じ日・同じ時刻の予定がすでにあれば、取り込みません（2回読み込んでも増えません）。</li>
        </ul>
      </details>
      <input ref={inputRef} type="file" accept=".ics,text/calendar" aria-label="カレンダーのファイル（.ics）を選ぶ" onChange={(e) => void onFile(e.target.files?.[0])} className="block w-full text-[13px]" />
      {preview && (
        <div className="space-y-2 rounded-xl border border-line bg-surface px-3 py-2 text-[13px]">
          <p className="font-semibold">「{preview.name}」</p>
          <ul className="list-disc pl-5">
            <li>取り込む予定：{preview.add}件</li>
            {preview.duplicates > 0 && <li>すでにある予定（取り込まない）：{preview.duplicates}件</li>}
            {preview.parsed.skipped > 0 && <li>日付が読めず、飛ばした予定：{preview.parsed.skipped}件</li>}
            {preview.parsed.repeatDropped > 0 && <li>繰り返しを写せず、最初の回だけにした予定：{preview.parsed.repeatDropped}件（メモに書いています）</li>}
            {preview.parsed.otherTimezone > 0 && <li>日本以外の時間帯の予定：{preview.parsed.otherTimezone}件（時刻はそのまま写します）</li>}
          </ul>
          <Button className="w-full" onClick={run} disabled={busy || preview.add === 0}>
            {preview.add === 0 ? "取り込む予定はありません" : `${preview.add}件を取り込む`}
          </Button>
        </div>
      )}
    </div>
  );
}
