import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { eventMatchesSnapshot } from "@/lib/eventConcurrency";
import { STORAGE_KEY, UNDO_KEY, wipeAllAppData, type KV } from "@/lib/storage";

class MemoryStorage implements KV {
  values = new Map<string, string>();
  failRemove = new Set<string>();
  failSet = new Set<string>();
  onRemove?: (key: string) => void;
  get length() { return this.values.size; }
  key(i: number) { return [...this.values.keys()][i] ?? null; }
  getItem(k: string) { return this.values.get(k) ?? null; }
  setItem(k: string, v: string) {
    if (this.failSet.has(k)) throw new Error("set failed");
    this.values.set(k, v);
  }
  removeItem(k: string) {
    this.onRemove?.(k);
    if (this.failRemove.has(k)) throw new Error("remove failed");
    this.values.delete(k);
  }
}
const seeded = () => {
  const kv = new MemoryStorage();
  const raw = JSON.stringify(emptyData());
  kv.values.set(STORAGE_KEY, raw);
  kv.values.set(UNDO_KEY, JSON.stringify({ raw, reason: "restore", savedAt: "2026-11-22T00:00:00Z" }));
  kv.values.set("kurashi-base:corrupt:1", "legacy-personal-data");
  kv.values.set("another-app:session", "do not delete");
  return { kv, raw };
};

describe("GO公開前：すべて削除のデータ保護", () => {
  it("本体・控え・破損データ退避をすべて消し、他アプリのキーは保持する", () => {
    const { kv, raw } = seeded();
    const r = wipeAllAppData(raw, kv);
    expect(r.ok).toBe(true);
    expect([...kv.values.keys()].filter((k) => k.startsWith("kurashi-base:"))).toEqual([]);
    expect(kv.getItem("another-app:session")).toBe("do not delete");
  });
  it("別タブが先に保存したら削除しない", () => {
    const { kv, raw } = seeded();
    const newer = JSON.stringify({ ...emptyData(), marker: "new" });
    kv.values.set(STORAGE_KEY, newer);
    const r = wipeAllAppData(raw, kv);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.conflict).toBe(true);
    expect(kv.getItem(STORAGE_KEY)).toBe(newer);
    expect(kv.getItem(UNDO_KEY)).not.toBeNull();
  });
  it("控えの消去に失敗したら、削除完了扱いにせず、元データを保持する", () => {
    const { kv, raw } = seeded();
    kv.failRemove.add(UNDO_KEY);
    const r = wipeAllAppData(raw, kv);
    expect(r.ok).toBe(false);
    expect(kv.getItem(STORAGE_KEY)).toBe(raw);
    expect(kv.getItem(UNDO_KEY)).not.toBeNull();
  });
  it("本体の消去が失敗しても、先に消した控え・退避データを巻き戻す", () => {
    const { kv, raw } = seeded();
    kv.failRemove.add(STORAGE_KEY);
    const r = wipeAllAppData(raw, kv);
    expect(r.ok).toBe(false);
    expect(kv.getItem(STORAGE_KEY)).toBe(raw);
    expect(kv.getItem(UNDO_KEY)).not.toBeNull();
    expect(kv.getItem("kurashi-base:corrupt:1")).toBe("legacy-personal-data");
  });
  it("初回起動で本体データが無くても、古い控え・退避データを消せる", () => {
    const { kv } = seeded();
    kv.values.delete(STORAGE_KEY);
    expect(wipeAllAppData(null, kv).ok).toBe(true);
    expect([...kv.values.keys()].filter((k) => k.startsWith("kurashi-base:"))).toHaveLength(0);
  });
  it("列挙できない保存環境では、消去成功を返さない", () => {
    const { kv, raw } = seeded();
    const restricted: KV = { getItem: kv.getItem.bind(kv), setItem: kv.setItem.bind(kv), removeItem: kv.removeItem.bind(kv) };
    expect(wipeAllAppData(raw, restricted).ok).toBe(false);
    expect(kv.getItem(STORAGE_KEY)).toBe(raw);
  });
  it("削除中に別タブが書き込んだ内容は、巻き戻しで上書きしない", () => {
    const { kv, raw } = seeded();
    const newer = JSON.stringify({ ...emptyData(), marker: "concurrent-write" });
    kv.onRemove = (key) => { if (key === UNDO_KEY) kv.values.set(STORAGE_KEY, newer); };
    const r = wipeAllAppData(raw, kv);
    expect(r.ok).toBe(false);
    expect(kv.getItem(STORAGE_KEY)).toBe(newer);
  });
});

describe("GO公開前：同じ予定の二重編集", () => {
  const base = { id: "ev1", title: "旅行", startDate: "2026-12-01", endDate: "2026-12-01", allDay: true, startTime: "", endTime: "", note: "", createdAt: "t0", updatedAt: "t0" };
  it("開いたときと同じなら編集できる", () => expect(eventMatchesSnapshot(base, JSON.stringify(base))).toBe(true));
  it("予定名だけ変更されても、古い編集内容の上書きを防ぐ", () => expect(eventMatchesSnapshot({ ...base, title: "出張" }, JSON.stringify(base))).toBe(false));
  it("持ち物のチェックだけ変わっても、黙って上書きしない", () => expect(eventMatchesSnapshot({ ...base, items: [{ id: "i1", text: "傘", done: true }] }, JSON.stringify(base))).toBe(false));
});
