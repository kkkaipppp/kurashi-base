import { emptyData } from "./defaults";
import { validateAppData } from "./schema";
import type { AppData } from "./types";

export const STORAGE_KEY = "kurashi-base:data:v1";

export type LoadResult =
  | { status: "ok"; data: AppData }
  | { status: "new"; data: AppData }
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
    return { status: "unavailable", error: "保存領域を読み込めませんでした" };
  }
  if (raw === null) return { status: "new", data: emptyData() };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "corrupt", error: "保存データが壊れていて読み込めません", raw };
  }
  const v = validateAppData(parsed);
  if (!v.ok) return { status: "corrupt", error: v.error, raw };
  return { status: "ok", data: v.data };
}

export type SaveResult = { ok: true } | { ok: false; error: string };

/** 1回の書き込みで全体を保存（部分保存を残さない）。失敗時は成功と表示させない */
export function saveData(data: AppData, kv: KV | null = getLocal()): SaveResult {
  if (!kv) return { ok: false, error: "このブラウザではデータを保存できません" };
  try {
    kv.setItem(STORAGE_KEY, JSON.stringify(data));
    return { ok: true };
  } catch (e) {
    const quota = e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);
    return { ok: false, error: quota ? "保存容量が不足しています。古いデータを書き出して整理してください" : "保存に失敗しました。もう一度お試しください" };
  }
}

/** 破損データを退避してから初期化する（元の文字列は別キーに残す） */
export function quarantineAndReset(raw: string, kv: KV | null = getLocal()): SaveResult {
  if (!kv) return { ok: false, error: "保存領域を利用できません" };
  try {
    kv.setItem(`kurashi-base:corrupt:${Date.now()}`, raw);
  } catch {
    return { ok: false, error: "破損データの退避に失敗したため、初期化を中止しました" };
  }
  return saveData(emptyData(), kv);
}
