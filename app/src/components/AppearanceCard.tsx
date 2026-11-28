"use client";

import { useEffect, useState } from "react";
import { Card, Field, inputCls } from "./ui";
import { useUI } from "./UIContext";
import { DEFAULT_APPEARANCE, TEXT_SIZES, THEMES, applyAppearance, readAppearance, saveAppearance, type Appearance } from "@/lib/appearance";

/** 起動のときに、端末に控えた表示の大きさと色を当てる（自分用の殻から呼ぶ） */
export function AppearanceSync() {
  useEffect(() => {
    applyAppearance(readAppearance());
  }, []);
  return null;
}

/** 設定の「表示」：文字の大きさと色（この端末だけ） */
export function AppearanceCard() {
  const ui = useUI();
  // 設定の画面は記録を読み込んだあと（ブラウザの中）で描くので、初めから端末の控えを読む
  const [a, setA] = useState<Appearance>(() => (typeof window === "undefined" ? DEFAULT_APPEARANCE : readAppearance()));
  const change = (next: Appearance) => {
    setA(next);
    if (!saveAppearance(next)) ui.toast("この端末に控えられませんでした。次に開いたときは元に戻ります", "error");
  };
  return (
    <Card>
      <h2 className="text-[15px] font-bold">文字の大きさと色</h2>
      <p className="mb-3 text-[13px] text-ink-3">この端末の表示だけが変わります（記録やバックアップには入りません）。iPhone の「設定」の文字の大きさとは別です。</p>
      <div className="grid grid-cols-1 gap-3">
        <Field label="文字の大きさ（画面全体）" htmlFor="ap-text">
          <select id="ap-text" value={a.text} onChange={(e) => change({ ...a, text: e.target.value as Appearance["text"] })} className={inputCls}>
            {TEXT_SIZES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="色" htmlFor="ap-theme">
          <select id="ap-theme" value={a.theme} onChange={(e) => change({ ...a, theme: e.target.value as Appearance["theme"] })} className={inputCls}>
            {THEMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Card>
  );
}
