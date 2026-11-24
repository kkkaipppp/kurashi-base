import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { cloneTrip } from "@/lib/tripTemplate";
import type { AppData, Transaction } from "@/lib/types";

// NEXT v21 X17：テンプレートは計画だけを複製。実績・完了・元の明細 ID を複製しない
const now = "2026-11-25T00:00:00.000Z";
const mk = (): AppData => {
  const d = emptyData(now);
  d.trips = [{ id: "t1", title: "京都", startDate: "2026-12-04", endDate: "2026-12-06", destination: "京都", budget: 60000, note: "紅葉", createdAt: now, updatedAt: now }];
  d.events = [
    { id: "e1", title: "新幹線", startDate: "2026-12-04", endDate: "2026-12-04", allDay: false, startTime: "08:00", endTime: "10:15", note: "", tripId: "t1", kind: "move", cost: 14000, location: "京都駅", items: [{ id: "i1", text: "切符", done: true }, { id: "i2", text: "充電器", done: false }], createdAt: now, updatedAt: now },
    { id: "e2", title: "宿", startDate: "2026-12-04", endDate: "2026-12-06", allDay: true, startTime: "", endTime: "", note: "", tripId: "t1", kind: "stay", createdAt: now, updatedAt: now },
    { id: "other", title: "歯医者", startDate: "2026-12-05", endDate: "2026-12-05", allDay: false, startTime: "10:00", endTime: "11:00", note: "", createdAt: now, updatedAt: now },
  ];
  const tx: Transaction = { id: "x", type: "expense", date: "2026-12-05", amount: 15000, currency: "JPY", categoryId: "exp-1", merchant: "宿代", paymentMethod: "", note: "", source: "manual", tripId: "t1", createdAt: now, updatedAt: now };
  d.transactions = [tx];
  return d;
};
let n = 0;
const ids = { trip: () => `NT${++n}`, event: () => `NE${++n}` };

describe("旅行のコピー", () => {
  it("日付を同じだけずらし、旅行・行程を新しい ID で作る。持ち物は未チェックに戻す", () => {
    const d = mk();
    const r = cloneTrip(d, "t1", "2027-03-10", now, ids);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = r.next.trips!.find((x) => x.id === r.tripId)!;
    expect([t.title, t.startDate, t.endDate, t.budget, t.destination]).toEqual(["京都（コピー）", "2027-03-10", "2027-03-12", 60000, "京都"]);
    const evs = r.next.events.filter((e) => e.tripId === r.tripId);
    expect(r.events).toBe(2);
    expect(evs.map((e) => [e.title, e.startDate, e.endDate])).toEqual([["新幹線", "2027-03-10", "2027-03-10"], ["宿", "2027-03-10", "2027-03-12"]]);
    expect(evs[0].cost).toBe(14000);
    expect(evs[0].items?.map((i) => [i.text, i.done])).toEqual([["切符", false], ["充電器", false]]);
    // 新しい ID（元の ID を再利用しない）
    expect(new Set([r.tripId, ...evs.map((e) => e.id), ...(evs[0].items ?? []).map((i) => i.id)]).size).toBe(1 + 2 + 2);
    expect(evs.every((e) => !["e1", "e2"].includes(e.id))).toBe(true);
  });
  it("支出はコピーしない。元の旅行・行程・支出は変わらない。旅行に入っていない予定は触らない", () => {
    const d = mk();
    const before = JSON.stringify(d);
    const r = cloneTrip(d, "t1", "2027-03-10", now, ids);
    expect(JSON.stringify(d)).toBe(before); // 元のデータを書き換えない
    if (!r.ok) throw new Error("x");
    expect(r.next.transactions).toEqual(d.transactions);
    expect(r.next.transactions.filter((t) => t.tripId === r.tripId)).toHaveLength(0);
    expect(r.next.events.find((e) => e.id === "e1")).toEqual(d.events[0]);
    expect(r.next.events).toHaveLength(d.events.length + 2);
    expect(r.next.events.find((e) => e.id === "other")).toEqual(d.events[2]);
  });
  it("元がない・日付がおかしいときは断る。うるう日をまたぐ移動も正しい", () => {
    expect(cloneTrip(mk(), "nope", "2027-03-10", now)).toMatchObject({ ok: false });
    expect(cloneTrip(mk(), "t1", "", now)).toMatchObject({ ok: false });
    const d = mk();
    d.trips![0].startDate = "2027-02-27";
    d.trips![0].endDate = "2027-03-01";
    d.events = [];
    const r = cloneTrip(d, "t1", "2028-02-27", now, ids);
    expect(r.ok && r.next.trips!.at(-1)!.endDate).toBe("2028-02-29"); // 元は出発から2日後（2027 は平年で 2/27→3/1）。2028 はうるう年なので 2/27 の2日後は 2/29
  });
  it("自分用だけ。取り消しの控えを残して保存する", () => {
    const comp = readFileSync(join(__dirname, "..", "src", "components", "TripCopy.tsx"), "utf8");
    expect(comp).toContain("store.replaceAll(c.next,");
    expect(readFileSync(join(__dirname, "..", "src", "app", "trips", "page.tsx"), "utf8")).toContain("const TripCopy = IS_PERSONAL ? dynamic(");
  });
});
