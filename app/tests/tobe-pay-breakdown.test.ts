import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { payBreakdown } from "@/lib/payBreakdown";
import { applyRefund } from "@/lib/refund";
import type { Transaction } from "@/lib/types";

// 期待値は手で作った（家計簿と同じ数え方：返金を引いたあと・口座間の移動とカードの引き落としは入れない・ほかの月は入れない）
const ts = "2026-11-28T00:00:00.000Z";
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({ type: "expense", date: "2026-11-10", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "cash", note: "", source: "manual", createdAt: ts, updatedAt: ts, ...o });

describe("支払方法ごとの支出（家計簿の予算のタブ）", () => {
  it("カード 3,000円・現金 1,000円（返金 400円を引いて 600円）・指定なし 500円。引き落とし・口座間の移動・収入・ほかの月は入れない", () => {
    let d = emptyData(ts);
    d.transactions = [
      tx({ id: "c1", amount: 3000, paymentMethod: "card" }),
      tx({ id: "m1", amount: 1000, paymentMethod: "cash" }),
      tx({ id: "n1", amount: 500, paymentMethod: "" }),
      tx({ id: "s1", amount: 9000, paymentMethod: "bank", countAs: "transfer", transferKind: "card" }),
      tx({ id: "t1", amount: 7000, paymentMethod: "bank", countAs: "transfer" }),
      tx({ id: "i1", type: "income", amount: 50000, categoryId: "inc-1", paymentMethod: "bank" }),
      tx({ id: "o1", date: "2026-10-31", amount: 8000, paymentMethod: "card" }),
    ];
    const r = applyRefund(d, "m1", 400, "2026-11-20", "r1", ts);
    if (!r.ok) throw new Error(r.error);
    d = r.next;
    expect(payBreakdown(d, "2026-11")).toEqual([
      { id: "card", label: "クレジットカード", amount: 3000 },
      { id: "cash", label: "現金", amount: 600 },
      { id: "", label: "指定なし", amount: 500 },
    ]);
    expect(payBreakdown(d, "2026-12")).toEqual([]);
  });
});
