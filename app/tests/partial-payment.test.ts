import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { applyRecurringPayment, revertPartialPayment, applyTxUpdate, partialMark } from "@/lib/dataOps";
import { unpaidRecurringThisMonth } from "@/lib/allowance";
import { buildTodayItems } from "@/lib/todayItems";
import { validateAppData } from "@/lib/schema";
import { monthLedger } from "@/lib/ledger";
import type { AppData, RecurringExpense, Transaction } from "@/lib/types";

// NEXT v21 X02：予定5000・一部の実績3000なら、未消化2000。全部払ったら残りは消える。取り消しは一部の分だけ戻す
const now = "2026-11-25T00:00:00.000Z";
const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");
const rc = (o: Partial<RecurringExpense> = {}): RecurringExpense => ({ id: "r", name: "ジム", amount: 5000, cycle: "monthly", anchorDay: 28, nextDueDate: "2026-11-28", categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now, ...o });
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({ type: "expense", date: "2026-11-25", amount: 3000, currency: "JPY", categoryId: "exp-5", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now, ...o });

describe("固定費の一部の支払い（X02）", () => {
  it("予定5000・一部3000 → 次の支払日は進まず、未払いは2000。残り2000を払うと、次の支払日が進み、未払いは0", () => {
    const a = applyRecurringPayment([rc()], "r", 3000, true, now);
    expect(a[0].nextDueDate).toBe("2026-11-28");
    expect(a[0].partialPaid).toEqual({ due: "2026-11-28", paid: 3000 });
    expect(unpaidRecurringThisMonth(a, "2026-11-25")).toBe(2000);
    const b = applyRecurringPayment(a, "r", 2000, true, now); // 残りを払った（一部として足しても、届いたら完了）
    expect(b[0].nextDueDate).toBe("2026-12-28");
    expect(b[0].partialPaid).toBeUndefined();
    expect(unpaidRecurringThisMonth(b, "2026-11-25")).toBe(0);
  });
  it("全額として記録すると、一部の記録を消して次の支払日を進める。1回で予定額以上でも、一度だけ進める", () => {
    const a = applyRecurringPayment([rc({ partialPaid: { due: "2026-11-28", paid: 3000 } })], "r", 2000, false, now);
    expect(a[0].nextDueDate).toBe("2026-12-28");
    expect(a[0].partialPaid).toBeUndefined();
    expect(applyRecurringPayment([rc()], "r", 9000, true, now)[0].nextDueDate).toBe("2026-12-28");
  });
  it("一部の支払いの記録を消すと、その分を戻す（0になったら一部払いの記録も消す）。一部でない記録は触らない", () => {
    const a = applyRecurringPayment([rc()], "r", 3000, true, now);
    const r1 = revertPartialPayment(a, tx({ id: "t", recurringId: "r", recurringPartial: true, recurringDue: "2026-11-28", amount: 1000 }), now);
    expect(r1[0].partialPaid?.paid).toBe(2000);
    const r2 = revertPartialPayment(a, tx({ id: "t", recurringId: "r", recurringPartial: true, recurringDue: "2026-11-28", amount: 3000 }), now);
    expect(r2[0].partialPaid).toBeUndefined();
    expect(revertPartialPayment(a, tx({ id: "t", recurringId: "r", amount: 3000 }), now)).toBe(a);
  });
  it("編集で一部の支払いとしてつなぐと、次の支払日は進まない（二重に引かない）。自由に使える残りは、残りの分だけ引く", () => {
    const d: AppData = emptyData(now);
    d.budget.monthly = 100000;
    d.recurring = [rc()];
    d.transactions = [tx({ id: "t", amount: 3000 })];
    const base = ((): Omit<Transaction, "id" | "createdAt" | "updatedAt" | "currency"> => {
      const { id: _i, createdAt: _c, updatedAt: _u, currency: _cur, ...p } = d.transactions[0]; // eslint-disable-line @typescript-eslint/no-unused-vars
      return p;
    })();
    const before = monthLedger(d, "2026-11", "2026-11-25");
    expect(before.unpaidFixed).toBe(5000);
    const next = applyTxUpdate(d, "t", { ...base, recurringId: "r", recurringPartial: true }, now);
    expect(next.transactions[0]).toMatchObject({ recurringPartial: true, recurringDue: "2026-11-28" });
    expect(next.recurring[0].nextDueDate).toBe("2026-11-28");
    expect(next.recurring[0].partialPaid?.paid).toBe(3000);
    const after = monthLedger(next, "2026-11", "2026-11-25");
    expect(after.unpaidFixed).toBe(2000);
    expect(after.lifeExpense).toBe(3000); // 払った分は生活費に入る
    expect(after.freeLeft).toBe(100000 - 3000 - 2000); // 予定5000の合計は変わらない
  });
  it("今日のまとめ・カレンダーには、残りの額を出す。バックアップの往復で残る。おかしな値は断る", () => {
    const d: AppData = emptyData(now);
    d.recurring = [rc({ nextDueDate: "2026-11-25", partialPaid: { due: "2026-11-25", paid: 3000 } })];
    const item = buildTodayItems(d, "2026-11-25").find((i) => i.key === "rc-r");
    expect(item?.title).toContain("¥2,000");
    expect(item?.sub).toContain("一部 ¥3,000 は支払い済み");
    expect(src("app/calendar/page.tsx")).toContain("r.amount - r.partialPaid.paid");
    const ok = validateAppData(JSON.parse(JSON.stringify(d)));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data.recurring[0].partialPaid).toEqual({ due: "2026-11-25", paid: 3000 });
    const bad = JSON.parse(JSON.stringify(d));
    bad.recurring[0].partialPaid = { due: "x", paid: 1 };
    expect(validateAppData(bad).ok).toBe(false);
    const bad2 = JSON.parse(JSON.stringify(emptyData(now)));
    bad2.transactions = [{ ...tx({ id: "z" }), recurringPartial: "yes" }];
    expect(validateAppData(bad2).ok).toBe(false);
  });
  it("入力で選べる（予定額より少ないときだけ）。つながないと今までどおり", () => {
    const s = src("components/TxSheet.tsx");
    expect(s).toContain("一部だけの支払い（残り");
    expect(s).toContain("recurringPartial: true");
    expect(src("lib/store.tsx")).toContain("applyRecurringPayment(d.recurring, t.recurringId, t.amount, !!t.recurringPartial, ts)");
    expect(src("lib/store.tsx")).toContain("revertPartialPayment(d.recurring, tx, now())");
  });
});

