import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { accountView, nextCardPayment, reconcile } from "@/lib/accounts";
import { applySettlement, splitTx } from "@/lib/advance";
import { summarizeMonth } from "@/lib/aggregate";
import { validateAppData } from "@/lib/schema";
import type { Account, AppData, Transaction } from "@/lib/types";

// 期待値は決めごと（2026-11-28：口座の残高の目安＝照合した残高＋その後の記録。カードは使った額が引き落とし待ち。振替は出る口座から入る口座へ）から手で作った
const ts = "2026-11-28T00:00:00.000Z";
const today = "2026-11-28";
const acc = (o: Partial<Account> & { id: string; kind: Account["kind"] }): Account => ({ name: o.id, closingDay: null, payDay: null, baseBalance: null, baseDate: "", note: "", archived: false, createdAt: ts, updatedAt: ts, ...o });
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({ type: "expense", date: "2026-11-10", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: ts, updatedAt: ts, ...o });
const bank = acc({ id: "bank", kind: "bank", baseBalance: 100000, baseDate: "2026-11-01" });
const card = acc({ id: "card", kind: "card", closingDay: 15, payDay: 10 });
const emoney = acc({ id: "em", kind: "emoney" });
const data = (): AppData => {
  const d = emptyData(ts);
  d.accounts = [bank, card, emoney];
  d.transactions = [
    tx({ id: "t1", date: "2026-11-05", amount: 3000, accountId: "bank" }),
    tx({ id: "t2", date: "2026-11-10", amount: 5000, accountId: "card", paymentMethod: "card" }),
    tx({ id: "t3", date: "2026-11-12", amount: 1500, accountId: "card", paymentMethod: "card", refundGross: 2000 }),
    tx({ id: "r3", date: "2026-11-14", type: "income", amount: 500, countAs: "transfer", refundOf: "t3", categoryId: "inc-1" }),
    tx({ id: "t4", date: "2026-11-20", amount: 1000, accountId: "card", paymentMethod: "card" }),
    tx({ id: "sal", date: "2026-11-25", type: "income", amount: 200000, accountId: "bank", categoryId: "inc-1" }),
    tx({ id: "pay", date: "2026-11-26", amount: 4000, countAs: "transfer", transferKind: "card", accountId: "bank", toAccountId: "card" }),
    tx({ id: "chg", date: "2026-11-27", amount: 3000, countAs: "transfer", accountId: "bank", toAccountId: "em" }),
    tx({ id: "old", date: "2026-10-31", amount: 99999, accountId: "bank" }),
    tx({ id: "fut", date: "2026-11-30", amount: 7777, accountId: "bank" }),
  ];
  return d;
};

describe("口座・カード・電子マネーの残高の目安", () => {
  it("口座：100,000 − 3,000 ＋ 200,000 − 4,000（カードへ）− 3,000（電子マネーへ）＝ 290,000。照合より前・今日より後の記録は数えない", () => {
    expect(accountView(data(), bank, today)).toEqual({ value: 290000, change: 190000, known: true });
  });
  it("カード（照合なし）：− 5,000 − 2,000（返金の前の額）＋ 500（返金）− 1,000 ＋ 4,000（引き落とし）＝ −3,500（引き落とし待ち 3,500）", () => {
    expect(accountView(data(), card, today)).toEqual({ value: -3500, change: -3500, known: false });
  });
  it("電子マネー（照合なし）：残高は出さず、動き（＋3,000）だけ", () => {
    expect(accountView(data(), emoney, today)).toEqual({ value: null, change: 3000, known: false });
  });
  it("口座の振替と精算は、家計簿の支出・収入に入らない（集計は今までどおり）", () => {
    expect(summarizeMonth(data().transactions, "2026-11")).toMatchObject({ expense: 3000 + 5000 + 1500 + 1000 + 7777, income: 200000 });
  });
});

describe("カードの締め日・引き落とし", () => {
  it("15日締め・翌月10日払い、今日 11/28：11/15 締めの分（10/16〜11/15：5,000 ＋ 2,000 − 500 返金 ＝ 6,500）を 12/10 に。引き落としの 4,000 は引かない", () => {
    expect(nextCardPayment(data(), card, today)).toEqual({ closing: "2026-11-15", from: "2026-10-15", pay: "2026-12-10", amount: 6500 });
  });
  it("月末締め（31日）・翌月27日払い：2月は28日で締める", () => {
    const c = acc({ id: "c2", kind: "card", closingDay: 31, payDay: 27 });
    const d = emptyData(ts);
    d.transactions = [tx({ id: "a", date: "2027-02-28", amount: 1200, accountId: "c2" }), tx({ id: "b", date: "2027-03-01", amount: 800, accountId: "c2" })];
    expect(nextCardPayment(d, c, "2027-03-05")).toEqual({ closing: "2027-02-28", from: "2027-01-31", pay: "2027-03-27", amount: 1200 });
  });
  it("締め日・引き落とし日が無いカード・カードでない口座は出さない", () => {
    expect(nextCardPayment(data(), acc({ id: "x", kind: "card" }), today)).toBeNull();
    expect(nextCardPayment(data(), bank, today)).toBeNull();
  });
});

