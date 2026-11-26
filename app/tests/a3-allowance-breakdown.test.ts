import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { allowanceBreakdown } from "@/lib/allowanceBreakdown";
import { monthLedger } from "@/lib/ledger";
import type { AppData, CalendarEvent, Transaction } from "@/lib/types";

// A3（2026-11-26）：ホームの「1日あたり」の内訳。期待値は手で計算した（指示書の例：予算 120,000・生活費 96,420・投資 100,000・固定費 8,000・残り7日）
const now = "2026-11-24T00:00:00.000Z";
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({ type: "expense", date: "2026-11-10", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now, ...o });
const ev = (o: Partial<CalendarEvent> & { id: string }): CalendarEvent => ({ title: "予定", startDate: "2026-11-27", endDate: "2026-11-27", allDay: true, startTime: "", endTime: "", note: "", createdAt: now, updatedAt: now, ...o });
const base = (): AppData => {
  const d = emptyData(now);
  d.categories.push({ id: "inv", name: "証券", kind: "expense", order: 99, archived: false, role: "invest" });
  d.budget.monthly = 120000;
  d.recurring = [
    { id: "r1", name: "スマホ", amount: 8000, cycle: "monthly", anchorDay: 28, nextDueDate: "2026-11-28", categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now },
    { id: "r2", name: "積立", amount: 30000, cycle: "monthly", anchorDay: 28, nextDueDate: "2026-11-28", categoryId: "inv", paymentMethod: "", active: true, createdAt: now, updatedAt: now },
  ];
  d.transactions = [tx({ id: "a", amount: 96420 }), tx({ id: "b", categoryId: "inv", amount: 100000 })];
  return d;
};
const today = "2026-11-24";

describe("A3 今月あといくらの内訳", () => {
  it("自分用：120,000 − 96,420 − 固定費 8,000（スマホ。積立は除く）＝ 15,580。÷ 7日 ＝ 2,225。ホームと同じ数字", () => {
    const b = allowanceBreakdown(base(), today, true)!;
    expect([b.budget, b.spent, b.unpaidFixed, b.freeLeft, b.daysLeft, b.perDay]).toEqual([120000, 96420, 8000, 15580, 7, 2225]);
    expect(b.fixed).toEqual([{ name: "スマホ", date: "2026-11-28", amount: 8000 }]);
    const l = monthLedger(base(), "2026-11", today, true);
    expect([l.freeLeft, l.perDay]).toEqual([b.freeLeft, b.perDay]);
  });
  it("固定費の1件ずつの合計は、引いた固定費と同じ（一部だけ払った固定費は残りだけ）", () => {
    const d = base();
    d.recurring[0].partialPaid = { due: "2026-11-28", paid: 3000 };
    const b = allowanceBreakdown(d, today, true)!;
    expect(b.fixed).toEqual([{ name: "スマホ", date: "2026-11-28", amount: 5000 }]);
    expect(b.unpaidFixed).toBe(5000);
  });
  it("予定の費用の目安：今日〜月末だけ・何日もの予定は1回・終わった回と過去は数えない。引いた場合の1日あたり（15,580 − 9,000）÷ 7 ＝ 940", () => {
    const d = base();
    d.events = [
      ev({ id: "e1", title: "飲み会", cost: 6000 }),
      ev({ id: "e2", title: "旅行", startDate: "2026-11-29", endDate: "2026-11-30", cost: 2000 }),
      ev({ id: "e3", title: "ジム", startDate: "2026-11-17", endDate: "2026-11-17", repeat: "weekly", repeatUntil: "", cost: 1000 }), // 11/24 の回だけ
      ev({ id: "e4", title: "過去", startDate: "2026-11-20", endDate: "2026-11-20", cost: 5000 }),
      ev({ id: "e5", title: "済み", startDate: "2026-11-25", endDate: "2026-11-25", cost: 4000, doneDates: ["2026-11-25"] }),
      ev({ id: "e6", title: "来月", startDate: "2026-12-01", endDate: "2026-12-01", cost: 7000 }),
    ];
    const b = allowanceBreakdown(d, today, true)!;
    expect(b.eventCosts).toEqual([
      { title: "ジム", date: "2026-11-24", cost: 1000 },
      { title: "飲み会", date: "2026-11-27", cost: 6000 },
      { title: "旅行", date: "2026-11-29", cost: 2000 },
    ]);
    expect([b.eventCostTotal, b.perDayWithEvents]).toEqual([9000, 940]);
    expect(b.freeLeft).toBe(15580); // 予定の目安は、上の計算では引かない
  });
  it("予算がなければ出さない。目安がなければ「引いた場合」も出さない", () => {
    const d = base();
    expect(allowanceBreakdown(d, today, true)!.perDayWithEvents).toBeNull();
    d.budget.monthly = null;
    expect(allowanceBreakdown(d, today, true)).toBeNull();
  });
  it("自分用だけ（公開版の組み立てには入れない）", () => {
    const home = readFileSync(join(__dirname, "..", "src", "app", "page.tsx"), "utf8");
    expect(home).toContain('const AllowanceDetails = PERSONAL ? dynamic(() => import("@/components/AllowanceDetails")');
  });
});
