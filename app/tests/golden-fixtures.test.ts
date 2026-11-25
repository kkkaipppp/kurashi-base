import { describe, expect, it } from "vitest";
import { migrate, validateAppData } from "@/lib/schema";
import { ledgerEvents, monthTotals, refundConservationErrors } from "@/lib/ledgerCore";
import { summarizeMonth } from "@/lib/aggregate";
import { cashBalance } from "@/lib/balance";
import type { AppData } from "@/lib/types";

// o11 A02：旧 v1・v2（項目の少ない古いデータ）と、今の項目をすべて使ったデータの「golden fixture」。
// 読めること・台帳の答え・今の集計が一致することを、手で決めた期待値で確かめる（実装から期待値を作らない）
const at = "2026-01-01T00:00:00.000Z";
const cats = [
  { id: "exp-1", name: "食費", kind: "expense", order: 1, archived: false },
  { id: "exp-4", name: "住居", kind: "expense", order: 4, archived: false },
  { id: "inv", name: "投資", kind: "expense", order: 9, archived: false },
  { id: "inc-1", name: "給与", kind: "income", order: 1, archived: false },
];
const t = (o: Record<string, unknown>) => ({ type: "expense", currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: at, updatedAt: at, ...o });

/** v1（2026-11-20 ごろの形）：一覧（タスク等）も旅行もない。取引は基本の項目だけ */
const V1 = {
  schemaVersion: 1,
  transactions: [t({ id: "a", date: "2026-10-03", amount: 1200 }), t({ id: "b", date: "2026-10-25", amount: 300000, type: "income", categoryId: "inc-1" }), t({ id: "c", date: "2026-11-02", amount: 50000, categoryId: "inv" })],
  events: [],
  categories: cats,
  recurring: [],
  budget: { monthly: 100000 },
  prefs: { home: { todaySpent: true, nextRecurring: true, needsReview: true } },
  meta: { createdAt: at, lastBackupAt: null },
};

/** 今の項目をすべて使ったデータ（返金の一部と全額・カード払いと引き落とし・口座間の移動・投資・固定費の一部払い・生活の変化・目標の節目・カード開始債務） */
const FULL = {
  schemaVersion: 2,
  transactions: [
    t({ id: "p1", date: "2026-11-05", amount: 7000, refundGross: 10000 }), // 10,000 のうち 3,000 を返金
    t({ id: "r1", date: "2026-11-08", amount: 3000, type: "income", categoryId: "inc-1", countAs: "transfer", refundOf: "p1" }),
    t({ id: "p2", date: "2026-11-06", amount: 4000, refundGross: 4000, countAs: "transfer", refundWas: "invest", categoryId: "inv" }), // 全額返金（元は投資）
    t({ id: "r2", date: "2026-11-09", amount: 4000, type: "income", categoryId: "inc-1", countAs: "transfer", refundOf: "p2" }),
    t({ id: "k1", date: "2026-11-10", amount: 30000, paymentMethod: "card" }),
    t({ id: "s1", date: "2026-11-27", amount: 100000, countAs: "transfer", transferKind: "card", paymentMethod: "bank" }),
    t({ id: "m1", date: "2026-11-12", amount: 50000, countAs: "transfer" }),
    t({ id: "f1", date: "2026-11-20", amount: 30000, categoryId: "exp-4", recurringId: "rent", recurringPartial: true, recurringDue: "2026-11-27" }),
    t({ id: "i1", date: "2026-11-25", amount: 280000, type: "income", categoryId: "inc-1" }),
  ],
  events: [],
  trips: [],
  categories: cats,
  recurring: [{ id: "rent", name: "家賃", amount: 80000, cycle: "monthly", anchorDay: 27, nextDueDate: "2026-11-27", categoryId: "exp-4", paymentMethod: "", active: true, partialPaid: { due: "2026-11-27", paid: 30000 }, createdAt: at, updatedAt: at }],
  budget: { monthly: 150000 },
  prefs: { home: { todaySpent: true, nextRecurring: true, needsReview: true } },
  meta: { createdAt: at, lastBackupAt: null, lifeChanges: [{ id: "l1", title: "引っ越し", date: "2026-12-01", status: "planned", createdAt: at, items: [{ kind: "budget", before: 150000, after: 170000 }] }] },
  nisa: [], notes: [], tasks: [], contracts: [], health: [], documents: [], studySubjects: [], studyLogs: [],
  assets: [{ id: "a", name: "銀行", kind: "cash", value: 500000, asOf: "2026-11-01", cardDebt: 100000, note: "", createdAt: at, updatedAt: at }],
  goals: [{ id: "g", title: "引っ越す", deadline: "", kind: "check", target: null, current: 0, unit: "", done: false, note: "", steps: [{ id: "st1", text: "見積り", done: false, due: "2026-12-10" }], createdAt: at, updatedAt: at }],
};

