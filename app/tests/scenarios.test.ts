import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { compareScenarios } from "@/lib/scenarios";
import { forecastMonthEnd } from "@/lib/forecast";
import type { AppData, Transaction } from "@/lib/types";

// NEXT v21：シナリオ比較。同じ範囲（月末まで）・確定した額と固定費は動かさない・予算がなければ差を出さない
const now = "2026-11-25T00:00:00.000Z";
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({ type: "expense", date: "2026-11-10", amount: 2000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now, ...o });
const seed = (budget: number | null): AppData => {
  const d = emptyData(now);
  d.budget.monthly = budget;
  d.recurring = [{ id: "r", name: "スマホ", amount: 8000, cycle: "monthly", anchorDay: 28, nextDueDate: "2026-11-28", categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now }];
  d.transactions = Array.from({ length: 12 }, (_, i) => tx({ id: `p${i}`, date: `2026-11-${String(i + 3).padStart(2, "0")}` }));
  return d;
};

describe("シナリオ比較", () => {
  it("基準は月末の見込みと同じ。残りの変動費だけを増減し、使った額と固定費は同じ", () => {
    const d = seed(60000);
    const f = forecastMonthEnd(d, "2026-11-25");
    if (!f.ok) throw new Error("見込みが出ない");
    const r = compareScenarios(d, "2026-11-25", null);
    if (!r.ok) throw new Error("出ない");
    const by = Object.fromEntries(r.items.map((s) => [s.key, s]));
    expect(by.pace.projected).toBe(f.projected);
    expect(by.pace.diff).toBe(0);
    const v = f.dailyVariable * f.daysAhead;
    expect(by.cut.projected).toBe(f.spent + f.unpaidFixed + Math.round(v * 0.8));
    expect(by.up.projected).toBe(f.spent + f.unpaidFixed + Math.round(v * 1.2));
    expect(by.cut.diff).toBe(by.cut.projected - f.projected);
    expect(by.cut.diff).toBeLessThanOrEqual(0);
    expect(by.up.diff).toBeGreaterThanOrEqual(0);
  });
  it("買い物を足すと、基準にその額が足される。0円・なしは出さない", () => {
    const d = seed(60000);
    const r = compareScenarios(d, "2026-11-25", 30000);
    if (!r.ok) throw new Error("出ない");
    const buy = r.items.find((s) => s.key === "buy")!;
    expect(buy.diff).toBe(30000);
    expect(compareScenarios(d, "2026-11-25", 0).ok && (compareScenarios(d, "2026-11-25", 0) as { items: unknown[] }).items).toHaveLength(3);
    expect((compareScenarios(d, "2026-11-25", null) as { items: unknown[] }).items).toHaveLength(3);
  });
  it("予算の差：予算 − 見込み。予算がなければ null（余ると言わない）", () => {
    const withB = compareScenarios(seed(60000), "2026-11-25", null);
    const noB = compareScenarios(seed(null), "2026-11-25", null);
    if (!withB.ok || !noB.ok) throw new Error("出ない");
    expect(withB.items[0].vsBudget).toBe(60000 - withB.items[0].projected);
    expect(noB.items.every((s) => s.vsBudget === null)).toBe(true);
  });
  it("記録が足りないときは、出さない", () => {
    expect(compareScenarios(emptyData(now), "2026-11-25", null).ok).toBe(false);
  });
});
