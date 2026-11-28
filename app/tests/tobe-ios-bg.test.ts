import { describe, expect, it } from "vitest";
import config from "../capacitor.config";

// 平尾さん 2026-11-28：iPhone アプリの下（ホームバーの所）が黒く空いて見える → アプリの背景を下のボタンの並び（白）と同じにする
describe("iPhone アプリの背景", () => {
  it("背景は白。2026-11-28 から画面いっぱいに描き（contentInset never）、上下の余白は画面の側で取る（下のボタンの並びがスクロールで動かない）", () => {
    expect(config.ios?.backgroundColor).toBe("#ffffff");
    expect(config.ios?.contentInset).toBe("never");
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain('viewportFit: "cover"');
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("--sat: calc(env(safe-area-inset-top, 0px) / var(--z));");
    expect(css).toContain("--sab: calc(env(safe-area-inset-bottom, 0px) / var(--z));");
    expect(readFileSync("src/components/PersonalShell.tsx", "utf8")).toContain("pb-[var(--sab)]");
    expect(readFileSync("src/components/ui.tsx", "utf8")).toContain("sticky top-[var(--sat)]");
    expect(readFileSync("src/components/AppShell.tsx", "utf8")).toContain("pt-[var(--sat)] pb-[calc(7rem+var(--sab))]");
  });
});

// 平尾さん 2026-11-28 の写真：初めの倍率 0.88 では iPhone で縮まず、横幅だけ広がって右が切れた → 倍率は 1、縮めるのは zoom
import { readFileSync } from "node:fs";
describe("自分用の画面の縮め方", () => {
  it("倍率は 1（右が切れない）。自分用は zoom 0.88 と最大の倍率 1（入力で自動の拡大をしない）", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain("initialScale: 1,");
    expect(layout).not.toMatch(/initialScale: IS_PERSONAL/);
    expect(layout).toContain("...(IS_PERSONAL ? { maximumScale: 1, ");
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/html\[data-edition="personal"\] \{\s*zoom: 0\.88;/);
  });
  it("入力のシートの高さは zoom で割る（割らないと下にすき間が出る）", () => {
    expect(readFileSync("src/components/Sheet.tsx", "utf8")).toContain("setVp({ top: v.offsetTop / z, height: v.height / z })");
  });
});
