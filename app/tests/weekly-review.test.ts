import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { weeklyReview } from "@/lib/weeklyReview";
import type { AppData, Transaction } from "@/lib/types";

// NEXT v21 Phase 4：週ごとの見直し。記録されたことだけ。0円と「記録なし」を区別する
const now = "2026-11-25T00:00:00.000Z";
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({
  type: "expense", date: "2026-11-24", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now, ...o,
});
// 2026-11-23（月）〜11-29（日）。今日は 11-25（水）
const base = (): AppData => {
  const d = emptyData(now);
  d.categories.push({ id: "inv", name: "証券", kind: "expense", order: 99, archived: false, role: "invest" });
  return d;
};

describe("週ごとの見直し", () => {
  it("今週は今日までの生活費。前の週は同じ曜日（月〜水）までと比べる。投資・収支に数えないものは入れない", () => {
    const d = base();
    d.transactions = [
      tx({ id: "a", date: "2026-11-23", amount: 1000 }),
      tx({ id: "b", date: "2026-11-25", amount: 2000, categoryId: "exp-2" }),
      tx({ id: "c", date: "2026-11-26", amount: 9999 }), // 今日より先は入れない
      tx({ id: "inv", date: "2026-11-24", amount: 50000, categoryId: "inv" }),
      tx({ id: "mv", date: "2026-11-24", amount: 7000, countAs: "transfer" }),
      tx({ id: "p1", date: "2026-11-16", amount: 500 }), // 前の週 月
      tx({ id: "p2", date: "2026-11-18", amount: 700 }), // 前の週 水
      tx({ id: "p3", date: "2026-11-20", amount: 5000 }), // 前の週 金（同じ曜日までに入らない）
    ];
    const r = weeklyReview(d, "2026-11-23", "2026-11-25", true);
    expect(r.spent).toBe(3000);
    expect(r.prevSpent).toBe(1200);
    expect(r.topCategory).toEqual({ categoryId: "exp-2", total: 2000 });
  });
  it("前の週に記録がまったくないときは null（0円と比べない）。過去の週は、その週の最後まで", () => {
    const d = base();
    d.transactions = [tx({ id: "a", date: "2026-11-10", amount: 800 }), tx({ id: "b", date: "2026-11-12", amount: 400 })];
    const past = weeklyReview(d, "2026-11-09", "2026-11-25", true);
    expect(past.spent).toBe(1200);
    expect(past.prevSpent).toBeNull();
    expect(weeklyReview(d, "2026-11-23", "2026-11-25", true).spent).toBe(0);
    expect(weeklyReview(d, "2026-11-23", "2026-11-25", true).topCategory).toBeNull();
  });
  it("次の週にあるもの：予定・固定費・期限のタスク・契約の更新日。済んだもの・止めたものは入れない", () => {
    const d = base();
    d.events = [
      { id: "e1", title: "歯医者", startDate: "2026-11-30", endDate: "2026-11-30", allDay: false, startTime: "10:00", endTime: "11:00", note: "", createdAt: now, updatedAt: now },
      { id: "e0", title: "今週", startDate: "2026-11-25", endDate: "2026-11-25", allDay: true, startTime: "", endTime: "", note: "", createdAt: now, updatedAt: now },
    ];
    d.recurring = [
      { id: "r1", name: "スマホ", amount: 8000, cycle: "monthly", anchorDay: 2, nextDueDate: "2026-12-02", categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now },
      { id: "r2", name: "止めた", amount: 1, cycle: "monthly", anchorDay: 2, nextDueDate: "2026-12-02", categoryId: "exp-5", paymentMethod: "", active: false, createdAt: now, updatedAt: now },
    ];
    d.tasks = [
      { id: "t1", title: "提出", due: "2026-12-01", done: false, note: "", createdAt: now, updatedAt: now },
      { id: "t2", title: "済み", due: "2026-12-01", done: true, note: "", createdAt: now, updatedAt: now },
    ];
    d.contracts = [{ id: "c1", name: "保険", provider: "", amount: null, cycle: "yearly", renewalDate: "2026-12-06", status: "active", note: "", createdAt: now, updatedAt: now }];
    const r = weeklyReview(d, "2026-11-23", "2026-11-25", true);
    expect(r.events).toBe(1); // 今週：11/25 の予定
    expect(r.next.from).toBe("2026-11-30");
    expect(r.next.to).toBe("2026-12-06");
    expect(r.next.events).toBe(1);
    expect(r.next.fixed).toEqual([{ name: "スマホ", amount: 8000, date: "2026-12-02" }]);
    expect(r.next.tasks).toBe(1);
    expect(r.next.renewals).toBe(1);
  });
  it("振り返りの週に出す（自分用の画面）。原因は推測しない", () => {
    expect(readFileSync(join(__dirname, "..", "src", "components", "PeriodReport.tsx"), "utf8")).toContain("<WeeklyReviewCard");
    expect(readFileSync(join(__dirname, "..", "src", "components", "WeeklyReviewCard.tsx"), "utf8")).toContain("理由は推測しません");
  });
});
