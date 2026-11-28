import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { emptyData } from "@/lib/defaults";
import { installmentPlan, installmentStatus } from "@/lib/installments";
import { summarizeMonth } from "@/lib/aggregate";
import { validateAppData } from "@/lib/schema";
import { COLLECTION_KEYS, type Transaction } from "@/lib/types";

// 期待値は決めごと（To-Be 04「外貨は最小単位＋通貨＋換算根拠」・02「分割払い」。2026-11-28）から手で作った
const ts = "2026-11-28T00:00:00.000Z";

// 通貨の一覧は自分用だけ（版の値は読み込みのときに決まる）。自分用として読み込み直す
let fx: typeof import("@/lib/fx");
let pubFx: typeof import("@/lib/fx");
beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "public");
  vi.resetModules();
  pubFx = await import("@/lib/fx");
  vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "personal");
  vi.resetModules();
  fx = await import("@/lib/fx");
}, 60_000);
afterAll(() => vi.unstubAllEnvs());
const parseForeign = (s: string, c: string) => fx.parseForeign(s, c);
const formatForeign = (f: Parameters<typeof fx.formatForeign>[0]) => fx.formatForeign(f);
const foreignToInput = (f: Parameters<typeof fx.foreignToInput>[0]) => fx.foreignToInput(f);
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({ type: "expense", date: "2026-11-10", amount: 1878, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: ts, updatedAt: ts, ...o });

describe("外貨の読み取り", () => {
  it("最小単位の整数にする。小数の桁が多い・0・読めないものは断る", () => {
    expect(parseForeign("12.5", "USD")).toBe(1250);
    expect(parseForeign("１，２３４．５６", "USD")).toBe(123456);
    expect(parseForeign("12", "USD")).toBe(1200);
    expect(parseForeign("12.345", "USD")).toBeNull();
    expect(parseForeign("15000", "KRW")).toBe(15000);
    expect(parseForeign("15000.5", "KRW")).toBeNull();
    expect(parseForeign("0", "USD")).toBeNull();
    expect(parseForeign("-3", "USD")).toBeNull();
    expect(parseForeign("12", "XXX")).toBeNull();
  });
  it("カンマは3桁ごとの区切りだけ。「12,50」（小数のつもりかもしれない）は断る。「12.」「.5」は読む（点検 中2・低5）", () => {
    expect(parseForeign("12,50", "EUR")).toBeNull();
    expect(parseForeign("１２，５０", "EUR")).toBeNull();
    expect(parseForeign("1,2,3", "USD")).toBeNull();
    expect(parseForeign("1,234", "USD")).toBe(123400);
    expect(parseForeign("12,345,678.9", "USD")).toBe(1234567890);
    expect(parseForeign("12.", "USD")).toBe(1200);
    expect(parseForeign(".5", "USD")).toBe(50);
    expect(parseForeign("100.", "KRW")).toBe(100);
    expect(parseForeign(".", "USD")).toBeNull();
    expect(parseForeign("", "USD")).toBeNull();
  });
  it("公開版には通貨の一覧が無い（入力の欄も出ない）", () => {
    expect(pubFx.CURRENCIES).toEqual([]);
    expect(pubFx.parseForeign("12.5", "USD")).toBeNull();
  });
  it("見せ方と、入力の欄への戻し方", () => {
    expect(formatForeign({ currency: "USD", minor: 123456, digits: 2, basis: "" })).toBe("USD 1,234.56");
    expect(formatForeign({ currency: "KRW", minor: 15000, digits: 0, basis: "" })).toBe("KRW 15,000");
    expect(foreignToInput({ currency: "USD", minor: 1250, digits: 2, basis: "" })).toBe("12.50");
  });
  it("外貨の控えがあっても、収支は円の金額で数える（外貨の額は数えない）", () => {
    const d = emptyData(ts);
    d.transactions = [tx({ id: "a", fx: { currency: "USD", minor: 1250, digits: 2, basis: "1USD=150.24円" } })];
    expect(summarizeMonth(d.transactions, "2026-11").expense).toBe(1878);
  });
});

describe("分割払いの予定", () => {
  it("10万円を24回：毎月 4,166円、割り切れない 16円は1回目（4,182円）。合計は総額と同じ", () => {
    const p = installmentPlan({ total: 100000, count: 24, firstDate: "2026-12-27" });
    expect(p).toHaveLength(24);
    expect(p[0]).toEqual({ date: "2026-12-27", amount: 4182 });
    expect(p[1]).toEqual({ date: "2027-01-27", amount: 4166 });
    expect(p[23].date).toBe("2028-11-27");
    expect(p.reduce((s, x) => s + x.amount, 0)).toBe(100000);
  });
  it("31日が1回目なら、短い月は月末（2月は28日、うるう年は29日）", () => {
    expect(installmentPlan({ total: 3000, count: 3, firstDate: "2027-01-31" }).map((x) => x.date)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
    expect(installmentPlan({ total: 2000, count: 2, firstDate: "2028-01-31" }).map((x) => x.date)).toEqual(["2028-01-31", "2028-02-29"]);
  });
  it("今日までに払った回・残り・次の支払い。支払日の当日は払った回に入る。払い終わったら次はない", () => {
    const x = { total: 30000, count: 3, firstDate: "2026-10-27" };
    expect(installmentStatus(x, "2026-11-26")).toEqual({ paidCount: 1, left: 20000, next: { date: "2026-11-27", amount: 10000 } });
    expect(installmentStatus(x, "2026-11-27")).toEqual({ paidCount: 2, left: 10000, next: { date: "2026-12-27", amount: 10000 } });
    expect(installmentStatus(x, "2027-01-01")).toEqual({ paidCount: 3, left: 0, next: null });
    expect(installmentStatus(x, "2026-10-01").paidCount).toBe(0);
  });
});

describe("保存の形", () => {
  it("外貨の控え・分割払いがあるデータも、無い古いデータも読める（分割払いは空で足す）。形の違うものは断る", () => {
    const d = emptyData(ts);
    d.transactions = [tx({ id: "a", fx: { currency: "USD", minor: 1250, digits: 2, basis: "" } })];
    d.installments = [{ id: "i", name: "スマホ", total: 100000, count: 24, firstDate: "2026-12-27", note: "", createdAt: ts, updatedAt: ts }];
    expect(validateAppData(JSON.parse(JSON.stringify(d))).ok).toBe(true);
    const old = JSON.parse(JSON.stringify(emptyData(ts)));
    delete old.installments;
    const r = validateAppData(old);
    expect(r.ok && r.data.installments).toEqual([]);
    for (const [path, v] of [["fx.currency", "usd"], ["fx.minor", 0], ["fx.minor", 1.5], ["fx.digits", 4]] as const) {
      const bad = JSON.parse(JSON.stringify(d));
      const [a, b] = path.split(".");
      bad.transactions[0][a][b] = v;
      expect(validateAppData(bad).ok, `${path}=${v}`).toBe(false);
    }
    for (const [k, v] of [["count", 0], ["count", 121], ["total", 0], ["firstDate", ""]] as const) {
      const bad = JSON.parse(JSON.stringify(d));
      bad.installments[0][k] = v;
      expect(validateAppData(bad).ok, `${k}=${v}`).toBe(false);
    }
    expect(COLLECTION_KEYS).toContain("installments");
  });
});