describe("golden fixture：旧 v1", () => {
  it("v1 は読み込めて、一覧と旅行が空で足される。記録はそのまま", () => {
    const m = migrate(structuredClone(V1)) as AppData;
    expect(validateAppData(structuredClone(V1)).ok).toBe(true);
    expect(m.schemaVersion).toBe(2);
    expect(m.trips).toEqual([]);
    expect(m.tasks).toEqual([]);
    expect(m.transactions.map((x) => [x.id, x.amount])).toEqual([["a", 1200], ["b", 300000], ["c", 50000]]);
  });
  it("v1 の台帳：10月は支出 1,200・収入 300,000。11月は投資 50,000（生活費 0）。名前に『投資』のカテゴリは投資", () => {
    const m = migrate(structuredClone(V1)) as AppData;
    const ev = ledgerEvents(m);
    expect(monthTotals(ev, "2026-10")).toMatchObject({ purchaseNet: 1200, income: 300000, lifeNet: 1200, investNet: 0 });
    expect(monthTotals(ev, "2026-11")).toMatchObject({ purchaseNet: 50000, lifeNet: 0, investNet: 50000 });
  });
});

describe("golden fixture：今の項目をすべて使ったデータ", () => {
  const d = (): AppData => structuredClone(FULL) as unknown as AppData;
  it("読み込める（すべて任意の項目）", () => {
    expect(validateAppData(d()).ok).toBe(true);
  });
  it("11月の台帳（手で決めた期待値）：購入の今の額 7,000＋0＋30,000＋30,000＝67,000・元の額 10,000＋4,000＋30,000＋30,000＝74,000・返金の戻り 7,000・収入 280,000・引き落とし 100,000", () => {
    const ev = ledgerEvents(d());
    expect(refundConservationErrors(ev)).toEqual([]);
    const m = monthTotals(ev, "2026-11");
    expect(m.purchaseNet).toBe(67000);
    expect(m.purchaseGross).toBe(74000);
    expect(m.refundedInMonth).toBe(7000);
    expect(m.income).toBe(280000);
    expect(m.cardSettled).toBe(100000);
    expect(m.investNet).toBe(0); // 全額返金した投資は 0
    expect(m.lifeNet).toBe(67000);
    expect(m.fixedLifeNet).toBe(30000); // 固定費の一部払い
    // 今の集計とも一致
    const s = summarizeMonth(d().transactions, "2026-11");
    expect(s.expense).toBe(67000);
    expect(s.income).toBe(280000);
  });
  it("残高の目安（手で決めた期待値）：500,000＋280,000−（7,000＋30,000）−100,000＝643,000。カードの引き落とし待ち＝100,000＋30,000−100,000＝30,000（確か）", () => {
    const r = cashBalance(d(), "2026-11-30");
    if (!r.ok) throw new Error("出ない");
    expect(r.balance).toBe(643000);
    expect(r.cardPending).toBe(30000);
    expect(r.cardPendingKnown).toBe(true);
  });
});
