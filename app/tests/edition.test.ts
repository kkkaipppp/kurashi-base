import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FEATURE_EDITIONS } from "@/lib/edition";

// 2026-11-24 平尾さんの方針：自分用（personal）と公開用（public）を、組み立てるときのスイッチで分ける
describe("版（personal / public）", () => {
  it("public で有効な機能は、personal でも有効（自分用で先に使ってから公開する）", () => {
    for (const [name, v] of Object.entries(FEATURE_EDITIONS)) {
      if (v.public) expect(v.personal, name).toBe(true);
    }
  });
  it("指定がないとき（Vercel）は public。パソコンでの試しとアプリ用の書き出しは personal", () => {
    const s = readFileSync(join(__dirname, "..", "next.config.ts"), "utf8");
    expect(s).toContain('process.env.NODE_ENV === "development" || process.env.KB_EXPORT === "1"');
    expect(s).toContain(': "public";');
    expect(s).toContain("NEXT_PUBLIC_KB_EDITION: edition");
  });
  it("画面の設定では切り替えない（版を変える入力や保存がない）", () => {
    const settings = readFileSync(join(__dirname, "..", "src", "app", "settings", "page.tsx"), "utf8");
    // 版の値を読むだけ（公開版から自分用の部品を外す比較）はよい。版を変える入力・保存だけを禁じる
    expect(settings).not.toMatch(/setEdition|setItem[(][^)]*EDITION/);
    const ed = readFileSync(join(__dirname, "..", "src", "lib", "edition.ts"), "utf8");
    expect(ed).not.toMatch(/localStorage|useState/);
  });
});
