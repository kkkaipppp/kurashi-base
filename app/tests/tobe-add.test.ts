import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recentTemplates } from "@/lib/txTemplates";
import type { Transaction } from "@/lib/types";

// To-Be 02「＋：前回、コピー」（2026-11-28、自分用）。期待値は手で作った
const ts = "2026-11-28T00:00:00.000Z";
const tx = (o: Partial<Transaction>): Transaction => ({
  id: "t", type: "expense", date: "2026-11-20", amount: 500, currency: "JPY", categoryId: "food", merchant: "コンビニ", paymentMethod: "card", note: "", source: "manual", createdAt: ts, updatedAt: ts, ...o,
});

describe("追加の「前の記録から」", () => {
  it("新しい順に、同じ中身は1つにまとめて最大3件。返金・口座間の移動は出さない。メモと日付は写さない", () => {
    const list = recentTemplates([
      tx({ id: "a", date: "2026-11-27", merchant: " コンビニ ", note: "おにぎり" }),
      tx({ id: "b", date: "2026-11-26", merchant: "コンビニ" }), // a と同じ中身
      tx({ id: "c", date: "2026-11-25", amount: 3000, merchant: "カード", countAs: "transfer" }),
      tx({ id: "d", date: "2026-11-24", amount: 200, type: "income", categoryId: "refund", refundOf: "x" }),
      tx({ id: "e", date: "2026-11-23", amount: 250000, type: "income", categoryId: "salary", merchant: "" }),
      tx({ id: "f", date: "2026-11-22", amount: 10000, categoryId: "inv", merchant: "積立", countAs: "invest" }),
      tx({ id: "g", date: "2026-11-21", amount: 900, merchant: "本屋" }),
    ]);
    expect(list.map((t) => [t.type, t.merchant, t.amount])).toEqual([
      ["expense", "コンビニ", 500],
      ["income", "", 250000],
      ["expense", "積立", 10000],
    ]);
    expect(list[2].countAs).toBe("invest");
    expect(list[0]).not.toHaveProperty("note");
    expect(list[0]).not.toHaveProperty("date");
    expect(recentTemplates([])).toEqual([]);
  });
  it("押すと入力のシートを選んだ日で開くだけ（保存しない）。公開版の追加の一覧は変えない", () => {
    const s = readFileSync("src/components/AddSheet.tsx", "utf8");
    const from = s.slice(s.indexOf("const fromTemplate = "), s.indexOf("const pick = "));
    expect(from).toContain("openTx(t.type, date, {");
    expect(from).not.toMatch(/store\.|commit|addTx|saveTx/);
    const ctx = readFileSync("src/components/UIContext.tsx", "utf8");
    // 貼り付けからは oneShot（書きかけの控えを使わない）を足した。保存はしない（入力のシートを開くだけ）
    expect(ctx).toContain("openTx={(type, date, initial, oneShot) => setTx({ mode: \"new\", type, date, ...(initial ? { initial } : {}), ...(oneShot ? { oneShot } : {}), key: ++seq.current })}");
    expect(ctx).toContain("{add && !PersonalAddSheet && (");
  });
});
