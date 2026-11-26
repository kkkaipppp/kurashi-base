import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// o31 01・o30 D009（T009）：自分用の設定は6つの区切り。今ある設定は全部どこかに出る（消さない）。公開版は今までの並び
const s = readFileSync(join(__dirname, "..", "src", "app", "settings", "page.tsx"), "utf8");
// 設定の画面の本文（見出しのあと）で、自分用と公開版に分かれる所
const at = s.indexOf("{PERSONAL_BUILD ? (", s.indexOf('<PageHeader title="設定" />'));
// 改行は CRLF のこともあるので、閉じかっこの形だけで探す
const split = s.indexOf(") : (", s.indexOf("{blkAbout}", at));
const personal = s.slice(at, split);
const pub = s.slice(split, s.indexOf("</main>", split));

describe("o31 T009 設定の6つの区切り", () => {
  it("一般・表示・家計簿・外部連携・データ管理・アプリ情報の順", () => {
    const order = ["一般", "表示", "家計簿", "外部連携", "データ管理", "アプリ情報"].map((g) => personal.indexOf(`>${g}</GroupLabel>`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it("今ある設定のまとまりは、自分用でも公開版でも全部出る（それぞれ1回）", () => {
    for (const b of ["blkBudget", "blkHome", "blkCategories", "blkConnect", "blkData", "blkAbout"]) {
      expect(personal.split(`{${b}}`).length - 1, `自分用 ${b}`).toBe(1);
      expect(pub.split(`{${b}}`).length - 1, `公開版 ${b}`).toBe(1);
    }
    for (const c of ["<NavSettingsCard />", "<StartScreenCard />", "<MenuVisibilityCard />"]) expect(personal).toContain(c);
  });
  it("飛び先（バックアップ・予算・カテゴリ・すべて削除・下のメニュー）は、ページの中に1つずつある", () => {
    for (const id of ['id="backup"', 'id="budget"', 'id="categories"', 'id="danger"']) expect(s.split(id).length - 1, id).toBe(1);
    const nav = readFileSync(join(__dirname, "..", "src", "components", "NavSettingsCard.tsx"), "utf8");
    expect(nav).toContain('id="nav"');
  });
});
