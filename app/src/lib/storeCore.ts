import type { Repository, RepoLoadResult, RepoSaveResult, Token } from "./repository";
import type { SaveResult, UndoSnapshot } from "./storage";
import type { AppData } from "./types";

/**
 * 保存の中心（o11 A06）。React に依らない（試験で直接確かめられる。点検 中-4）。
 * - 保存・読み込み直し・取り消し・すべて削除は、すべて1本の列（queue）に並べて、1つずつ行う（点検 中-3）
 * - 保存の前の確かめ（別タブとの競合・編集を始めたときの内容）は、列の中で、そのときの最新のデータに対して行う（点検 中-2）
 * - 復元など「別に作ったデータで置き換える」保存は、作るときに使ったデータ（base）が今も最新かを、列の中で確かめる（点検 中-1）
 * - 保存が完了したときだけ ok を返し、そのあとで画面に知らせる
 */
export type CoreStatus = "loading" | "ready" | "corrupt" | "unavailable";
export interface CoreState {
  status: CoreStatus;
  data: AppData | null;
  error: string | null;
  raw: string | null;
  undo: UndoSnapshot | null;
}

export const NOT_LOADED = "保存できませんでした。データを読み込めていません。再読み込みしてください";
export const BASE_CHANGED = "保存できませんでした。この操作を始めたあとに、記録が変わりました（ほかのタブ・ほかの保存）。最新の内容を読み込み直したので、もう一度やり直してください";

export interface CommitOptions {
  /** 取り消し用の控えを残す保存（復元・置き換えなど） */
  undoReason?: string | ((cur: AppData) => string);
  /** 列の中で、最新のデータに対して確かめる。文字列を返したら保存しない（その文字列がエラー） */
  check?: (cur: AppData) => string | null;
  /** 置き換える内容を作るときに使ったデータ。今の最新と違えば保存しない（別に作った古い内容で上書きしない） */
  base?: AppData;
}

export class StoreCore {
  private state: CoreState = { status: "loading", data: null, error: null, raw: null, undo: null };
  private token: Token = null;
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<(s: CoreState) => void>();

  constructor(readonly repo: Repository) {}

  get snapshot(): CoreState {
    return this.state;
  }

  subscribe(fn: (s: CoreState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(next: Partial<CoreState>) {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l(this.state);
  }

  /** 列に並べる。前の仕事が失敗・例外でも、次は動く */
  enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job, job);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async readUndo(): Promise<UndoSnapshot | null> {
    try {
      return await this.repo.readUndo();
    } catch {
      return null;
    }
  }

  private async applyLoad(r: RepoLoadResult) {
    const undo = await this.readUndo();
    if (r.status === "ok" || r.status === "new") {
      this.token = "token" in r ? r.token : null;
      this.set({ status: "ready", data: r.data, error: null, raw: null, undo });
    } else if (r.status === "corrupt") {
      this.token = null;
      this.set({ status: "corrupt", data: null, error: r.error, raw: r.raw, undo });
    } else {
      this.token = null;
      this.set({ status: "unavailable", data: null, error: r.error, raw: null, undo });
    }
  }

  /** 読み込み直し（列に並べる。保存の途中に割り込まない） */
  reload(): Promise<void> {
    return this.enqueue(() => this.loadNow());
  }

  private async loadNow() {
    await this.applyLoad(await this.repo.load());
  }

  private async finish(next: AppData, r: RepoSaveResult): Promise<SaveResult> {
    if (r.ok) {
      this.token = r.token;
      // 控えは保存のたびに読み直す（取り消しのボタンの表示を、実際の控えと合わせる。点検 低-3）
      this.set({ data: next, undo: await this.readUndo() });
      return { ok: true };
    }
    // 競合なら最新を読み込み直す。そうでない失敗でも、控えの表示は読み直す
    if (r.conflict) await this.loadNow();
    else this.set({ undo: await this.readUndo() });
    return { ok: false, error: r.error };
  }

  commit(fn: (d: AppData) => AppData, opts: CommitOptions = {}): Promise<SaveResult> {
    return this.enqueue(async () => {
      const cur = this.state.data;
      if (!cur) return { ok: false, error: NOT_LOADED };
      if (opts.base && opts.base !== cur) {
        await this.loadNow();
        return { ok: false, error: BASE_CHANGED };
      }
      try {
        const err = opts.check?.(cur) ?? null;
        if (err) return { ok: false, error: err };
        const next = fn(cur);
        const reason = typeof opts.undoReason === "function" ? opts.undoReason(cur) : opts.undoReason;
        return await this.finish(next, await this.repo.save(next, this.token, reason));
      } catch (e) {
        return { ok: false, error: `保存できませんでした（${(e as Error)?.message ?? "不明"}）。今までの記録は消えていません` };
      }
    });
  }

  undoLast(): Promise<SaveResult> {
    return this.enqueue(async () => {
      try {
        const r = await this.repo.undo(this.token);
        if (r.ok && r.data) return this.finish(r.data, r);
        if (!r.ok && r.conflict) await this.loadNow();
        else this.set({ undo: await this.readUndo() });
        return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
      } catch (e) {
        return { ok: false as const, error: `取り消せませんでした（${(e as Error)?.message ?? "不明"}）` };
      }
    });
  }

  wipe(empty: AppData): Promise<SaveResult> {
    return this.enqueue(async () => {
      try {
        return await this.finish(empty, await this.repo.wipe(this.token));
      } catch (e) {
        return { ok: false as const, error: `削除できませんでした（${(e as Error)?.message ?? "不明"}）` };
      }
    });
  }

  resetCorrupt(): Promise<SaveResult> {
    return this.enqueue(async () => {
      if (!this.state.raw) return { ok: false, error: "対象のデータがありません" };
      const r = await this.repo.quarantine(this.state.raw);
      if (r.ok) await this.loadNow();
      return r;
    });
  }
}
