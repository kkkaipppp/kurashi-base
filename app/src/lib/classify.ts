import type { AppData, Category, RecurringExpense, Transaction } from "./types";

/**
 * 支出の分け方（100点化の指示 D：名前ではなく、本人が決めた分類で数える）。
 * - 投資か生活費か：
 *   1. 取引ごとの上書き（Transaction.countAs）があればそれ
 *   2. カテゴリの分類（Category.role）があればそれ
 *   3. どちらもなければ、今までどおり「名前に『投資』が入っている」で判断（古い記録はそのまま）
 * - 固定費か変動費か：
 *   1. 固定費から記録した支出（recurringId つき）は固定費
 *   2. 古い記録（recurringId なし）は、固定費に登録したカテゴリで「金額も同じ」ときだけ固定費とみなす
 *      （同じカテゴリの変動費を固定費に数えないため）
 * どれも記録を書き換えない。計算のときに見るだけ。
 */
export type CountAs = "life" | "invest";

export const isInvestByName = (name: string) => name.includes("投資");

/** カテゴリを投資として数えるか */
export function categoryIsInvest(c: Pick<Category, "kind" | "name" | "role"> | undefined): boolean {
  if (!c || c.kind !== "expense") return false;
  if (c.role) return c.role === "invest";
  return isInvestByName(c.name);
}

/** カテゴリの分け方が、本人が決めたものか、名前から決めたものか */
export function categoryRoleSource(c: Pick<Category, "role">): "set" | "name" {
  return c.role ? "set" : "name";
}

export function txIsInvest(t: Pick<Transaction, "type" | "categoryId" | "countAs">, cats: Map<string, Category>): boolean {
  if (t.type !== "expense") return false;
  if (t.countAs) return t.countAs === "invest";
  return categoryIsInvest(cats.get(t.categoryId));
}

export function txIsFixed(t: Pick<Transaction, "type" | "categoryId" | "amount" | "recurringId">, recurring: RecurringExpense[]): boolean {
  if (t.type !== "expense") return false;
  if (t.recurringId) return true;
  return recurring.some((r) => r.active && r.categoryId === t.categoryId && r.amount === t.amount);
}

export const categoryMap = (data: Pick<AppData, "categories">) => new Map(data.categories.map((c) => [c.id, c]));

/**
 * 手で入れた支出が、まだ記録していない固定費の支払いかもしれないとき、その候補（押したときだけつなぐ）。
 * 同じカテゴリで金額が同じ、または名前が店名に入っていて、次の支払日の前後10日以内のもの
 */
export function fixedCandidates(
  draft: { type: string; categoryId: string; amount: number | null; merchant: string; date: string },
  recurring: RecurringExpense[],
): RecurringExpense[] {
  if (draft.type !== "expense") return [];
  const day = Date.parse(`${draft.date}T00:00:00`);
  if (Number.isNaN(day)) return [];
  return recurring.filter((r) => {
    if (!r.active) return false;
    const due = Date.parse(`${r.nextDueDate}T00:00:00`);
    // 毎週の固定費は前後3日（10日だと、すでに記録した前の回にもつながってしまう。点検役の指摘）
    const range = r.cycle === "weekly" ? 3 : 10;
    if (Number.isNaN(due) || Math.abs(due - day) > range * 86_400_000) return false;
    const sameCatAmount = r.categoryId === draft.categoryId && draft.amount !== null && r.amount === draft.amount;
    const nameHit = r.name.trim().length >= 2 && draft.merchant.includes(r.name.trim());
    return sameCatAmount || nameHit;
  });
}
