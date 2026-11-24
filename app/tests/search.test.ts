import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { FEATURE_EDITIONS } from "@/lib/edition";
import { parseQuery, searchAll } from "@/lib/search";
import type { AppData, Transaction } from "@/lib/types";

// NEXT v21 Phase 2：横断検索（合成データ）
const now = "2026-11-25T00:00:00.000Z";
const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({
  type: "expense", date: "2026-11-10", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now, ...o,
});
const data = (): AppData => {
  const d = emptyData(now);
  d.transactions = [tx({ id: "a", merchant: "スターバックス", amount: 650 }), tx({ id: "b", merchant: "ｽｰﾊﾟｰ", note: "京都旅行のおみやげ", amount: 1200, date: "2026-11-12" })];
  d.events = [{ id: "e", title: "歯医者", startDate: "2026-12-01", endDate: "2026-12-01", allDay: false, startTime: "10:00", endTime: "11:00", note: "", location: "京都駅前", createdAt: now, updatedAt: now }];
  d.notes = [{ id: "n", title: "京都の持ち物", body: "充電器", date: "2026-11-01", pinned: false, createdAt: now, updatedAt: now }];
  d.tasks = [{ id: "t", title: "住民票", due: "2026-11-30", done: false, note: "", createdAt: now, updatedAt: now }];
  return d;
};

describe("横断検索", () => {
  it("1つの言葉で、記録・予定・メモを種類ごとに探す。全角・半角・大文字小文字をそろえる", () => {
    const g = searchAll(data(), "京都");
    expect(g.map((x) => x.kind)).toEqual(["tx", "event", "note"]);
    expect(g[0].hits.map((h) => h.id)).toEqual(["b"]); // メモの中
    expect(searchAll(data(), "ｽｰﾊﾟｰ")[0].hits[0].id).toBe("b");
    expect(searchAll(data(), "スーパー")[0].hits[0].id).toBe("b"); // 半角カナと全角カナ
  });
  it("空白で区切ると、すべて含むものだけ（AND）", () => {
    expect(searchAll(data(), "京都 充電器").map((x) => x.kind)).toEqual(["note"]);
    expect(searchAll(data(), "京都 存在しない")).toEqual([]);
  });
  it("数字だけを入れると、金額が同じものも出る（¥・カンマ・円は無視）", () => {
    expect(parseQuery("¥1,200")).toEqual({ words: ["¥1,200"].map((w) => w.normalize("NFKC").toLowerCase()), amount: 1200 });
    expect(searchAll(data(), "¥1,200")[0].hits[0].id).toBe("b");
    expect(searchAll(data(), "650円")[0].hits[0].id).toBe("a");
    expect(parseQuery("京都").amount).toBeNull();
  });
  it("空の言葉は何も返さない。新しいものから並べ、件数を数える", () => {
    expect(searchAll(data(), "  ")).toEqual([]);
    const d = data();
    d.transactions = Array.from({ length: 12 }, (_, i) => tx({ id: `x${i}`, merchant: "コンビニ", date: `2026-11-${String(i + 1).padStart(2, "0")}` }));
    const g = searchAll(d, "コンビニ", 5);
    expect(g[0].total).toBe(12);
    expect(g[0].hits).toHaveLength(5);
    expect(g[0].hits[0].id).toBe("x11"); // いちばん新しい
  });
  it("自分用だけの機能。メニューとホームに入口がある。外へは送らない", () => {
    expect(FEATURE_EDITIONS.search).toEqual({ personal: true, public: false });
    expect(src("app/menu/page.tsx")).toContain('href: "/search"');
    expect(src("app/page.tsx")).toContain('href="/search"');
    expect(src("lib/search.ts")).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon/);
  });
});
