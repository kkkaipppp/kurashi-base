import { emptyData } from "./defaults";
import { IndexedDbRepository, MOVED_MARK_KEY, migrateFromLocalStorage, openDb, type FaultInjector } from "./idbRepository";
import { LocalStorageRepository, type Repository, type RepoLoadResult, type RepoSaveResult, type Token } from "./repository";
import { STORAGE_KEY, quarantineAndReset, wipeAllAppData, type KV } from "./storage";
import type { AppData } from "./types";
import { countData } from "./backup";
import { validateAppData } from "./schema";

/**
 * IndexedDB の保存を、保存の境界（Repository）の形に合わせる部品（o11 A06 段階B）。
 * - 起動したとき、まだ移していなければ、localStorage の旧データを移す（旧データは消さない。移行の手順は idbRepository.ts）
 * - token は版（revision）。ほかのタブが先に保存していれば conflict
 * - ほかのタブへの知らせは BroadcastChannel（IndexedDB には storage イベントがないため）
 * - 一度も移していない端末で、IndexedDB が開けない・移行に失敗したときは、今までどおり localStorage で続ける（記録を外へ出せなくなる画面に閉じ込めない。点検 中-2）
 * - 接続が切れたら（iPhone で裏に回したときなど）、1回だけつなぎ直してやり直す（点検 中-3）
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

const lostConnection = (error: string) => /closing|closed|InvalidState|connection/i.test(error);

/** 旧データの本体に、記録が1件以上あるか（カテゴリは数えない）。読めない中身は「ある」とみなす（黙って捨てない） */
function legacyHasRecords(raw: string): boolean {
  try {
    const v = validateAppData(JSON.parse(raw));
    if (!v.ok) return true;
    return Object.entries(countData(v.data)).some(([k, n]) => k !== "categories" && n > 0);
  } catch {
    return true;
  }
}

/** IndexedDB が空になっていたときの説明（読み込めない画面に出す） */
export function lostStoreMessage(movedAt: string): string {
  const day = /^\d{4}-\d{2}-\d{2}/.test(movedAt) ? `${Number(movedAt.slice(5, 7))}月${Number(movedAt.slice(8, 10))}日` : "以前";
  return `記録の保存先が空になっていました（iPhone が容量を空けるために消した可能性があります）。元の場所には、${day}に保存先を移す前の古い記録だけが残っています。古い記録で続けると、それより後の記録が戻らないため、ここでは開きません。最新の記録は「ファイル」→ このiPhone内 → くらしベース → 自動バックアップ にあります。下の「別の場所に移して最初から始める」を押してから、設定の「バックアップから復元」で戻してください`;
}

export class IdbRepositoryAdapter implements Repository {
  readonly kind = "indexedDB" as const;
  private repo: IndexedDbRepository | null = null;
  private readonly now: () => string;
  /** 一度も移していない端末で IndexedDB が使えないとき、この起動のあいだは localStorage で続ける */
  private fallback: LocalStorageRepository | null = null;
  /** 移行の結果（診断・画面の知らせ用） */
  migration: string | null = null;

