import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { ledgerEvents, monthTotals, refundConservationErrors } from "@/lib/ledgerCore";
import { summarizeMonth } from "@/lib/aggregate";
import { monthBreakdown } from "@/lib/monthBreakdown";
import { applyRefund, undoRefund } from "@/lib/refund";
import { validateAppData } from "@/lib/schema";
import type { AppData, Transaction } from "@/lib/types";

// o11 工程2・4（A02・A03）：共通台帳。今の集計と「並行比較」して、同じ答えになることを確かめる（差があれば説明が要る）。
// 合成データは種（seed）つきの乱数で作る。期待値は「今の集計」と「台帳の保存則」から独立に決める。
const now = "2026-11-25T00:00:00.000Z";
const rng = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({ type: "expense", date: "2026-11-10", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now, ...o });

/** 乱数で、購入・収入・カード払い・引き落とし・振替・投資・返金（一部・全額・取り消し）の混ざったデータを作る */
function synth(seed: number): AppData {
  const r = rng(seed);
  let d = emptyData(now);
  d.categories.push({ id: "inv", name: "証券口座へ", kind: "expense", order: 99, archived: false, role: "invest" });
  d.recurring = [{ id: "rc", name: "家賃", amount: 80000, cycle: "monthly", anchorDay: 27, nextDueDate: "2026-12-27", categoryId: "exp-4", paymentMethod: "", active: true, createdAt: now, updatedAt: now }];
  const months = ["2026-09", "2026-10", "2026-11", "2026-12"];
  const txs: Transaction[] = [];
  for (let i = 0; i < 60; i++) {
    const mo = months[Math.floor(r() * months.length)];
    const date = `${mo}-${String(1 + Math.floor(r() * 28)).padStart(2, "0")}`;
    const kind = r();
    const amount = 100 + Math.floor(r() * 50000);
    if (kind < 0.12) txs.push(tx({ id: `i${i}`, type: "income", date, amount, categoryId: "inc-1" }));
    else if (kind < 0.2) txs.push(tx({ id: `s${i}`, date, amount, countAs: "transfer", transferKind: "card" }));
    else if (kind < 0.26) txs.push(tx({ id: `m${i}`, date, amount, countAs: "transfer" }));
    else if (kind < 0.34) txs.push(tx({ id: `v${i}`, date, amount, categoryId: "inv" }));
    else if (kind < 0.4) txs.push(tx({ id: `f${i}`, date, amount: 80000, categoryId: "exp-4", recurringId: "rc" }));
    else txs.push(tx({ id: `p${i}`, date, amount, paymentMethod: r() < 0.4 ? "card" : "cash" }));
  }
  d.transactions = txs;
  // 返金：購入の一部に、1〜3回の返金。ときどき取り消す（順番はばらばら）
  const purchases = txs.filter((t) => t.id.startsWith("p") || t.id.startsWith("v"));
  let n = 0;
  for (const p of purchases) {
    if (r() > 0.35) continue;
    const times = 1 + Math.floor(r() * 3);
    const made: string[] = [];
    for (let k = 0; k < times; k++) {
      const cur = d.transactions.find((x) => x.id === p.id)!;
      const left = (cur.refundGross ?? cur.amount) - d.transactions.filter((x) => x.refundOf === p.id).reduce((a, x) => a + x.amount, 0);
      if (left <= 0) break;
      const amt = r() < 0.3 ? left : 1 + Math.floor(r() * left);
      const id = `r${n++}`;
      const res = applyRefund(d, p.id, amt, months[Math.floor(r() * months.length)] + "-15", id, now);
      if (res.ok) {
        d = res.next;
        made.push(id);
      }
    }
    if (made.length && r() < 0.4) d = undoRefund(d, made[Math.floor(r() * made.length)], now);
  }
  return d;
}

