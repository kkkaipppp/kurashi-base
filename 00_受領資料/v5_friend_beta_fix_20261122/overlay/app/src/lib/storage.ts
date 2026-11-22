import { emptyData } from "./defaults";
import { validateAppData } from "./schema";
import type { AppData } from "./types";

export const STORAGE_KEY = "kurashi-base:data:v1";

export type LoadResult =
  | { status: "ok"; data: AppData; persistedRaw: string }
  | { status: "new"; data: AppData; persistedRaw: null }
  | { status: "corrupt"; error: string; raw: string }
  | { status: "unavailable"; error: string };

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function getLocal(): KV | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    // 読み取り前に書き込みテストをしない。容量不足でも既存データは読めることがある。
    // 書き込みできるかは saveDataIfUnchanged が、実際の保存時に判定する。
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadData(kv: KV | null = getLocal()): LoadResult {
  if (!kv) return { status: "unavailable", error: "このブラウザではデータを保存できません（プライベートモードや保存の制限が原因の可能性があります）" };
  let raw: string | null;
  try {
    raw = kv.getItem(STORAGE_KEY);
  } catch {
    return { status: "unavailable", error: "保存場所を読み込めませんでした" };
  }
  if (raw === null) return { status: "new", data: emptyData(), persistedRaw: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "corrupt", error: "保存データが壊れていて読み込めません", raw };
  }
  const v = validateAppData(parsed);
  if (!v.ok) return { status: "corrupt", error: v.error, raw };
  return { status: "ok", data: v.data, persistedRaw: raw };
}

export type SaveResult = { ok: true } | { ok: false; error: string };

/** 1回の書き込みで全体を保存（部分保存を残さない）。失敗時は成功と表示させない */
export function saveData(data: AppData, kv: KV | null = getLocal()): SaveResult {
  if (!kv) return { ok: false, error: "保存できませんでした。このブラウザではデータを保存できません" };
  try {
    kv.setItem(STORAGE_KEY, JSON.stringify(data));
    return { ok: true };
  } catch (e) {
    const quota = e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);
    return { ok: false, error: quota ? "保存できませんでした。保存できる容量が足りません。バックアップを書き出してから、古い記録を整理してください" : "保存できませんでした。もう一度お試しください" };
  }
}

/**
 * 複数タブによる古い状態からの上書きを検出する（同時書き込みを完全に直列化するものではない）。
 * 端末上のデータが読み込み時と違えば保存を中止し、利用者へ再読込を案内する。
 */
export type GuardedSaveResult = { ok: true; persistedRaw: string } | { ok: false; error: string; conflict?: true };

export const CONFLICT_ERROR = "保存できませんでした。ほかのタブで記録が変わっていたため、最新の内容を読み込み直しました。もう一度保存してください";

export function saveDataIfUnchanged(data: AppData, expectedRaw: string | null, kv: KV | null = getLocal()): GuardedSaveResult {
  if (!kv) return { ok: false, error: "保存できませんでした。ブラウザの保存場所を使えません" };
  try {
    if (kv.getItem(STORAGE_KEY) !== expectedRaw) {
      return { ok: false, error: CONFLICT_ERROR, conflict: true };
    }
    const raw = JSON.stringify(data);
    kv.setItem(STORAGE_KEY, raw);
    return { ok: true, persistedRaw: raw };
  } catch (e) {
    const quota = typeof DOMException !== "undefined" && e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);
    return { ok: false, error: quota ? "保存できませんでした。保存容量が足りません。バックアップを書き出してください" : "保存できませんでした。保存場所にアクセスできません" };
  }
}

// --- 直前の操作の取り消し（復元・全置き換えの前の状態を1つだけ控える） ---

export const UNDO_KEY = "kurashi-base:undo:v1";

export interface UndoSnapshot {
  savedAt: string; // ISO
  reason: string; // 例：「バックアップから置き換え」
  raw: string; // 操作の前の保存データ（そのままの文字列）
}

