import { emptyData } from "./defaults";
import { IndexedDbRepository, MOVED_MARK_KEY, migrateFromLocalStorage, openDb, type FaultInjector } from "./idbRepository";
import { STORAGE_KEY, UNDO_KEY, type KV } from "./storage";
import type { Repository, RepoLoadResult, RepoSaveResult, Token } from "./repository";
import type { AppData } from "./types";

/**
 * IndexedDB の保存を、保存の境界（Repository）の形に合わせる部品（o11 A06 段階B の条件1。点検：高）。
 * - 起動したとき、まだ移していなければ、localStorage の旧データを移す（旧データは消さない。移行の手順は idbRepository.ts）
 * - token は版（revision）。ほかのタブが先に保存していれば conflict
 * - ほかのタブへの知らせは BroadcastChannel（IndexedDB には storage イベントがないため。段階B の条件2。点検：中）
 * **まだアプリの保存先には使っていない**（自分用の版で、ブラウザと実機で確かめてから切り替える）
 */
export const CHANNEL = "kurashi-base:idb";

export interface IdbAdapterOptions {
  factory: IDBFactory;
  /** 旧データ（localStorage）。移行の元 */
  legacy: KV | null;
  fault?: FaultInjector;
  /** ほかのタブへの知らせ（試験では差し替える） */
  channel?: { postMessage(m: unknown): void; addEventListener(t: "message", f: () => void): void; removeEventListener(t: "message", f: () => void): void; close?(): void } | null;
  now?: () => string;
}

export class IdbRepositoryAdapter implements Repository {
  readonly kind = "indexedDB" as const;
  private repo: IndexedDbRepository | null = null;
  private readonly now: () => string;
  /** 移行の結果（診断・画面の知らせ用） */
  migration: string | null = null;

  constructor(private readonly opts: IdbAdapterOptions) {
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  private async open(): Promise<IndexedDbRepository> {
    if (!this.repo) this.repo = new IndexedDbRepository(await openDb(this.opts.factory), this.opts.fault);
    return this.repo;
  }

  async load(): Promise<RepoLoadResult> {
    let repo: IndexedDbRepository;
    try {
      repo = await this.open();
    } catch (e) {
      return { status: "unavailable", error: `保存場所を開けませんでした（${(e as Error)?.message ?? "不明"}）` };
    }
    // まだ移していなければ、旧データを移す（失敗しても旧データは残る。次の起動でやり直す）
    if (this.opts.legacy && !(await repo.meta())) {
      const m = await migrateFromLocalStorage(this.opts.legacy, repo, this.now());
      this.migration = m.status;
      if (m.status === "invalid") {
        // 旧データが壊れている：移さず、読み込めない画面へ（旧データはそのまま。退避の手順で扱う）
        const raw = this.opts.legacy.getItem(STORAGE_KEY) ?? "";
        return { status: "corrupt", error: m.error, raw };
      }
      if (m.status === "failed" || m.status === "mismatch") {
        return { status: "unavailable", error: m.status === "failed" ? `${m.error}。今までの記録は、元の場所に残っています` : "移した中身が元と合わないため、切り替えませんでした。今までの記録は、元の場所に残っています" };
      }
    }
    const r = await repo.load();
    if (!r.ok) {
      const raw = await repo.rawData();
      return raw ? { status: "corrupt", error: r.error, raw: raw.json } : { status: "unavailable", error: r.error };
    }
    if (!r.data) return { status: "new", data: emptyData(), persistedRaw: null, token: 0 };
    return { status: "ok", data: r.data, token: r.revision };
  }

  private notify() {
    try {
      this.opts.channel?.postMessage({ type: "changed" });
    } catch {
      /* 知らせは任意 */
    }
  }

  async save(next: AppData, token: Token, undoReason?: string): Promise<RepoSaveResult> {
    const repo = await this.open();
    const r = await repo.save(next, (token as number) ?? 0, this.now(), undoReason);
    if (!r.ok) return r;
    this.notify();
    return { ok: true, token: r.revision };
  }

  async readUndo() {
    return (await this.open()).readUndo();
  }

  async undo(token: Token) {
    const r = await (await this.open()).undo((token as number) ?? 0, this.now());
    if (!r.ok) return r;
    this.notify();
    return { ok: true as const, token: r.revision, data: r.data };
  }

  async wipe(token: Token): Promise<RepoSaveResult> {
    const r = await (await this.open()).wipe((token as number) ?? 0, this.now(), emptyData());
    if (!r.ok) return r;
    // 旧データ（localStorage）にも残さない（すべて削除の約束。移行の印は残し、旧データから移し直さない）
    try {
      this.opts.legacy?.removeItem(STORAGE_KEY);
      this.opts.legacy?.removeItem(UNDO_KEY);
      this.opts.legacy?.setItem(MOVED_MARK_KEY, this.now());
    } catch {
      /* 旧データの掃除は任意（正本は IndexedDB） */
    }
    this.notify();
    return { ok: true, token: r.revision };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 境界の形に合わせる（IndexedDB は本体を自分で読む）
  async quarantine(_raw: string) {
    const r = await (await this.open()).quarantine(this.now());
    if (r.ok) this.notify();
    return r;
  }

  subscribe(onChange: () => void) {
    const ch = this.opts.channel;
    if (!ch) return () => {};
    ch.addEventListener("message", onChange);
    return () => ch.removeEventListener("message", onChange);
  }
}
