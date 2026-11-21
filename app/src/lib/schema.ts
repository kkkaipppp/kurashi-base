import { isValidDateStr, isValidTimeStr } from "./date";
import { MAX_AMOUNT } from "./money";
import type { AppData } from "./types";

// 保存データ・バックアップの構造検証。不正なら理由を返し、既存データには触れない。

type R = { ok: true; data: AppData } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isAmt = (v: unknown) => Number.isInteger(v) && (v as number) > 0 && (v as number) <= MAX_AMOUNT;

export function validateAppData(raw: unknown): R {
  if (!isObj(raw)) return { ok: false, error: "データの形式が正しくありません" };
  if (raw.schemaVersion !== 1) return { ok: false, error: `対応していないデータ形式です（schemaVersion: ${String(raw.schemaVersion)}）` };
  for (const k of ["transactions", "events", "categories", "recurring"]) {
    if (!Array.isArray(raw[k])) return { ok: false, error: `${k} が見つかりません` };
  }
  const cats = raw.categories as unknown[];
  for (const c of cats) {
    if (!isObj(c) || !isStr(c.id) || !isStr(c.name) || (c.kind !== "expense" && c.kind !== "income"))
      return { ok: false, error: "カテゴリのデータが壊れています" };
  }
  const ids = new Set<string>();
  for (const t of raw.transactions as unknown[]) {
    if (
      !isObj(t) || !isStr(t.id) || (t.type !== "expense" && t.type !== "income") ||
      !isStr(t.date) || !isValidDateStr(t.date) || !isAmt(t.amount) || !isStr(t.categoryId) ||
      !isStr(t.merchant) || !isStr(t.paymentMethod) || !isStr(t.note) || !isStr(t.createdAt)
    )
      return { ok: false, error: "取引のデータが壊れています" };
    if (ids.has(t.id)) return { ok: false, error: "取引IDが重複しています" };
    ids.add(t.id);
  }
  for (const e of raw.events as unknown[]) {
    if (
      !isObj(e) || !isStr(e.id) || !isStr(e.title) || !isStr(e.startDate) || !isValidDateStr(e.startDate) ||
      !isStr(e.endDate) || !isValidDateStr(e.endDate) || e.endDate < e.startDate || typeof e.allDay !== "boolean" ||
      (!e.allDay && (!isStr(e.startTime) || !isValidTimeStr(e.startTime) || !isStr(e.endTime) || !isValidTimeStr(e.endTime)))
    )
      return { ok: false, error: "予定のデータが壊れています" };
    if (ids.has(e.id)) return { ok: false, error: "予定IDが重複しています" };
    ids.add(e.id);
  }
  for (const r of raw.recurring as unknown[]) {
    if (
      !isObj(r) || !isStr(r.id) || !isStr(r.name) || !isAmt(r.amount) || (r.cycle !== "monthly" && r.cycle !== "yearly") ||
      !Number.isInteger(r.anchorDay) || !isStr(r.nextDueDate) || !isValidDateStr(r.nextDueDate) || typeof r.active !== "boolean"
    )
      return { ok: false, error: "固定費のデータが壊れています" };
  }
  if (!isObj(raw.budget) || !(raw.budget.monthly === null || isAmt(raw.budget.monthly)))
    return { ok: false, error: "予算のデータが壊れています" };
  if (!isObj(raw.prefs) || !isObj(raw.prefs.home)) return { ok: false, error: "表示設定のデータが壊れています" };
  if (!isObj(raw.meta)) return { ok: false, error: "管理情報が壊れています" };
  return { ok: true, data: raw as unknown as AppData };
}

/** 文字列の簡易チェックサム（FNV-1a 32bit）。改ざん防止ではなく破損検出用 */
export function checksum(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
