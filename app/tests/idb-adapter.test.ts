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
  // 本物の localStorage と同じく、key()・length も持つ（すべて削除は、キーを1つずつ見て消す）
  return {
    store,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as KV & { store: Map<string, string> };
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

describe("IndexedDB の切り替えの独立点検（高-1・高-3・中-1・中-2）", () => {
  it("高-1：旧データなしで始めた端末に、あとから旧データが現れても、IndexedDB の記録を上書きしない", async () => {
    const { legacy, make } = await setup();
    const a = new StoreCore(make());
    await a.reload();
    expect((await a.commit(addTx("idb-only"))).ok).toBe(true);
    legacy.setItem(STORAGE_KEY, JSON.stringify({ ...emptyData(now), transactions: [tx("legacy")] })); // 旧版に戻して記録した
    const b = new StoreCore(make());
    await b.reload();
    expect(b.snapshot.data?.transactions.map((t) => t.id)).toEqual(["idb-only"]);
  });
  it("高-3：すべて削除は、旧データ側の kurashi-base: のキー（下書き・表示の設定・退避分）と、IndexedDB の退避分まで消す", async () => {
    const old = { ...emptyData(now), transactions: [tx("old")] };
    const { legacy, make, factory } = await setup({
      [STORAGE_KEY]: JSON.stringify(old),
      "kurashi-base:sheet-draft:v1:tx:new": "{}",
      "kurashi-base:ui:calendar-show:v1": "money",
      "kurashi-base:corrupt:1": "x",
      "other-app:key": "keep",
    });
    const core = new StoreCore(make());
    await core.reload();
    // IndexedDB にも退避分を作っておく
    const { openDb } = await import("@/lib/idbRepository");
    const db = await openDb(factory);
    await new Promise<void>((res) => {
      const t = db.transaction("kv", "readwrite");
      t.objectStore("kv").put({ json: "x" }, "corrupt:old");
      t.oncomplete = () => res();
    });
    db.close();
    expect((await core.wipe(emptyData(now))).ok).toBe(true);
    const left = [...legacy.store.keys()].filter((k) => k.startsWith("kurashi-base:") && k !== MOVED_MARK_KEY);
    expect(left).toEqual([]);
    expect(legacy.store.get("other-app:key")).toBe("keep"); // ほかのアプリのキーには触れない
    const db2 = await openDb(factory);
    const keys = await new Promise<string[]>((res) => {
      const g = db2.transaction("kv").objectStore("kv").getAllKeys();
      g.onsuccess = () => res((g.result as IDBValidKey[]).map(String));
    });
    db2.close();
    expect(keys.filter((k) => k.startsWith("corrupt:"))).toEqual([]);
  });
  it("中-1：旧データが壊れているとき、退避すると先へ進める（旧データ側を退避し、空から始まる）", async () => {
    const { legacy, make } = await setup({ [STORAGE_KEY]: "{壊れた" });
    const core = new StoreCore(make());
    await core.reload();
    expect(core.snapshot.status).toBe("corrupt");
    expect((await core.resetCorrupt()).ok).toBe(true);
    expect(core.snapshot.status).toBe("ready");
    expect([...legacy.store.keys()].some((k) => k.startsWith("kurashi-base:corrupt:"))).toBe(true); // 壊れた中身は退避して残す
  });
  it("中-2：一度も移していない端末で、移行に失敗したら、この起動は localStorage で続ける（記録を外へ出せない画面に閉じ込めない）", async () => {
    const old = { ...emptyData(now), transactions: [tx("old")] };
    const legacy = memKV({ [STORAGE_KEY]: JSON.stringify(old) });
    const ad = new IdbRepositoryAdapter({ factory: new IDBFactory(), legacy, fault: (k) => k === "staging" });
    const core = new StoreCore(ad);
    await core.reload();
    expect(core.snapshot.status).toBe("ready");
    expect(core.snapshot.data?.transactions.map((t) => t.id)).toEqual(["old"]);
    expect(ad.active).toBe("localStorage");
    expect((await core.commit(addTx("new"))).ok).toBe(true);
    expect(JSON.parse(legacy.store.get(STORAGE_KEY)!).transactions).toHaveLength(2);
  });
  it("中-2：一度でも移した端末では、localStorage に戻らない（古い中身を出さない）", async () => {
    const { legacy, make } = await setup({ [STORAGE_KEY]: JSON.stringify({ ...emptyData(now), transactions: [tx("old")] }) });
    const a = new StoreCore(make());
    await a.reload();
    expect(legacy.store.get(MOVED_MARK_KEY)).toBeDefined();
    const broken = new IdbRepositoryAdapter({ factory: { open: () => { throw new Error("開けない"); } } as unknown as IDBFactory, legacy });
    const b = new StoreCore(broken);
    await b.reload();
    expect(b.snapshot.status).toBe("unavailable");
  });
});

describe("再点検（7b7f83b）の中-G", () => {
  it("旧データなしで始めた端末：旧データ側にも印が書かれ、IndexedDB が開けない起動では、空の localStorage で黙って続けない", async () => {
    const { legacy, make } = await setup();
    const a = new StoreCore(make());
    await a.reload();
    await a.commit(addTx("idb-only"));
    expect(legacy.store.get(MOVED_MARK_KEY)).toBeDefined();
    const broken = new IdbRepositoryAdapter({ factory: { open: () => { throw new Error("開けない"); } } as unknown as IDBFactory, legacy });
    const b = new StoreCore(broken);
    await b.reload();
    expect(b.snapshot.status).toBe("unavailable");
  });
  it("印がなくても、旧データに本体がなければ、localStorage で続けない", async () => {
    const legacy = memKV();
    const broken = new IdbRepositoryAdapter({ factory: { open: () => { throw new Error("開けない"); } } as unknown as IDBFactory, legacy });
    const b = new StoreCore(broken);
    await b.reload();
    expect(b.snapshot.status).toBe("unavailable");
  });
});
