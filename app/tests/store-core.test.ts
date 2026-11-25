import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { StoreCore, BASE_CHANGED } from "@/lib/storeCore";
import type { Repository, RepoLoadResult, RepoSaveResult, Token } from "@/lib/repository";
import type { UndoSnapshot } from "@/lib/storage";
import type { AppData, Transaction } from "@/lib/types";

// o11 A06（点検 中-1〜中-4）：保存の中心 StoreCore の振る舞い。保存先は試験用のメモリ（版つき・遅延・失敗の注入ができる）
const now = "2026-11-25T00:00:00.000Z";
const tx = (id: string, amount = 1000): Transaction => ({ id, type: "expense", date: "2026-11-10", amount, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now });
const tick = () => new Promise((r) => setTimeout(r, 0));

/** メモリの保存先。rev が版。delay ミリ秒かけて保存する（IndexedDB のように、待たされる保存を作る） */
class MemRepo implements Repository {
  readonly kind = "indexedDB" as const;
  rev = 0;
  json: string | null = null;
  undoSnap: UndoSnapshot | null = null;
  saves = 0;
  failNext: "conflict" | "error" | "throw" | null = null;
  delay = 0;
  /** 読み込みの遅れ（読み始めた時点の中身を、遅れて返す＝古い中身になりうる） */
  loadDelay = 0;
  onChange: (() => void) | null = null;
  constructor(init?: AppData) {
    if (init) {
      this.json = JSON.stringify(init);
      this.rev = 1;
    }
  }
  async load(): Promise<RepoLoadResult> {
    const json = this.json;
    const rev = this.rev;
    if (this.loadDelay) {
      await new Promise((r) => setTimeout(r, this.loadDelay));
      if (json === null) return { status: "new", data: emptyData(now), persistedRaw: null, token: 0 };
      return { status: "ok", data: JSON.parse(json), token: rev };
    }
    if (this.json === null) return { status: "new", data: emptyData(now), persistedRaw: null, token: 0 };
    return { status: "ok", data: JSON.parse(this.json), token: this.rev };
  }
  async save(next: AppData, token: Token, undoReason?: string): Promise<RepoSaveResult> {
    if (this.delay) await new Promise((r) => setTimeout(r, this.delay));
    const f = this.failNext;
    this.failNext = null;
    if (f === "throw") throw new Error("注入した例外");
    if (f === "error") return { ok: false, error: "注入した失敗" };
    if (f === "conflict" || token !== this.rev) return { ok: false, error: "競合", conflict: true };
    if (undoReason && this.json) this.undoSnap = { savedAt: now, reason: undoReason, raw: this.json };
    this.json = JSON.stringify(next);
    this.rev++;
    this.saves++;
    return { ok: true, token: this.rev };
  }
  async readUndo() {
    return this.undoSnap;
  }
  async undo(token: Token) {
    if (token !== this.rev) return { ok: false as const, error: "競合", conflict: true as const };
    if (!this.undoSnap) return { ok: false as const, error: "元に戻せる控えがありません" };
    const data = JSON.parse(this.undoSnap.raw) as AppData;
    this.undoSnap = { savedAt: now, reason: "取り消し", raw: this.json! };
    this.json = JSON.stringify(data);
    this.rev++;
    return { ok: true as const, token: this.rev, data };
  }
  async wipe() {
    this.json = null;
    this.undoSnap = null;
    this.rev++;
    return { ok: true as const, token: this.rev };
  }
  async quarantine() {
    return { ok: true as const };
  }
  subscribe(fn: () => void) {
    this.onChange = fn;
    return () => (this.onChange = null);
  }
  /** ほかのタブで保存されたことにする */
  externalWrite(d: AppData) {
    this.json = JSON.stringify(d);
    this.rev++;
  }
}

const ready = async (init?: AppData) => {
  const repo = new MemRepo(init);
  const core = new StoreCore(repo);
  await core.reload();
  return { repo, core };
};
const addTx = (id: string, amount = 1000) => (d: AppData): AppData => ({ ...d, transactions: [...d.transactions, tx(id, amount)] });

describe("StoreCore：保存の順番と完了", () => {
  it("遅い保存が2つ同時に来ても、順番に、それぞれ最新のデータに当てる（片方の記録が消えない）", async () => {
    const { repo, core } = await ready();
    repo.delay = 5;
    const [a, b] = await Promise.all([core.commit(addTx("a")), core.commit(addTx("b"))]);
    expect(a.ok && b.ok).toBe(true);
    expect(core.snapshot.data?.transactions.map((t) => t.id)).toEqual(["a", "b"]);
    expect(JSON.parse(repo.json!).transactions).toHaveLength(2);
  });
  it("保存が完了する前は、画面のデータは変わらない（完了してから知らせる）", async () => {
    const { repo, core } = await ready();
    repo.delay = 20;
    const p = core.commit(addTx("a"));
    await tick();
    expect(core.snapshot.data?.transactions).toEqual([]);
    expect((await p).ok).toBe(true);
    expect(core.snapshot.data?.transactions).toHaveLength(1);
  });
  it("前の保存が失敗・例外でも、次の保存は動く。失敗した保存は、画面のデータを変えない", async () => {
    const { repo, core } = await ready();
    repo.failNext = "throw";
    const a = await core.commit(addTx("a"));
    expect(a.ok).toBe(false);
    repo.failNext = "error";
    expect((await core.commit(addTx("b"))).ok).toBe(false);
    expect(core.snapshot.data?.transactions).toEqual([]);
    expect((await core.commit(addTx("c"))).ok).toBe(true);
    expect(core.snapshot.data?.transactions.map((t) => t.id)).toEqual(["c"]);
  });
});

