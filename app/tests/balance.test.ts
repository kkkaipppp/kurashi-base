import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { cashBalance } from "@/lib/balance";
import { summarizeMonth } from "@/lib/aggregate";
import { validateAppData } from "@/lib/schema";
import type { AppData, Transaction } from "@/lib/types";

// NEXT v21 X03・X05：購入50000をカードで → 支出は買った日に1回。翌月の引き落としで現金が50000減るが、支出は再び数えない。基準の残高がなければ、残高は出さない
const now = "2026-11-25T00:00:00.000Z";
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({ type: "expense", date: "2026-11-10", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now, ...o });
const withBase = (txs: Transaction[], value = 300000, asOf = "2026-11-01"): AppData => {
  const d = emptyData(now);
  d.assets = [{ id: "a", name: "銀行", kind: "cash", value, asOf, note: "", createdAt: now, updatedAt: now }];
  d.transactions = txs;
  return d;
};
const ok = (d: AppData, today = "2026-12-05") => {
  const r = cashBalance(d, today);
  if (!r.ok) throw new Error("出ない");
  return r;
};

describe("現金・預金の残高の目安", () => {
  it("基準の残高がないとき（資産なし・評価額なし・評価日なし・現金以外）は、出さない", () => {
    expect(cashBalance(emptyData(now), "2026-11-25")).toEqual({ ok: false, reason: "noBase" });
    const d = withBase([]);
    d.assets[0] = { ...d.assets[0], value: null };
    expect(cashBalance(d, "2026-11-25").ok).toBe(false);
    d.assets[0] = { ...d.assets[0], value: 1, asOf: "" };
    expect(cashBalance(d, "2026-11-25").ok).toBe(false);
    d.assets[0] = { ...d.assets[0], asOf: "2026-11-01", kind: "investment" };
    expect(cashBalance(d, "2026-11-25").ok).toBe(false);
  });
  it("基準の日より後の収入が足され、現金払いの支出が引かれる。基準の日と同じ日・前の記録は数えない", () => {
    const r = ok(
      withBase([
        tx({ id: "i", type: "income", date: "2026-11-05", amount: 200000, categoryId: "inc-1" }),
        tx({ id: "c", date: "2026-11-06", amount: 3000, paymentMethod: "cash" }),
        tx({ id: "q", date: "2026-11-07", amount: 500, paymentMethod: "qr" }),
        tx({ id: "same", date: "2026-11-01", amount: 99999 }),
        tx({ id: "old", date: "2026-10-20", amount: 99999 }),
      ]),
    );
    expect(r.income).toBe(200000);
    expect(r.spend).toBe(3500);
    expect(r.balance).toBe(300000 + 200000 - 3500);
  });
  it("カード払いは、買った日には現金を減らさない（引き落とし前の分として別に出す）。引き落とすと、現金が減り、引き落とし前は減る", () => {
    const bought = withBase([tx({ id: "k", date: "2026-11-10", amount: 50000, paymentMethod: "card" })]);
    const a = ok(bought, "2026-11-25");
    expect(a.balance).toBe(300000);
    expect(a.cardPending).toBe(50000);
    expect(a.afterCard).toBe(250000);
    const settled = withBase([
      tx({ id: "k", date: "2026-11-10", amount: 50000, paymentMethod: "card" }),
      tx({ id: "s", date: "2026-12-04", amount: 50000, countAs: "transfer", transferKind: "card", paymentMethod: "bank" }),
    ]);
    const b = ok(settled, "2026-12-05");
    expect(b.cardSettled).toBe(50000);
    expect(b.balance).toBe(250000);
    expect(b.cardPending).toBe(0);
    expect(b.afterCard).toBe(250000);
  });
  it("支出は、買った日に1回だけ。引き落としの記録は、支出に数えない（二重に数えない）", () => {
    const d = withBase([
      tx({ id: "k", date: "2026-11-10", amount: 50000, paymentMethod: "card" }),
      tx({ id: "s", date: "2026-12-04", amount: 50000, countAs: "transfer", transferKind: "card" }),
    ]);
    expect(summarizeMonth(d.transactions, "2026-11").expense).toBe(50000);
    expect(summarizeMonth(d.transactions, "2026-12").expense).toBe(0);
  });
  it("口座間の移動（収支に数えない）は、残高を変えない。先の日付の記録は、まだ数えない。投資に回した分は、現金から出ていく", () => {
    const r = ok(
      withBase([
        tx({ id: "m", date: "2026-11-05", amount: 70000, countAs: "transfer" }),
        tx({ id: "f", date: "2026-12-20", amount: 5000 }),
        tx({ id: "v", date: "2026-11-08", amount: 30000, countAs: "invest" }),
      ]),
      "2026-12-05",
    );
    expect(r.balance).toBe(300000 - 30000);
  });
  it("基準が複数あるときは、評価日がいちばん新しい1件を使う", () => {
    const d = withBase([tx({ id: "c", date: "2026-11-20", amount: 1000, paymentMethod: "cash" })]);
    d.assets.push({ id: "b", name: "新しい基準", kind: "cash", value: 100000, asOf: "2026-11-15", note: "", createdAt: now, updatedAt: now });
    const r = ok(d, "2026-11-25");
    expect(r.base.name).toBe("新しい基準");
    expect(r.balance).toBe(99000);
  });
  it("保存の検査：カード引き落としの印があっても、なくても読める。壊れた形は拒否", () => {
    expect(validateAppData(withBase([tx({ id: "s", countAs: "transfer", transferKind: "card" })])).ok).toBe(true);
    expect(validateAppData(withBase([tx({ id: "s" })])).ok).toBe(true);
    expect(validateAppData(withBase([tx({ id: "s", transferKind: "zzz" as never })])).ok).toBe(false);
  });
});
