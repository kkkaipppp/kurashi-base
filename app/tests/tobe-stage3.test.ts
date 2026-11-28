import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { validateAppData } from "@/lib/schema";
import { monthlyNet, netWorth, valueAt, withHistory, HISTORY_MAX } from "@/lib/assetTrend";
import { contractMoney, danglingContracts, monthlyOf } from "@/lib/contractLink";
import { buildNavi } from "@/lib/navi";
import { suggestions } from "@/lib/suggestions";
import { deadlineDays } from "@/lib/deadlines";
import { buildTodayItems } from "@/lib/todayItems";
import { deadlinesOn } from "@/lib/deadlines";
import type { AppData, Asset, Contract, Goal, RecurringExpense } from "@/lib/types";

// 期待値は決定（2026-11-28 S3-1〜S3-3 ①）と To-Be 03 から手で作った
const ts = "2026-11-28T00:00:00.000Z";
const asset = (o: Partial<Asset>): Asset => ({ id: "a", name: "銀行", kind: "cash", value: 100000, asOf: "2026-11-01", note: "", createdAt: ts, updatedAt: ts, ...o });
const goal = (o: Partial<Goal>): Goal => ({ id: "g", title: "本", deadline: "2026-11-28", kind: "number", target: 10, current: 1, unit: "冊", done: false, note: "", createdAt: ts, updatedAt: ts, ...o });
const rec = (o: Partial<RecurringExpense>): RecurringExpense => ({ id: "r", name: "スマホ", amount: 3000, cycle: "monthly", anchorDay: 5, nextDueDate: "2026-12-05", categoryId: "exp-5", paymentMethod: "card", active: true, createdAt: ts, updatedAt: ts, ...o });
const contract = (o: Partial<Contract>): Contract => ({ id: "c", name: "スマホ", provider: "", amount: 2500, cycle: "monthly", renewalDate: "", status: "active", note: "", createdAt: ts, updatedAt: ts, ...o });
const roundtrip = (d: AppData) => validateAppData(JSON.parse(JSON.stringify(d)));

describe("S3-1 資産：負債・純資産・推移", () => {
  it("純資産＝資産 − 負債。評価額が空欄は数えない（0 にしない）", () => {
    expect(netWorth([asset({ value: 300000 }), asset({ debt: true, value: 120000 }), asset({ value: null })])).toEqual({ assets: 300000, debts: 120000, net: 180000, unknown: 1 });
    expect(netWorth([asset({ debt: true, value: 50000 })]).net).toBe(-50000);
  });

  it("評価額か評価日を直すと、前の値を推移に残す。変えなければ残さない・空欄は残さない・同じ評価日は置き換え・24件まで", () => {
    const prev = asset({ value: 100000, asOf: "2026-10-31" });
    expect(withHistory(prev, { value: 120000, asOf: "2026-11-30" })).toEqual([{ asOf: "2026-10-31", value: 100000 }]);
    expect(withHistory(prev, { value: 100000, asOf: "2026-10-31" })).toBeUndefined();
    expect(withHistory(asset({ value: null, asOf: "" }), { value: 5, asOf: "2026-11-30" })).toBeUndefined();
    // 同じ評価日のまま額だけ直した：古い値は、今の値に置き換わるので残さない
    expect(withHistory(prev, { value: 110000, asOf: "2026-10-31" })).toEqual([]);
    // 評価額を空欄にしたときは、前の値を残す（点検 低）
    expect(withHistory(prev, { value: null, asOf: "2026-10-31" })).toEqual([{ asOf: "2026-10-31", value: 100000 }]);
    const many = asset({ history: Array.from({ length: HISTORY_MAX }, (_, i) => ({ asOf: `2024-${String((i % 12) + 1).padStart(2, "0")}-0${Math.floor(i / 12) + 1}`, value: i })), value: 1, asOf: "2026-01-01" });
    const h = withHistory(many, { value: 2, asOf: "2026-02-01" })!;
    expect(h.length).toBe(HISTORY_MAX);
    expect(h.at(-1)).toEqual({ asOf: "2026-01-01", value: 1 });
  });

  it("月末ごとの純資産：その月末に分かる値だけ。負債は引く", () => {
    const a = asset({ value: 120000, asOf: "2026-11-15", history: [{ asOf: "2026-09-30", value: 100000 }] });
    const debt = asset({ id: "d", debt: true, value: 30000, asOf: "2026-10-10" });
    expect(valueAt(a, "2026-08-31")).toBeNull();
    expect(monthlyNet([a, debt], ["2026-08", "2026-09", "2026-10", "2026-11"])).toEqual([
      { month: "2026-08", net: 0, counted: 0 },
      { month: "2026-09", net: 100000, counted: 1 },
      { month: "2026-10", net: 70000, counted: 2 },
      { month: "2026-11", net: 90000, counted: 2 },
    ]);
  });
});

