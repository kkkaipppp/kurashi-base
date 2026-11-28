import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { cashBalance } from "@/lib/balance";
import { summarizeMonth } from "@/lib/aggregate";
import { validateAppData } from "@/lib/schema";
import { applyRefund } from "@/lib/refund";
import { applySettlement, openAdvances, owedLeft, settleProblems, splitTx } from "@/lib/advance";
import type { AppData, Transaction } from "@/lib/types";

// 期待値は決めごと（2026-11-28：経費は支出に数えず、全額を返してもらう分。精算は収支に数えない）から手で作った
const ts = "2026-11-28T00:00:00.000Z";
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({ type: "expense", date: "2026-11-10", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "出張", paymentMethod: "cash", note: "", source: "manual", createdAt: ts, updatedAt: ts, ...o });
const claim = tx({ id: "cl", amount: 5000, claim: true, countAs: "transfer" });
const data = (txs: Transaction[]): AppData => {
  const d = emptyData(ts);
  d.assets = [{ id: "a", name: "銀行", kind: "cash", value: 100000, asOf: "2026-11-01", note: "", createdAt: ts, updatedAt: ts }];
  d.transactions = txs;
  return d;
};
const bal = (d: AppData) => {
  const r = cashBalance(d, "2026-11-28");
  if (!r.ok) throw new Error("出ない");
  return r;
};

describe("経費（会社に請求する支出）", () => {
  it("5,000円の経費 → 今月の支出 0円・返してもらう分 5,000円。入金 5,000円 → 0円・収入は増えない", () => {
    let d = data([claim, tx({ id: "p", amount: 800 })]);
    expect(summarizeMonth(d.transactions, "2026-11").expense).toBe(800);
    expect(owedLeft(d, claim)).toBe(5000);
    expect(openAdvances(d).map((x) => [x.tx.id, x.left])).toEqual([["cl", 5000]]);
    const r = applySettlement(d, "cl", 5000, "2026-11-25", "s1", ts);
    if (!r.ok) throw new Error(r.error);
    d = r.next;
    expect(owedLeft(d, claim)).toBe(0);
    expect(summarizeMonth(d.transactions, "2026-11").income).toBe(0);
    expect(settleProblems(d)).toEqual([]);
    expect(applySettlement(d, "cl", 1, "2026-11-26", "s2", ts).ok).toBe(false);
  });

  it("残高の目安：現金の経費は払った額が出て、入金で戻る。カードの経費は引き落とし待ちが増える", () => {
    expect(bal(data([claim])).balance).toBe(95000);
    const r = applySettlement(data([claim]), "cl", 5000, "2026-11-25", "s1", ts);
    if (!r.ok) throw new Error(r.error);
    expect(bal(r.next).balance).toBe(100000);
    const card = tx({ id: "cl", amount: 5000, claim: true, countAs: "transfer", paymentMethod: "card" });
    expect(bal(data([card]))).toMatchObject({ balance: 100000, cardPending: 5000 });
  });

  it("経費は返金にできない。保存の形：経費の印のあるデータも古いデータも読める・印の形が違えば断る", () => {
    expect(applyRefund(data([claim]), "cl", 100, "2026-11-20", "r", ts).ok).toBe(false);
    expect(validateAppData(JSON.parse(JSON.stringify(data([claim])))).ok).toBe(true);
    const bad = JSON.parse(JSON.stringify(data([claim])));
    bad.transactions[0].claim = "yes";
    expect(validateAppData(bad).ok).toBe(false);
  });
});

describe("割り勘（計画）", () => {
  it("4,000円を3人で割る → 自分の分 1,334円（切り上げ）を支出に、2,666円を返してもらう分に", () => {
    const r = splitTx(data([tx({ id: "t", amount: 4000 })]), "t", 3, ts);
    if (!r.ok) throw new Error(r.error);
    const t = r.next.transactions[0];
    expect(t).toMatchObject({ amount: 1334, advanceGross: 4000 });
    expect(owedLeft(r.next, t)).toBe(2666);
    expect(summarizeMonth(r.next.transactions, "2026-11").expense).toBe(1334);
  });
  it("割れないもの：人数 1・51・小数、もう立替・経費・収支に数えない・固定費の支払い・返金のある支出、1円を2人", () => {
    const d = data([tx({ id: "t", amount: 4000 }), tx({ id: "a", amount: 1000, advanceGross: 3000 }), claim, tx({ id: "m", countAs: "transfer" }), tx({ id: "r", recurringId: "rc" }), tx({ id: "g", refundGross: 2000 }), tx({ id: "one", amount: 1 })]);
    for (const n of [1, 51, 2.5]) expect(splitTx(d, "t", n, ts).ok).toBe(false);
    for (const id of ["a", "cl", "m", "r", "g", "one", "nothing"]) expect(splitTx(d, id, 2, ts).ok, id).toBe(false);
  });
});
