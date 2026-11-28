import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { cashBalance } from "@/lib/balance";
import { summarizeMonth } from "@/lib/aggregate";
import { validateAppData } from "@/lib/schema";
import { applyRefund, deleteTxWithRefunds } from "@/lib/refund";
import { applySettlement, checkAdvance, openAdvances, owedLeft, owedTotal } from "@/lib/advance";
import { countedEntries, ledgerEvents, refundConservationErrors } from "@/lib/ledgerCore";
import { findDuplicates } from "@/lib/duplicates";
import { dataHealth } from "@/lib/dataHealth";
import { settleProblems } from "@/lib/advance";
import type { AppData, Transaction } from "@/lib/types";

// 期待値は決定（2026-11-28：金額は自分の分・総額を控える。精算は収支に数えない）と To-Be 03 から手で作った
const now = "2026-11-28T00:00:00.000Z";
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({ type: "expense", date: "2026-11-10", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "居酒屋", paymentMethod: "cash", note: "", source: "manual", createdAt: now, updatedAt: now, ...o });
const data = (txs: Transaction[], base = true): AppData => {
  const d = emptyData(now);
  if (base) d.assets = [{ id: "a", name: "銀行", kind: "cash", value: 100000, asOf: "2026-11-01", note: "", createdAt: now, updatedAt: now }];
  d.transactions = txs;
  return d;
};
const adv = tx({ id: "adv", amount: 1000, advanceGross: 4000 });
const settle = (d: AppData, amount: number, id = "s1", date = "2026-11-15") => {
  const r = applySettlement(d, "adv", amount, date, id, now);
  if (!r.ok) throw new Error(r.error);
  return r.next;
};
const bal = (d: AppData) => {
  const r = cashBalance(d, "2026-11-28");
  if (!r.ok) throw new Error("出ない");
  return r;
};

describe("立替と精算（To-Be 段階2 家計簿）", () => {
  it("4,000円を立替・自分の分 1,000円 → 今月の支出は 1,000円、返してもらう分 3,000円", () => {
    const d = data([adv]);
    expect(summarizeMonth(d.transactions, "2026-11").expense).toBe(1000);
    expect(owedLeft(d, adv)).toBe(3000);
    expect(owedTotal(d)).toBe(3000);
  });

  it("3,000円返してもらう → 返してもらう分 0円・収入は増えない・一覧から消える", () => {
    const d = settle(data([adv]), 3000);
    const m = summarizeMonth(d.transactions, "2026-11");
    expect(m.expense).toBe(1000);
    expect(m.income).toBe(0);
    expect(owedLeft(d, adv)).toBe(0);
    expect(openAdvances(d)).toEqual([]);
    expect(countedEntries(ledgerEvents(d)).map((e) => e.txId)).toEqual(["adv"]);
  });

  it("2回に分けて返してもらえる。残りより多い・0円・日付の誤り・立替でない・同じ ID は断る", () => {
    let d = settle(data([adv, tx({ id: "plain" })]), 1000, "s1");
    expect(owedLeft(d, adv)).toBe(2000);
    expect(applySettlement(d, "adv", 2001, "2026-11-20", "s2", now).ok).toBe(false);
    expect(applySettlement(d, "adv", 0, "2026-11-20", "s2", now).ok).toBe(false);
    expect(applySettlement(d, "adv", 1.5, "2026-11-20", "s2", now).ok).toBe(false);
    expect(applySettlement(d, "adv", 100, "2026-02-30", "s2", now).ok).toBe(false);
    expect(applySettlement(d, "plain", 100, "2026-11-20", "s2", now).ok).toBe(false);
    expect(applySettlement(d, "adv", 100, "2026-11-20", "s1", now).ok).toBe(false);
    expect(applySettlement(d, "gone", 100, "2026-11-20", "s2", now).ok).toBe(false);
    d = settle(d, 2000, "s2");
    expect(owedLeft(d, adv)).toBe(0);
    expect(applySettlement(d, "adv", 1, "2026-11-20", "s3", now).ok).toBe(false);
  });

  it("残高の目安：現金で立替 → 払った 4,000円が出る。返してもらった 3,000円が入る", () => {
    expect(bal(data([adv])).balance).toBe(100000 - 4000);
    const r = bal(settle(data([adv]), 3000));
    expect(r.balance).toBe(100000 - 4000 + 3000);
    expect(r.settledIn).toBe(3000);
    expect(r.advancedOut).toBe(3000);
  });

  it("残高の目安：カードで立替 → 引き落とし待ちが総額 4,000円増え、現金は減らない。返してもらった現金は入る", () => {
    const card = tx({ id: "adv", amount: 1000, advanceGross: 4000, paymentMethod: "card" });
    const r = bal(data([card]));
    expect(r.balance).toBe(100000);
    expect(r.cardPending).toBe(4000);
    expect(bal(settle(data([card]), 3000)).balance).toBe(103000);
  });

  it("返金の保存則の点検に立替が引っかからない（総額は返金の元の額と別）", () => {
    expect(refundConservationErrors(ledgerEvents(settle(data([adv]), 1000)))).toEqual([]);
  });

  it("立替の記録は返金にできない（総額と食い違うため）", () => {
    const r = applyRefund(data([adv]), "adv", 500, "2026-11-20", "r1", now);
    expect(r.ok).toBe(false);
  });

  it("立替の記録を消すと、精算の記録も一緒に消える（返してもらった記録だけが残らない）", () => {
    const d = deleteTxWithRefunds(settle(data([adv, tx({ id: "other" })]), 1000), "adv");
    expect(d.transactions.map((t) => t.id)).toEqual(["other"]);
  });

  it("入力の確かめ：自分の分は 1円以上・総額より少ない", () => {
    expect(checkAdvance(4000, 1000)).toBeNull();
    expect(checkAdvance(4000, 0)).not.toBeNull();
    expect(checkAdvance(4000, 4000)).not.toBeNull();
    expect(checkAdvance(4000, 5000)).not.toBeNull();
    expect(checkAdvance(1, 1)).not.toBeNull();
    expect(checkAdvance(4000, 999.5)).not.toBeNull();
  });

  it("保存の形：立替・精算のあるデータを読める。古いデータ（項目なし）もそのまま。形の違うものは断る", () => {
    const d = settle(data([adv], false), 1000);
    expect(validateAppData(JSON.parse(JSON.stringify(d))).ok).toBe(true);
    expect(validateAppData(JSON.parse(JSON.stringify(data([tx({ id: "x" })], false)))).ok).toBe(true);
    const bad = JSON.parse(JSON.stringify(data([tx({ id: "x" })], false)));
    bad.transactions[0].advanceGross = "4000";
    expect(validateAppData(bad).ok).toBe(false);
    const bad2 = JSON.parse(JSON.stringify(data([tx({ id: "x" })], false)));
    bad2.transactions[0].settles = 3;
    expect(validateAppData(bad2).ok).toBe(false);
  });
});