describe("S3-2 目標：休止", () => {
  it("休止中の目標は、ホームの確認・今日の期限・やることの節目に出さない（再開すれば出る）", () => {
    const d = emptyData(ts);
    d.goals = [goal({ pausedAt: "2026-11-20", steps: [{ id: "s", text: "1冊目", done: false, due: "2026-11-28" }] })];
    expect(buildNavi(d, "2026-11-28").filter((x) => x.key.startsWith("goal-"))).toEqual([]);
    expect(buildTodayItems(d, "2026-11-28").filter((x) => x.key.startsWith("goal-"))).toEqual([]);
    expect(deadlinesOn(d, "2026-11-28").filter((x) => x.key.startsWith("g"))).toEqual([]);
    expect([...deadlineDays(d, "2026-11")]).toEqual([]);
    expect(suggestions(d, "2026-11-28", {}).filter((x) => x.key.includes(":g"))).toEqual([]);
    d.goals = [goal({ steps: [{ id: "s", text: "1冊目", done: false, due: "2026-11-28" }] })];
    expect(buildNavi(d, "2026-11-28").some((x) => x.key === "goal-g")).toBe(true);
    expect(suggestions(d, "2026-11-28", {}).some((x) => x.key === "step:g:s")).toBe(true);
    expect([...deadlineDays(d, "2026-11")]).toEqual(["2026-11-28"]);
    expect(deadlinesOn(d, "2026-11-28").some((x) => x.key === "gs-g-s")).toBe(true);
  });
});

describe("S3-3 契約と固定費のつなぎ", () => {
  it("つないだ契約は、固定費の金額・周期を使う。つなぎ先が無ければ契約の金額", () => {
    expect(contractMoney(contract({ recurringId: "r" }), [rec({ amount: 3300, cycle: "yearly" })])).toEqual({ amount: 3300, per: "year", source: "recurring" });
    expect(contractMoney(contract({ recurringId: "gone" }), [rec({})])).toEqual({ amount: 2500, per: "month", source: "contract" });
    expect(monthlyOf({ amount: 1200, per: "week", source: "recurring" })).toBe(5200);
    expect(monthlyOf({ amount: 12000, per: "year", source: "contract" })).toBe(1000);
    expect(monthlyOf({ amount: 5000, per: "once", source: "contract" })).toBe(0);
    expect(danglingContracts([contract({ recurringId: "gone" }), contract({ id: "c2" })], [rec({})]).map((c) => c.id)).toEqual(["c"]);
  });
});

describe("保存の形（S3-1〜S3-3）", () => {
  it("負債は種類を増やさず印で持つ：種類は前の版と同じ7つの中（前の版が種類で断らない。点検 中1）", () => {
    const OLD_KINDS = ["cash", "investment", "nisa", "pension", "insurance", "property", "other"];
    const kinds = new Set(["cash", "investment", "nisa", "pension", "insurance", "property", "other"] satisfies Asset["kind"][]);
    expect([...kinds].sort()).toEqual([...OLD_KINDS].sort());
  });

  it("新しい項目のあるデータも、古いデータ（項目なし）も読める。形の違うものは断る", () => {
    const d = emptyData(ts);
    d.assets = [asset({ debt: true, history: [{ asOf: "2026-10-01", value: 1 }] })];
    d.goals = [goal({ pausedAt: "2026-11-20" })];
    d.contracts = [contract({ recurringId: "r" })];
    d.recurring = [rec({})];
    expect(roundtrip(d).ok).toBe(true);
    expect(roundtrip(emptyData(ts)).ok).toBe(true);
    const bad1 = JSON.parse(JSON.stringify(d));
    bad1.assets[0].debt = "yes";
    expect(validateAppData(bad1).ok).toBe(false);
    const bad2 = JSON.parse(JSON.stringify(d));
    bad2.assets[0].history = [{ asOf: "2026-13-01", value: 1 }];
    expect(validateAppData(bad2).ok).toBe(false);
    const bad3 = JSON.parse(JSON.stringify(d));
    bad3.goals[0].pausedAt = "きのう";
    expect(validateAppData(bad3).ok).toBe(false);
    const bad4 = JSON.parse(JSON.stringify(d));
    bad4.contracts[0].recurringId = 5;
    expect(validateAppData(bad4).ok).toBe(false);
  });
});
