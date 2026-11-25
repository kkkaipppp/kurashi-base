import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { suggestions, MAX_SUGGESTIONS } from "@/lib/suggestions";
import type { AppData, Goal, RecurringExpense } from "@/lib/types";

// NEXT v21 X14：提案は原則3件、同じ対象は1つに、期限と影響で並べる。0件のときは何も出さない。合成データ
const now = "2026-11-25T00:00:00.000Z";
const rec = (o: Partial<RecurringExpense> & { id: string }): RecurringExpense => ({
  name: "スマホ", amount: 8000, cycle: "monthly", anchorDay: 28, nextDueDate: "2026-11-28", categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now, ...o,
});
const goal = (o: Partial<Goal> & { id: string }): Goal => ({
  title: "貯金", deadline: "2026-12-10", kind: "number", target: 100000, current: 40000, unit: "円", done: false, note: "", createdAt: now, updatedAt: now, ...o,
});
const base = (): AppData => emptyData(now);

describe("提案の集約", () => {
  it("何もないときは0件（無理に出さない）", () => {
    expect(suggestions(base(), "2026-11-25", {})).toEqual([]);
  });
  it("3日以内の固定費の支払いを出す。残りだけを書く（一部払い）。4日先は出さない", () => {
    const d = base();
    d.recurring = [rec({ id: "a", nextDueDate: "2026-11-27", partialPaid: { due: "2026-11-27", paid: 3000 } }), rec({ id: "b", name: "家賃", nextDueDate: "2026-11-29" })];
    const s = suggestions(d, "2026-11-25", {});
    expect(s.map((x) => x.key)).toEqual(["rec:a"]);
    expect(s[0].why).toContain("5,000");
  });
  it("期限が過ぎた固定費は、いちばん上に出す", () => {
    const d = base();
    d.recurring = [rec({ id: "a", nextDueDate: "2026-11-26" }), rec({ id: "o", name: "水道", nextDueDate: "2026-11-23" })];
    expect(suggestions(d, "2026-11-25", {})[0].key).toBe("rec:o");
  });
  it("同じ対象（同じ key）は1つにまとめる", () => {
    const d = base();
    d.recurring = [rec({ id: "a", nextDueDate: "2026-11-26" }), rec({ id: "a", nextDueDate: "2026-11-27" })];
    expect(suggestions(d, "2026-11-25", {}).filter((x) => x.key === "rec:a")).toHaveLength(1);
  });
  it("多くても3件まで", () => {
    const d = base();
    d.recurring = ["1", "2", "3", "4", "5"].map((i) => rec({ id: i, nextDueDate: "2026-11-26" }));
    expect(suggestions(d, "2026-11-25", {})).toHaveLength(MAX_SUGGESTIONS);
    expect(MAX_SUGGESTIONS).toBe(3);
  });
  it("目標は期限が30日以内で、数字の目標が届いていないときだけ", () => {
    const d = base();
    d.goals = [goal({ id: "g1" }), goal({ id: "g2", deadline: "2027-03-01" }), goal({ id: "g3", current: 100000 }), goal({ id: "g4", kind: "check", target: null })];
    expect(suggestions(d, "2026-11-25", {}).map((x) => x.key)).toEqual(["goal:g1"]);
  });
  it("自分用の設定のとき、未整理の記録の件数を出す。切ってあれば出さない", () => {
    const d = base();
    const un = d.categories.find((c) => c.name === "その他" && c.kind === "expense")!;
    d.transactions = [{ id: "t", type: "expense", date: "2026-11-20", amount: 500, currency: "JPY", categoryId: un.id, merchant: "X", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now }];
    expect(suggestions(d, "2026-11-25", { inbox: true }).map((x) => x.key)).toEqual(["inbox"]);
    expect(suggestions(d, "2026-11-25", {})).toEqual([]);
  });
  it("期限の近いものが先、同じなら影響（金額のある支払い）が先", () => {
    const d = base();
    d.recurring = [rec({ id: "late", nextDueDate: "2026-11-28" }), rec({ id: "soon", nextDueDate: "2026-11-26" })];
    d.goals = [goal({ id: "g1", deadline: "2026-11-27" })];
    const k = suggestions(d, "2026-11-25", {}).map((x) => x.key);
    expect(k.indexOf("rec:soon")).toBeLessThan(k.indexOf("rec:late"));
  });
});
