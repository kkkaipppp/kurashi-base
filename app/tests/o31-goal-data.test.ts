import { describe, expect, it } from "vitest";
import { validateAppData } from "@/lib/schema";
import { emptyData } from "@/lib/defaults";
import { buildBackup, parseBackup } from "@/lib/backup";
import type { AppData, Goal } from "@/lib/types";

// o31 F018・F019（o30 T028）：目標の任意の項目（足すだけ）。古い目標（number/check・current/target/done）はそのまま読める
const ts = "2026-11-27T00:00:00.000Z";
const goal = (o: Partial<Goal> = {}): Goal => ({ id: "g1", title: "資格を取る", deadline: "", kind: "check", target: null, current: 0, unit: "", done: false, note: "", createdAt: ts, updatedAt: ts, ...o });
const withGoals = (g: Goal[]): AppData => ({ ...emptyData(ts), goals: g });

describe("o31 目標のデータの形（足すだけ）", () => {
  it("古い目標（期限なし・数値目標）を読める（T028）", () => {
    expect(validateAppData(withGoals([goal(), goal({ id: "g2", kind: "number", target: 300000, current: 120000, unit: "円", deadline: "2027-03-31" })])).ok).toBe(true);
  });
  it("条件・まとめ方・親・達成の記録を読めて、バックアップの往復で同じ", () => {
    const g = goal({
      conditions: [
        { id: "c1", label: "売上", unit: "円", op: ">=", target: 1000000, actual: null },
        { id: "c2", label: "体重", unit: "kg", op: "range", target: 60, targetMax: 65, actual: 63 },
      ],
      condMode: "or",
      parentId: "g0",
      achievements: [{ at: ts, verdict: "met", conditions: [{ id: "c2", label: "体重", unit: "kg", op: "range", target: 60, targetMax: 65, actual: 63 }] }],
    });
    const d = withGoals([goal({ id: "g0", title: "親" }), g]);
    expect(validateAppData(d).ok).toBe(true);
    const back = parseBackup(JSON.stringify(buildBackup(d)));
    expect(back.ok && back.preview.data.goals).toEqual(d.goals);
  });
  it("壊れた条件は受け付けない（知らない比べ方・目標の値が文字・まとめ方が知らない値）", () => {
    for (const bad of [
      goal({ conditions: [{ id: "c", label: "x", unit: "", op: "~" as never, target: 1, actual: null }] }),
      goal({ conditions: [{ id: "c", label: "x", unit: "", op: ">=", target: "1" as never, actual: null }] }),
      goal({ condMode: "xor" as never }),
    ])
      expect(validateAppData(withGoals([bad])).ok).toBe(false);
  });
});