describe("共通台帳：今の集計との並行比較（200通りの合成データ）", () => {
  it("どの月も、支出・収入・生活費・投資・固定費が、今の集計と一致する。保存則も保たれる", () => {
    for (let s = 1; s <= 200; s++) {
      const d = synth(s);
      expect(validateAppData(d).ok).toBe(true);
      const ev = ledgerEvents(d);
      expect(refundConservationErrors(ev)).toEqual([]);
      for (const mo of ["2026-09", "2026-10", "2026-11", "2026-12"]) {
        const a = summarizeMonth(d.transactions, mo);
        const b = monthBreakdown(d, mo, "2026-11-25");
        const t = monthTotals(ev, mo);
        expect(t.purchaseNet).toBe(a.expense);
        expect(t.income).toBe(a.income);
        expect(t.lifeNet).toBe(b.lifeExpense);
        expect(t.investNet).toBe(b.invest);
        expect(t.fixedLifeNet).toBe(b.fixed);
      }
    }
  });
});

describe("共通台帳：出来事の分け方と日付", () => {
  it("購入日・返金日・現金が動く日（引き落とし）は別。返金は返金日の月で『戻り』として数え、支出は購入月で減る", () => {
    let d = emptyData(now);
    d.transactions = [tx({ id: "p", date: "2026-10-20", amount: 50000, paymentMethod: "card" }), tx({ id: "s", date: "2026-11-27", amount: 50000, countAs: "transfer", transferKind: "card" })];
    const res = applyRefund(d, "p", 20000, "2026-11-05", "r", now);
    if (!res.ok) throw new Error(res.error);
    d = res.next;
    const ev = ledgerEvents(d);
    const oct = monthTotals(ev, "2026-10");
    const nov = monthTotals(ev, "2026-11");
    expect(oct.purchaseGross).toBe(50000);
    expect(oct.purchaseNet).toBe(30000); // 購入月の実績は、返金を引いた額
    expect(nov.refundedInMonth).toBe(20000); // 返金の戻りは、返金日の月
    expect(nov.purchaseNet).toBe(0);
    expect(nov.cardSettled).toBe(50000); // 引き落としは、現金が動く日の月。支出ではない
    expect(nov.income).toBe(0);
  });
  it("全額返金した購入は、購入として残り（元の額は分かる）、今の額は 0。取り消せば元に戻る", () => {
    let d = emptyData(now);
    d.transactions = [tx({ id: "p", amount: 10000 })];
    const res = applyRefund(d, "p", 10000, "2026-11-12", "r", now);
    if (!res.ok) throw new Error(res.error);
    d = res.next;
    const p = ledgerEvents(d).find((e) => e.txId === "p");
    expect(p).toMatchObject({ kind: "purchase", gross: 10000, net: 0 });
    const back = ledgerEvents(undoRefund(d, "r", now)).find((e) => e.txId === "p");
    expect(back).toMatchObject({ kind: "purchase", gross: 10000, net: 10000 });
  });
  it("返金の順番を入れ替えても、最後の今の額は同じ（順序に依存しない）", () => {
    const base = (): AppData => {
      const d = emptyData(now);
      d.transactions = [tx({ id: "p", amount: 10000 })];
      return d;
    };
    const run = (order: [number, string][], undo: string) => {
      let d = base();
      for (const [amt, id] of order) {
        const r = applyRefund(d, "p", amt, "2026-11-12", id, now);
        if (!r.ok) throw new Error(r.error);
        d = r.next;
      }
      return ledgerEvents(undoRefund(d, undo, now)).find((e) => e.txId === "p");
    };
    const a = run([[3000, "a"], [2000, "b"], [5000, "c"]], "b");
    const b = run([[5000, "c"], [3000, "a"], [2000, "b"]], "b");
    expect(a).toMatchObject({ net: 2000 });
    expect(b).toMatchObject({ net: 2000 });
  });
  it("保存則が崩れたデータ（返金の合計と今の額が合わない）は、勝手に直さず、要確認として返す", () => {
    const d = emptyData(now);
    d.transactions = [
      tx({ id: "p", amount: 7000, refundGross: 10000 }),
      tx({ id: "r", type: "income", amount: 2000, countAs: "transfer", refundOf: "p", categoryId: "inc-1" }), // 本当は 3000 のはず
    ];
    expect(refundConservationErrors(ledgerEvents(d))).toEqual(["p"]);
  });
});
