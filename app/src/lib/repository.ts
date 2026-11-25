import { loadData, quarantineAndReset, readUndo, restoreUndo, saveDataIfUnchanged, saveWithUndo, wipeAllAppData, type LoadResult, type SaveResult, type UndoSnapshot } from "./storage";
import { validateAppData } from "./schema";
import type { AppData } from "./types";

/**
 * 保存の境界（Repository。o11 工程3・A04/A06）。画面と store は、ここだけを通して保存する。
 * - すべて非同期（Promise）。保存が「完了した」ときだけ ok を返す（画面は ok を受けてから「保存しました」と出す）
 * - token：保存の版。読み込み・保存のたびに新しい値になる。前と違えば（ほかのタブが先に保存した）conflict を返す
 * 実体：LocalStorageRepository（今の storage.ts を包む。動きは今までどおり）。IndexedDB は idbRepository.ts（自分用の版で、確かめてから切り替える）
 */
export type Token = unknown;
export type RepoLoadResult = (LoadResult & { token?: Token }) | { status: "ok"; data: AppData; token: Token; persistedRaw?: string };
export type RepoSaveResult = { ok: true; token: Token } | { ok: false; error: string; conflict?: true };

export interface Repository {
  readonly kind: "localStorage" | "indexedDB";
  load(): Promise<RepoLoadResult>;
  /** undoReason を渡すと、今の中身を取り消し用の控えにしてから保存する（復元・置き換えなど） */
  save(next: AppData, token: Token, undoReason?: string): Promise<RepoSaveResult>;
  readUndo(): Promise<UndoSnapshot | null>;
  undo(token: Token): Promise<RepoSaveResult & { data?: AppData }>;
  wipe(token: Token): Promise<RepoSaveResult>;
  quarantine(raw: string): Promise<SaveResult>;
  /** ほかのタブで変わったときに呼ぶ。戻り値で購読をやめる */
  subscribe(onChange: () => void): () => void;
}

/** 今の localStorage の保存（storage.ts）を、そのまま非同期の形に包む。token は保存した生の文字列 */
export class LocalStorageRepository implements Repository {
  readonly kind = "localStorage" as const;
  async load(): Promise<RepoLoadResult> {
    const r = loadData();
    if (r.status === "ok" || r.status === "new") return { ...r, token: r.persistedRaw };
    return r;
  }
  async save(next: AppData, token: Token, undoReason?: string): Promise<RepoSaveResult> {
    // 保存の検査を通らないデータは、保存しない（次に開いたときに「読み込めない」画面に入らないように。.ics 取り込みの独立点検 高-1）
    const v = validateAppData(next);
    if (!v.ok) return { ok: false, error: `保存できませんでした（${v.error}）。今までの記録は消えていません` };
    const base = (token ?? null) as string | null;
    const r = undoReason ? saveWithUndo(next, base, undoReason, new Date().toISOString()) : saveDataIfUnchanged(next, base);
    return r.ok ? { ok: true, token: r.persistedRaw } : r;
  }
  async readUndo() {
    return readUndo();
  }
  async undo(token: Token) {
    const r = restoreUndo((token ?? null) as string | null, new Date().toISOString());
    return r.ok ? { ok: true as const, token: r.persistedRaw, data: r.data } : r;
  }
  async wipe(token: Token): Promise<RepoSaveResult> {
    const r = wipeAllAppData((token ?? null) as string | null);
    return r.ok ? { ok: true, token: null } : r;
  }
  async quarantine(raw: string) {
    return quarantineAndReset(raw);
  }
  subscribe(onChange: () => void) {
    if (typeof window === "undefined") return () => {};
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith("kurashi-base:data")) onChange();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }
}
