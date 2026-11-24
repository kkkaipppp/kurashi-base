import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { FEATURE_EDITIONS } from "@/lib/edition";
import { inboxCount, inboxGroups, recategorize } from "@/lib/inbox";
import type { AppData, Transaction } from "@/lib/types";

// NEXT v21 Phase 2：未整理の記録（合成データ）
const now = "2026-11-25T00:00:00.000Z";
const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({
  type: "expense", date: "2026-11-10", amount: 1000, currency: "JPY", categoryId: "exp-10", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now, ...o,
});
const data = (): AppData => {
  const d = emptyData(now);
  // exp-1＝食費、exp-10＝その他（初期カテゴリ）
  d.transactions = [
    tx({ id: "a", merchant: "セブン" , amount: 300, date: "2026-11-01" }),
    tx({ id: "b", merchant: "ｾﾌﾞﾝ", amount: 500, date: "2026-11-05" }),
    tx({ id: "c", merchant: "セブン", categoryId: "exp-1", amount: 400 }),
    tx({ id: "d", merchant: "セブン", categoryId: "exp-1", amount: 400 }),
    tx({ id: "e", merchant: "謎の店", amount: 900 }),
    tx({ id: "f", merchant: "", amount: 100 }),
    tx({ id: "g", type: "income", categoryId: "inc-3", merchant: "副業", amount: 5000 }),
  ];
  return d;
};

describe("未整理の記録", () => {
  it("「その他」の記録を店名（全角・半角をそろえて）でまとめる。件数の多い順", () => {
    const g = inboxGroups(data());
    expect(g.map((x) => [x.merchant, x.ids.length, x.total])).toEqual([["セブン", 2, 800], ["副業", 1, 5000], ["謎の店", 1, 900], ["（店名なし）", 1, 100]]); // 件数の同じものは金額の大きい順
    expect(g[0].firstDate).toBe("2026-11-01");
    expect(g[0].lastDate).toBe("2026-11-05");
    expect(inboxCount(data())).toBe(5); // 記録は5件（セブンの2件を1つにまとめて、グループは4つ）
  });
  it("候補は、同じ店名がほかのカテゴリに入っているときだけ（いちばん多いカテゴリ）。なければ出さない", () => {
    const g = inboxGroups(data());
    expect(g[0].suggest).toMatchObject({ categoryId: "exp-1", count: 2 });
    expect(g.slice(1).map((x) => x.suggest)).toEqual([null, null, null]); // 店名なしにも候補を出さない
  });
  it("カテゴリだけを変える（金額・日付・ID はそのまま）。種類が違う・非表示のカテゴリには移さない", () => {
    const d = data();
    const r = recategorize(d, ["a", "b"], "exp-1", now);
    expect(r.ok && r.changed).toBe(2);
    if (!r.ok) return;
    expect(r.next.transactions.filter((t) => t.id === "a" || t.id === "b").map((t) => [t.id, t.amount, t.date, t.categoryId])).toEqual([["a", 300, "2026-11-01", "exp-1"], ["b", 500, "2026-11-05", "exp-1"]]);
    expect(r.next.transactions.map((t) => t.id)).toEqual(d.transactions.map((t) => t.id));
    expect(inboxCount(r.next)).toBe(inboxCount(d) - 2);
    expect(recategorize(d, ["a"], "inc-1", now)).toMatchObject({ ok: false });
    const hidden = { ...d, categories: d.categories.map((c) => (c.id === "exp-1" ? { ...c, archived: true } : c)) };
    expect(recategorize(hidden, ["a"], "exp-1", now)).toMatchObject({ ok: false });
  });
  it("自分用だけ。まとめて変えるときは取り消しの控えを残す（replaceAll）。メニューに件数つきで出る", () => {
    expect(FEATURE_EDITIONS.inbox).toEqual({ personal: true, public: false });
    expect(src("app/inbox/page.tsx")).toContain("store.replaceAll(r.next,");
    expect(src("app/menu/page.tsx")).toContain('href: "/inbox"');
  });
});
