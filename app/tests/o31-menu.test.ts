import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MENU_FAV_MAX, MENU_RECENT_MAX, parseMenuFav, parseMenuRecent, pushRecent, toggleMenuFav } from "@/lib/menuPrefs";
import { GROUPS } from "@/lib/menuGroups";
import { HIDEABLE_MENU } from "@/lib/menuHidden";

// o31 F003（T003）・C003：すべての機能のお気に入り・最近・非表示と削除の分離。期待値は o31 01・02 から手で作った
const known = ["/study", "/goals", "/trips", "/notes", "/tasks", "/history", "/recurring"];

describe("o31 T003 お気に入りと最近", () => {
  it("お気に入りは星で足す・外す。上限まで。知らない道筋・消えた機能は読むときに除く", () => {
    let f: string[] = [];
    f = toggleMenuFav(f, "/study");
    f = toggleMenuFav(f, "/goals");
    expect(f).toEqual(["/study", "/goals"]);
    expect(toggleMenuFav(f, "/study")).toEqual(["/goals"]);
    const full = Array.from({ length: MENU_FAV_MAX }, (_, i) => `/x${i}`);
    expect(toggleMenuFav(full, "/y")).toEqual(full);
    expect(parseMenuFav(JSON.stringify(["/study", "/nope", "/study", 3, "goals"]), known)).toEqual(["/study"]);
    expect(parseMenuFav("{壊れ", known)).toEqual([]);
  });
  it("教材（勉強）を隠したら、お気に入りから外れる（記録は消さない。表示だけ）", () => {
    const visible = known.filter((h) => h !== "/study");
    expect(parseMenuFav(JSON.stringify(["/study", "/goals"]), visible)).toEqual(["/goals"]);
    // 隠せる機能の一覧に勉強がある（非表示は設定から戻せる）
    expect(HIDEABLE_MENU.some((m) => m.href === "/study")).toBe(true);
  });
  it("最近は新しい順に最大5件。同じ画面は1回。メニューに無い画面は控えない。詳細の道筋は機能に丸める", () => {
    let r: string[] = [];
    for (const p of ["/study", "/goals", "/study", "/trips/abc", "/settings", "/notes", "/tasks", "/history"]) r = pushRecent(r, p, known);
    expect(r).toEqual(["/history", "/tasks", "/notes", "/trips", "/study"]);
    expect(r.length).toBe(MENU_RECENT_MAX);
    expect(parseMenuRecent(JSON.stringify(["/study", "/zzz"]), known)).toEqual(["/study"]);
  });
  it("一覧の道筋は、どれも実在する画面", () => {
    for (const i of GROUPS.flatMap((g) => g.items)) {
      const path = i.href.split("#")[0];
      const file = join(__dirname, "..", "src", "app", path === "/" ? "" : path, "page.tsx");
      expect(() => readFileSync(file), i.href).not.toThrow();
    }
  });
  it("自分用は PersonalMenu、公開版は今までの一覧（C025）。言葉はやること・勉強・検索", () => {
    const page = readFileSync(join(__dirname, "..", "src", "app", "menu", "page.tsx"), "utf8");
    expect(page).toContain("if (IS_PERSONAL) return <PersonalMenu />;");
    const labels = GROUPS.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).toEqual(expect.arrayContaining(["やること", "勉強", "検索"]));
    expect(labels).not.toEqual(expect.arrayContaining(["タスク"]));
  });
});
