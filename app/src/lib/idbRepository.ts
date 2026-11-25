import { emptyData } from "./defaults";
import { validateAppData } from "./schema";
import { STORAGE_KEY, type KV, type UndoSnapshot } from "./storage";
import type { AppData } from "./types";

/**
 * IndexedDB の保存（o11 工程3・A04/A05）。**まだアプリの保存先には使っていない**（切り替えは A06 と実機の確認のあと）。
 * - 1つの readwrite のトランザクションで「版（revision）の照合 → 取り消し用の控え → 本体」を書く。完了したときだけ成功
 * - 版が違えば（ほかのタブが先に保存した）、書かずに conflict を返す
 * - 移行：localStorage の旧データを読む → 検査 → 仮置き（staging）→ 読み直して件数・金額・関連 ID を比べる → 一致したときだけ正本に切り替える。
 *   旧データ（localStorage）は消さない。途中で止まっても、正本の印がなければ旧データのまま（何度でもやり直せる）
 * データの形（AppData・schemaVersion 2）は変えない。中身は JSON の文字列のまま持つ（今と同じ検査を通す）
 */
export const IDB_NAME = "kurashi-base";
export const IDB_VERSION = 1;
const STORE = "kv";
/** 移行したことを、旧データ側にも小さく残す印（旧データ本体は消さない） */
export const MOVED_MARK_KEY = "kurashi-base:storage-moved:v1";

interface DataRow {
  revision: number;
  json: string;
  savedAt: string;
}
interface MetaRow {
  migratedAt: string;
  source: "localStorage";
  integrity: Integrity;
}

/** 試験用：書き込みの途中で失敗させる（容量不足などの注入） */
export type FaultInjector = (key: string) => boolean;

export type RepoLoad = { ok: true; data: AppData | null; revision: number } | { ok: false; error: string };
export type RepoSave = { ok: true; revision: number } | { ok: false; error: string; conflict?: true };

const quota = (e: unknown) => e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);

export function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("保存場所が、ほかのタブで使われています"));
  });
}

const reqP = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

export class IndexedDbRepository {
  constructor(
    private readonly db: IDBDatabase,
    private readonly fault?: FaultInjector,
  ) {}

  async load(): Promise<RepoLoad> {
    try {
      const tx = this.db.transaction(STORE, "readonly");
      const row = (await reqP(tx.objectStore(STORE).get("data"))) as DataRow | undefined;
      if (!row) return { ok: true, data: null, revision: 0 };
      const v = validateAppData(JSON.parse(row.json));
      if (!v.ok) return { ok: false, error: v.error };
      return { ok: true, data: v.data, revision: row.revision };
    } catch (e) {
      return { ok: false, error: `保存場所を読み込めませんでした（${(e as Error)?.message ?? "不明"}）` };
    }
  }

  /** expectedRevision：読み込んだときの版。違えば書かない。undoReason を渡すと、今の本体を取り消し用の控えにする */
  save(data: AppData, expectedRevision: number, now: string, undoReason?: string): Promise<RepoSave> {
    const v = validateAppData(data);
    if (!v.ok) return Promise.resolve({ ok: false, error: `保存できませんでした（${v.error}）` });
    const json = JSON.stringify(data);
    return new Promise((resolve) => {
      let result: RepoSave = { ok: false, error: "保存できませんでした" };
      let tx: IDBTransaction;
      try {
        tx = this.db.transaction(STORE, "readwrite");
      } catch (e) {
        resolve({ ok: false, error: `保存できませんでした（${(e as Error)?.message ?? "不明"}）` });
        return;
      }
      const st = tx.objectStore(STORE);
      const put = (key: string, val: unknown) => {
        if (this.fault?.(key)) throw new DOMException("injected", "QuotaExceededError");
        st.put(val, key);
      };
      const g = st.get("data");
      g.onsuccess = () => {
        const cur = g.result as DataRow | undefined;
        const curRev = cur?.revision ?? 0;
        if (curRev !== expectedRevision) {
          result = { ok: false, error: "保存できませんでした。ほかのタブで記録が変わっていました。読み込み直してから、もう一度保存してください", conflict: true };
          tx.abort();
          return;
        }
        try {
          if (undoReason && cur) put("undo", { savedAt: now, reason: undoReason, raw: cur.json } satisfies UndoSnapshot);
          put("data", { revision: curRev + 1, json, savedAt: now } satisfies DataRow);
          result = { ok: true, revision: curRev + 1 };
        } catch (e) {
          result = { ok: false, error: quota(e) ? "保存できませんでした。この端末の保存容量がいっぱいです。今までの記録は消えていません" : "保存できませんでした" };
          tx.abort();
        }
      };
      // 完了したときだけ成功（commit 前に成功と言わない）
      tx.oncomplete = () => resolve(result.ok ? result : { ok: false, error: "保存できませんでした" });
      tx.onabort = () => resolve(result.ok ? { ok: false, error: "保存できませんでした（途中で止まりました。今までの記録は消えていません）" } : result);
      tx.onerror = () => undefined; // onabort で返す
    });
  }

