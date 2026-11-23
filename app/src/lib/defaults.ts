import { COLLECTION_KEYS, type AppData, type Category, type Collections } from "./types";

export function emptyCollections(): Collections {
  return Object.fromEntries(COLLECTION_KEYS.map((k) => [k, []])) as unknown as Collections;
}

// 初期カテゴリ（取引のダミーデータは入れない）
const EXPENSE = ["食費", "日用品", "交通", "住まい", "光熱・通信", "医療・健康", "趣味・娯楽", "交際", "衣服・美容", "その他"];
const INCOME = ["給与", "副収入", "その他の収入"];

export function defaultCategories(): Category[] {
  return [
    ...EXPENSE.map((name, i) => ({ id: `exp-${i + 1}`, name, kind: "expense" as const, order: i, archived: false })),
    ...INCOME.map((name, i) => ({ id: `inc-${i + 1}`, name, kind: "income" as const, order: i, archived: false })),
  ];
}

/** 初期カテゴリの ID（どの端末でも同じ） */
export const DEFAULT_CATEGORY_IDS: ReadonlySet<string> = new Set(defaultCategories().map((c) => c.id));

export function emptyData(nowIso: string = new Date().toISOString()): AppData {
  return {
    schemaVersion: 2,
    transactions: [],
    events: [],
    trips: [],
    categories: defaultCategories(),
    recurring: [],
    budget: { monthly: null },
    prefs: { home: { todaySpent: true, nextRecurring: true, needsReview: true } },
    meta: { createdAt: nowIso, lastBackupAt: null },
    ...emptyCollections(),
  };
}

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
}
