import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { dataHealth } from "@/lib/dataHealth";
import { goalActions } from "@/lib/goalLinks";
import { validateAppData } from "@/lib/schema";
import type { AppData, CalendarEvent, Goal } from "@/lib/types";

// NEXT v21 X07・X08：予定は目標の行動。複数の目標が同じ予定を参照しても、予定は1つ。予定の完了と目標の達成は別
const now = "2026-11-25T00:00:00.000Z";
const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");
const goal = (o: Partial<Goal> = {}): Goal => ({ id: "g1", title: "簿記2級", deadline: "2027-03-01", kind: "check", target: null, current: 0, unit: "", done: false, note: "", createdAt: now, updatedAt: now, ...o });
const ev = (o: Partial<CalendarEvent> = {}): CalendarEvent => ({ id: "e1", title: "勉強", startDate: "2026-11-26", endDate: "2026-11-26", allDay: false, startTime: "20:00", endTime: "21:00", note: "", goalId: "g1", createdAt: now, updatedAt: now, ...o });
const mk = (): AppData => {
  const d = emptyData(now);
  d.goals = [goal()];
  return d;
};

describe("目標と予定", () => {
  it("目標につないだ予定の数・完了した回の数・次の行動（完了していない、いちばん近い回）", () => {
    const d = mk();
    d.events = [ev({ repeat: "weekly", doneDates: ["2026-11-26"] }), ev({ id: "e2", title: "模試", startDate: "2026-12-05", endDate: "2026-12-05" }), ev({ id: "x", goalId: undefined, title: "別の予定" })];
    const a = goalActions(d, "g1", "2026-11-25");
    expect(a.events).toBe(2);
    expect(a.doneCount).toBe(1);
    expect(a.next).toEqual({ eventId: "e1", title: "勉強", date: "2026-12-03" }); // 11/26 の回は完了済み → 次の回
  });
  it("予定を完了にしても、目標は達成にならない（別の状態）", () => {
    const d = mk();
    d.events = [ev({ doneDates: ["2026-11-26"] })];
    expect(d.goals[0].done).toBe(false);
    expect(goalActions(d, "g1", "2026-11-25").next).toBeNull(); // 行動は残っていないが、目標は達成していない
  });
  it("複数の目標が同じ予定を参照できる（予定は1つ。費用・時間は予定のまま）。つなぐ目標は1つ（予定ごとの goalId）", () => {
    const d = mk();
    d.goals.push(goal({ id: "g2", title: "TOEIC" }));
    d.events = [ev({ cost: 3000 })];
    expect(d.events).toHaveLength(1);
    expect(goalActions(d, "g1", "2026-11-25").events).toBe(1);
    expect(goalActions(d, "g2", "2026-11-25").events).toBe(0);
  });
  it("保存の形：goalId は任意。書き出し→読み込みで残る。おかしな値は断る。目標がなくなったらデータの点検でお知らせ", () => {
    const d = mk();
    d.events = [ev()];
    const r = validateAppData(JSON.parse(JSON.stringify(d)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.events[0].goalId).toBe("g1");
    const bad = JSON.parse(JSON.stringify(d));
    bad.events[0].goalId = 5;
    expect(validateAppData(bad).ok).toBe(false);
    d.goals = [];
    d.meta.lastBackupAt = "2026-11-24T00:00:00.000Z";
    expect(dataHealth(d, "2026-11-25").map((f) => f.id)).toContain("ev-goal");
    expect(d.events).toHaveLength(1); // 予定は消えない
  });
  it("画面は自分用だけ。目標の行に予定の数、予定の入力に目標の選択、詳細に目標へのリンク", () => {
    expect(src("components/EventSheet.tsx")).toContain('<Field label="関連する目標"');
    expect(src("components/EventSheet.tsx")).toContain("goalId: undefined");
    expect(src("app/goals/page.tsx")).toContain("予定${act.events}件（完了${act.doneCount}回）");
  });
});
