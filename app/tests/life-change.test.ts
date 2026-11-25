import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { addLifeChange, applyLifeChange, dueChanges, listChanges, monthlyImpact, removePlanned, totalMonthlyImpact, undoLifeChange, type LifeChange } from "@/lib/lifeChange";
import { validateAppData } from "@/lib/schema";
import type { AppData } from "@/lib/types";

// NEXT v21 B03：生活変化。本人が押したときだけ適用・ずれた項目は変えない・取り消せる・過去の記録は書き換えない
const now = "2026-11-25T00:00:00.000Z";
const seed = (): AppData => {
  const d = emptyData(now);
  d.budget.monthly = 150000;
  d.recurring = [
    { id: "rent", name: "家賃", amount: 80000, cycle: "monthly", anchorDay: 27, nextDueDate: "2026-11-27", categoryId: "exp-4", paymentMethod: "", active: true, createdAt: now, updatedAt: now },
    { id: "net", name: "ネット", amount: 4000, cycle: "monthly", anchorDay: 5, nextDueDate: "2026-12-05", categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now },
    { id: "ins", name: "保険", amount: 12000, cycle: "yearly", anchorDay: 1, nextDueDate: "2027-03-01", categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now },
  ];
  d.transactions = [{ id: "t", type: "expense", date: "2026-10-27", amount: 80000, currency: "JPY", categoryId: "exp-4", merchant: "家賃", paymentMethod: "", note: "", source: "manual", recurringId: "rent", createdAt: now, updatedAt: now }];
  return d;
};
const move = (): LifeChange => ({
  id: "c1",
  title: "引っ越し",
  date: "2026-12-01",
  status: "planned",
  createdAt: now,
  items: [
    { kind: "recurringAmount", recurringId: "rent", name: "家賃", before: 80000, after: 95000 },
    { kind: "recurringStop", recurringId: "net", name: "ネット" },
    { kind: "budget", before: 150000, after: 170000 },
  ],
});

describe("生活変化", () => {
  it("計画を足しただけでは、設定は変わらない。適用日が来たら『知らせる』だけで、自動では変えない", () => {
    const d = addLifeChange(seed(), move());
    expect(d.recurring[0].amount).toBe(80000);
    expect(d.budget.monthly).toBe(150000);
    expect(dueChanges(d, "2026-11-30")).toEqual([]);
    expect(dueChanges(d, "2026-12-01").map((c) => c.id)).toEqual(["c1"]);
    expect(validateAppData(d).ok).toBe(true);
  });
  it("適用すると、固定費の金額・やめる・予算が変わる。過去の記録は、そのまま。履歴に残る", () => {
    const d0 = addLifeChange(seed(), move());
    const r = applyLifeChange(d0, "c1", now);
    expect(r.applied).toBe(3);
    expect(r.skipped).toBe(0);
    expect(r.next.recurring.find((x) => x.id === "rent")?.amount).toBe(95000);
    expect(r.next.recurring.find((x) => x.id === "net")?.active).toBe(false);
    expect(r.next.budget.monthly).toBe(170000);
    expect(r.next.transactions).toEqual(d0.transactions);
    expect(listChanges(r.next)[0].status).toBe("applied");
    expect(validateAppData(r.next).ok).toBe(true);
  });
  it("変更前の値が今と違う項目（その後に本人が変えた）は、変えずに知らせる", () => {
    const d0 = addLifeChange(seed(), move());
    d0.recurring = d0.recurring.map((r) => (r.id === "rent" ? { ...r, amount: 82000 } : r));
    const r = applyLifeChange(d0, "c1", now);
    expect(r.applied).toBe(2);
    expect(r.skipped).toBe(1);
    expect(r.next.recurring.find((x) => x.id === "rent")?.amount).toBe(82000);
  });
  it("取り消すと、適用した分が元に戻る。取り消し後に本人が変えた項目は触らない。履歴は残る", () => {
    const d0 = addLifeChange(seed(), move());
    const a = applyLifeChange(d0, "c1", now).next;
    const edited: AppData = { ...a, budget: { monthly: 180000 } }; // 適用後に、本人が予算をさらに変えた
    const u = undoLifeChange(edited, "c1", now);
    expect(u.recurring.find((x) => x.id === "rent")?.amount).toBe(80000);
    expect(u.recurring.find((x) => x.id === "net")?.active).toBe(true);
    expect(u.budget.monthly).toBe(180000); // 触らない
    expect(listChanges(u)[0].status).toBe("undone");
    expect(listChanges(u)).toHaveLength(1);
  });
  it("二重に適用しない。適用済みは消せない。計画は消せる", () => {
    const a = applyLifeChange(addLifeChange(seed(), move()), "c1", now).next;
    expect(applyLifeChange(a, "c1", now).applied).toBe(0);
    expect(listChanges(removePlanned(a, "c1"))).toHaveLength(1);
    expect(listChanges(removePlanned(addLifeChange(seed(), move()), "c1"))).toHaveLength(0);
  });
  it("影響は1か月あたり：家賃 +15,000、ネット −4,000（やめる）、保険（年払い）をやめると −1,000", () => {
    const d = seed();
    expect(monthlyImpact(d, { kind: "recurringAmount", recurringId: "rent", name: "", before: 80000, after: 95000 })).toBe(15000);
    expect(monthlyImpact(d, { kind: "recurringStop", recurringId: "net", name: "" })).toBe(-4000);
    expect(monthlyImpact(d, { kind: "recurringStop", recurringId: "ins", name: "" })).toBe(-1000);
    expect(totalMonthlyImpact(d, move())).toBe(11000);
  });
  it("古いデータ（生活変化の項目なし）は、そのまま読める。壊れた形は拒否する", () => {
    expect(validateAppData(seed()).ok).toBe(true);
    const bad = seed();
    (bad.meta as unknown as { lifeChanges: unknown }).lifeChanges = [{ id: 1 }];
    expect(validateAppData(bad).ok).toBe(false);
  });
});
