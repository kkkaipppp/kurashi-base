import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { applyRefund, undoRefund } from "@/lib/refund";
import { cashBalance } from "@/lib/balance";
import { summarizeMonth } from "@/lib/aggregate";
import { validateAppData } from "@/lib/schema";
import type { AppData, Transaction } from "@/lib/types";

// v22 G0（P0）：独立した期待値（レビュー 9b300f2-o3）。実装を読んで期待値を作らない。
// 返金 10,000 → 3,000 → 7,000 → 最初の返金（3,000）を取り消す → 純支出は 3,000
// カード：基準日以前の未払い 100,000／以後の購入 30,000／決済 100,000 → 未決済は 30,000。購入日・返金日・決済日は別
const now = "2026-11-25T00:00:00.000Z";
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({ type: "expense", date: "2026-11-10", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now, ...o });
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};
const net = (d: AppData) => summarizeMonth(d.transactions, "2026-11");
const seed = (): AppData => {
  const d = emptyData(now);
  d.transactions = [tx({ id: "e", amount: 10000 })];
  return d;
};

describe("G0 返金（独立した期待値）", () => {
  it("10,000 → 返金3,000 → 返金7,000 → 最初の返金を取り消す → 純支出 3,000", () => {
    let d = ok(applyRefund(seed(), "e", 3000, "2026-11-12", "r1", now)).next;
    expect(net(d).expense).toBe(7000);
    d = ok(applyRefund(d, "e", 7000, "2026-11-15", "r2", now)).next;
    expect(net(d).expense).toBe(0);
    d = undoRefund(d, "r1", now);
    expect(net(d).expense).toBe(3000); // 10,000 − 7,000
    expect(net(d).income).toBe(0);
    expect(validateAppData(d).ok).toBe(true);
  });
  it("逆の順（あとの返金を取り消す）でも、純支出は 10,000 − 残った返金", () => {
    let d = ok(applyRefund(seed(), "e", 3000, "2026-11-12", "r1", now)).next;
    d = ok(applyRefund(d, "e", 7000, "2026-11-15", "r2", now)).next;
    d = undoRefund(d, "r2", now);
    expect(net(d).expense).toBe(7000); // 10,000 − 3,000
  });
  it("全部の返金を取り消すと、元の支出（10,000・元の数え方）に戻る", () => {
    let d = ok(applyRefund(seed(), "e", 3000, "2026-11-12", "r1", now)).next;
    d = ok(applyRefund(d, "e", 7000, "2026-11-15", "r2", now)).next;
    d = undoRefund(undoRefund(d, "r1", now), "r2", now);
    expect(d.transactions).toEqual(seed().transactions);
  });
  it("返金したあと、残りより大きい返金は断る（3,000 返金済みで、8,000 は断る）", () => {
    const d = ok(applyRefund(seed(), "e", 3000, "2026-11-12", "r1", now)).next;
    expect(applyRefund(d, "e", 8000, "2026-11-13", "r2", now).ok).toBe(false);
    expect(applyRefund(d, "e", 7000, "2026-11-13", "r2", now).ok).toBe(true);
  });
  it("返金日は購入日と別（購入日の支出は10月、返金は11月でも、純支出は購入した月の分だけ減る）", () => {
    const d0 = emptyData(now);
    d0.transactions = [tx({ id: "e", amount: 10000, date: "2026-10-20" })];
    const d = ok(applyRefund(d0, "e", 3000, "2026-11-12", "r1", now)).next;
    expect(summarizeMonth(d.transactions, "2026-10").expense).toBe(7000);
    expect(summarizeMonth(d.transactions, "2026-11").expense).toBe(0);
    expect(summarizeMonth(d.transactions, "2026-11").income).toBe(0);
  });
});

describe("G0 カードの債務（独立した期待値）", () => {
  it("基準日以前の未払い 100,000＋以後の購入 30,000−決済 100,000 → 未決済 30,000。購入日・決済日は別", () => {
    const d = emptyData(now);
    d.assets = [{ id: "a", name: "銀行", kind: "cash", value: 500000, asOf: "2026-11-01", cardDebt: 100000, note: "", createdAt: now, updatedAt: now }];
    d.transactions = [
      tx({ id: "k", date: "2026-11-10", amount: 30000, paymentMethod: "card" }),
      tx({ id: "s", date: "2026-11-20", amount: 100000, countAs: "transfer", transferKind: "card" }),
    ];
    const r = cashBalance(d, "2026-11-25");
    if (!r.ok) throw new Error("出ない");
    expect(r.cardPending).toBe(30000);
    expect(r.balance).toBe(500000 - 100000); // 決済で現金が 100,000 減る
    expect(r.afterCard).toBe(500000 - 100000 - 30000);
    expect(validateAppData(d).ok).toBe(true);
  });
  it("基準日のカード未払いを入れていないときは 0 として扱う（今までどおり）", () => {
    const d = emptyData(now);
    d.assets = [{ id: "a", name: "銀行", kind: "cash", value: 500000, asOf: "2026-11-01", note: "", createdAt: now, updatedAt: now }];
    d.transactions = [tx({ id: "k", date: "2026-11-10", amount: 30000, paymentMethod: "card" })];
    const r = cashBalance(d, "2026-11-25");
    if (!r.ok) throw new Error("出ない");
    expect(r.cardPending).toBe(30000);
  });
});
