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
    const probe = "kurashi-base:probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
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
export function saveDataIfUnchanged(data: AppData, expectedRaw: string | null, kv: KV | null = getLocal()): SaveResult & { persistedRaw?: string } {
  if (!kv) return { ok: false, error: "保存できませんでした。ブラウザの保存場所を使えません" };
  try {
    if (kv.getItem(STORAGE_KEY) !== expectedRaw) {
      return { ok: false, error: "ほかのタブで記録が変更されています。入力内容を控え、画面を再読み込みしてからやり直してください" };
    }
    const raw = JSON.stringify(data);
    kv.setItem(STORAGE_KEY, raw);
    return { ok: true, persistedRaw: raw };
  } catch (e) {
    const quota = typeof DOMException !== "undefined" && e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);
    return { ok: false, error: quota ? "保存できませんでした。保存容量が足りません。バックアップを書き出してください" : "保存できませんでした。保存場所にアクセスできません" };
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
