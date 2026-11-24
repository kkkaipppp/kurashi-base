import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dailyInWeek, monthlyInYear, summarizePeriod, weekRange, yearRange } from "@/lib/periods";
import { FEATURE_EDITIONS } from "@/lib/edition";
import type { Transaction } from "@/lib/types";

const tx = (p: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36), type: "expense", date: "2026-11-24", amount: 1000, currency: "JPY", categoryId: "exp-1",
  merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: "x", updatedAt: "x", ...p,
});

describe("週・年の収支（2026-11-24 平尾さん：年間と週の収支も見たい）", () => {
  it("週は月曜はじまり（日曜はその前の月曜から）。月や年をまたいでもよい", () => {
    expect(weekRange("2026-11-24")).toEqual({ from: "2026-11-23", to: "2026-11-29" }); // 火曜
    expect(weekRange("2026-11-29")).toEqual({ from: "2026-11-23", to: "2026-11-29" }); // 日曜
    expect(weekRange("2026-11-23")).toEqual({ from: "2026-11-23", to: "2026-11-29" }); // 月曜
    expect(weekRange("2027-01-01")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
  });
  it("期間の支出・収入・収支とカテゴリ別（多い順）。期間の外は数えない", () => {
    const txs = [
      tx({ date: "2026-11-23", amount: 500, categoryId: "a" }),
      tx({ date: "2026-11-29", amount: 2000, categoryId: "b" }),
      tx({ date: "2026-11-24", type: "income", amount: 10000, categoryId: "inc-1" }),
      tx({ date: "2026-11-30", amount: 9999 }),
    ];
    const s = summarizePeriod(txs, "2026-11-23", "2026-11-29");
    expect([s.expense, s.income, s.balance, s.count]).toEqual([2500, 10000, 7500, 3]);
    expect(s.byCategory).toEqual([{ categoryId: "b", total: 2000 }, { categoryId: "a", total: 500 }]);
    expect(dailyInWeek(txs, "2026-11-23").map((d) => d.expense)).toEqual([500, 0, 0, 0, 0, 0, 2000]);
  });
  it("年の12か月と、年の範囲", () => {
    const txs = [tx({ date: "2026-01-05", amount: 100 }), tx({ date: "2026-12-31", type: "income", amount: 300 }), tx({ date: "2025-12-31", amount: 7 })];
    const m = monthlyInYear(txs, 2026);
    expect(m).toHaveLength(12);
    expect([m[0].expense, m[11].income]).toEqual([100, 300]);
    expect(yearRange(2026)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
  it("まず自分用だけで有効（公開版には出さない）", () => {
    expect(FEATURE_EDITIONS.periodReport).toEqual({ personal: true, public: false });
    const page = readFileSync(join(__dirname, "..", "src", "app", "report", "page.tsx"), "utf8");
    // 表（FEATURE_EDITIONS）と、組み立てで外す条件がそろっていること（personal だけ）
    expect(page).toContain('const PERIOD_REPORT = process.env.NEXT_PUBLIC_KB_EDITION === "personal";');
    expect(page).toContain("if (!PERIOD_REPORT) return <MonthReportPage />;");
  });
});
