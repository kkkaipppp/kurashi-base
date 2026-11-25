import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { emptyData } from "@/lib/defaults";
import { IdbRepositoryAdapter } from "@/lib/idbAdapter";
import { MOVED_MARK_KEY } from "@/lib/idbRepository";
import { StoreCore, BASE_CHANGED } from "@/lib/storeCore";
import { STORAGE_KEY, UNDO_KEY, type KV } from "@/lib/storage";
import type { AppData, Transaction } from "@/lib/types";

// o11 A06 段階B の条件（独立点検）：①IndexedDB を保存の境界の形に合わせる部品と試験 ②ほかのタブへの知らせ ③保存の中心の試験を IndexedDB でも通す
const now = "2026-11-25T00:00:00.000Z";
const tx = (id: string, amount = 1000): Transaction => ({ id, type: "expense", date: "2026-11-10", amount, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now });
const addTx = (id: string) => (d: AppData): AppData => ({ ...d, transactions: [...d.transactions, tx(id)] });
const memKV = (init: Record<string, string> = {}): KV & { store: Map<string, string> } => {
  const store = new Map(Object.entries(init));
  return { store, getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) };
};
/** 同じ端末の別のタブどうしの知らせ（BroadcastChannel の代わり。送った本人には届かない） */
class Bus {
  subs = new Set<{ owner: Ch; f: () => void }>();
}
class Ch {
  constructor(private bus: Bus) {}
  postMessage() {
    for (const s of this.bus.subs) if (s.owner !== this) s.f();
  }
  addEventListener(_t: "message", f: () => void) {
    this.bus.subs.add({ owner: this, f });
  }
  removeEventListener(_t: "message", f: () => void) {
    for (const s of this.bus.subs) if (s.f === f) this.bus.subs.delete(s);
  }
}
const setup = async (legacyInit: Record<string, string> = {}) => {
  const factory = new IDBFactory();
  const legacy = memKV(legacyInit);
  const bus = new Bus();
  const make = () => new IdbRepositoryAdapter({ factory, legacy, channel: new Ch(bus) });
  return { factory, legacy, make };
};

describe("IndexedDB の部品：起動と移行", () => {
  it("はじめての端末：新しいデータで始まる（旧データなし）", async () => {
    const { make } = await setup();
    const core = new StoreCore(make());
    await core.reload();
    expect(core.snapshot.status).toBe("ready");
    expect(core.snapshot.data?.transactions).toEqual([]);
  });
  it("旧データ（localStorage）があれば、起動のときに移す。旧データは消さない。2回目の起動では移し直さない", async () => {
    const old = { ...emptyData(now), transactions: [tx("old")] };
    const { legacy, make } = await setup({ [STORAGE_KEY]: JSON.stringify(old) });
    const a = new StoreCore(make());
    await a.reload();
    expect(a.snapshot.data?.transactions.map((t) => t.id)).toEqual(["old"]);
    expect(legacy.store.get(STORAGE_KEY)).toBe(JSON.stringify(old));
    expect(legacy.store.get(MOVED_MARK_KEY)).toBeDefined();
    expect((await a.commit(addTx("new"))).ok).toBe(true);
    // 再起動：IndexedDB の新しい記録が見える（旧データから移し直して上書きしない）
    const b = new StoreCore(make());
    await b.reload();
    expect(b.snapshot.data?.transactions.map((t) => t.id)).toEqual(["old", "new"]);
  });
  it("旧データが壊れていれば、移さず、読み込めない画面へ（旧データはそのまま）", async () => {
    const { legacy, make } = await setup({ [STORAGE_KEY]: "{壊れた" });
    const core = new StoreCore(make());
    await core.reload();
    expect(core.snapshot.status).toBe("corrupt");
    expect(legacy.store.get(STORAGE_KEY)).toBe("{壊れた");
  });
});