  constructor(private readonly opts: IdbAdapterOptions) {
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  /** いま使っている保存先（診断用） */
  get active(): "indexedDB" | "localStorage" {
    return this.fallback ? "localStorage" : "indexedDB";
  }

  private async open(): Promise<IndexedDbRepository> {
    if (!this.repo) {
      const db = await openDb(this.opts.factory);
      // 接続が閉じられたら、次の操作でつなぎ直す（点検 中-3・低）
      db.onclose = () => {
        this.repo = null;
      };
      db.onversionchange = () => {
        db.close();
        this.repo = null;
      };
      this.repo = new IndexedDbRepository(db, this.opts.fault);
    }
    return this.repo;
  }

  /** 接続が切れていたら、1回だけつなぎ直してやり直す */
  private async withRepo<T extends { ok: boolean }>(op: (r: IndexedDbRepository) => Promise<T>): Promise<T> {
    const first = await op(await this.open());
    if (!first.ok && "error" in first && lostConnection(String((first as { error: unknown }).error))) {
      this.repo = null;
      return op(await this.open());
    }
    return first;
  }

  /** 一度移したあとで IndexedDB が空になったとき、旧データ（記録が1件以上ある）と移した日時。そうでなければ null */
  private staleLegacy(): { raw: string; movedAt: string } | null {
    try {
      const movedAt = this.opts.legacy?.getItem(MOVED_MARK_KEY);
      const raw = this.opts.legacy?.getItem(STORAGE_KEY);
      if (!movedAt || !raw || !legacyHasRecords(raw)) return null;
      return { raw, movedAt };
    } catch {
      return null;
    }
  }

  /** 一度でも IndexedDB へ移したか（旧データ側の印）。移していなければ、localStorage で続けても古い中身を出さない */
  private everMigrated(): boolean {
    try {
      return !!this.opts.legacy?.getItem(MOVED_MARK_KEY);
    } catch {
      return false;
    }
  }

  private async useFallback(reason: string): Promise<RepoLoadResult> {
    // localStorage で続けてよいのは、まだ一度も移しておらず、旧データに本体があるときだけ（空の localStorage で黙って続けない。再点検 中-G）
    let hasLegacyData = false;
    try {
      hasLegacyData = !!this.opts.legacy?.getItem(STORAGE_KEY);
    } catch {
      hasLegacyData = false;
    }
    if (this.everMigrated() || !this.opts.legacy || !hasLegacyData) return { status: "unavailable", error: reason };
    this.fallback = new LocalStorageRepository(this.opts.legacy);
    return this.fallback.load();
  }

  async load(): Promise<RepoLoadResult> {
    let repo: IndexedDbRepository;
    try {
      repo = await this.open();
    } catch (e) {
      return this.useFallback(`保存場所を開けませんでした（${(e as Error)?.message ?? "不明"}）`);
    }
    // まだ移していなければ、旧データを移す（失敗しても旧データは残る。次の起動でやり直す）
    if (this.opts.legacy && !(await repo.meta())) {
      // 一度移したのに、IndexedDB が空になっている（iPhone が容量を空けるために消したなど）。
      // 旧データは移す前の古い中身なので、黙って今の記録にしない（その後の記録が消えたように見え、自動バックアップも古い中身で上書きされる。o11 A07 点検 高-1）
      const stale = this.staleLegacy();
      if (stale) return { status: "corrupt", error: lostStoreMessage(stale.movedAt), raw: stale.raw };
      const m = await migrateFromLocalStorage(this.opts.legacy, repo, this.now());
      this.migration = m.status;
      if (m.status === "invalid") {
        // 旧データが壊れている：移さず、読み込めない画面へ（旧データはそのまま。退避で、旧データ側を退避する）
        const raw = this.opts.legacy.getItem(STORAGE_KEY) ?? "";
        return { status: "corrupt", error: m.error, raw };
      }
      if (m.status === "failed" || m.status === "mismatch") {
        // 移せなかった：この起動は今までどおり localStorage で続ける（次の起動でやり直す）
        return this.useFallback(m.status === "failed" ? `${m.error}。今までの記録は、元の場所に残っています` : "移した中身が元と合わないため、切り替えませんでした。今までの記録は、元の場所に残っています");
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
    if (this.fallback) return this.fallback.save(next, token, undoReason);
    const r = await this.withRepo((repo) => repo.save(next, (token as number) ?? 0, this.now(), undoReason));
    if (!r.ok) return r;
    this.notify();
    return { ok: true, token: r.revision };
  }

  async readUndo() {
    if (this.fallback) return this.fallback.readUndo();
    return (await this.open()).readUndo();
  }

  async undo(token: Token) {
    if (this.fallback) return this.fallback.undo(token);
    const r = await this.withRepo((repo) => repo.undo((token as number) ?? 0, this.now()));
    if (!r.ok) return r;
    this.notify();
    return { ok: true as const, token: r.revision, data: r.data };
  }

  /**
   * すべて削除：先に旧データ側（localStorage の kurashi-base: のキーを全部。下書き・表示の設定・退避分も）を消して、消えたことを確かめる。
   * 消しきれなければ、IndexedDB には触れずに失敗を返す。そのあと IndexedDB の本体・控え・退避分を消す。移行の印は残す（点検 高-3）
   */
  async wipe(token: Token): Promise<RepoSaveResult> {
    if (this.fallback) return this.fallback.wipe(token);
    if (this.opts.legacy) {
      let legacyRaw: string | null;
      try {
        legacyRaw = this.opts.legacy.getItem(STORAGE_KEY);
      } catch {
        return { ok: false, error: "削除できませんでした（元の保存場所を読めません）。データは変更していません" };
      }
      const lw = wipeAllAppData(legacyRaw, this.opts.legacy);
      if (!lw.ok) return { ok: false, error: lw.error };
      try {
        this.opts.legacy.setItem(MOVED_MARK_KEY, this.now()); // 旧データから移し直さない
      } catch {
        /* 印が書けなくても、IndexedDB の印（meta）が残るので移し直さない */
      }
    }
    const r = await this.withRepo((repo) => repo.wipe((token as number) ?? 0, this.now(), emptyData()));
    if (!r.ok) return r;
    this.notify();
    return { ok: true, token: r.revision };
  }

  /** 読み込めないデータの退避。IndexedDB に本体がなければ、旧データ側（localStorage）を退避する（点検 中-1） */
  async quarantine(raw: string) {
    if (this.fallback) return this.fallback.quarantine(raw);
    const repo = await this.open();
    if (await repo.rawData()) {
      const r = await repo.quarantine(this.now());
      if (r.ok) this.notify();
      return r;
    }
    if (this.opts.legacy) return quarantineAndReset(raw, this.opts.legacy);
    return { ok: false as const, error: "退避するデータがありません" };
  }

  subscribe(onChange: () => void) {
    const ch = this.opts.channel;
    if (!ch) return () => {};
    ch.addEventListener("message", onChange);
    return () => ch.removeEventListener("message", onChange);
  }
}
