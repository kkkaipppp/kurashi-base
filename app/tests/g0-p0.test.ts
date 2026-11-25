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
  it("基準日のカード未払いを入れていないときは「不明」。0 と決めつけず、引き落とし待ちは『少なくとも』の額（o11 工程2）", () => {
    const d = emptyData(now);
    d.assets = [{ id: "a", name: "銀行", kind: "cash", value: 500000, asOf: "2026-11-01", note: "", createdAt: now, updatedAt: now }];
    d.transactions = [tx({ id: "k", date: "2026-11-10", amount: 30000, paymentMethod: "card" })];
    const r = cashBalance(d, "2026-11-25");
    if (!r.ok) throw new Error("出ない");
    expect(r.cardPending).toBe(30000);
    expect(r.cardPendingKnown).toBe(false);
    expect(r.base.cardDebt).toBeNull();
  });
  it("基準日のカード未払いを 0 と入れたときは、確かな額として扱う", () => {
    const d = emptyData(now);
    d.assets = [{ id: "a", name: "銀行", kind: "cash", value: 500000, asOf: "2026-11-01", cardDebt: 0, note: "", createdAt: now, updatedAt: now }];
    const r = cashBalance(d, "2026-11-25");
    if (!r.ok) throw new Error("出ない");
    expect(r.cardPendingKnown).toBe(true);
    expect(r.base.cardDebt).toBe(0);
  });
});

describe("残高は、返金の日に現金が戻る（独立点検 高1・o11 工程2：購入日・返金日・現金移動日を分ける）", () => {
  const base = (asOf: string) => {
    const d = emptyData(now);
    d.assets = [{ id: "a", name: "銀行", kind: "cash", value: 100000, asOf, cardDebt: 0, note: "", createdAt: now, updatedAt: now }];
    return d;
  };
  it("基準 11/10 に 100,000。10/20 に現金で 50,000 の買い物、11/15 に 20,000 の返金 → 今日の残高は 120,000", () => {
    let d = base("2026-11-10");
    d.transactions = [tx({ id: "p", date: "2026-10-20", amount: 50000, paymentMethod: "cash" })];
    d = ok(applyRefund(d, "p", 20000, "2026-11-15", "r", now)).next;
    const r = cashBalance(d, "2026-11-25");
    if (!r.ok) throw new Error("出ない");
    expect(r.balance).toBe(120000);
  });
  it("基準 11/01 に 100,000。11/05 に現金で 50,000、返金の日は 12/10（まだ先）→ 今日（11/25）の残高は 50,000", () => {
    let d = base("2026-11-01");
    d.transactions = [tx({ id: "p", date: "2026-11-05", amount: 50000, paymentMethod: "cash" })];
    d = ok(applyRefund(d, "p", 20000, "2026-12-10", "r", now)).next;
    expect((cashBalance(d, "2026-11-25") as { balance: number }).balance).toBe(50000);
    expect((cashBalance(d, "2026-12-10") as { balance: number }).balance).toBe(70000);
  });
  it("カードの買い物の返金は、現金ではなく、カードの引き落とし待ちを減らす（返金の日に）", () => {
    let d = base("2026-11-01");
    d.transactions = [tx({ id: "p", date: "2026-11-05", amount: 30000, paymentMethod: "card" })];
    d = ok(applyRefund(d, "p", 10000, "2026-11-20", "r", now)).next;
    const before = cashBalance(d, "2026-11-19");
    const after = cashBalance(d, "2026-11-25");
    if (!before.ok || !after.ok) throw new Error("出ない");
    expect(before.cardPending).toBe(30000);
    expect(after.cardPending).toBe(20000);
    expect(after.balance).toBe(100000); // 現金は変わらない
  });
  it("全額返金の現金の買い物：買った日に減り、返金の日に戻る", () => {
    let d = base("2026-11-01");
    d.transactions = [tx({ id: "p", date: "2026-11-05", amount: 8000, paymentMethod: "cash" })];
    d = ok(applyRefund(d, "p", 8000, "2026-11-20", "r", now)).next;
    expect((cashBalance(d, "2026-11-10") as { balance: number }).balance).toBe(92000);
    expect((cashBalance(d, "2026-11-25") as { balance: number }).balance).toBe(100000);
  });
});

import { ledgerEvents, refundConservationErrors } from "@/lib/ledgerCore";
import { dataHealth } from "@/lib/dataHealth";
import { monthLedger } from "@/lib/ledger";

