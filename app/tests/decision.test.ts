import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { FEATURE_EDITIONS } from "@/lib/edition";
import { assessPurchase } from "@/lib/decision";
import type { AppData, Transaction } from "@/lib/types";

// NEXT v21 DECISION_SUPPORT：買い物の判断。買うかどうかは言わない。ホームと同じ計算
const now = "2026-11-25T00:00:00.000Z";
const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({ type: "expense", date: "2026-11-10", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now, ...o });
const base = (): AppData => {
  const d = emptyData(now);
  d.categories.push({ id: "inv", name: "証券", kind: "expense", order: 99, archived: false, role: "invest" });
  d.budget.monthly = 120000;
  d.recurring = [
    { id: "r", name: "スマホ", amount: 8000, cycle: "monthly", anchorDay: 28, nextDueDate: "2026-11-28", categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now },
    { id: "r2", name: "積立", amount: 30000, cycle: "monthly", anchorDay: 5, nextDueDate: "2026-12-05", categoryId: "inv", paymentMethod: "", active: true, createdAt: now, updatedAt: now },
  ];
  d.transactions = [tx({ id: "a", amount: 96420 }), tx({ id: "b", categoryId: "inv", amount: 100000 })];
  return d;
};

describe("買い物の判断", () => {
  it("今月に買ったら：自由に使える残り・1日あたりが、ホームと同じ計算で減る（指示書の例：残り7日）", () => {
    const a = assessPurchase(base(), 10000, "2026-11-24", true);
    expect(a.freeLeft).toEqual({ before: 15580, after: 5580 });
    expect(a.daysLeft).toBe(7);
    expect(a.perDay).toEqual({ before: 2225, after: 797 });
    expect(a.overFree).toBe(false);
  });
  it("予算を超える買い物は、自由に使える残りがマイナスになり、overFree。1日あたりは0円", () => {
    const a = assessPurchase(base(), 20000, "2026-11-24", true);
    expect(a.freeLeft.after).toBe(-4420);
    expect(a.overFree).toBe(true);
    expect(a.perDay.after).toBe(0);
  });
  it("予算がなければ、予算との比較は出さない（null）。来月の割合も出さない", () => {
    const d = base();
    d.budget.monthly = null;
    const a = assessPurchase(d, 10000, "2026-11-24");
    expect(a.freeLeft).toEqual({ before: null, after: null });
    expect(a.vsBudget).toBeNull();
    expect(a.nextMonth.amountShareOfBudget).toBeNull();
  });
  it("来月に回したら：予算に対する割合と、来月に来る固定費（登録されている予定額。投資の積立は入れない）。年またぎも", () => {
    const a = assessPurchase(base(), 30000, "2026-11-24", true);
    expect(a.nextMonth).toEqual({ budget: 120000, fixed: 8000, amountShareOfBudget: 25 }); // スマホ 8000 は来月も来る。積立 30000 は入れない
    const e = base();
    e.recurring[0].nextDueDate = "2027-01-28";
    expect(assessPurchase(e, 1000, "2026-12-20", true).nextMonth.fixed).toBe(8000); // 12月 → 1月
  });
  it("月末の見込みがあれば、予算との差も出す。記録が少ないときは出さない", () => {
    const d = base();
    d.transactions = [...d.transactions, ...Array.from({ length: 5 }, (_, i) => tx({ id: `v${i}`, date: `2026-11-0${i + 1}`, amount: 1000 }))];
    const a = assessPurchase(d, 10000, "2026-11-24");
    expect(a.projected?.after).toBe((a.projected?.before ?? 0) + 10000);
    expect(a.vsBudget).not.toBeNull();
    expect(assessPurchase(emptyData(now), 1000, "2026-11-24").projected).toBeNull();
  });
  it("自分用と公開版の両方。「買うべき」とは言わない。外へ送らない", () => {
    expect(FEATURE_EDITIONS.decide).toEqual({ personal: true, public: true }); // 2026-11-25 平尾さんの決定（①）：自分用と友達用（公開版）の両方で出す
    const page = src("app/decide/page.tsx");
    expect(page).toContain("買うかどうかは、決めません");
    expect(page).not.toMatch(/買うべき|買わない方|おすすめ/); // 画面の言葉は、判断を押しつけない
    expect(page + src("lib/decision.ts")).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon/);
    expect(src("lib/menuGroups.ts")).toContain('href: "/decide"'); // o31 F003：メニューの一覧は app/menu/page.tsx から lib/menuGroups.ts に移した（中身は同じ。見る場所だけ変えた）
  });
});
