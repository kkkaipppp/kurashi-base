import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { LocalStorageRepository } from "@/lib/repository";
import { StoreCore } from "@/lib/storeCore";
import { validateRelationships } from "@/lib/schema";
import type { KV } from "@/lib/storage";
import type { AppData, Transaction } from "@/lib/types";

// o11 A08 点検 高-2：ふつうの保存のたびに、取り消し用の控えを読み直して検査しない（30年分では約0.2秒）。
// 控えが変わりうる保存（控えを書く保存・取り消し・すべて削除）のあとだけ読み直し、取り消しのボタンの表示は今までどおり合う
const now = "2026-11-25T00:00:00.000Z";
const tx = (id: string): Transaction => ({ id, type: "expense", date: "2026-11-10", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now });
const memKV = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } } as KV;
};

describe("A08：保存のたびの重さ", () => {
  it("ふつうの保存では控えを読み直さない。控えを書く保存・取り消し・すべて削除では読み直し、ボタンの表示が控えと合う", async () => {
    const repo = new LocalStorageRepository(memKV());
    let reads = 0;
    const orig = repo.readUndo.bind(repo);
    repo.readUndo = async () => {
      reads++;
      return orig();
    };
    const core = new StoreCore(repo);
    await core.reload();
    const base = reads;
    const add = (id: string) => (d: AppData) => ({ ...d, transactions: [...d.transactions, tx(id)] });
    expect((await core.commit(add("a"))).ok).toBe(true);
    expect(reads).toBe(base);
    expect((await core.commit(add("b"), { undoReason: "復元" })).ok).toBe(true);
    expect(reads).toBe(base + 1);
    expect(core.snapshot.undo?.reason).toBe("復元");
    // 控えのあとのふつうの保存：控えはそのまま（表示も消えない）
    expect((await core.commit(add("c"))).ok).toBe(true);
    expect(reads).toBe(base + 1);
    expect(core.snapshot.undo?.reason).toBe("復元");
    expect((await repo.readUndo())?.reason).toBe("復元");
    // 取り消し：読み直す
    expect((await core.undoLast()).ok).toBe(true);
    expect(reads).toBeGreaterThan(base + 1);
    expect(core.snapshot.data?.transactions.map((t) => t.id)).toEqual(["a"]);
    // すべて削除：読み直して、控えの表示が消える
    expect((await core.wipe(emptyData(now))).ok).toBe(true);
    expect(core.snapshot.undo).toBeNull();
  });
  it("関係の検査は、問題がないときは説明の文を作らない（速さ）。問題があるときは今までどおりの説明を出す", () => {
    const d = emptyData(now);
    d.transactions = [tx("a")];
    expect(validateRelationships(d)).toEqual({ ok: true });
    d.transactions = [{ ...tx("b"), categoryId: "nai", merchant: "店" }];
    expect(validateRelationships(d)).toEqual({ ok: false, error: "2026-11-10の支出1,000円（店）のカテゴリが、バックアップの中に見つかりません" });
    d.transactions = [{ ...tx("c"), type: "income" }];
    expect(validateRelationships(d)).toEqual({ ok: false, error: "2026-11-10の収入1,000円のカテゴリが、支出用・収入用で食い違っています" });
  });
});
