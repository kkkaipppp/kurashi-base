import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { HIDEABLE_MENU, cleanMenuHidden } from "@/lib/menuHidden";
import { validateAppData } from "@/lib/schema";
import { summarizeMonth } from "@/lib/aggregate";
import { searchAll } from "@/lib/search";

// NEXT v21 X16・D11：非表示と削除を区別（隠しても記録は残る）。基本の家計と予定は隠せない
const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");
const now = "2026-11-25T00:00:00.000Z";

describe("メニューに出す機能", () => {
  it("隠せるのはメニューにある機能だけ。基本（取引履歴・固定費・設定・使い方）は隠せない", () => {
    const menu = src("app/menu/page.tsx");
    for (const m of HIDEABLE_MENU) expect(menu, m.href).toContain(`href: "${m.href}"`);
    const hrefs = HIDEABLE_MENU.map((m) => m.href);
    for (const core of ["/history", "/recurring", "/settings", "/guide", "/settings#backup"]) expect(hrefs).not.toContain(core);
  });
  it("知らない道筋・重複は無視する", () => {
    expect(cleanMenuHidden(["/trips", "/trips", "/nope", "/history"])).toEqual(["/trips"]);
    expect(cleanMenuHidden(undefined)).toEqual([]);
  });
  it("全部隠しても、記録は消えず、集計・検索・バックアップに残る。保存の形は任意の項目を足すだけ", () => {
    const d = emptyData(now);
    d.trips = [{ id: "t", title: "京都旅行", startDate: "2026-12-01", endDate: "2026-12-02", destination: "", budget: null, note: "", createdAt: now, updatedAt: now }];
    d.transactions = [{ id: "a", type: "expense", date: "2026-11-02", amount: 300, currency: "JPY", categoryId: "exp-1", merchant: "A", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now }];
    d.prefs.menuHidden = HIDEABLE_MENU.map((m) => m.href);
    expect(summarizeMonth(d.transactions, "2026-11").expense).toBe(300);
    expect(searchAll(d, "京都")[0].kind).toBe("trip");
    const r = validateAppData(JSON.parse(JSON.stringify(d)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.prefs.menuHidden).toHaveLength(HIDEABLE_MENU.length);
    const bad = JSON.parse(JSON.stringify(d));
    bad.prefs.menuHidden = "x";
    expect(validateAppData(bad).ok).toBe(false);
    expect(validateAppData(JSON.parse(JSON.stringify(emptyData(now)))).ok).toBe(true); // 項目がない今までのデータも読める
  });
  it("メニューは自分用だけ隠す（公開版は今のまま）。設定に選ぶカードがある", () => {
    expect(src("app/menu/page.tsx")).toContain("const hidden = IS_PERSONAL ? new Set(data.prefs.menuHidden ?? []) : null;");
    expect(src("app/settings/page.tsx")).toContain("const MenuVisibilityCard = PERSONAL_BUILD ? dynamic(");
  });
});