  /**
   * 1つのトランザクションで「版の照合 → 書き換え」をする（取り消し・すべて削除・退避で使う）。
   * body が返したものを結果にする。版が違えば書かずに conflict
   */
  private guardedWrite<T extends { ok: true }>(
    expectedRevision: number,
    body: (cur: DataRow | undefined, undo: UndoSnapshot | undefined, put: (k: string, v: unknown) => void, del: (k: string) => void) => T | { ok: false; error: string },
  ): Promise<T | { ok: false; error: string; conflict?: true }> {
    return new Promise((resolve) => {
      let result: T | { ok: false; error: string; conflict?: true } = { ok: false, error: "保存できませんでした" };
      let tx: IDBTransaction;
      try {
        tx = this.db.transaction(STORE, "readwrite");
      } catch (e) {
        resolve({ ok: false, error: `保存できませんでした（${(e as Error)?.message ?? "不明"}）` });
        return;
      }
      const st = tx.objectStore(STORE);
      const put = (key: string, val: unknown) => {
        if (this.fault?.(key)) throw new DOMException("injected", "QuotaExceededError");
        st.put(val, key);
      };
      const del = (key: string) => void st.delete(key);
      const g = st.get("data");
      const gu = st.get("undo");
      gu.onsuccess = () => {
        const cur = g.result as DataRow | undefined;
        if ((cur?.revision ?? 0) !== expectedRevision) {
          result = { ok: false, error: "保存できませんでした。ほかのタブで記録が変わっていました。読み込み直してから、もう一度やり直してください", conflict: true };
          tx.abort();
          return;
        }
        try {
          result = body(cur, gu.result as UndoSnapshot | undefined, put, del);
          if (!result.ok) tx.abort();
        } catch (e) {
          result = { ok: false, error: quota(e) ? "保存できませんでした。この端末の保存容量がいっぱいです。今までの記録は消えていません" : "保存できませんでした" };
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result.ok ? result : { ok: false, error: "保存できませんでした" });
      tx.onabort = () => resolve(result.ok ? { ok: false, error: "保存できませんでした（途中で止まりました。今までの記録は消えていません）" } : result);
      tx.onerror = () => undefined;
    });
  }

  /** 取り消し：控えを本体に戻し、今の本体を新しい控えにする（もう一度押せばやり直せる） */
  undo(expectedRevision: number, now: string) {
    return this.guardedWrite<{ ok: true; revision: number; data: AppData }>(expectedRevision, (cur, u, put) => {
      if (!u) return { ok: false, error: "元に戻せる控えがありません" };
      const v = validateAppData(JSON.parse(u.raw));
      if (!v.ok) return { ok: false, error: "控えが壊れているため、元に戻せません" };
      const rev = (cur?.revision ?? 0) + 1;
      if (cur) put("undo", { savedAt: now, reason: `取り消し（${u.reason}）`, raw: cur.json } satisfies UndoSnapshot);
      put("data", { revision: rev, json: u.raw, savedAt: now } satisfies DataRow);
      return { ok: true, revision: rev, data: v.data };
    });
  }

  /** すべて削除：本体と控えを消す（移行の印は残す＝旧データから、もう一度移さない） */
  async wipe(expectedRevision: number, now: string, empty: AppData) {
    const r = await this.guardedWrite<{ ok: true; revision: number }>(expectedRevision, (cur, _u, put, del) => {
      const rev = (cur?.revision ?? 0) + 1;
      del("undo");
      del("staging");
      put("data", { revision: rev, json: JSON.stringify(empty), savedAt: now } satisfies DataRow);
      return { ok: true, revision: rev };
    });
    if (!r.ok) return r;
    // 壊れたデータの退避分（corrupt:…）も消し、残っていないことを確かめる（すべて削除の約束。点検 高-3）
    const left = await this.deleteKeys((k) => k.startsWith("corrupt:"));
    if (left > 0) return { ok: false as const, error: `削除しきれなかったデータが ${left} 件あります。もう一度「すべて削除」をしてください` };
    return r;
  }

  /** 条件に合うキーを消し、消したあとも残っている数を返す */
  private async deleteKeys(match: (k: string) => boolean): Promise<number> {
    const keys = ((await reqP(this.db.transaction(STORE, "readonly").objectStore(STORE).getAllKeys())) as IDBValidKey[]).map(String).filter(match);
    if (keys.length) {
      await new Promise<void>((resolve) => {
        const tx = this.db.transaction(STORE, "readwrite");
        const st = tx.objectStore(STORE);
        for (const k of keys) st.delete(k);
        tx.oncomplete = () => resolve();
        tx.onabort = () => resolve();
        tx.onerror = () => undefined;
      });
    }
    const after = ((await reqP(this.db.transaction(STORE, "readonly").objectStore(STORE).getAllKeys())) as IDBValidKey[]).map(String).filter(match);
    return after.length;
  }

  /** 読み込めないデータを、別のキーに退避してから、本体を消す（退避が書けなければ、何もしない） */
  quarantine(now: string) {
    return new Promise<{ ok: true } | { ok: false; error: string }>((resolve) => {
      let ok = false;
      const tx = this.db.transaction(STORE, "readwrite");
      const st = tx.objectStore(STORE);
      const g = st.get("data");
      g.onsuccess = () => {
        const cur = g.result as DataRow | undefined;
        if (!cur) return;
        try {
          if (this.fault?.("corrupt")) throw new DOMException("injected", "QuotaExceededError");
          st.put({ savedAt: now, json: cur.json }, `corrupt:${now}`);
          st.delete("data");
          ok = true;
        } catch {
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(ok ? { ok: true } : { ok: false, error: "退避するデータがありません" });
      tx.onabort = () => resolve({ ok: false, error: "退避できませんでした。データはそのままです" });
    });
  }

  /** 生の本体（読み込めないときの退避・診断用） */
  async rawData(): Promise<{ revision: number; json: string } | null> {
    const tx = this.db.transaction(STORE, "readonly");
    const row = (await reqP(tx.objectStore(STORE).get("data"))) as DataRow | undefined;
    return row ? { revision: row.revision, json: row.json } : null;
  }

  async readUndo(): Promise<UndoSnapshot | null> {
    const tx = this.db.transaction(STORE, "readonly");
    const u = (await reqP(tx.objectStore(STORE).get("undo"))) as UndoSnapshot | undefined;
    if (!u) return null;
    try {
      return validateAppData(JSON.parse(u.raw)).ok ? u : null;
    } catch {
      return null;
    }
  }

  async meta(): Promise<MetaRow | null> {
    const tx = this.db.transaction(STORE, "readonly");
    return ((await reqP(tx.objectStore(STORE).get("meta"))) as MetaRow | undefined) ?? null;
  }

  /** 移行用：仮置き・正本の切り替えを、1つのトランザクションで（印・本体・仮置きの削除を同時に） */
  putStaging(json: string): Promise<boolean> {
    return this.writeAll((_st, put) => put("staging", json));
  }

  async readStaging(): Promise<string | null> {
    const tx = this.db.transaction(STORE, "readonly");
    return ((await reqP(tx.objectStore(STORE).get("staging"))) as string | undefined) ?? null;
  }

  /**
   * 正本への切り替え。本体も印もないときだけ書く（同じトランザクションの中で確かめる。すでに本体があれば、上書きしない。点検 高-1）。
   * 結果：done（切り替えた）／exists（すでに本体か印がある＝何もしない）／failed
   */
  promote(json: string, meta: MetaRow, now: string): Promise<"done" | "exists" | "failed"> {
    return new Promise((resolve) => {
      let result: "done" | "exists" | "failed" = "failed";
      let tx: IDBTransaction;
      try {
        tx = this.db.transaction(STORE, "readwrite");
      } catch {
        resolve("failed");
        return;
      }
      const st = tx.objectStore(STORE);
      const gd = st.get("data");
      const gm = st.get("meta");
      gm.onsuccess = () => {
        if (gd.result || gm.result) {
          result = "exists";
          st.delete("staging");
          return;
        }
        try {
          for (const k of ["data", "meta"]) if (this.fault?.(k)) throw new DOMException("injected", "QuotaExceededError");
          st.put({ revision: 1, json, savedAt: now } satisfies DataRow, "data");
          st.put(meta, "meta");
          st.delete("staging");
          result = "done";
        } catch {
          result = "failed";
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => resolve("failed");
    });
  }

  /** 移行の印だけを書く（旧データがない端末でも、あとから現れた旧データで上書きしないように。点検 高-1）。すでにあれば何もしない */
  markMigrated(meta: MetaRow): Promise<boolean> {
    return new Promise((resolve) => {
      const tx = this.db.transaction(STORE, "readwrite");
      const st = tx.objectStore(STORE);
      const gm = st.get("meta");
      gm.onsuccess = () => {
        if (!gm.result) st.put(meta, "meta");
      };
      tx.oncomplete = () => resolve(true);
      tx.onabort = () => resolve(false);
    });
  }

  private writeAll(body: (st: IDBObjectStore, put: (k: string, v: unknown) => void) => void): Promise<boolean> {
    return new Promise((resolve) => {
      let ok = true;
      const tx = this.db.transaction(STORE, "readwrite");
      const st = tx.objectStore(STORE);
      const put = (key: string, val: unknown) => {
        if (this.fault?.(key)) throw new DOMException("injected", "QuotaExceededError");
        st.put(val, key);
      };
      try {
        body(st, put);
      } catch {
        ok = false;
        tx.abort();
      }
      tx.oncomplete = () => resolve(ok);
      tx.onabort = () => resolve(false);
    });
  }
}

/** 件数・金額・関連 ID の要約（移行の前後で比べる） */
export interface Integrity {
  chars: number;
  tx: number;
  txSum: number;
  events: number;
  recurring: number;
  trips: number;
  collections: Record<string, number>;
  /** 関連：固定費・旅行・返金・目標につながった記録の数 */
  links: { recurringId: number; tripId: number; refundOf: number; goalId: number; eventId: number };
}

export function integrity(d: AppData, json: string): Integrity {
  const cols: Record<string, number> = {};
  for (const k of ["nisa", "notes", "tasks", "assets", "contracts", "health", "documents", "studySubjects", "studyLogs", "goals"] as const) cols[k] = (d[k] as unknown[]).length;
  return {
    chars: json.length,
    tx: d.transactions.length,
    txSum: d.transactions.reduce((a, t) => a + t.amount, 0),
    events: d.events.length,
    recurring: d.recurring.length,
    trips: (d.trips ?? []).length,
    collections: cols,
    links: {
      recurringId: d.transactions.filter((t) => t.recurringId).length,
      tripId: d.transactions.filter((t) => t.tripId).length + d.events.filter((e) => e.tripId).length,
      refundOf: d.transactions.filter((t) => t.refundOf).length,
      goalId: d.events.filter((e) => e.goalId).length,
      eventId: d.tasks.filter((t) => t.eventId).length,
    },
  };
}

export type MigrateResult =
  | { status: "done"; integrity: Integrity }
  | { status: "already" }
  | { status: "nothing" }
  | { status: "invalid"; error: string }
  | { status: "mismatch"; before: Integrity; after: Integrity }
  | { status: "failed"; error: string };

/**
 * localStorage の旧データを、IndexedDB に移す。旧データは消さない（印の小さいキーだけ足す）。
 * 何度呼んでもよい（すでに移っていれば "already"）。途中で失敗したら、正本は旧データのまま
 */
export async function migrateFromLocalStorage(kv: KV, repo: IndexedDbRepository, now: string): Promise<MigrateResult> {
  if (await repo.meta()) return { status: "already" };
  let raw: string | null;
  try {
    raw = kv.getItem(STORAGE_KEY);
  } catch (e) {
    return { status: "failed", error: `旧データを読めませんでした（${(e as Error)?.message ?? "不明"}）` };
  }
  if (raw === null) {
    // 旧データがない端末：印だけ書く（あとから旧データが現れても、IndexedDB の記録を上書きしない。点検 高-1）
    await repo.markMigrated({ migratedAt: now, source: "localStorage", integrity: integrity(emptyData(now), "") });
    return { status: "nothing" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "invalid", error: "旧データが壊れているため、移しません（旧データはそのまま）" };
  }
  const v = validateAppData(parsed);
  if (!v.ok) return { status: "invalid", error: v.error };
  const before = integrity(v.data, raw);
  // 1. 仮置き
  if (!(await repo.putStaging(raw))) return { status: "failed", error: "仮置きに失敗しました（旧データはそのまま）" };
  // 2. 読み直して比べる
  const staged = await repo.readStaging();
  if (staged === null) return { status: "failed", error: "仮置きを読み直せませんでした（旧データはそのまま）" };
  const v2 = validateAppData(JSON.parse(staged));
  if (!v2.ok) return { status: "failed", error: `仮置きの検査に失敗しました（${v2.error}）` };
  const after = integrity(v2.data, staged);
  if (JSON.stringify(before) !== JSON.stringify(after)) return { status: "mismatch", before, after };
  // 3. 一致したときだけ、正本に切り替える（本体・印・仮置きの削除を同時に）
  const pr = await repo.promote(staged, { migratedAt: now, source: "localStorage", integrity: after }, now);
  if (pr === "failed") return { status: "failed", error: "切り替えに失敗しました（旧データはそのまま）" };
  // すでに本体か印がある（別のタブが先に移した・IndexedDB で先に記録した）：上書きしない
  if (pr === "exists") return { status: "already" };
  // 4. 旧データ側に、小さな印だけ残す（旧データ本体は消さない。印が書けなくても、移行は成立している）
  try {
    kv.setItem(MOVED_MARK_KEY, now);
  } catch {
    /* 印は任意 */
  }
  return { status: "done", integrity: after };
}
