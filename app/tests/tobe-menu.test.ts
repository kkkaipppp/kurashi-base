import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hubCategories, moveCategory, orderCategories, visibleItems } from "@/lib/menuHub";
import { HIDEABLE_MENU, cleanMenuHidden } from "@/lib/menuHidden";

// To-Be 2026-11-27 02「メニュー: 計画、目標、資産、契約・固定費、健康、メモ、書類。3列アイコン、短い名称、編集」。期待値は 02 から手で作った
describe("メニューの7分類", () => {
  it("並びと名前", () => {
    expect(hubCategories().map((c) => c.label)).toEqual(["計画", "目標", "資産", "契約・固定費", "健康", "メモ", "書類"]);
  });
  it("専門の画面は分類の中から行ける（旅行・資格・NISA・固定費を落とさない。03「独立ページの削除は機能廃止ではない」）", () => {
    const hrefs = hubCategories().flatMap((c) => c.items.map((i) => i.href));
    for (const h of ["/plans", "/trips", "/goals", "/study", "/assets", "/contracts", "/recurring", "/health", "/notes", "/documents"]) expect(hrefs).toContain(h);
  });
  it("隠した画面は分類の中から消え、中身が0の分類は出さない（記録は消えない。A05）", () => {
    const health = hubCategories().find((c) => c.key === "health")!;
    expect(visibleItems(health, new Set(["/health"]))).toEqual([]);
    const contract = hubCategories().find((c) => c.key === "contract")!;
    // 固定費は家計の基本なので隠せない。契約を隠しても固定費は残る
    expect(visibleItems(contract, new Set(cleanMenuHidden(["/contracts", "/recurring"]))).map((i) => i.href)).toEqual(["/recurring"]);
    expect(HIDEABLE_MENU.map((m) => m.href)).toContain("/plans");
  });
});

describe("並び替え（端末ごとの表示の設定）", () => {
  const cats = hubCategories();
  it("保存した並びを先に、知らない分類は捨て、足りない分類は元の順で後ろへ", () => {
    expect(orderCategories(cats, JSON.stringify(["memo", "zzz", "plan"])).map((c) => c.key)).toEqual(["memo", "plan", "goal", "asset", "contract", "health", "document"]);
  });
  it("壊れた値・空は元の並び", () => {
    expect(orderCategories(cats, "{oops").map((c) => c.key)).toEqual(cats.map((c) => c.key));
    expect(orderCategories(cats, null).map((c) => c.key)).toEqual(cats.map((c) => c.key));
  });
  it("1つ上・下へ。端では動かない", () => {
    expect(moveCategory(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveCategory(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveCategory(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
  });
});

describe("画面", () => {
  it("自分用のメニューは3列で、お気に入り・最近の一覧を出さない。検索・設定・使い方がある", () => {
    const src = readFileSync("src/components/PersonalMenu.tsx", "utf8");
    expect(src).toContain("grid-cols-3");
    expect(src).not.toContain("MENU_FAV_KEY");
    expect(src).not.toContain("最近開いた機能");
    for (const w of ['label: "検索"', 'label: "設定"', 'label: "使い方"']) expect(src).toContain(w);
  });
  it("計画の画面は公開版の組み立てに入れない（直接開いても「この画面は使えません」）", () => {
    const page = readFileSync("src/app/plans/page.tsx", "utf8");
    expect(page).toMatch(/process\.env\.NEXT_PUBLIC_KB_EDITION === "personal" \? dynamic\(/);
    expect(page).toContain("<NotAvailable />");
  });
});
