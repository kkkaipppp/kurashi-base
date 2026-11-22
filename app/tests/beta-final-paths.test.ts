import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { loadData, STORAGE_KEY } from "@/lib/storage";

// beta-final-guard.test.ts は関数を単体で確かめる。こちらは、実際に通る道（window.localStorage・ストア）で再現する。

describe("容量不足でも、既存の記録は開ける（P0-3：実際のブラウザの保存場所を使う道）", () => {
  const g = globalThis as unknown as { window?: unknown };
  afterEach(() => {
    delete g.window;
  });

  it("書き込みが QuotaExceededError でも、読み込みは ok になる", () => {
    const data = emptyData();
    data.budget.monthly = 50000;
    const raw = JSON.stringify(data);
    g.window = {
      localStorage: {
        getItem: (k: string) => (k === STORAGE_KEY ? raw : null),
        setItem: () => {
          throw new DOMException("storage full", "QuotaExceededError");
        },
        removeItem: () => {},
      },
    };
    const r = loadData();
    expect(r.status).toBe("ok");
    expect(r.status === "ok" && r.data.budget.monthly).toBe(50000);
  });
});

describe("予定の編集で空にした詳細が戻らない（P0-1：ストアの更新の道）", () => {
  const store = readFileSync(join(__dirname, "..", "src", "lib", "store.tsx"), "utf8");
  it("updateEvent は古い予定に重ねず、編集できる項目をすべて置き換える", () => {
    const fn = store.slice(store.indexOf("updateEvent: (id, e) =>"), store.indexOf("deleteEvent: (id)"));
    expect(fn).toContain("replaceEventEditableFields");
    expect(fn).not.toMatch(/\{\s*\.\.\.x,\s*\.\.\.e/);
  });
});

describe("旅行つきの復元の境界", () => {
  const ev = (id: string, tripId?: string) => ({
    id, title: "行程", startDate: "2026-12-01", endDate: "2026-12-01", allDay: true, startTime: "", endTime: "", note: "",
    createdAt: "x", updatedAt: "x", ...(tripId ? { tripId } : {}),
  });
  const trip = (id: string, title: string) => ({ id, title, startDate: "2026-12-01", endDate: "2026-12-03", destination: title, budget: null, note: "", createdAt: "x", updatedAt: "x" });

  it("まるごと置き換えなら、旅行と行程のつながりをそのまま戻す", async () => {
    const { applyRestore } = await import("@/lib/backup");
    const incoming = emptyData();
    incoming.trips.push(trip("t-new", "札幌旅行"));
    incoming.events.push(ev("e1", "t-new"));
    const cur = emptyData();
    cur.trips.push(trip("t-old", "京都旅行"));
    const r = applyRestore(cur, incoming, "replace");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.trips.map((t) => t.id)).toEqual(["t-new"]);
    expect(r.data.events[0].tripId).toBe("t-new");
  });

  it("今の端末にない旅行を追加するときは、その行程も一緒に追加する", async () => {
    const { applyRestore } = await import("@/lib/backup");
    const incoming = emptyData();
    incoming.trips.push(trip("t-new", "札幌旅行"));
    incoming.events.push(ev("e1", "t-new"), ev("e2"));
    const r = applyRestore(emptyData(), incoming, "merge");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.events.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
    expect(r.dependentSkipped).toBe(0);
  });
});
