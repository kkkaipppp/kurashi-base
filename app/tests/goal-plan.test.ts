import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { goalPace, goalPaceText } from "@/lib/goalPlan";
import type { Goal } from "@/lib/types";

// NEXT v21：数値目標の必要なペース（差額÷残り期間、切り上げ。期限超過・ゼロ期間・達成済み・入力不足を検証）
const now = "2026-11-25T00:00:00.000Z";
const g = (o: Partial<Goal>): Goal => ({ id: "g", title: "旅行", deadline: "2027-02-22", kind: "number", target: 300000, current: 0, unit: "円", done: false, note: "", createdAt: now, updatedAt: now, ...o });
const fmt = (n: number) => n.toLocaleString("ja-JP");

describe("目標のペース", () => {
  it("残り ÷ 期限までの日数 × 30日、切り上げ。期限の日を含めて数える", () => {
    // 11/25〜2/22 ＝ 90日。30万円 ÷ 90日 × 30 ＝ 10万円／月
    const p = goalPace(g({}), "2026-11-25");
    expect(p).toMatchObject({ ok: true, days: 90, remaining: 300000, perMonth: 100000, perWeek: 23334 });
    expect(goalPaceText(p, "円", fmt)).toBe("1か月あたり約100,000円のペース（残り300,000円・90日）");
  });
  it("端数は切り上げる（足りなくならないように）", () => {
    const p = goalPace(g({ target: 100000, current: 1 }), "2026-11-25");
    expect(p.ok && p.perMonth).toBe(Math.ceil((99999 * 30) / 90));
  });
  it("期限が今日まで・30日未満のときは、残り全部と1週間あたりを出す", () => {
    const p = goalPace(g({ deadline: "2026-12-05", target: 10000 }), "2026-11-25");
    expect(p).toMatchObject({ ok: true, days: 11 });
    expect(goalPaceText(p, "円", fmt)).toContain("あと11日で10,000円");
    expect(goalPace(g({ deadline: "2026-11-25" }), "2026-11-25")).toMatchObject({ ok: true, days: 1 });
  });
  it("出さないとき：期限超過・期限なし・達成済み・目標なし・達成目標・チェック済み（0や負の値を出さない）", () => {
    expect(goalPace(g({ deadline: "2026-11-24" }), "2026-11-25")).toEqual({ ok: false, reason: "pastDue" });
    expect(goalPace(g({ deadline: "" }), "2026-11-25")).toEqual({ ok: false, reason: "noDeadline" });
    expect(goalPace(g({ current: 300000 }), "2026-11-25")).toEqual({ ok: false, reason: "reached" });
    expect(goalPace(g({ current: 400000 }), "2026-11-25")).toEqual({ ok: false, reason: "reached" });
    expect(goalPace(g({ target: null }), "2026-11-25")).toEqual({ ok: false, reason: "noTarget" });
    expect(goalPace(g({ target: 0 }), "2026-11-25")).toEqual({ ok: false, reason: "noTarget" });
    expect(goalPace(g({ kind: "check" }), "2026-11-25")).toEqual({ ok: false, reason: "notNumber" });
    expect(goalPace(g({ done: true }), "2026-11-25")).toEqual({ ok: false, reason: "done" });
    expect(goalPaceText({ ok: false, reason: "pastDue" }, "円", fmt)).toContain("期限を見直す");
    expect(goalPaceText({ ok: false, reason: "done" }, "円", fmt)).toBe("");
  });
  it("目標の画面（自分用）に出す", () => {
    expect(readFileSync(join(__dirname, "..", "src", "app", "goals", "page.tsx"), "utf8")).toContain("必要なペース");
  });
});
