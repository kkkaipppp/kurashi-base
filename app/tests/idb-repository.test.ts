import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { emptyData } from "@/lib/defaults";
import { IndexedDbRepository, MOVED_MARK_KEY, integrity, migrateFromLocalStorage, openDb } from "@/lib/idbRepository";
import { STORAGE_KEY, type KV } from "@/lib/storage";
import type { AppData, Transaction } from "@/lib/types";

// o11 A04・A05：IndexedDB の保存と移行。fake-indexeddb（開発用だけ。Q29 で承認）で、失敗の注入・途中停止・複数タブを確かめる
const now = "2026-11-25T00:00:00.000Z";
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({ type: "expense", date: "2026-11-10", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now, ...o });
const sample = (n = 3): AppData => {
  const d = emptyData(now);
  d.transactions = Array.from({ length: n }, (_, i) => tx({ id: `t${i}`, amount: 1000 + i }));
  d.recurring = [{ id: "rc", name: "家賃", amount: 80000, cycle: "monthly", anchorDay: 27, nextDueDate: "2026-11-27", categoryId: "exp-4", paymentMethod: "", active: true, createdAt: now, updatedAt: now }];
  d.transactions.push(tx({ id: "f", amount: 80000, recurringId: "rc", categoryId: "exp-4" }));
  return d;
};
const memKV = (init: Record<string, string> = {}): KV & { store: Map<string, string> } => {
  const store = new Map(Object.entries(init));
  return { store, getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) };
};
const fresh = async (fault?: (k: string) => boolean) => new IndexedDbRepository(await openDb(new IDBFactory()), fault);

describe("IndexedDB の保存（A04）", () => {
  it("はじめは空。保存すると版が 1 になり、読み直すと同じ中身", async () => {
    const r = await fresh();
    expect(await r.load()).toEqual({ ok: true, data: null, revision: 0 });
    const s = await r.save(sample(), 0, now);
    expect(s).toEqual({ ok: true, revision: 1 });
    const l = await r.load();
    if (!l.ok || !l.data) throw new Error("読めない");
    expect(l.revision).toBe(1);
    expect(l.data.transactions.map((t) => t.id)).toEqual(sample().transactions.map((t) => t.id));
  });
  it("版が違う保存（ほかのタブが先に保存した）は、書かずに conflict。先の保存は消えない", async () => {
    const db = await openDb(new IDBFactory());
    const tabA = new IndexedDbRepository(db);
    const tabB = new IndexedDbRepository(db);
    await tabA.save(sample(1), 0, now);
    const a2 = sample(2);
    expect((await tabA.save(a2, 1, now)).ok).toBe(true); // A が版 2 に
    const b = await tabB.save(sample(5), 1, now); // B はまだ版 1 のつもり
    expect(b.ok).toBe(false);
    expect(b.ok ? undefined : b.conflict).toBe(true);
    const l = await tabA.load();
    if (!l.ok || !l.data) throw new Error("読めない");
    expect(l.revision).toBe(2);
    expect(l.data.transactions).toHaveLength(a2.transactions.length);
  });
  it("書き込みの途中で失敗（容量不足を注入）しても、前の中身と版はそのまま。成功とは言わない", async () => {
    let fail = false;
    const r = await fresh((k) => fail && k === "data");
    await r.save(sample(1), 0, now);
    fail = true;
    const s = await r.save(sample(9), 1, now, "復元");
    expect(s.ok).toBe(false);
    expect(s.ok ? "" : s.error).toContain("容量");
    const l = await r.load();
    if (!l.ok || !l.data) throw new Error("読めない");
    expect(l.revision).toBe(1);
    expect(l.data.transactions).toHaveLength(2);
    expect(await r.readUndo()).toBeNull(); // 控えも書かれていない（同じトランザクション）
  });
  it("取り消し用の控えは、本体と同じトランザクションで書く。控えから前の中身が読める", async () => {
    const r = await fresh();
    await r.save(sample(1), 0, now);
    await r.save(sample(4), 1, now, "復元");
    const u = await r.readUndo();
    expect(u?.reason).toBe("復元");
    expect(JSON.parse(u!.raw).transactions).toHaveLength(2);
  });
  it("壊れたデータは保存しない", async () => {
    const r = await fresh();
    const bad = sample() as unknown as Record<string, unknown>;
    bad.transactions = [{ id: 1 }];
    const s = await r.save(bad as unknown as AppData, 0, now);
    expect(s.ok).toBe(false);
    expect(await r.load()).toEqual({ ok: true, data: null, revision: 0 });
  });
});

