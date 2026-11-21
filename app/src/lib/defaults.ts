import type { AppData, Category } from "./types";

// 初期カテゴリ（取引のダミーデータは入れない）
const EXPENSE = ["食費", "日用品", "交通", "住まい", "光熱・通信", "医療・健康", "趣味・娯楽", "交際", "衣服・美容", "その他"];
const INCOME = ["給与", "副収入", "その他の収入"];

export function defaultCategories(): Category[] {
  return [
    ...EXPENSE.map((name, i) => ({ id: `exp-${i + 1}`, name, kind: "expense" as const, order: i, archived: false })),
    ...INCOME.map((name, i) => ({ id: `inc-${i + 1}`, name, kind: "income" as const, order: i, archived: false })),
  ];
}

export function emptyData(nowIso: string = new Date().toISOString()): AppData {
  return {
    schemaVersion: 1,
    transactions: [],
    events: [],
    categories: defaultCategories(),
    recurring: [],
    budget: { monthly: null },
    prefs: { home: { todaySpent: true, nextRecurring: true, needsReview: true } },
    meta: { createdAt: nowIso, lastBackupAt: null },
  };
}

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
}