describe("立替と精算：点検の直し（2026-11-28）", () => {
  it("中1：総額で入れた同じ支払い（カード明細の 4,000円）を、重複の候補に出す", () => {
    const c = findDuplicates({ type: "expense", date: "2026-11-10", amount: 4000, merchant: "居酒屋", paymentMethod: "card" }, [adv]);
    expect(c.map((x) => x.tx.id)).toEqual(["adv"]);
    const h = dataHealth(data([adv, tx({ id: "dup", amount: 4000 })]), "2026-11-28");
    expect(h.some((f) => f.id === "dup")).toBe(true);
  });

  it("中2：立替が無い・立替でない・多すぎる・数え方の無い精算は、残高に入れず、点検に出す", () => {
    const orphan = tx({ id: "o", type: "income", amount: 2000, countAs: "transfer", settles: "nothing", categoryId: "inc-1" });
    expect(bal(data([adv, orphan])).balance).toBe(100000 - 4000);
    expect(settleProblems(data([adv, orphan]))).toEqual(["o"]);
    expect(dataHealth(data([adv, orphan]), "2026-11-28").some((f) => f.id === "settle-bad")).toBe(true);
    const over = [adv, tx({ id: "s1", type: "income", amount: 3000, countAs: "transfer", settles: "adv", categoryId: "inc-1" }), tx({ id: "s2", type: "income", amount: 3000, countAs: "transfer", settles: "adv", categoryId: "inc-1" })];
    expect(bal(data(over)).balance).toBe(100000 - 4000 + 3000);
    expect(settleProblems(data(over)).sort()).toEqual(["s1", "s2"]);
    const plain = [tx({ id: "p" }), tx({ id: "s", type: "income", amount: 500, countAs: "transfer", settles: "p", categoryId: "inc-1" })];
    expect(bal(data(plain)).balance).toBe(100000 - 1000);
    const noCount = tx({ id: "nc", type: "income", amount: 3000, settles: "adv", categoryId: "inc-1" });
    expect(owedLeft(data([adv, noCount]), adv)).toBe(3000);
    expect(settleProblems(data([adv, noCount]))).toEqual(["nc"]);
  });
});