describe("StoreCore：ほかのタブとの競合", () => {
  it("ほかのタブで保存されていたら、上書きせずに止め、最新を読み込み直す。そのあとの保存は通る", async () => {
    const { repo, core } = await ready();
    const other = { ...emptyData(now), transactions: [tx("other")] };
    repo.externalWrite(other);
    const r = await core.commit(addTx("mine"));
    expect(r.ok).toBe(false);
    expect(JSON.parse(repo.json!).transactions.map((t: Transaction) => t.id)).toEqual(["other"]); // 上書きしていない
    expect(core.snapshot.data?.transactions.map((t) => t.id)).toEqual(["other"]); // 読み込み直した
    expect((await core.commit(addTx("mine"))).ok).toBe(true);
    expect(core.snapshot.data?.transactions.map((t) => t.id)).toEqual(["other", "mine"]);
  });
  it("中-1：作るときに使ったデータ（base）が古ければ、置き換えの保存をしない（並んでいた保存・ほかのタブの変更を消さない）", async () => {
    const { repo, core } = await ready();
    repo.delay = 5;
    const base = core.snapshot.data!;
    const restored = { ...base, transactions: [tx("from-backup")] };
    const p1 = core.commit(addTx("queued")); // 先に並んだ保存
    const p2 = core.commit(() => restored, { undoReason: "復元", base }); // 古い base から作った置き換え
    expect((await p1).ok).toBe(true);
    const r2 = await p2;
    expect(r2.ok).toBe(false);
    expect(r2.ok ? "" : r2.error).toBe(BASE_CHANGED);
    expect(core.snapshot.data?.transactions.map((t) => t.id)).toEqual(["queued"]); // 先の保存は消えない
  });
  it("中-2：編集を始めたときの内容の確かめは、列の中で、最新のデータに対して行う（前に並んだ保存が同じ記録を変えたら止める）", async () => {
    const { repo, core } = await ready({ ...emptyData(now), transactions: [tx("t", 1000)] });
    repo.delay = 5;
    const snap = JSON.stringify(core.snapshot.data!.transactions[0]);
    const change = (amount: number) => (d: AppData): AppData => ({ ...d, transactions: d.transactions.map((t) => ({ ...t, amount })) });
    const check = (cur: AppData) => (JSON.stringify(cur.transactions[0]) === snap ? null : "ほかで変わりました");
    const p1 = core.commit(change(2000), { check }); // 1つ目：まだ同じなので通る
    const p2 = core.commit(change(3000), { check }); // 2つ目：1つ目のあとでは内容が違うので止める
    expect((await p1).ok).toBe(true);
    expect((await p2).ok).toBe(false);
    expect(core.snapshot.data?.transactions[0].amount).toBe(2000);
  });
  it("中-3：読み込み直しも列に並ぶ（保存の途中に割り込んで、古いデータを出さない）", async () => {
    const { repo, core } = await ready();
    repo.delay = 10;
    const p = core.commit(addTx("a"));
    repo.loadDelay = 30; // 読み込みが遅い（列に並ばないと、保存の前の古い中身が、保存のあとに上書きしてしまう）
    const reload = core.reload(); // 保存の途中で、ほかのタブの知らせが来た
    await Promise.all([p, reload]);
    expect(core.snapshot.data?.transactions.map((t) => t.id)).toEqual(["a"]);
    expect((await core.commit(addTx("b"))).ok).toBe(true); // 版も正しい
  });
});

describe("StoreCore：取り消しの控え・取り消し・すべて削除", () => {
  it("控えを残す保存のあと、控えの表示は読み直される。取り消すと元に戻る", async () => {
    const { core } = await ready({ ...emptyData(now), transactions: [tx("orig")] });
    expect(core.snapshot.undo).toBeNull();
    expect((await core.commit(() => ({ ...emptyData(now), transactions: [tx("new")] }), { undoReason: "復元" })).ok).toBe(true);
    expect(core.snapshot.undo?.reason).toBe("復元");
    expect((await core.undoLast()).ok).toBe(true);
    expect(core.snapshot.data?.transactions.map((t) => t.id)).toEqual(["orig"]);
  });
  it("控えの理由は、保存の時点のデータから決められる（カテゴリをまとめるときの名前など）", async () => {
    const { repo, core } = await ready({ ...emptyData(now), transactions: [tx("a")] });
    await core.commit((d) => d, { undoReason: (cur) => `${cur.transactions.length}件のときの操作` });
    expect(repo.undoSnap?.reason).toBe("1件のときの操作");
  });
  it("すべて削除すると、空になり、控えも消える", async () => {
    const { core } = await ready({ ...emptyData(now), transactions: [tx("a")] });
    expect((await core.wipe(emptyData(now))).ok).toBe(true);
    expect(core.snapshot.data?.transactions).toEqual([]);
    expect(core.snapshot.undo).toBeNull();
  });
  it("読み込めていないときは、保存しない", async () => {
    const core = new StoreCore(new MemRepo());
    const r = await core.commit(addTx("a"));
    expect(r.ok).toBe(false);
  });
});
