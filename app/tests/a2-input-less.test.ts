import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { eventExpenseStart, similarExpenseOn } from "@/lib/eventExpense";
import { categoryForMerchant, recentMerchants } from "@/lib/merchantSuggest";
import type { Transaction } from "@/lib/types";

// A2（2026-11-26 平尾さん「全部おすすめで」の 6）：入力を減らす。自分用。期待値は手で作った
const now = "2026-11-26T00:00:00.000Z";
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({ type: "expense", date: "2026-11-10", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now, ...o });
const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");

describe("A2 予定の費用から支出を記録", () => {
  it("費用の目安があれば、その回の日・額・予定名で始める。なければ出さない", () => {
    expect(eventExpenseStart({ title: " 歓迎会 ", startDate: "2026-12-04", cost: 5000 })).toEqual({ date: "2026-12-04", amount: "5000", merchant: "歓迎会" });
    expect(eventExpenseStart({ title: "ジム", startDate: "2026-11-03", cost: 1000 }, "2026-11-24")?.date).toBe("2026-11-24");
    expect(eventExpenseStart({ title: "x", startDate: "2026-12-04", cost: 0 })).toBeNull();
    expect(eventExpenseStart({ title: "x", startDate: "2026-12-04" })).toBeNull();
  });
  it("同じ日に同じ額の支出があれば、二重かもしれないと知らせる（収入は数えない）", () => {
    const d = { transactions: [tx({ id: "a", date: "2026-12-04", amount: 5000 }), tx({ id: "b", type: "income", date: "2026-12-05", amount: 5000, categoryId: "inc-1" })] };
    expect(similarExpenseOn(d, "2026-12-04", 5000)).toBe(true);
    expect(similarExpenseOn(d, "2026-12-05", 5000)).toBe(false);
    expect(similarExpenseOn(d, "2026-12-04", 4999)).toBe(false);
  });
  it("保存は本人（入力の画面を開くだけ）・自分用だけ", () => {
    const s = src("components/EventSheet.tsx");
    expect(s).toContain('ui.openTx({ mode: "new", type: "expense", date: s.date, initial: { amount: s.amount, merchant: s.merchant } })');
    expect(s).toContain("{IS_PERSONAL && eventExpenseStart(ev, day) && (");
  });
});

describe("A2 店名の候補", () => {
  const txs = [
    tx({ id: "1", merchant: "スーパーA", date: "2026-11-20", categoryId: "exp-1" }),
    tx({ id: "2", merchant: "スーパーＡ ", date: "2026-11-21", categoryId: "exp-1" }), // 全角・空白は同じ店
    tx({ id: "3", merchant: "薬局", date: "2026-11-22", categoryId: "exp-2" }),
    tx({ id: "4", merchant: "薬局", date: "2026-11-25", categoryId: "exp-3" }), // いちばん新しいカテゴリを使う
    tx({ id: "5", merchant: "古い店", date: "2026-08-01" }), // 90日より前
    tx({ id: "6", merchant: "", date: "2026-11-23" }),
    tx({ id: "7", merchant: "給料元", type: "income", date: "2026-11-25", categoryId: "inc-1" }),
  ];
  it("直近90日の多い順（同じ数なら新しい順）。空と古い店名と、ほかの種類は出さない", () => {
    expect(recentMerchants(txs, "expense", "2026-11-26")).toEqual(["薬局", "スーパーＡ"]);
    expect(recentMerchants(txs, "income", "2026-11-26")).toEqual(["給料元"]);
  });
  it("その店のいちばん新しい記録のカテゴリ。知らない店・空は null", () => {
    expect(categoryForMerchant(txs, "expense", "薬局")).toBe("exp-3");
    expect(categoryForMerchant(txs, "expense", "ｽｰﾊﾟｰA".normalize("NFKC"))).toBe("exp-1");
    expect(categoryForMerchant(txs, "expense", "知らない店")).toBeNull();
    expect(categoryForMerchant(txs, "expense", " ")).toBeNull();
  });
  it("自分用だけで、押したときだけ入る", () => {
    const s = src("components/TxSheet.tsx");
    expect(s).toContain("SUGGEST ? recentMerchants(");
    expect(s).toContain('onClick={() => set("categoryId", merchantCat)}');
  });
});
