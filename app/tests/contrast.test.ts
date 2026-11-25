import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// v22 UI12：色の実測（WCAG のコントラスト比）。通常の文字は 4.5:1、大きい文字・UI の境界は 3:1 を目標にする。
// 測った値は、結果の欄（console）に出る。目標に届かないものは「既知」の欄に分け、黙って合格にしない（何が足りないかを記録する）
const css = readFileSync(join(__dirname, "..", "src", "app", "globals.css"), "utf8");
const root = css.slice(0, css.indexOf("}", css.indexOf(":root")));
const color = (name: string): string => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(root);
  if (!m) throw new Error(`色が見つかりません：${name}`);
  return m[1];
};
const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
export const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("色のコントラスト比（実測）", () => {
  const bg = color("bg");
  const surface = color("surface");
  const pairs: [string, string, string][] = [
    ["本文（ink）× 背景", color("ink"), bg],
    ["本文（ink）× カード", color("ink"), surface],
    ["補足（ink-2）× 背景", color("ink-2"), bg],
    ["補足（ink-2）× カード", color("ink-2"), surface],
    ["ブランド（brand）× カード", color("brand"), surface],
    ["ボタン文字（brand-ink）× ブランド", color("brand-ink"), color("brand")],
    ["支出（expense）× カード", color("expense"), surface],
    ["収入（income）× カード", color("income"), surface],
    ["予定（event）× カード", color("event"), surface],
    ["警告（warn）× カード", color("warn"), surface],
    ["危険（danger）× カード", color("danger"), surface],
  ];
  it.each(pairs)("通常の文字 4.5:1 以上：%s", (_n, fg, back) => {
    const r = ratio(fg, back);
    console.log(`${_n}: ${r.toFixed(2)}:1`);
    expect(r).toBeGreaterThanOrEqual(4.5);
  });
  // Q28（2026-11-25 平尾さんの決定「濃くする」）：薄い補足（ink-3）と、薄い地の上の支出・予定の文字も、4.5:1 を満たす
  it.each([
    ["薄い補足（ink-3）× カード", color("ink-3"), surface],
    ["薄い補足（ink-3）× 背景", color("ink-3"), bg],
    ["支出 × 支出の薄い地", color("expense"), color("expense-soft")],
    ["予定 × 予定の薄い地", color("event"), color("event-soft")],
    ["収入 × 収入の薄い地", color("income"), color("income-soft")],
    ["ブランド × ブランドの薄い地", color("brand"), color("brand-soft")],
    ["警告 × 警告の薄い地", color("warn"), color("warn-soft")],
  ])("4.5:1 以上（Q28 で濃くした）：%s", (_n, fg, back) => {
    const r = ratio(fg, back);
    console.log(_n + ": " + r.toFixed(2) + ":1");
    expect(r).toBeGreaterThanOrEqual(4.5);
  });
  it("補足の階層：本文（ink）＞ 補足（ink-2）＞ 薄い補足（ink-3）の順に、濃さが違う", () => {
    expect(ratio(color("ink"), surface)).toBeGreaterThan(ratio(color("ink-2"), surface));
    expect(ratio(color("ink-2"), surface)).toBeGreaterThan(ratio(color("ink-3"), surface));
  });
  it("UI の境界（線）は、背景とのコントラストが低い（装飾の線。入力欄の境界などは別に確認が要る）", () => {
    const r = ratio(color("line"), surface);
    console.log(`境界の線（line）× カード: ${r.toFixed(2)}:1`);
    expect(r).toBeLessThan(3);
  });
});
