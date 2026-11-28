/**
 * 表示の大きさと色（To-Be 02 設定「文字サイズ/テーマ」。2026-11-28。自分用）。
 * 端末ごとの表示の設定（記録ではない。バックアップには入らない）。html の data-text・data-theme に付け、globals.css で変える。
 * 暗い色（ダークモード）は、まだ作っていない（全部の画面の色の確かめが要るため）
 */
export const APPEARANCE_KEY = "kurashi-base:ui:appearance:v1";

export type TextSize = "normal" | "large" | "xlarge";
export type Theme = "white" | "warm" | "contrast";
export interface Appearance {
  text: TextSize;
  theme: Theme;
}
export const DEFAULT_APPEARANCE: Appearance = { text: "normal", theme: "white" };

export const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: "normal", label: "標準" },
  { value: "large", label: "大きめ" },
  { value: "xlarge", label: "とても大きい" },
];
export const THEMES: { value: Theme; label: string }[] = [
  { value: "white", label: "白" },
  { value: "warm", label: "生成り（やわらかい白）" },
  { value: "contrast", label: "くっきり（文字と線を濃く）" },
];

export function parseAppearance(raw: string | null | undefined): Appearance {
  try {
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== "object") return DEFAULT_APPEARANCE;
    const o = v as Record<string, unknown>;
    return {
      text: TEXT_SIZES.some((t) => t.value === o.text) ? (o.text as TextSize) : "normal",
      theme: THEMES.some((t) => t.value === o.theme) ? (o.theme as Theme) : "white",
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function readAppearance(): Appearance {
  try {
    return parseAppearance(localStorage.getItem(APPEARANCE_KEY));
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/** 画面に当てる（標準・白は属性を外す） */
export function applyAppearance(a: Appearance, root: HTMLElement = document.documentElement): void {
  if (a.text === "normal") root.removeAttribute("data-text");
  else root.setAttribute("data-text", a.text);
  if (a.theme === "white") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", a.theme);
}

export function saveAppearance(a: Appearance): boolean {
  applyAppearance(a);
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}
