import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { applyRestore } from "@/lib/backup";
import { validateRelationships } from "@/lib/schema";
import { replaceEventEditableFields } from "@/lib/eventMerge";
import { loadData, readUndo, saveDataIfUnchanged, saveWithUndo, STORAGE_KEY, UNDO_KEY, type KV } from "@/lib/storage";
import type { CalendarEvent, Trip } from "@/lib/types";

const NOW = "2026-11-22T10:00:00.000Z";
const event = (id: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, title: "新幹線", startDate: "2026-12-01", endDate: "2026-12-01", allDay: false,
  startTime: "09:00", endTime: "12:00", note: "", createdAt: NOW, updatedAt: NOW, ...extra,
});
const trip = (id: string, title: string): Trip => ({
  id, title, startDate: "2026-12-01", endDate: "2026-12-03", destination: title,
  budget: null, note: "", createdAt: NOW, updatedAt: NOW,
});
class FaultKV implements KV {
  values = new Map<string, string>();
  failWrite = new Set<string>();
  failRead = new Set<string>();
  failRemove = new Set<string>();
  getItem(key: string) {
    if (this.failRead.has(key)) throw new Error("read unavailable");
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrite.has(key)) throw new DOMException("storage full", "QuotaExceededError");
    this.values.set(key, value);
  }
  removeItem(key: string) {
    if (this.failRemove.has(key)) throw new Error("remove unavailable");
    this.values.delete(key);
  }
}

describe("友人β：データを壊さないための回帰検証", () => {
  it("編集で空にした場所・URL・持ち物・旅行・種類・費用が復活しない", () => {
    const before = event("e1", { location: "札幌", url: "https://example.com", items: [{id:"i1",text:"傘",done:false}], tripId:"t1", kind:"move", cost:1000 });
    const { location: _location, url: _url, items: _items, tripId: _tripId, kind: _kind, cost: _cost, id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...clean } = before;
    void [_location, _url, _items, _tripId, _kind, _cost, _id, _createdAt, _updatedAt];
    const after = replaceEventEditableFields(before, clean, "2026-12-02T00:00:00.000Z");
    for (const k of ["location", "url", "items", "tripId", "kind", "cost"]) expect(k in after).toBe(false);
    expect(after.id).toBe("e1");
    expect(after.createdAt).toBe(NOW);
  });
  it("意味が違う同一IDの旅行を指す行程は追加復元しない", () => {
    const current = emptyData();
    current.trips.push(trip("same-trip", "京都旅行"));
    const incoming = emptyData();
    incoming.trips.push(trip("same-trip", "札幌旅行"));
    incoming.events.push(event("new-event", { tripId: "same-trip" }));
    const result = applyRestore(current, incoming, "merge");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.events).toHaveLength(0);
    expect(result.data.trips[0].title).toBe("京都旅行");
    expect(result.dependentSkipped).toBe(1);
  });
  it("意味が同じ旅行の予算メモ違いなら参照する行程を維持する", () => {
    const current = emptyData();
    current.trips.push(trip("same-trip", "京都旅行"));
    const incoming = emptyData();
    incoming.trips.push({ ...trip("same-trip", "京都旅行"), budget: 30000 });
    incoming.events.push(event("new-event", { tripId: "same-trip" }));
    const result = applyRestore(current, incoming, "merge");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.events[0].tripId).toBe("same-trip");
  });
  it("存在しない旅行を参照するバックアップは復元できない", () => {
    const data = emptyData();
    data.events.push(event("e1", { tripId: "missing" }));
    expect(validateRelationships(data).ok).toBe(false);
  });
  it("容量不足で書き込めない場合でも、既存データがあれば読み出せる", () => {
    const kv = new FaultKV();
    const data = emptyData();
    kv.values.set(STORAGE_KEY, JSON.stringify(data));
    kv.failWrite.add(STORAGE_KEY);
    expect(loadData(kv).status).toBe("ok");
    expect(saveDataIfUnchanged(data, kv.getItem(STORAGE_KEY), kv).ok).toBe(false);
    expect(kv.getItem(STORAGE_KEY)).toBe(JSON.stringify(data));
  });
  it("本体保存に失敗しても、前の取り消し用控えは変わらない", () => {
    const kv = new FaultKV();
    const a = emptyData();
    const before = JSON.stringify(a);
    kv.values.set(STORAGE_KEY, before);
    const olderUndo = JSON.stringify({ savedAt: NOW, reason: "旧復元", raw: before });
    kv.values.set(UNDO_KEY, olderUndo);
    kv.failWrite.add(STORAGE_KEY);
    const result = saveWithUndo({ ...a, budget: { monthly: 50000 } }, before, "新復元", NOW, kv);
    expect(result.ok).toBe(false);
    expect(kv.getItem(UNDO_KEY)).toBe(olderUndo);
    expect(kv.getItem(STORAGE_KEY)).toBe(before);
    expect(readUndo(kv)?.reason).toBe("旧復元");
  });
  it("本体保存失敗、かつ元の控えに戻せない場合は、異常を隠さない", () => {
    const kv = new FaultKV();
    const data = emptyData();
    const before = JSON.stringify(data);
    kv.values.set(STORAGE_KEY, before);
    kv.failWrite.add(STORAGE_KEY);
    kv.failRemove.add(UNDO_KEY);
    const result = saveWithUndo({ ...data, budget: { monthly: 30000 } }, before, "復元", NOW, kv);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("控えを元に戻せませんでした");
  });
  it("保存前に競合すれば元のデータも控えも変更しない", () => {
    const kv = new FaultKV();
    const initial = emptyData();
    const raw = JSON.stringify(initial);
    kv.values.set(STORAGE_KEY, raw);
    const anotherTab = JSON.stringify({ ...initial, budget:{monthly:50000} });
    kv.values.set(STORAGE_KEY, anotherTab);
    const result = saveWithUndo(emptyData(), raw, "復元", NOW, kv);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflict).toBe(true);
    expect(kv.getItem(STORAGE_KEY)).toBe(anotherTab);
    expect(kv.getItem(UNDO_KEY)).toBeNull();
  });
});