describe("一部の支払い：取り消しが別の回を巻き込まない・完了の記録に一部の印を付けない（点検役の指摘）", () => {
  it("1回目の一部払いの記録を消しても、2回目の払い分は戻らない", () => {
    // 1回目：3000＋2000（完了）→ 次の支払日へ。2回目：1000 を一部払い
    let list = [rc()];
    const first = tx({ id: "a", recurringId: "r", amount: 3000, ...partialMark(list, "r", 3000, true) });
    list = applyRecurringPayment(list, "r", 3000, true, now);
    const second = tx({ id: "b", recurringId: "r", amount: 2000, ...partialMark(list, "r", 2000, true) });
    list = applyRecurringPayment(list, "r", 2000, true, now);
    expect(list[0].nextDueDate).toBe("2026-12-28");
    expect(second.recurringPartial).toBeUndefined(); // 完了させた記録に、一部の印は付かない
    const third = tx({ id: "c", recurringId: "r", amount: 1000, ...partialMark(list, "r", 1000, true) });
    list = applyRecurringPayment(list, "r", 1000, true, now);
    expect(third).toMatchObject({ recurringPartial: true, recurringDue: "2026-12-28" });
    expect(list[0].partialPaid).toEqual({ due: "2026-12-28", paid: 1000 });
    // 1回目（11/28 の分）の記録を消す：今の払い分（12/28 の分）は動かない
    const after = revertPartialPayment(list, first, now);
    expect(after[0].partialPaid).toEqual({ due: "2026-12-28", paid: 1000 });
    // 同じ回の記録を消すと戻る
    expect(revertPartialPayment(list, third, now)[0].partialPaid).toBeUndefined();
  });
  it("全部払い終わる額は、一部の印を付けない。印のない記録・支払日のない記録は、消しても何も戻さない", () => {
    const list = [rc()];
    expect(partialMark(list, "r", 5000, true)).toEqual({});
    expect(partialMark(list, "r", 6000, true)).toEqual({});
    expect(partialMark(list, "r", 2000, false)).toEqual({});
    expect(partialMark(list, "r", 2000, true)).toEqual({ recurringPartial: true, recurringDue: "2026-11-28" });
    const a = applyRecurringPayment(list, "r", 3000, true, now);
    expect(revertPartialPayment(a, tx({ id: "x", recurringId: "r", recurringPartial: true, amount: 3000 }), now)).toBe(a);
  });
});

