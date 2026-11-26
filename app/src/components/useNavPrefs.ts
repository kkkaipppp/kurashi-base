"use client";

import { useCallback, useSyncExternalStore } from "react";
import { ADD_FAV_KEY, DEFAULT_ADD_FAV, DEFAULT_NAV, NAV_KEY, parseAddFav, parseNav, serializeNav, validateNav, type AddKindId, type NavId } from "@/lib/navPrefs";

/** 下のメニューと追加のお気に入り（端末ごとの表示の設定）を読む・書く。設定の画面と下のメニューが同じ値を見る */
const EVENT = "kb-nav-prefs";

function read(key: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

// 文字列で比べる（同じ中身なら同じ値を返し、無駄な描き直しをしない）
const navSnap = () => read(NAV_KEY) ?? "";
const favSnap = () => read(ADD_FAV_KEY) ?? "";
const serverSnap = () => "";

export function useNavPrefs() {
  const navRaw = useSyncExternalStore(subscribe, navSnap, serverSnap);
  const favRaw = useSyncExternalStore(subscribe, favSnap, serverSnap);
  const nav: NavId[] = navRaw ? parseNav(navRaw) : [...DEFAULT_NAV];
  const fav: AddKindId[] = favRaw ? parseAddFav(favRaw) : [...DEFAULT_ADD_FAV];

  /** 保存する。検査に通らなければ保存せず理由を返す。書けなければ false の理由 */
  const saveNav = useCallback((ids: string[]): { ok: true } | { ok: false; error: string } => {
    const v = validateNav(ids);
    if (!v.ok) return v;
    try {
      localStorage.setItem(NAV_KEY, serializeNav(v.ids));
    } catch {
      return { ok: false, error: "保存できませんでした。ブラウザの保存の設定を確かめてください" };
    }
    window.dispatchEvent(new Event(EVENT));
    return { ok: true };
  }, []);

  const saveFav = useCallback((ids: AddKindId[]): boolean => {
    try {
      localStorage.setItem(ADD_FAV_KEY, JSON.stringify(ids.slice(0, 4)));
    } catch {
      return false;
    }
    window.dispatchEvent(new Event(EVENT));
    return true;
  }, []);

  /** 初期の構成に戻す（表示の設定だけ。記録は変えない） */
  const resetNav = useCallback((): boolean => {
    try {
      localStorage.removeItem(NAV_KEY);
      localStorage.removeItem(ADD_FAV_KEY);
    } catch {
      return false;
    }
    window.dispatchEvent(new Event(EVENT));
    return true;
  }, []);

  return { nav, fav, saveNav, saveFav, resetNav };
}