describe("独立点検（8db1a71・47d4ce9）の指摘への試験", () => {
  it("中1：返金の記録なのに『収支に数えない』がない収入は、今の集計と同じく収入。元の購入は要確認（データの点検に出る）", () => {
    const d = emptyData(now);
    d.transactions = [tx({ id: "p", amount: 7000, refundGross: 10000 }), tx({ id: "r", type: "income", amount: 3000, refundOf: "p", categoryId: "inc-1" })];
    const ev = ledgerEvents(d);
    expect(ev.find((e) => e.txId === "r")?.kind).toBe("income");
    expect(refundConservationErrors(ev)).toEqual(["p"]);
    expect(dataHealth(d, "2026-11-25").find((f) => f.id === "refund-sum")?.count).toBe(1);
  });
  it("返金の記録 ID が重複・空なら断る", () => {
    const d = emptyData(now);
    d.transactions = [tx({ id: "p", amount: 1000 })];
    expect(applyRefund(d, "p", 100, "2026-11-12", "p", now).ok).toBe(false);
    expect(applyRefund(d, "p", 100, "2026-11-12", " ", now).ok).toBe(false);
  });
  it("低3：現金の資産の日付が今日より後だけなら、『入っていない』ではなく futureBase", () => {
    const d = emptyData(now);
    d.assets = [{ id: "a", name: "銀行", kind: "cash", value: 1, asOf: "2026-12-31", note: "", createdAt: now, updatedAt: now }];
    expect(cashBalance(d, "2026-11-25")).toEqual({ ok: false, reason: "futureBase" });
  });
  it("低4：カードを使っていなければ cardActivity は false（不明の注意を出さない）", () => {
    const d = emptyData(now);
    d.assets = [{ id: "a", name: "銀行", kind: "cash", value: 1000, asOf: "2026-11-01", note: "", createdAt: now, updatedAt: now }];
    d.transactions = [tx({ id: "c", date: "2026-11-05", amount: 100, paymentMethod: "cash" })];
    const r = cashBalance(d, "2026-11-25");
    if (!r.ok) throw new Error("出ない");
    expect(r.cardActivity).toBe(false);
  });
  it("過去の月・未来の月の家計は、1日あたりと自由に使える残りを出さない（null）。予算の残りは出す", () => {
    const d = emptyData(now);
    d.budget.monthly = 100000;
    d.transactions = [tx({ id: "a", date: "2026-10-05", amount: 3000 })];
    const past = monthLedger(d, "2026-10", "2026-11-25");
    expect(past.perDay).toBeNull();
    expect(past.freeLeft).toBeNull();
    expect(past.lifeBudgetLeft).toBe(97000);
    expect(monthLedger(d, "2026-12", "2026-11-25").perDay).toBeNull();
    expect(monthLedger(d, "2026-11", "2026-11-25").perDay).not.toBeNull();
  });
});

describe("再点検（571b373）の指摘への試験", () => {
  it("高1：返金のある元の支出を消すと、その返金の記録も一緒に消え、残高は元に戻る", async () => {
    const { deleteTxWithRefunds } = await import("@/lib/refund");
    let d = emptyData(now);
    d.assets = [{ id: "a", name: "銀行", kind: "cash", value: 100000, asOf: "2026-11-01", cardDebt: 0, note: "", createdAt: now, updatedAt: now }];
    d.transactions = [tx({ id: "p", date: "2026-11-05", amount: 50000, paymentMethod: "cash" })];
    d = ok(applyRefund(d, "p", 20000, "2026-11-15", "r", now)).next;
    const out = deleteTxWithRefunds(d, "p");
    expect(out.transactions).toEqual([]);
    expect((cashBalance(out, "2026-11-25") as { balance: number }).balance).toBe(100000);
  });
  it("高1：元の支出が見つからない返金（古いデータ）は、残高に足さず、データの点検に出す", () => {
    const d = emptyData(now);
    d.assets = [{ id: "a", name: "銀行", kind: "cash", value: 100000, asOf: "2026-11-01", cardDebt: 0, note: "", createdAt: now, updatedAt: now }];
    d.transactions = [tx({ id: "r", type: "income", date: "2026-11-15", amount: 20000, countAs: "transfer", refundOf: "gone", categoryId: "inc-1" })];
    expect((cashBalance(d, "2026-11-25") as { balance: number }).balance).toBe(100000);
    expect(dataHealth(d, "2026-11-25").find((f) => f.id === "refund-orphan")?.count).toBe(1);
  });
});
