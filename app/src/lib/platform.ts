"use client";

import { useEffect, useState } from "react";

/**
 * iPhone のアプリ（Capacitor）の中で動いているか。Web 版（Safari・ホーム画面のアイコン）では false。
 * アプリの中では window.Capacitor が用意されるので、パッケージを読み込まずに判定できる。
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/** 画面で使う版（最初の表示は Web 版として描き、読み込んだあとに切り替える。表示のずれを防ぐため） */
export function useIsNativeApp(): boolean {
  const [native, setNative] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNative(isNativeApp());
  }, []);
  return native;
}

/** 保存場所の説明（レビュー o1 の P03：アプリと Web 版で分ける） */
export const STORAGE_TEXT = {
  web: {
    short: "記録は、この端末のこのブラウザの中だけに保存されます。ホーム画面のアイコンと Safari でも、記録は別々です。",
    backup: "記録は、この端末のブラウザの中だけに保存されています。ブラウザのデータを消すと記録も消えるので、週に1回ほどファイルに書き出してください。",
    privacy: "記録は、この端末のブラウザの中にだけ保存します。外部のサーバーへは送りません。",
    lost: "ブラウザの履歴・Webサイトデータを消したときや、機種変更したときに、記録が消えることがあります。定期的にバックアップしてください。",
  },
  app: {
    short: "記録は、このアプリの中に保存されます。Safari やホーム画面のアイコン（Web 版）とは別です。",
    backup:
      "記録は、このアプリの中に保存されています。アプリを開いたとき・閉じたときに、その日のバックアップを「ファイル」アプリ（このiPhone内 → くらしベース → 自動バックアップ）に自動で書きます（1日1つ、14日分）。アプリを削除すると、自動バックアップも一緒に消えるので、ときどき「バックアップを書き出す」で iCloud Drive などにも保存してください。",
    privacy: "記録は、このアプリの中にだけ保存します。外部のサーバーへは送りません。",
    lost: "Safari の履歴を消しても、アプリの記録は消えません。アプリを削除すると、記録と自動バックアップが消えます。機種変更の前にはバックアップを書き出してください。",
  },
} as const;
