import { describe, expect, it } from "vitest";
import { combine, judge, linkedTotals, periodOpen, snapshotAchievement, sumSameUnit, toNumber, wouldCycle, type GoalCondition } from "@/lib/goalCond";

// o31 P4（T018・T019・T020、o30 T029〜T031、X004）。期待値は o31 04・05 から手で作った
const c = (o: Partial<GoalCondition>): GoalCondition => ({ id: "c", label: "", unit: "円", op: ">=", target: 0, actual: 0, ...o });

describe("o31 T018 達成条件（AND・OR・未判定）", () => {
  const sales = c({ id: "sales", unit: "円", op: ">=", target: 1_000_000, actual: 1_200_000 }); // 達成
  const profit = c({ id: "profit", unit: "円", op: ">=", target: 300_000, actual: 250_000 }); // 未達
  const hours = c({ id: "hours", unit: "時間", op: ">=", target: 100, actual: 120 }); // 達成
  it("売上達成・利益未達・時間達成 → AND は未達、OR は達成", () => {
    const v = [sales, profit, hours].map((x) => judge(x));
    expect(v).toEqual(["met", "unmet", "met"]);
    expect(combine("and", v)).toBe("unmet");
    expect(combine("or", v)).toBe("met");
  });
  it("欠けている値は未判定（0 にしない）。AND：未達が無く未判定があれば未判定。OR：達成が無く未判定があれば未判定。空は未判定", () => {
    const missing = c({ actual: null, target: 10 });
    expect(judge(missing)).toBe("unknown");
    expect(combine("and", ["met", "unknown"])).toBe("unknown");
    expect(combine("or", ["unmet", "unknown"])).toBe("unknown");
    expect(combine("and", [])).toBe("unknown");
    expect(combine("or", [])).toBe("unknown");
  });
  it("上限・範囲・ちょうど", () => {
    expect(judge(c({ op: "<=", target: 50000, actual: 48000 }))).toBe("met");
    expect(judge(c({ op: "range", target: 60, targetMax: 65, actual: 66 }))).toBe("unmet");
    expect(judge(c({ op: "range", target: 60, actual: 62 }))).toBe("unknown");
    expect(judge(c({ op: "==", target: 1, actual: 1 }))).toBe("met");
  });
  it("違う単位は足さない（C018）", () => {
    expect(sumSameUnit([{ value: 3, unit: "時間" }, { value: 30, unit: "分" }])).toBeNull();
    expect(sumSameUnit([{ value: 3, unit: "時間" }, { value: 2, unit: "時間" }])).toEqual({ value: 5, unit: "時間" });
  });
});

describe("o31 T019 目標の階層と達成の記録", () => {
  it("A→B→A は拒否。自分自身も拒否。つながっていなければ足せる", () => {
    const parentOf = new Map<string, string | undefined>([["B", "A"]]);
    expect(wouldCycle(parentOf, "A", "B")).toBe(true);
    expect(wouldCycle(parentOf, "A", "A")).toBe(true);
    expect(wouldCycle(parentOf, "C", "B")).toBe(false);
  });
  it("達成したときの条件を写して残す。あとで条件を変えても、前の達成の記録は変わらない", () => {
    const conds = [c({ id: "x", op: ">=", target: 10, actual: 12 })];
    const snap = snapshotAchievement("2026-11-27T00:00:00Z", "and", conds);
    conds[0].target = 20;
    expect(snap.verdict).toBe("met");
    expect(snap.conditions[0].target).toBe(10);
  });
});

describe("o31 T020 実績の参照（同じ記録は全体で1回）", () => {
  it("30分の勉強を2つの目標が参照 → それぞれ30分、全体も30分。2,200円の教材費も全体で2,200円", () => {
    const values: Record<string, number> = { log1: 30, tx1: 2200 };
    const r = linkedTotals({ g1: ["log1"], g2: ["log1", "log1"] }, (id) => values[id] ?? null);
    expect(r.perGoal).toEqual({ g1: 30, g2: 30 });
    expect(r.overall).toBe(30);
    const m = linkedTotals({ g1: ["tx1"], g2: ["tx1"] }, (id) => values[id] ?? null);
    expect(m.overall).toBe(2200);
  });
  it("消えた記録は数えずに、欠けとして返す（0 にしない）", () => {
    const r = linkedTotals({ g1: ["gone"] }, () => null);
    expect(r).toEqual({ perGoal: { g1: 0 }, overall: 0, missing: ["gone"] });
  });
});

describe("o31 点検の直し（中-5・低-3）", () => {
  it("期限の前の「以下」は未判定（上回っていれば未達）。期限のあとは確定。期限なしはずっと途中", () => {
    const food = c({ op: "<=", target: 50000, actual: 48000 });
    expect(judge(food, { periodOpen: true })).toBe("unknown");
    expect(judge(c({ op: "<=", target: 50000, actual: 52000 }), { periodOpen: true })).toBe("unmet");
    expect(judge(food, { periodOpen: false })).toBe("met");
    expect(periodOpen("2026-12-31", "2026-11-27")).toBe(true);
    expect(periodOpen("2026-11-26", "2026-11-27")).toBe(false);
    expect(periodOpen("", "2026-11-27")).toBe(true);
    // 期間の途中に「以下」だけで達成の記録を作らない
    expect(snapshotAchievement("t", "and", [food], { periodOpen: true }).verdict).toBe("unknown");
  });
  it("全角の数字・桁区切りを受け付ける。空・数でないものは null（0 にしない）", () => {
    expect([toNumber("３０"), toNumber("1,200"), toNumber(" 12.5 "), toNumber(""), toNumber("abc")]).toEqual([30, 1200, 12.5, null, null]);
  });
});
