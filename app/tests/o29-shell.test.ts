import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_START, parseStart, startRedirect } from "@/lib/startScreen";
import { ratio } from "./contrast.test";

// o29（2026-11-27）：自分用の下のタブ（A 案）・起動時の画面・画面ごとの＋・自分用の色。期待値は 01_製品仕様・02_画面契約・05_矛盾解消から手で作った
describe("o29 起動時の画面", () => {
  it("初期はカレンダー。知らない値・空もカレンダー（o29 01：初期はカレンダー）", () => {
    expect(DEFAULT_START).toBe("calendar");
    expect([parseStart(null), parseStart(""), parseStart("x"), parseStart("report")]).toEqual(["calendar", "calendar", "calendar", "report"]);
  });
  it("移るのは、このタブで最初に / をクエリなしで開いたときだけ。ホームを選んでいれば移らない", () => {
    expect(startRedirect("/", "", "calendar", false)).toBe("/calendar");
    expect(startRedirect("/", "", "report", false)).toBe("/report");
    expect(startRedirect("/", "", "tasks", false)).toBe("/tasks");
    expect(startRedirect("/", "", "home", false)).toBeNull();
    // 2回目（ホームを開き直した）は移らない＝ホームは互換の入口として開ける（C001）
    expect(startRedirect("/", "", "calendar", true)).toBeNull();
    // ウィジェット・通知の ?add= などは、そのまま
    expect(startRedirect("/", "?add=expense", "calendar", false)).toBeNull();
    expect(startRedirect("/settings", "", "calendar", false)).toBeNull();
  });
});

// 「o29 下のタブと＋」（中央の＋・固定の4つのタブ・画面ごとの＋）の試験は、o31 C001 で仕様が撤回されたので、
// o31 の右端の「追加」と下のメニューの試験（tests/o31-nav.test.ts）に置き換えた（2026-11-27。旧仕様の期待値を新仕様に合わせて変えたのではない）
describe("o29 自分用の色（白・#222・#e5e5e5・#254e85）", () => {
  const css = readFileSync(join(__dirname, "..", "src", "app", "globals.css"), "utf8");
  const block = css.slice(css.indexOf(':root[data-edition="personal"]'));
  const c = (n: string) => new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`).exec(block.slice(0, block.indexOf("}")))![1];
  it("01_製品仕様の暫定の色", () => {
    expect([c("bg"), c("ink"), c("line"), c("brand")]).toEqual(["#ffffff", "#222222", "#e5e5e5", "#254e85"]);
  });
  it("文字は 4.5:1 以上（白い地）。操作の色の上の白い文字も 4.5:1 以上", () => {
    for (const n of ["ink", "ink-2", "ink-3", "brand"]) expect(ratio(c(n), c("bg"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(c("brand-ink"), c("brand"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(c("brand"), c("brand-soft"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(c("ink-3"), c("surface-2"))).toBeGreaterThanOrEqual(4.5);
  });
});