describe("移行（A05）：localStorage → IndexedDB", () => {
  it("移すと、件数・金額・関連 ID が一致し、旧データは消えない。印だけ足す。もう一度呼ぶと already", async () => {
    const d = sample(50);
    const raw = JSON.stringify(d);
    const kv = memKV({ [STORAGE_KEY]: raw });
    const r = await fresh();
    const m = await migrateFromLocalStorage(kv, r, now);
    expect(m.status).toBe("done");
    if (m.status === "done") expect(m.integrity).toEqual(integrity(d, raw));
    expect(kv.store.get(STORAGE_KEY)).toBe(raw); // 旧データは、そのまま
    expect(kv.store.get(MOVED_MARK_KEY)).toBe(now);
    const l = await r.load();
    if (!l.ok || !l.data) throw new Error("読めない");
    expect(l.data.transactions).toHaveLength(51);
    expect((await migrateFromLocalStorage(kv, r, now)).status).toBe("already");
  });
  it("旧データがなければ何もしない。壊れていれば移さない（旧データはそのまま）", async () => {
    expect((await migrateFromLocalStorage(memKV(), await fresh(), now)).status).toBe("nothing");
    const kv = memKV({ [STORAGE_KEY]: "{壊れた" });
    const r = await fresh();
    expect((await migrateFromLocalStorage(kv, r, now)).status).toBe("invalid");
    expect(kv.store.get(STORAGE_KEY)).toBe("{壊れた");
    expect(await r.load()).toEqual({ ok: true, data: null, revision: 0 });
  });
  it("切り替えの途中で失敗しても、正本は旧データのまま。やり直すと移せる（何度でもやり直せる）", async () => {
    const kv = memKV({ [STORAGE_KEY]: JSON.stringify(sample(5)) });
    let fail = true;
    const db = await openDb(new IDBFactory());
    const r = new IndexedDbRepository(db, (k) => fail && k === "meta");
    const m1 = await migrateFromLocalStorage(kv, r, now);
    expect(m1.status).toBe("failed");
    expect(await r.load()).toEqual({ ok: true, data: null, revision: 0 }); // 正本はまだない（本体・印は同じトランザクション）
    expect(kv.store.get(MOVED_MARK_KEY)).toBeUndefined();
    fail = false;
    expect((await migrateFromLocalStorage(kv, r, now)).status).toBe("done");
  });
  it("仮置きの途中で失敗しても、旧データはそのまま", async () => {
    const raw = JSON.stringify(sample(5));
    const kv = memKV({ [STORAGE_KEY]: raw });
    const r = await fresh((k) => k === "staging");
    expect((await migrateFromLocalStorage(kv, r, now)).status).toBe("failed");
    expect(kv.store.get(STORAGE_KEY)).toBe(raw);
  });
  it("移したあとの保存は、版 1 から続く（移行の直後の版の照合が正しい）", async () => {
    const kv = memKV({ [STORAGE_KEY]: JSON.stringify(sample(2)) });
    const r = await fresh();
    await migrateFromLocalStorage(kv, r, now);
    const l = await r.load();
    if (!l.ok || !l.data) throw new Error("読めない");
    expect(l.revision).toBe(1);
    expect((await r.save({ ...l.data, budget: { monthly: 1 } }, 1, now)).ok).toBe(true);
  });
});

describe("移行の照合（A05）", () => {
  it("仮置きを読み直した中身が旧データと違えば（件数・金額・関連 ID）、切り替えない。正本は旧データのまま", async () => {
    const d = sample(5);
    const kv = memKV({ [STORAGE_KEY]: JSON.stringify(d) });
    class Lossy extends IndexedDbRepository {
      async readStaging() {
        const s = await super.readStaging();
        if (!s) return s;
        const x = JSON.parse(s);
        x.transactions = x.transactions.slice(1); // 1件欠けた（書き込みの不具合を想定）
        return JSON.stringify(x);
      }
    }
    const r = new Lossy(await openDb(new IDBFactory()));
    const m = await migrateFromLocalStorage(kv, r, now);
    expect(m.status).toBe("mismatch");
    if (m.status === "mismatch") expect(m.after.tx).toBe(m.before.tx - 1);
    expect(await r.load()).toEqual({ ok: true, data: null, revision: 0 });
    expect(kv.store.get(MOVED_MARK_KEY)).toBeUndefined();
  });
});