describe("残高照合", () => {
  it("口座の実際の残高 289,000 → 差 −1,000。照合した残高と日が入り、それより前の記録は数えなくなる", () => {
    const r = reconcile(data(), "bank", 289000, today, ts);
    expect(r.diff).toBe(-1000);
    const b = r.next.accounts.find((a) => a.id === "bank")!;
    expect(b).toMatchObject({ baseBalance: 289000, baseDate: today });
    expect(accountView(r.next, b, today).value).toBe(289000);
  });
  it("カードは引き落とし待ちの額で合わせる（目安 3,500 に対して実際 3,800 → 差 300）", () => {
    const r = reconcile(data(), "card", 3800, today, ts);
    expect(r.diff).toBe(300);
    expect(accountView(r.next, r.next.accounts.find((a) => a.id === "card")!, today).value).toBe(-3800);
  });
});

describe("保存の形：口座・カード", () => {
  it("口座の一覧・記録の口座の印があっても読める。無い古いデータは空の一覧を足す。形の違うものは断る", () => {
    expect(validateAppData(JSON.parse(JSON.stringify(data()))).ok).toBe(true);
    const old = JSON.parse(JSON.stringify(emptyData(ts)));
    delete old.accounts;
    const r = validateAppData(old);
    expect(r.ok && r.data.accounts).toEqual([]);
    for (const f of [(x: AppData) => ((x.accounts[0] as { kind: string }).kind = "wallet"), (x: AppData) => (x.accounts[1].closingDay = 32), (x: AppData) => ((x.transactions[0] as { accountId: unknown }).accountId = 1)]) {
      const bad = JSON.parse(JSON.stringify(data()));
      f(bad);
      expect(validateAppData(bad).ok).toBe(false);
    }
  });
});

describe("点検の直し（口座。2026-11-28）", () => {
  it("高1：割り勘して返してもらうと、元の支出の口座に入る（100,000 − 3,000 ＋ 2,000 ＝ 99,000）。別の口座も選べる", () => {
    const d0 = emptyData(ts);
    d0.accounts = [bank, emoney];
    d0.transactions = [tx({ id: "t", date: "2026-11-10", amount: 3000, accountId: "bank" })];
    const s = splitTx(d0, "t", 3, ts);
    if (!s.ok) throw new Error(s.error);
    const r = applySettlement(s.next, "t", 2000, "2026-11-20", "st", ts);
    if (!r.ok) throw new Error(r.error);
    expect(r.next.transactions.find((x) => x.id === "st")!.accountId).toBe("bank");
    expect(accountView(r.next, bank, today).value).toBe(99000);
    const r2 = applySettlement(s.next, "t", 2000, "2026-11-20", "st", ts, "em");
    if (!r2.ok) throw new Error(r2.error);
    expect(accountView(r2.next, emoney, today).change).toBe(2000);
  });
  it("中1・低1：入る先の無い収入の振替は入る（＋1,000）。同じ口座どうしの振替は動かない", () => {
    const d = emptyData(ts);
    d.accounts = [bank];
    d.transactions = [tx({ id: "a", type: "income", amount: 1000, countAs: "transfer", accountId: "bank", categoryId: "inc-1" }), tx({ id: "b", amount: 1000, countAs: "transfer", accountId: "bank", toAccountId: "bank" })];
    expect(accountView(d, bank, today).value).toBe(101000);
  });
  it("中2：照合した日に、照合のあとで入れた記録は数える（照合の前に入れた記録は数えない）", () => {
    const d = emptyData(ts);
    d.accounts = [bank];
    d.transactions = [tx({ id: "before", date: today, amount: 300, accountId: "bank", createdAt: "2026-11-28T01:00:00.000Z" })];
    const r = reconcile(d, "bank", 100000, today, "2026-11-28T02:00:00.000Z");
    r.next.transactions.push(tx({ id: "after", date: today, amount: 700, accountId: "bank", createdAt: "2026-11-28T03:00:00.000Z" }));
    expect(accountView(r.next, r.next.accounts[0], today).value).toBe(99300);
  });
  it("低2：引き落とし日の当日に引き落としを記録したら、次の分を出す。15日締め・翌月5日払い・年またぎ", () => {
    const c = acc({ id: "c", kind: "card", closingDay: 15, payDay: 5 });
    const d = emptyData(ts);
    d.transactions = [
      tx({ id: "x1", date: "2026-11-15", amount: 6000, accountId: "c" }),
      tx({ id: "x2", date: "2026-11-16", amount: 400, accountId: "c" }),
      tx({ id: "x3", date: "2026-12-20", amount: 900, accountId: "c" }),
    ];
    expect(nextCardPayment(d, c, "2026-12-05")).toMatchObject({ pay: "2026-12-05", amount: 6000 });
    d.transactions.push(tx({ id: "p", date: "2026-12-05", amount: 6000, countAs: "transfer", transferKind: "card", accountId: "bank", toAccountId: "c" }));
    expect(nextCardPayment(d, c, "2026-12-05")).toMatchObject({ closing: "2026-12-15", pay: "2027-01-05", amount: 400 });
    expect(nextCardPayment(d, c, "2027-01-06")).toMatchObject({ closing: "2027-01-15", pay: "2027-02-05", amount: 900 });
  });
});