/** 控えを読む。読めない・壊れている控えは「ない」とみなす（控えを消したりはしない） */
export function readUndo(kv: KV | null = getLocal()): UndoSnapshot | null {
  if (!kv) return null;
  try {
    const s = kv.getItem(UNDO_KEY);
    if (!s) return null;
    const u = JSON.parse(s) as Partial<UndoSnapshot>;
    if (typeof u.savedAt !== "string" || typeof u.reason !== "string" || typeof u.raw !== "string") return null;
    if (!validateAppData(JSON.parse(u.raw)).ok) return null;
    return u as UndoSnapshot;
  } catch {
    return null;
  }
}

/**
 * 今の保存データを控えてから、新しいデータを保存する（復元・置き換えなど、大きく変わる操作用）。
 * 控えを書けなかったときは、保存もしない（取り消せない状態で大きな変更をしない）。
 */
export function saveWithUndo(data: AppData, expectedRaw: string | null, reason: string, now: string, kv: KV | null = getLocal()): GuardedSaveResult {
  if (!kv) return { ok: false, error: "保存できませんでした。ブラウザの保存場所を使えません" };
  let current: string | null;
  try {
    current = kv.getItem(STORAGE_KEY);
  } catch {
    return { ok: false, error: "保存できませんでした。保存場所にアクセスできません" };
  }
  if (current !== expectedRaw) return { ok: false, error: CONFLICT_ERROR, conflict: true };
  if (current === null) return saveDataIfUnchanged(data, expectedRaw, kv);
  // localStorage は複数キーを一括更新できないため、保存失敗時は前の控えに戻す。
  // 操作前の控えは同じ文字列のまま保持し、失敗しても取り消し履歴を失わない。
  let previousUndo: string | null;
  try {
    previousUndo = kv.getItem(UNDO_KEY);
  } catch {
    return { ok: false, error: "保存場所を読み込めないため、元に戻すための控えを作れませんでした" };
  }
  const pendingUndo = JSON.stringify({ savedAt: now, reason, raw: current } satisfies UndoSnapshot);
  try {
    kv.setItem(UNDO_KEY, pendingUndo);
  } catch {
    return { ok: false, error: "保存できませんでした。元に戻すための控えを作れません。先にバックアップを書き出してください" };
  }
  const result = saveDataIfUnchanged(data, expectedRaw, kv);
  if (result.ok) return result;
  try {
    // 別の処理が控えを書き換えていたら、その控えを無断で上書きしない。
    if (kv.getItem(UNDO_KEY) !== pendingUndo) {
      return { ok: false, error: `${result.error}。取り消し用データも変更されたため、再読み込みしてください`, ...(result.conflict ? { conflict: true as const } : {}) };
    }
    if (previousUndo === null) kv.removeItem(UNDO_KEY);
    else kv.setItem(UNDO_KEY, previousUndo);
  } catch {
    return { ok: false, error: `${result.error}。取り消し用の控えを元に戻せませんでした。新たな操作をせず、現在のデータをバックアップしてください`, ...(result.conflict ? { conflict: true as const } : {}) };
  }
  return result;
}

/** 控えの状態に戻す。戻す直前の状態を新しい控えにするので、もう一度押せばやり直せる */
export function restoreUndo(expectedRaw: string | null, now: string, kv: KV | null = getLocal()): GuardedSaveResult & { data?: AppData } {
  const u = readUndo(kv);
  if (!u) return { ok: false, error: "元に戻せる控えがありません" };
  const v = validateAppData(JSON.parse(u.raw));
  if (!v.ok) return { ok: false, error: "控えが壊れているため、元に戻せません" };
  const r = saveWithUndo(v.data, expectedRaw, `「${u.reason}」の取り消し`, now, kv);
  return r.ok ? { ...r, data: v.data } : r;
}

/** 控えを消す（すべてのデータを削除するとき。端末に記録を残さないため） */
export function clearUndo(kv: KV | null = getLocal()): void {
  try {
    kv?.removeItem(UNDO_KEY);
  } catch {
    /* 消せなくても致命的ではない */
  }
}

/** 破損データを退避してから初期化する（元の文字列は別キーに残す） */
export function quarantineAndReset(raw: string, kv: KV | null = getLocal()): SaveResult {
  if (!kv) return { ok: false, error: "保存場所を使えません" };
  try {
    kv.setItem(`kurashi-base:corrupt:${Date.now()}`, raw);
  } catch {
    return { ok: false, error: "壊れたデータを別の場所に移せなかったため、初期化をやめました" };
  }
  return saveData(emptyData(), kv);
}
