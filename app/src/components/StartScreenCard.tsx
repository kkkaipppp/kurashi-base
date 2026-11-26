"use client";

import { useState } from "react";
import { Card, SectionTitle } from "./ui";
import { useUI } from "./UIContext";
import { DEFAULT_START, START_KEY, START_SCREENS, parseStart, type StartScreen } from "@/lib/startScreen";

/** 自分用：起動時の画面を選ぶ（o29 起動設定。端末ごとの表示の設定で、記録ではない） */
export function StartScreenCard() {
  const ui = useUI();
  // 画面はデータの読み込みのあとに出る（AppShell の Gate）ので、最初の値をここで読む。読めないときは既定
  const [value, setValue] = useState<StartScreen>(() => {
    try {
      return typeof window === "undefined" ? DEFAULT_START : parseStart(localStorage.getItem(START_KEY));
    } catch {
      return DEFAULT_START;
    }
  });
  const choose = (v: StartScreen) => {
    try {
      localStorage.setItem(START_KEY, v);
      setValue(v);
      ui.toast("保存しました");
    } catch {
      ui.toast("保存できませんでした。ブラウザの保存の設定を確かめてください", "error");
    }
  };
  return (
    <Card>
      <SectionTitle>起動時の画面</SectionTitle>
      <div role="radiogroup" aria-label="起動時の画面" className="divide-y divide-line">
        {START_SCREENS.map((s) => (
          <label key={s.id} className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
            <span>{s.label}</span>
            <input type="radio" name="start-screen" className="size-5 accent-brand" checked={value === s.id} onChange={() => choose(s.id)} />
          </label>
        ))}
      </div>
    </Card>
  );
}
