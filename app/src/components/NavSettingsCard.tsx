"use client";

import { useState } from "react";
import { Button, Card, SectionTitle } from "./ui";
import { useUI } from "./UIContext";
import { useNavPrefs } from "./useNavPrefs";
import { ADD_FAV_MAX, ADD_KINDS, NAV_ITEMS, NAV_MAX, NAV_MIN, moveNav, navItem, type AddKindId, type NavId } from "@/lib/navPrefs";

/**
 * 自分用：下のメニューの編集と、「追加」のよく使う種類（o31 F001・F002、o30 D004）。
 * 並べ替えは上下のボタン（ドラッグはしない）。1〜4個。右端の「追加」は動かせない。
 * 初期に戻すのは表示の設定だけで、記録は変わらない
 */
export function NavSettingsCard() {
  const ui = useUI();
  const { nav, fav, saveNav, saveFav, resetNav } = useNavPrefs();
  const [error, setError] = useState<string | null>(null);
  const apply = (ids: NavId[]) => {
    const r = saveNav(ids);
    setError(r.ok ? null : r.error);
  };
  const rest = NAV_ITEMS.filter((n) => !nav.includes(n.id));
  const toggleFav = (k: AddKindId) => {
    const next = fav.includes(k) ? fav.filter((x) => x !== k) : [...fav, k];
    if (next.length === 0) return setError("よく使う種類は1つ以上選んでください");
    if (next.length > ADD_FAV_MAX) return setError(`よく使う種類は${ADD_FAV_MAX}つまでです`);
    setError(saveFav(next) ? null : "保存できませんでした。ブラウザの保存の設定を確かめてください");
  };
  return (
    <Card>
      <div id="nav" className="scroll-mt-20" />
      <SectionTitle>下のメニュー</SectionTitle>
      <p className="mb-2 text-[14px] text-ink-2">
        {NAV_MIN}〜{NAV_MAX}個まで選べます。右端の「追加」はいつも出ます。外した画面にも、上のメニュー（四角が4つのアイコン）から行けます。
      </p>
      <ol className="divide-y divide-line border-y border-line" aria-label="今の下のメニュー（左から順）">
        {nav.map((id, i) => (
          <li key={id} className="flex min-h-12 items-center gap-2">
            <span className="num w-6 text-[14px] text-ink-3">{i + 1}</span>
            <span className="flex-1 font-semibold">{navItem(id).label}</span>
            <button type="button" aria-label={`${navItem(id).label}を左へ`} disabled={i === 0} onClick={() => apply(moveNav(nav, i, -1))} className="inline-flex size-11 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 disabled:opacity-30">
              ↑
            </button>
            <button type="button" aria-label={`${navItem(id).label}を右へ`} disabled={i === nav.length - 1} onClick={() => apply(moveNav(nav, i, 1))} className="inline-flex size-11 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 disabled:opacity-30">
              ↓
            </button>
            <button type="button" aria-label={`${navItem(id).label}をメニューから外す`} disabled={nav.length <= NAV_MIN} onClick={() => apply(nav.filter((x) => x !== id))} className="min-h-11 rounded-lg px-2 text-[14px] font-semibold text-ink-2 hover:bg-surface-2 disabled:opacity-30">
              外す
            </button>
          </li>
        ))}
      </ol>
      {nav.length < NAV_MAX && rest.length > 0 && (
        <>
          <h3 className="mt-3 mb-1 text-[14px] font-semibold text-ink-3">メニューに足す</h3>
          <div className="flex flex-wrap gap-2">
            {rest.map((n) => (
              <button key={n.id} type="button" onClick={() => apply([...nav, n.id])} className="min-h-11 rounded-lg border border-line px-3 text-[14px] font-semibold hover:bg-surface-2">
                ＋ {n.label}
              </button>
            ))}
          </div>
        </>
      )}

      <h3 className="mt-5 mb-1 text-[15px] font-bold">「追加」でよく使う種類</h3>
      <p className="mb-1 text-[14px] text-ink-2">{ADD_FAV_MAX}つまで。「追加」の一覧の上に出ます（今の画面に合う種類は、いちばん上に出ます）。</p>
      <div className="grid grid-cols-2 gap-x-3">
        {ADD_KINDS.map((k) => (
          <label key={k.id} className="flex min-h-11 cursor-pointer items-center gap-2">
            <input type="checkbox" className="size-5 accent-brand" checked={fav.includes(k.id)} onChange={() => toggleFav(k.id)} />
            {k.label}
          </label>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[14px] font-medium text-danger">
          {error}
        </p>
      )}
      <div className="mt-4">
        <Button
          variant="secondary"
          onClick={async () => {
            if (!(await ui.confirm({ title: "下のメニューを初期に戻しますか？", body: "カレンダー・家計簿・やること・その他と、「追加」でよく使う種類を初めの状態に戻します。記録は変わりません。", ok: "初期に戻す" }))) return;
            setError(resetNav() ? null : "保存できませんでした。ブラウザの保存の設定を確かめてください");
          }}
        >
          初期に戻す
        </Button>
      </div>
    </Card>
  );
}