describe("IndexedDB の部品：保存の中心の試験を、IndexedDB でも通す（条件③）", () => {
  it("同時の2つの保存は、順番に、どちらも残る", async () => {
    const { make } = await setup();
    const core = new StoreCore(make());
    await core.reload();
    const [a, b] = await Promise.all([core.commit(addTx("a")), core.commit(addTx("b"))]);
    expect(a.ok && b.ok).toBe(true);
    expect(core.snapshot.data?.transactions.map((t) => t.id)).toEqual(["a", "b"]);
  });
  it("ほかのタブが先に保存していたら、上書きせず止め、読み込み直す。そのあとは保存できる", async () => {
    const { make } = await setup();
    const tab1 = new StoreCore(make());
    const tab2 = new StoreCore(make());
    await tab1.reload();
    await tab2.reload();
    expect((await tab2.commit(addTx("tab2"))).ok).toBe(true);
    const r = await tab1.commit(addTx("tab1"));
    // 知らせ（条件②）で、tab1 はすでに読み込み直しているか、保存のときに版の照合で止まる。どちらでも tab2 の記録は消えない
    const after = await tab1.commit(addTx("tab1-again"));
    expect(after.ok).toBe(true);
    const ids = tab1.snapshot.data?.transactions.map((t) => t.id) ?? [];
    expect(ids).toContain("tab2");
    expect(ids).toContain("tab1-again");
    if (!r.ok) expect(ids).not.toContain("tab1");
  });
  it("条件②：ほかのタブで保存すると、知らせが届いて、こちらの画面も新しくなる", async () => {
    const { make } = await setup();
    const a1 = make();
    const a2 = make();
    const tab1 = new StoreCore(a1);
    const tab2 = new StoreCore(a2);
    await tab1.reload();
    await tab2.reload();
    a1.subscribe(() => void tab1.reload());
    expect((await tab2.commit(addTx("from-tab2"))).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    await tab1.reload(); // 列の後ろで待つ
    expect(tab1.snapshot.data?.transactions.map((t) => t.id)).toEqual(["from-tab2"]);
  });
  it("置き換え（復元）は、作るときのデータが古ければ保存しない（中-1）", async () => {
    const { make } = await setup();
    const core = new StoreCore(make());
    await core.reload();
    const base = core.snapshot.data!;
    await core.commit(addTx("a"));
    const r = await core.commit(() => ({ ...base, transactions: [tx("backup")] }), { undoReason: "復元", base });
    expect(r.ok ? "" : r.error).toBe(BASE_CHANGED);
    expect(core.snapshot.data?.transactions.map((t) => t.id)).toEqual(["a"]);
  });
  it("控えを残す保存 → 取り消し → もう一度取り消すと、やり直せる", async () => {
    const { make } = await setup();
    const core = new StoreCore(make());
    await core.reload();
    await core.commit(addTx("orig"));
    await core.commit(() => ({ ...emptyData(now), transactions: [tx("restored")] }), { undoReason: "復元" });
    expect(core.snapshot.undo?.reason).toBe("復元");
    expect((await core.undoLast()).ok).toBe(true);
    expect(core.snapshot.data?.transactions.map((t) => t.id)).toEqual(["orig"]);
    expect((await core.undoLast()).ok).toBe(true);
    expect(core.snapshot.data?.transactions.map((t) => t.id)).toEqual(["restored"]);
  });
  it("すべて削除：IndexedDB も旧データ（localStorage）も空になり、再起動しても旧データから戻らない", async () => {
    const old = { ...emptyData(now), transactions: [tx("old")] };
    const { legacy, make } = await setup({ [STORAGE_KEY]: JSON.stringify(old), [UNDO_KEY]: "x" });
    const core = new StoreCore(make());
    await core.reload();
    expect((await core.wipe(emptyData(now))).ok).toBe(true);
    expect(legacy.store.get(STORAGE_KEY)).toBeUndefined();
    expect(legacy.store.get(UNDO_KEY)).toBeUndefined();
    const again = new StoreCore(make());
    await again.reload();
    expect(again.snapshot.data?.transactions).toEqual([]);
  });
  it("書き込みの途中で失敗（容量不足）しても、前の中身は残り、成功と言わない", async () => {
    const factory = new IDBFactory();
    let fail = false;
    const core = new StoreCore(new IdbRepositoryAdapter({ factory, legacy: memKV(), fault: (k) => fail && k === "data" }));
    await core.reload();
    await core.commit(addTx("a"));
    fail = true;
    const r = await core.commit(addTx("b"));
    expect(r.ok).toBe(false);
    fail = false;
    const again = new StoreCore(new IdbRepositoryAdapter({ factory, legacy: memKV() }));
    await again.reload();
    expect(again.snapshot.data?.transactions.map((t) => t.id)).toEqual(["a"]);
  });
});
