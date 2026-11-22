import { isValidDateStr, isValidTimeStr } from "./date";
import { MAX_AMOUNT } from "./money";
import { COLLECTION_KEYS, type AppData, type CollectionKey } from "./types";

// 保存データ・バックアップの構造検証。不正なら理由を返し、既存データには触れない。

type R = { ok: true; data: AppData } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const okDateOrBlank = (v: unknown) => isStr(v) && (v === "" || isValidDateStr(v));
const isDate = (v: unknown) => isStr(v) && isValidDateStr(v);
const isBool = (v: unknown) => typeof v === "boolean";
const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown) => v === null || isNum(v);
const oneOf = (...xs: string[]) => (v: unknown) => isStr(v) && xs.includes(v);
const isAmt = (v: unknown) => Number.isInteger(v) && (v as number) > 0 && (v as number) <= MAX_AMOUNT;

export const CURRENT_SCHEMA = 2;

/**
 * 古い形式のデータを今の形式に移行する（元のオブジェクトは変更しない）。
 * v1 → v2：NISA・メモ・勉強・目標の空の一覧を足す。既存のデータはそのまま。
 */
export function migrate(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  let d: Record<string, unknown> = raw;
  if (d.schemaVersion === 1) {
    d = { ...d, schemaVersion: 2 };
    // 通常の v1 には新しい一覧がないので空で足す。すでに値があれば消さずに残し、後の検証に任せる
    for (const k of COLLECTION_KEYS) if (d[k] === undefined) d[k] = [];
  }
  // v5：旅行の一覧（無ければ空で足す。形式の番号は 2 のまま。古いアプリは知らない項目をそのまま残す）
  if (d.schemaVersion === 2 && d.trips === undefined) d = { ...d, trips: [] };
  return d;
}

const isHttpOrBlank = (v: unknown) => {
  if (!isStr(v)) return false;
  if (v.trim() === "") return true;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};
const optional = (check: (v: unknown) => boolean) => (v: unknown) => v === undefined || check(v);
const isCheckList = (v: unknown) =>
  Array.isArray(v) && v.every((x) => isObj(x) && isStr(x.id) && isStr(x.text) && isBool(x.done));
const isBookList = (v: unknown) =>
  Array.isArray(v) && v.every((x) => isObj(x) && isStr(x.id) && isStr(x.title) && isHttpOrBlank(x.url) && isStr(x.note));
const isMoneyOrNull = (v: unknown) => v === null || (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_AMOUNT);

/** v5 で予定に足した任意の項目（無くてもよい。あれば形を確かめる） */
const EVENT_V5: Record<string, (v: unknown) => boolean> = {
  location: optional(isStr),
  url: optional(isHttpOrBlank),
  items: optional(isCheckList),
  tripId: optional(isStr),
  kind: optional(oneOf("move", "stay", "sight", "food", "other")),
  cost: optional(isMoneyOrNull),
};

