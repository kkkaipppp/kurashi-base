import type { Category } from "./types";

export const CATEGORY_NAME_MAX = 20;

/**
 * カテゴリの名前を変える。ID は変えないので、過去の取引とのつながりはそのまま。
 * 同じ種類（支出・収入）で表示中のカテゴリと同じ名前にはしない（復元のとき名前で同じものと見るため）。
 */
export function renameCategoryIn(
  categories: Category[],
  id: string,
  name: string,
): { ok: true; categories: Category[] } | { ok: false; error: string } {
  const clean = name.trim();
  const current = categories.find((c) => c.id === id);
  if (!current) return { ok: false, error: "カテゴリが見つかりません。画面を開き直してください" };
  if (!clean || clean.length > CATEGORY_NAME_MAX) return { ok: false, error: `カテゴリ名は1〜${CATEGORY_NAME_MAX}文字で入力してください` };
  if (categories.some((c) => c.id !== id && c.kind === current.kind && c.name === clean && !c.archived)) {
    return { ok: false, error: "同じ名前のカテゴリがあります" };
  }
  return { ok: true, categories: categories.map((c) => (c.id === id ? { ...c, name: clean } : c)) };
}
