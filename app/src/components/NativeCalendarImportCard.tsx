"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "./ui";
import { useUI } from "./UIContext";
import { useData, useStore } from "@/lib/store";
import { newId } from "@/lib/defaults";
import { todayStr } from "@/lib/date";
import { isNativeApp } from "@/lib/platform";
import { applyIcsImport, planIcsImport } from "@/lib/icsImport";
import { NATIVE_RANGES, calendarKey, nativeRange, nativeToParsed, summarizeCalendars, type NativeCalendarItem, type NativeRangeKey } from "@/lib/nativeCalendar";

/**
 * iPhone のカレンダーから予定を取り込む（A5。自分用アプリの中だけ。2026-11-26 平尾さん「全部おすすめで」）。
 * 読むのは押したときだけ・端末の中だけ。1回の写しで、そのあとの変更はつながらない。
 * 取り込む前に、カレンダーごとの件数と、足す件数・すでにある件数を見せる。取り消しの控えを残して保存する
 */
type Bridge = { nativePromise?: (plugin: string, method: string, options?: object) => Promise<Record<string, unknown>> };
const readNative = (from: string, to: string) => {
  const cap = (window as unknown as { Capacitor?: Bridge }).Capacitor;
  if (!cap?.nativePromise) return Promise.reject(new Error("iPhone アプリの中でだけ使えます"));
  return cap.nativePromise("WidgetBridge", "readCalendarEvents", { from, to }) as Promise<{ items?: NativeCalendarItem[]; overLimit?: number }>;
};

const noSubscribe = () => () => {};

export function NativeCalendarImportCard() {
  const data = useData();
  const store = useStore();
  const ui = useUI();
  const [range, setRange] = useState<NativeRangeKey>("1y");
  const [loaded, setLoaded] = useState<{ items: NativeCalendarItem[]; overLimit: number; from: string; to: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // 組み立てのときの下書き（サーバー側）では false、画面では iPhone アプリの中かどうか
  const native = useSyncExternalStore(noSubscribe, isNativeApp, () => false);

  const calendars = useMemo(() => (loaded ? summarizeCalendars(loaded.items) : []), [loaded]);
  const plan = useMemo(() => {
    if (!loaded) return null;
    const parsed = nativeToParsed(loaded.items, selected, loaded.overLimit);
    return { parsed, ...planIcsImport(store.data ?? data, parsed) };
  }, [loaded, selected, store.data, data]);

  if (!native) return null;

  const read = async () => {
    if (busy) return;
    setBusy(true);
    setLoaded(null);
    try {
      const { from, to } = nativeRange(range, todayStr());
      const r = await readNative(from, to);
      const items = Array.isArray(r.items) ? r.items : [];
      setLoaded({ items, overLimit: Number(r.overLimit) || 0, from, to });
      setSelected(new Set(summarizeCalendars(items).filter((c) => c.defaultOn).map(calendarKey)));
      if (items.length === 0) ui.toast("この期間に、ほかのカレンダーの予定はありません");
    } catch (e) {
      ui.toast(e instanceof Error && e.message ? e.message : "カレンダーを読めませんでした", "error");
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!loaded || busy) return;
    setBusy(true);
    try {
      // 作るときのデータ（base）を渡す。確認のあいだに変わっていたら、保存しない（.ics の取り込みと同じ）
      const base = store.data ?? data;
      const p = planIcsImport(base, nativeToParsed(loaded.items, selected, loaded.overLimit));
      if (p.add.length === 0) {
        setLoaded(null);
        return ui.toast("取り込む予定はありません（すべて、すでにあります）");
      }
      const next = applyIcsImport(base, p.add, () => newId("ev"), new Date().toISOString());
      const r = await store.replaceAll(next, `iPhone のカレンダーから予定を${p.add.length}件取り込む`, base);
      if (!r.ok) return ui.toast(r.error, "error");
      ui.toast(`予定を${p.add.length}件取り込みました（設定の「直前の操作を取り消す」で戻せます）`);
      setLoaded(null);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (k: string) => {
    const s = new Set(selected);
    if (s.has(k)) s.delete(k);
    else s.add(k);
    setSelected(s);
  };

  return (
    <div className="space-y-2 rounded-xl bg-surface-2 px-3 py-3">
      <p className="text-[14px] font-semibold">iPhone のカレンダーから取り込む</p>
      <p className="text-[13px] text-ink-3">
        iPhone のカレンダーの予定を、1回だけ写します（そのあとの変更は、つながりません）。押したときだけ、この iPhone の中で読みます。外へは送りません。
      </p>
      <label htmlFor="native-cal-range" className="block text-[13px] font-semibold text-ink-2">
        読む期間
      </label>
      <select id="native-cal-range" value={range} onChange={(e) => {
          // 期間を変えたら、前に読んだ結果は消す（前の期間のまま取り込まないように。点検 低-5）
          setRange(e.target.value as NativeRangeKey);
          setLoaded(null);
        }} className="block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-[14px]">
        {NATIVE_RANGES.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
          </option>
        ))}
      </select>
      <Button variant="secondary" className="w-full" onClick={read} disabled={busy}>
        {busy && !loaded ? "読んでいます…" : "iPhone のカレンダーを読む"}
      </Button>
      {loaded && loaded.items.length > 0 && plan && (
        <div className="space-y-2 rounded-xl border border-line bg-surface px-3 py-2 text-[13px]">
          <fieldset>
            <legend className="font-semibold">取り込むカレンダー</legend>
            <ul className="mt-1">
              {calendars.map((c) => (
                <li key={calendarKey(c)}>
                  <label className="flex min-h-11 items-center gap-2">
                    <input type="checkbox" className="size-5" checked={selected.has(calendarKey(c))} onChange={() => toggle(calendarKey(c))} />
                    <span className="min-w-0 flex-1 break-words">
                      {c.name}
                      {c.type === "birthday" ? "（誕生日）" : c.type === "subscription" ? "（照会）" : ""}
                    </span>
                    <span className="num shrink-0 text-ink-3">{c.count}件</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <ul className="list-disc pl-5">
            <li>取り込む予定：{plan.add.length}件</li>
            {plan.duplicates > 0 && <li>すでにアプリにある予定（取り込まない）：{plan.duplicates}件</li>}
            {plan.inFileDuplicates > 0 && <li>同じ名前・日・時刻が重なった予定（1つだけ取り込む）：{plan.inFileDuplicates}件</li>}
            {plan.parsed.skipped > 0 && <li>日付が読めず、飛ばした予定：{plan.parsed.skipped}件</li>}
            {plan.parsed.overLimit > 0 && <li>多すぎて読まなかった予定：{plan.parsed.overLimit}件（期間を短くしてください）</li>}
          </ul>
          <p className="text-[12px] text-ink-3">繰り返しの予定は、期間の中の回を1つずつ写します。</p>
          <Button className="w-full" onClick={run} disabled={busy || plan.add.length === 0}>
            {plan.add.length === 0 ? "取り込む予定はありません" : `${plan.add.length}件を取り込む`}
          </Button>
        </div>
      )}
    </div>
  );
}