// 追加した一覧ごとの項目チェック（順番は COLLECTION_KEYS に合わせる。studySubjects は studyLogs より前）
const SPECS: Record<CollectionKey, { label: string; fields: Record<string, (v: unknown) => boolean> }> = {
  nisa: { label: "NISA", fields: { date: isDate, kind: oneOf("buy", "sell"), frame: oneOf("tsumitate", "growth"), amount: (v) => isAmt(v), name: isStr, note: isStr } },
  notes: { label: "生活記録・メモ", fields: { title: isStr, body: isStr, date: okDateOrBlank, pinned: isBool } },
  tasks: { label: "タスク", fields: { title: isStr, due: okDateOrBlank, done: isBool, note: isStr } },
  assets: { label: "資産", fields: { name: isStr, kind: oneOf("cash", "investment", "nisa", "pension", "insurance", "property", "other"), value: numOrNull, asOf: okDateOrBlank, note: isStr } },
  contracts: { label: "契約", fields: { name: isStr, provider: isStr, amount: numOrNull, cycle: oneOf("monthly", "yearly", "none"), renewalDate: okDateOrBlank, status: oneOf("active", "cancelled"), note: isStr } },
  health: { label: "健康記録", fields: { date: isDate, item: isStr, value: numOrNull, unit: isStr, note: isStr } },
  documents: { label: "書類", fields: { title: isStr, category: isStr, expiry: okDateOrBlank, place: isStr, note: isStr } },
  studySubjects: { label: "勉強（資格）", fields: { name: isStr, examDate: okDateOrBlank, targetHours: (v) => v === null || (isNum(v) && (v as number) > 0), archived: isBool, catalogId: optional(isStr), books: optional(isBookList) } },
  studyLogs: { label: "勉強記録", fields: { subjectId: isStr, date: isDate, minutes: (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 1440, note: isStr } },
  goals: { label: "目標", fields: { title: isStr, deadline: okDateOrBlank, kind: oneOf("number", "check"), target: numOrNull, current: isNum, unit: isStr, done: isBool, note: isStr } },
};

export function validateAppData(input: unknown): R {
  const raw = migrate(input);
  if (!isObj(raw)) return { ok: false, error: "データの形式が正しくありません" };
  if (raw.schemaVersion !== CURRENT_SCHEMA)
    return { ok: false, error: `対応していないデータ形式です（schemaVersion: ${String(raw.schemaVersion)}）。アプリを最新にしてください` };
  for (const k of ["transactions", "events", "categories", "recurring", ...COLLECTION_KEYS]) {
    if (!Array.isArray(raw[k])) return { ok: false, error: `${k} が見つかりません` };
  }
  const cats = raw.categories as unknown[];
  const catIds = new Set<string>();
  for (const c of cats) {
    if (!isObj(c) || !isStr(c.id) || !isStr(c.name) || (c.kind !== "expense" && c.kind !== "income"))
      return { ok: false, error: "カテゴリのデータが壊れています" };
    if (catIds.has(c.id)) return { ok: false, error: "カテゴリIDが重複しています" };
    catIds.add(c.id);
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
      (!e.allDay && (!isStr(e.startTime) || !isValidTimeStr(e.startTime) || !isStr(e.endTime) || !isValidTimeStr(e.endTime))) ||
      !(e.repeat === undefined || ["none", "weekly", "monthly", "yearly"].includes(e.repeat as string)) ||
      !(e.repeatUntil === undefined || okDateOrBlank(e.repeatUntil)) ||
      !Object.entries(EVENT_V5).every(([f, check]) => check(e[f]))
    )
      return { ok: false, error: "予定のデータが壊れています" };
    if (ids.has(e.id)) return { ok: false, error: "予定IDが重複しています" };
    ids.add(e.id);
  }
  if (!Array.isArray(raw.trips)) return { ok: false, error: "trips が見つかりません" };
  const tripIds = new Set<string>();
  for (const t of raw.trips as unknown[]) {
    if (
      !isObj(t) || !isStr(t.id) || !isStr(t.title) || !isDate(t.startDate) || !isDate(t.endDate) ||
      (t.endDate as string) < (t.startDate as string) || !isStr(t.destination) || !isMoneyOrNull(t.budget) || !isStr(t.note)
    )
      return { ok: false, error: "旅行のデータが壊れています" };
    if (tripIds.has(t.id)) return { ok: false, error: "旅行のIDが重複しています" };
    tripIds.add(t.id);
  }
  const recurringIds = new Set<string>();
  for (const r of raw.recurring as unknown[]) {
    if (
      !isObj(r) || !isStr(r.id) || !isStr(r.name) || !isAmt(r.amount) || !["weekly", "monthly", "yearly"].includes(r.cycle as string) ||
      !Number.isInteger(r.anchorDay) || !isStr(r.nextDueDate) || !isValidDateStr(r.nextDueDate) || typeof r.active !== "boolean"
    )
      return { ok: false, error: "固定費のデータが壊れています" };
    if (recurringIds.has(r.id)) return { ok: false, error: "固定費IDが重複しています" };
    recurringIds.add(r.id);
  }
  if (!isObj(raw.budget) || !(raw.budget.monthly === null || isAmt(raw.budget.monthly)))
    return { ok: false, error: "予算のデータが壊れています" };
  if (!isObj(raw.prefs) || !isObj(raw.prefs.home)) return { ok: false, error: "表示設定のデータが壊れています" };
  if (!isObj(raw.meta)) return { ok: false, error: "管理情報が壊れています" };

  const subjectIds = new Set<string>();
  for (const k of COLLECTION_KEYS) {
    const spec = SPECS[k];
    const seen = new Set<string>();
    for (const item of raw[k] as unknown[]) {
      if (!isObj(item) || !isStr(item.id) || !Object.entries(spec.fields).every(([f, check]) => check(item[f])))
        return { ok: false, error: `${spec.label}のデータが壊れています` };
      if (seen.has(item.id)) return { ok: false, error: `${spec.label}のIDが重複しています` };
      seen.add(item.id);
      if (k === "studySubjects") subjectIds.add(item.id);
      if (k === "studyLogs" && !subjectIds.has(item.subjectId as string))
        return { ok: false, error: "勉強の記録が、存在しない資格を指しています" };
    }
  }
  return { ok: true, data: raw as unknown as AppData };
}

/**
 * 参照整合性を追加検査する。古い端末データの読み込みでは自動変更・破棄をしないため、
 * 構造検査 validateAppData と分離し、復元前の厳密検査で使う。
 */
export function validateRelationships(data: AppData): { ok: true } | { ok: false; error: string } {
  const categories = new Map(data.categories.map((c) => [c.id, c]));
  for (const t of data.transactions) {
    const cat = categories.get(t.categoryId);
    const label = `${t.date}の${t.type === "expense" ? "支出" : "収入"}${t.amount.toLocaleString("ja-JP")}円${t.merchant ? `（${t.merchant}）` : ""}`;
    if (!cat) return { ok: false, error: `${label}のカテゴリが、バックアップの中に見つかりません` };
    if (cat.kind !== t.type) return { ok: false, error: `${label}のカテゴリが、支出用・収入用で食い違っています` };
  }
  for (const r of data.recurring) {
    const cat = categories.get(r.categoryId);
    if (!cat || cat.kind !== "expense") return { ok: false, error: `固定費「${r.name}」のカテゴリが、支出用のカテゴリになっていません` };
  }
  const trips = new Set((data.trips ?? []).map((t) => t.id));
  for (const e of data.events) {
    if (e.tripId && !trips.has(e.tripId)) {
      return { ok: false, error: `${e.startDate}の予定「${e.title}」が、存在しない旅行を参照しています` };
    }
  }
  const subjects = new Set(data.studySubjects.map((s) => s.id));
  for (const l of data.studyLogs) {
    if (!subjects.has(l.subjectId)) return { ok: false, error: `${l.date}の勉強の記録（${l.minutes}分）の資格が、バックアップの中に見つかりません` };
  }
  return { ok: true };
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
