import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyData } from "@/lib/defaults";
import { paydayBudget, paydayPeriod } from "@/lib/paydayBudget";
import { buildNavi } from "@/lib/navi";
import { validateAppData } from "@/lib/schema";
import { COLLECTION_KEYS, type PointCard, type Transaction } from "@/lib/types";

// 期待値は決めごと（2026-11-28：給料日〜次の給料日の前日。月末を超える給料日は月末。ポイントは期限の30日前から確認に出す）から手で作った
const ts = "2026-11-28T00:00:00.000Z";
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({ type: "expense", date: "2026-11-26", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: ts, updatedAt: ts, ...o });
const pt = (o: Partial<PointCard> & { id: string }): PointCard => ({ name: "Aポイント", balance: 500, expiry: "", note: "", createdAt: ts, updatedAt: ts, ...o });

describe("給料日からの期間", () => {
  it.each([
    ["2026-11-28", 25, "2026-11-25", "2026-12-24"],
    ["2026-11-25", 25, "2026-11-25", "2026-12-24"], // 給料日の当日から
    ["2026-11-24", 25, "2026-10-25", "2026-11-24"], // 給料日の前日まで
    ["2026-01-05", 25, "2025-12-25", "2026-01-24"], // 年またぎ
    ["2026-12-25", 25, "2026-12-25", "2027-01-24"],
    ["2026-02-28", 31, "2026-02-28", "2026-03-30"], // 31日の月末丸め（2026年2月は28日まで）
    ["2026-03-15", 31, "2026-02-28", "2026-03-30"],
    ["2026-03-31", 31, "2026-03-31", "2026-04-29"], // 4月は30日が給料日 → 前日の29日まで
    ["2028-02-29", 30, "2028-02-29", "2028-03-29"], // うるう年
    ["2026-11-01", 1, "2026-11-01", "2026-11-30"], // 1日なら月と同じ
  ])("今日 %s・給料日 %i日 → %s〜%s", (today, payday, from, to) => {
    expect(paydayPeriod(today, payday)).toEqual({ from, to });
  });
});

describe("給料日からの予算", () => {
  it("予算 10万円・25日給料日・今日 11/28：前日 3,000円は数えない。11/25 5,000円＋11/28 2,000円＋先の日付 11/29 9,000円（月の予算と同じく数える）＝16,000円。期間の後・特別支出・収入は数えない。残り 84,000円・27日・1日 3,111円", () => {
    const d = emptyData(ts);
    d.budget.monthly = 100000;
    d.budget.payday = 25;
    d.transactions = [
      tx({ id: "a", date: "2026-11-24", amount: 3000 }),
      tx({ id: "b", date: "2026-11-25", amount: 5000 }),
      tx({ id: "c", date: "2026-11-28", amount: 2000 }),
      tx({ id: "f", date: "2026-11-29", amount: 9000 }),
      tx({ id: "after", date: "2026-12-25", amount: 7000 }),
      tx({ id: "s", date: "2026-11-26", amount: 50000, special: true }),
      tx({ id: "i", date: "2026-11-25", amount: 250000, type: "income", categoryId: "inc-1" }),
    ];
    expect(paydayBudget(d, "2026-11-28", true)).toEqual({ from: "2026-11-25", to: "2026-12-24", budget: 100000, spent: 16000, left: 84000, daysLeft: 27, perDay: 3111 });
  });

  it("超えたら残りはマイナスで1日の目安は出さない。給料日か予算が無ければ出さない", () => {
    const d = emptyData(ts);
    d.budget.monthly = 5000;
    d.budget.payday = 25;
    d.transactions = [tx({ id: "b", amount: 8000 })];
    const p = paydayBudget(d, "2026-11-28", true);
    expect(p?.left).toBe(-3000);
    expect(p?.perDay).toBeNull();
    d.budget.payday = null;
    expect(paydayBudget(d, "2026-11-28", true)).toBeNull();
    d.budget.payday = 25;
    d.budget.monthly = null;
    expect(paydayBudget(d, "2026-11-28", true)).toBeNull();
  });
});

describe("保存の形：給料日・ポイント", () => {
  it("給料日・ポイントのあるデータも、無い古いデータも読める（ポイントは空で足す）。形の違うものは断る", () => {
    const d = emptyData(ts);
    d.budget.payday = 25;
    d.points = [pt({ id: "p", expiry: "2026-12-01" })];
    expect(validateAppData(JSON.parse(JSON.stringify(d))).ok).toBe(true);
    const old = JSON.parse(JSON.stringify(emptyData(ts)));
    delete old.points;
    const r = validateAppData(old);
    expect(r.ok && r.data.points).toEqual([]);
    for (const [k, v] of [["balance", -5], ["balance", 1.5]] as const) {
      const b = JSON.parse(JSON.stringify(d));
      b.points[0][k] = v;
      expect(validateAppData(b).ok, `${k}=${v}`).toBe(false);
    }
    for (const v of [0, 32, 1.5, "25"]) {
      const bad = JSON.parse(JSON.stringify(d));
      bad.budget.payday = v;
      expect(validateAppData(bad).ok, String(v)).toBe(false);
    }
    const bad = JSON.parse(JSON.stringify(d));
    bad.points[0].expiry = "2026-13-01";
    expect(validateAppData(bad).ok).toBe(false);
    expect(COLLECTION_KEYS).toContain("points");
  });
});

describe("ポイントの期限をホームの確認に出す（自分用）", () => {
  afterEach(() => vi.unstubAllEnvs());
  const data = () => {
    const d = emptyData(ts);
    d.points = [
      pt({ id: "soon", name: "近い", expiry: "2026-12-03" }), // あと5日
      pt({ id: "edge", name: "ちょうど", expiry: "2026-12-28" }), // あと30日
      pt({ id: "far", name: "遠い", expiry: "2026-12-29" }), // あと31日 → 出さない
      pt({ id: "past", name: "過ぎた", expiry: "2026-11-27" }), // 過ぎた → 出さない
      pt({ id: "zero", name: "空", expiry: "2026-12-01", balance: 0 }), // 残り0 → 出さない
      pt({ id: "none", name: "期限なし" }),
      pt({ id: "today", name: "当日", expiry: "2026-11-28" }), // 今日まで
    ];
    return d;
  };
  it("期限の30日前から。残り0・期限なし・過ぎたものは出さない。7日以内は強め", () => {
    vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "personal");
    const items = buildNavi(data(), "2026-11-28").filter((i) => i.key.startsWith("pt-"));
    expect(items.map((i) => i.key).sort()).toEqual(["pt-edge", "pt-soon", "pt-today"]);
    expect(items.find((i) => i.key === "pt-today")?.title).toBe("当日のポイントの期限は今日まで");
    expect(items.find((i) => i.key === "pt-soon")?.title).toBe("近いのポイントの期限まであと5日");
    expect(items.find((i) => i.key === "pt-soon")?.tone).toBe("today");
    expect(items.find((i) => i.key === "pt-edge")?.tone).toBe("info");
  });
  it("公開版では出さない", () => {
    vi.stubEnv("NEXT_PUBLIC_KB_EDITION", "public");
    expect(buildNavi(data(), "2026-11-28").some((i) => i.key.startsWith("pt-"))).toBe(false);
  });
});
