import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { forecastCurve, forecastMonthEnd } from "@/lib/forecast";
import { budgetSpent, monthLedger } from "@/lib/ledger";
import type { AppData, Transaction } from "@/lib/types";

// 独立点検（2026-11-26）の「足りない試験」。期待値は手で計算した
const now = "2026-11-26T00:00:00.000Z";
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({ type: "expense", date: "2026-11-02", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now, ...o });
const base = (): AppData => {
  const d = emptyData(now);
  d.categories.push({ id: "inv", name: "証券", kind: "expense", order: 99, archived: false, role: "invest" });
  d.budget.monthly = 100000;
  d.recurring = [{ id: "r2", name: "積立", amount: 30000, cycle: "monthly", anchorDay: 28, nextDueDate: "2026-11-28", categoryId: "inv", paymentMethod: "", active: true, createdAt: now, updatedAt: now }];
  d.transactions = [1, 2, 3, 4].map((i) => tx({ id: `v${i}`, date: `2026-11-0${i}` }));
  return d;
};

describe("公開版の数え方の境界", () => {
  it("投資の積立が一部だけ払われているとき：これから払う額は残り（30,000 − 10,000 ＝ 20,000）だけ", () => {
    const d = base();
    d.recurring[0].partialPaid = { due: "2026-11-28", paid: 10000 };
    d.transactions.push(tx({ id: "p", categoryId: "inv", amount: 10000, date: "2026-11-20", recurringId: "r2" }));
    const l = monthLedger(d, "2026-11", "2026-11-26", false);
    expect([l.spent, l.unpaidFixed, l.freeLeft]).toEqual([14000, 20000, 66000]); // 4,000 ＋ 10,000、100,000 − 14,000 − 20,000
    const f = forecastMonthEnd(d, "2026-11-26", undefined, false);
    // 変動費の窓は 11/1〜11/25 の25日、変動費は 4,000（払った積立は固定費なので入らない）→ 1日 160。残り4日
    expect(f.ok && [f.spent, f.unpaidFixed, f.dailyVariable, f.projected]).toEqual([14000, 20000, 160, 14000 + 20000 + 160 * 4]);
  });
  it("今日より後の日付の支出（承認待ち⑤＝2026-11-26 平尾さん「全部おすすめで」でそろえた）：予算の使用率も、月末の見込みも数える", () => {
    const d = base();
    d.transactions.push(tx({ id: "f", date: "2026-11-29", amount: 5000 }));
    expect(budgetSpent(d, "2026-11", "2026-11-26", false)).toBe(9000);
    const f = forecastMonthEnd(d, "2026-11-26", undefined, false);
    expect(f.ok && f.spent).toBe(9000);
    // 翌月の日付の記録は、今月には数えない
    d.transactions.push(tx({ id: "g", date: "2026-12-01", amount: 7000 }));
    const g = forecastMonthEnd(d, "2026-11-26", undefined, false);
    expect(g.ok && g.spent).toBe(9000);
  });
  it("今日より後の日付の支出は、見込みの線のその日に載り、線の終わりは月末の見込みと同じ", () => {
    const d = base();
    d.transactions.push(tx({ id: "f", date: "2026-11-29", amount: 5000 }));
    const f = forecastMonthEnd(d, "2026-11-26", undefined, false);
    const c = forecastCurve(d, "2026-11-26", false);
    expect(f.ok).toBe(true);
    expect(c).not.toBeNull();
    if (!f.ok || !c) return;
    // 実線（今日まで）には入らない
    expect(c.actual[25]).toBe(4000);
    // 28日→29日で、1日分の変動費 ＋ 5000 円増える
    expect(c.projected[3] - c.projected[2]).toBe(f.dailyVariable + 5000);
    expect(c.projected[c.projected.length - 1]).toBe(f.projected);
  });
  it("月末の日（11/30）は残り0日。うるう年の2月末（2028-02-29）も同じ", () => {
    const f = forecastMonthEnd(base(), "2026-11-30", undefined, false);
    expect(f.ok && [f.daysAhead, f.projected]).toEqual([0, 4000 + 30000]);
    const d = base();
    d.recurring = [];
    d.transactions = [1, 2, 3, 4].map((i) => tx({ id: `w${i}`, date: `2028-02-0${i}` }));
    const g = forecastMonthEnd(d, "2028-02-29", undefined, false);
    expect(g.ok && [g.daysAhead, g.spent]).toEqual([0, 4000]);
  });
});
