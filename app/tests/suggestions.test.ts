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

describe("提案の境界（独立点検の指摘）", () => {
  it("固定費は今日とちょうど3日後を出し、4日後は出さない", () => {
    const d = base();
    d.recurring = [rec({ id: "t0", nextDueDate: "2026-11-25" }), rec({ id: "t3", nextDueDate: "2026-11-28" }), rec({ id: "t4", nextDueDate: "2026-11-29" })];
    expect(suggestions(d, "2026-11-25", {}).map((x) => x.key).sort()).toEqual(["rec:t0", "rec:t3"]);
  });
  it("種類が混ざっても3件まで。期限が過ぎたものが先頭", () => {
    const d = base();
    d.recurring = [rec({ id: "a", nextDueDate: "2026-11-24" }), rec({ id: "b", nextDueDate: "2026-11-26" })];
    d.goals = [goal({ id: "g1", deadline: "2026-11-27" }), goal({ id: "g2", deadline: "2026-11-28" })];
    const s = suggestions(d, "2026-11-25", { inbox: true });
    expect(s).toHaveLength(3);
    expect(s[0].key).toBe("rec:a");
  });
  it("同じ対象が2つあれば、点の高い（期限の近い）ほうが残る", () => {
    const d = base();
    d.recurring = [rec({ id: "a", nextDueDate: "2026-11-27" }), rec({ id: "a", nextDueDate: "2026-11-26" })];
    expect(suggestions(d, "2026-11-25", {})[0].title).toContain("1日後");
  });
  it("目標の期限の境目：期限まで30日の目標は出し、31日の目標は出さない", () => {
    const d = base();
    // goalPace の days は期限の日を含む（今日 11/25 → 12/24 は30日、12/25 は31日）
    d.goals = [goal({ id: "in", deadline: "2026-12-24" }), goal({ id: "out", deadline: "2026-12-25" })];
    expect(suggestions(d, "2026-11-25", {}).map((x) => x.key)).toEqual(["goal:in"]);
  });
});

describe("別の場所に出ているものは出さない", () => {
  it("skipRecurringIds に入れた固定費は、提案に出ない", () => {
    const d = base();
    d.recurring = [rec({ id: "a", nextDueDate: "2026-11-25" }), rec({ id: "b", nextDueDate: "2026-11-27" })];
    expect(suggestions(d, "2026-11-25", { skipRecurringIds: new Set(["a"]) }).map((x) => x.key)).toEqual(["rec:b"]);
  });
});

describe("目標の節目", () => {
  it("3日以内・過ぎた節目を出す。終わった節目・達成済みの目標・4日先は出さない", () => {
    const d = base();
    const st = (id: string, due: string, done = false) => ({ id, text: `節目${id}`, done, due });
    d.goals = [
      goal({ id: "a", kind: "check", target: null, deadline: "", steps: [st("1", "2026-11-26"), st("2", "2026-11-24"), st("3", "2026-11-29"), st("4", "2026-11-26", true)] }),
      goal({ id: "b", kind: "check", target: null, deadline: "", done: true, steps: [st("1", "2026-11-26")] }),
    ];
    const s = suggestions(d, "2026-11-25", {});
    expect(s.map((x) => x.key)).toEqual(["step:a:2", "step:a:1"]); // 過ぎたものが先
  });
});

describe("生活変化の適用日", () => {
  it("適用日が来ていて、まだ適用していない計画を出す（自分用の設定のときだけ）。適用日の前・適用済みは出さない", () => {
    const d = base();
    d.meta.lifeChanges = [
      { id: "a", title: "引っ越し", date: "2026-11-25", status: "planned", createdAt: now, items: [{ kind: "budget", before: null, after: 1000 }] },
      { id: "b", title: "転職", date: "2026-12-25", status: "planned", createdAt: now, items: [{ kind: "budget", before: null, after: 1000 }] },
      { id: "c", title: "済み", date: "2026-11-01", status: "applied", createdAt: now, items: [{ kind: "budget", before: null, after: 1000 }] },
    ];
    expect(suggestions(d, "2026-11-25", { inbox: true }).map((x) => x.key)).toEqual(["life:a"]);
    expect(suggestions(d, "2026-11-25", {})).toEqual([]);
  });
});
