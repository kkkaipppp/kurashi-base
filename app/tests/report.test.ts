import { describe, expect, it } from "vitest";
import { buildInsights, expenseUntilDay, monthReport, weeklyBuckets } from "@/lib/report";
import { emptyData } from "@/lib/defaults";
import type { Transaction } from "@/lib/types";

const tx = (date: string, amount: number, categoryId = "exp-1", type: "expense" | "income" = "expense"): Transaction => ({
  id: Math.random().toString(36), type, date, amount, currency: "JPY", categoryId, merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: date, updatedAt: date,
});

describe("振り返りの計算", () => {
  it("週ごとの支出は 1〜7・8〜14・15〜21・22〜28・29〜月末 に分かれ、合計が月の支出と一致する", () => {
    const txs = [tx("2026-11-01", 100), tx("2026-11-07", 200), tx("2026-11-08", 300), tx("2026-11-30", 400), tx("2026-12-01", 999), tx("2026-11-15", 50, "inc-1", "income")];
    const w = weeklyBuckets(txs, "2026-11");
    expect(w.map((b) => b.label)).toEqual(["1〜7日", "8〜14日", "15〜21日", "22〜28日", "29〜30日"]);
    expect(w.map((b) => b.expense)).toEqual([300, 300, 0, 0, 400]);
    expect(w.reduce((s, b) => s + b.expense, 0)).toBe(monthReport({ ...emptyData(), transactions: txs }, "2026-11").expense);
  });
  it("2月は 29日〜 の区切りが出ない年もある", () => {
    expect(weeklyBuckets([], "2026-02").map((b) => b.label)).toEqual(["1〜7日", "8〜14日", "15〜21日", "22〜28日"]);
  });
  it("〜日までの支出は、31日まである月から30日の月へも正しく切る", () => {
    const txs = [tx("2026-10-31", 500), tx("2026-10-15", 100)];
    expect(expenseUntilDay(txs, "2026-10", 15)).toBe(100);
    expect(expenseUntilDay(txs, "2026-10", 31)).toBe(600);
  });
});

describe("くらしの気づき（B10：データがないときは出さない）", () => {
  it("記録が0件なら何も出さない", () => {
    expect(buildInsights(emptyData(), "2026-11", "2026-11-21")).toEqual([]);
  });
  it("先月の記録がなければ比較は出さない", () => {
    const d = { ...emptyData(), transactions: [tx("2026-11-10", 5000)] };
    expect(buildInsights(d, "2026-11", "2026-11-21").some((i) => i.key === "total")).toBe(false);
  });
  it("月の途中は先月の同じ日までと比べる", () => {
    const d = { ...emptyData(), transactions: [tx("2026-11-10", 6000), tx("2026-10-10", 5000), tx("2026-10-25", 90000)] };
    const i = buildInsights(d, "2026-11", "2026-11-21");
    expect(i[0].text).toBe("今月の支出は先月の同じ日までより¥1,000多いです（+20%）");
  });
  it("いちばん増えたカテゴリは、1,000円以上増えたときだけ", () => {
    const d = {
      ...emptyData(),
      transactions: [tx("2026-11-05", 8000, "exp-1"), tx("2026-10-05", 5000, "exp-1"), tx("2026-11-05", 1500, "exp-3"), tx("2026-10-05", 1000, "exp-3")],
    };
    const i = buildInsights(d, "2026-11", "2026-11-21");
    expect(i.find((x) => x.key === "cat")?.text).toBe("食費が先月の同じ日までより¥3,000多いです（+60%）");
    expect(i.find((x) => x.key === "cat")?.href).toBe("/history?m=2026-11&cat=exp-1");
  });
  it("月末の見込みは、予算があり7日目以降だけ", () => {
    const d = { ...emptyData(), transactions: [tx("2026-11-02", 3000)] };
    expect(buildInsights(d, "2026-11", "2026-11-10").some((i) => i.key === "pace")).toBe(false);
    d.budget.monthly = 50000;
    expect(buildInsights(d, "2026-11", "2026-11-06").some((i) => i.key === "pace")).toBe(false);
    expect(buildInsights(d, "2026-11", "2026-11-10").find((i) => i.key === "pace")?.text).toBe("このペースだと、月末の支出は約¥9,000になりそうです（予算は ¥50,000）");
  });
});
