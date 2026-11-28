import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { summarizeMonth } from "@/lib/aggregate";
import { budgetSpent, monthLedger } from "@/lib/ledger";
import { yearSpecial } from "@/lib/specialBudget";
import { validateAppData } from "@/lib/schema";
import { addLifeChange, applyLifeChange, undoLifeChange } from "@/lib/lifeChange";
import { weeklyReview } from "@/lib/weeklyReview";
import { buildWidgetSummary } from "@/lib/widgetSummary";
import type { Transaction } from "@/lib/types";

// 期待値は決めごと（2026-11-28：特別支出は支出に数えるが、月の予算と比べず年の予算と比べる・予算の履歴を残す）から手で作った
const ts = "2026-11-28T00:00:00.000Z";
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({ type: "expense", date: "2026-11-10", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: ts, updatedAt: ts, ...o });

describe("特別支出", () => {
  it("帰省 30,000円（特別）＋食費 5,000円 → 今月の支出は 35,000円、月の予算と比べる額は 5,000円、今年の特別支出は 30,000円", () => {
    const d = emptyData(ts);
    d.budget.monthly = 100000;
    d.transactions = [tx({ id: "s", amount: 30000, special: true }), tx({ id: "f", amount: 5000 }), tx({ id: "old", date: "2025-12-01", amount: 9000, special: true })];
    expect(summarizeMonth(d.transactions, "2026-11").expense).toBe(35000);
    expect(budgetSpent(d, "2026-11", "2026-11-28", true)).toBe(5000);
    expect(monthLedger(d, "2026-11", "2026-11-28", true).spent).toBe(5000);
    expect(yearSpecial(d, "2026")).toBe(30000);
    expect(yearSpecial(d, "2025")).toBe(9000);
  });

  it("保存の形：特別支出の印・年の予算・予算の履歴は省ける。形が違えば断る", () => {
    const d = emptyData(ts);
    d.budget = { monthly: 100000, yearlySpecial: 300000, history: [{ at: "2026-11-28", monthly: 100000 }] };
    d.transactions = [tx({ id: "s", special: true })];
    expect(validateAppData(JSON.parse(JSON.stringify(d))).ok).toBe(true);
    type Raw = { budget: Record<string, unknown>; transactions: Record<string, unknown>[] };
    for (const f of [(x: Raw) => (x.budget.yearlySpecial = -1), (x: Raw) => (x.budget.history = [{ at: "11/28", monthly: 1 }]), (x: Raw) => (x.transactions[0].special = false)]) {
      const bad = JSON.parse(JSON.stringify(d));
      f(bad);
      expect(validateAppData(bad).ok).toBe(false);
    }
  });
});

describe("点検の直し（2026-11-28）", () => {
  it("高1：生活の変化で月の予算を変えても、特別支出の年の予算と履歴は消えない。変化は履歴に残り、取り消しも残る", () => {
    let d = emptyData(ts);
    d.budget = { monthly: 100000, yearlySpecial: 300000, history: [{ at: "2026-10-01", monthly: 100000 }] };
    d = addLifeChange(d, { id: "lc", title: "引っ越し", date: "2026-12-01", status: "planned", createdAt: ts, items: [{ kind: "budget", before: 100000, after: 120000 }] });
    d = applyLifeChange(d, "lc", "2026-12-01T00:00:00.000Z").next;
    expect(d.budget).toEqual({ monthly: 120000, yearlySpecial: 300000, history: [{ at: "2026-10-01", monthly: 100000 }, { at: "2026-12-01", monthly: 120000 }] });
    d = undoLifeChange(d, "lc", "2026-12-02T00:00:00.000Z");
    expect(d.budget.monthly).toBe(100000);
    expect(d.budget.yearlySpecial).toBe(300000);
    expect(d.budget.history?.at(-1)).toEqual({ at: "2026-12-02", monthly: 100000 });
  });
  it("中2：週のふりかえりの「使ったお金」には特別支出を入れる（30,000＋5,000＝35,000）", () => {
    const d = emptyData(ts);
    d.transactions = [tx({ id: "s", date: "2026-11-23", amount: 30000, special: true }), tx({ id: "f", date: "2026-11-24", amount: 5000 })];
    expect(weeklyReview(d, "2026-11-23", "2026-11-28", true).spent).toBe(35000);
  });
  it("低：ウィジェットの予定にも「（仮）」", () => {
    const d = emptyData(ts);
    d.events = [{ id: "e", title: "歯医者", startDate: "2026-11-28", endDate: "2026-11-28", allDay: false, startTime: "10:00", endTime: "11:00", note: "", tentative: true, createdAt: ts, updatedAt: ts }];
    expect(buildWidgetSummary(d, "2026-11-28", ts).events[0].title).toBe("（仮）歯医者");
  });
});
