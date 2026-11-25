import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { applyRefund, undoRefund, refundedTotal } from "@/lib/refund";
import { summarizeMonth } from "@/lib/aggregate";
import { monthBreakdown } from "@/lib/monthBreakdown";
import { validateAppData } from "@/lib/schema";
import type { AppData, Transaction } from "@/lib/types";

// NEXT v21 X02：返金。元の支出を金額で減らす／全額なら収支に数えない。返金の記録は、収入にも数えない（二重にしない）。取り消すと元に戻る
const now = "2026-11-25T00:00:00.000Z";
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({ type: "expense", date: "2026-11-10", amount: 10000, currency: "JPY", categoryId: "exp-1", merchant: "Amazon", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now, ...o });
const seed = (o: Partial<Transaction> = {}): AppData => {
  const d = emptyData(now);
  d.transactions = [tx({ id: "e", ...o })];
  return d;
};
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};

describe("返金", () => {
  it("一部の返金：元の支出が返金の分だけ減り、返金の記録は収入にも支出にも数えない", () => {
    const d = ok(applyRefund(seed(), "e", 3000, "2026-11-20", "r", now)).next;
    expect(d.transactions.find((t) => t.id === "e")?.amount).toBe(7000);
    const s = summarizeMonth(d.transactions, "2026-11");
    expect(s.expense).toBe(7000);
    expect(s.income).toBe(0);
    expect(monthBreakdown(d, "2026-11", "2026-11-25").lifeExpense).toBe(7000);
    expect(refundedTotal(d, "e")).toBe(3000);
    expect(validateAppData(d).ok).toBe(true);
  });
  it("全額の返金：元の支出を収支に数えない（記録は残る）。もう一度は返金できない", () => {
    const d = ok(applyRefund(seed(), "e", 10000, "2026-11-20", "r", now)).next;
    expect(d.transactions.find((t) => t.id === "e")?.countAs).toBe("transfer");
    expect(d.transactions.find((t) => t.id === "e")?.amount).toBe(10000); // 元の金額は残す
    expect(summarizeMonth(d.transactions, "2026-11").expense).toBe(0);
    expect(applyRefund(d, "e", 1, "2026-11-21", "r2", now).ok).toBe(false);
    expect(validateAppData(d).ok).toBe(true);
  });
  it("2回に分けた返金（3000＋7000）で、全額になる", () => {
    let d = ok(applyRefund(seed(), "e", 3000, "2026-11-20", "r1", now)).next;
    d = ok(applyRefund(d, "e", 7000, "2026-11-21", "r2", now)).next;
    expect(summarizeMonth(d.transactions, "2026-11").expense).toBe(0);
    expect(refundedTotal(d, "e")).toBe(10000);
  });
  it("多すぎる額・0円・小数・支出でない記録・存在しない記録は、断る", () => {
    expect(applyRefund(seed(), "e", 10001, "2026-11-20", "r", now).ok).toBe(false);
    expect(applyRefund(seed(), "e", 0, "2026-11-20", "r", now).ok).toBe(false);
    expect(applyRefund(seed(), "e", 1.5, "2026-11-20", "r", now).ok).toBe(false);
    expect(applyRefund(seed({ type: "income" }), "e", 100, "2026-11-20", "r", now).ok).toBe(false);
    expect(applyRefund(seed(), "zzz", 100, "2026-11-20", "r", now).ok).toBe(false);
    expect(applyRefund(seed(), "e", 100, "あした", "r", now).ok).toBe(false);
  });
  it("取り消すと、金額も、数え方も、元に戻る（投資の記録の返金なら、投資のまま）", () => {
    const base = seed();
    const part = ok(applyRefund(base, "e", 3000, "2026-11-20", "r", now)).next;
    expect(undoRefund(part, "r", now).transactions).toEqual(base.transactions);
    const inv = seed({ countAs: "invest" });
    const full = ok(applyRefund(inv, "e", 10000, "2026-11-20", "r", now)).next;
    expect(undoRefund(full, "r", now).transactions.find((t) => t.id === "e")?.countAs).toBe("invest");
  });
  it("返金の記録を、返金の記録として、さらに返金はできない", () => {
    const d = ok(applyRefund(seed(), "e", 3000, "2026-11-20", "r", now)).next;
    expect(applyRefund(d, "r", 100, "2026-11-21", "r2", now).ok).toBe(false);
  });
  it("元の記録がもうなくても、取り消しは壊れない", () => {
    const d = ok(applyRefund(seed(), "e", 3000, "2026-11-20", "r", now)).next;
    const gone: AppData = { ...d, transactions: d.transactions.filter((t) => t.id !== "e") };
    const out = undoRefund(gone, "r", now);
    expect(out.transactions.find((t) => t.id === "r")).toBeUndefined();
  });
});
