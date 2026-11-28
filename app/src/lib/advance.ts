import { isValidDateStr } from "./date";
import { MAX_AMOUNT } from "./money";
import type { AppData, Transaction } from "./types";

/**
 * 立替と精算（To-Be 02・03「現金移動、個人負担、立替債権を区別」。決定 2026-11-28：金額は自分の分、払った総額を控える）。
 * 立替の支出：amount＝自分の分（収支に数えるのはこれだけ）、advanceGross＝実際に払った総額。
 *   返してもらう分＝advanceGross − amount − 精算の合計（0 未満にしない）
 * 精算の記録：type=income・countAs=transfer・settles＝どの立替か。収入にも支出にも数えない（お金が戻っただけ）。
 * 残高の目安では、立替の総額が出ていき（カードなら引き落とし待ち）、精算の額が入る（lib/balance.ts）。
 * 返金と立替は重ねない（返金は元の額から計算し直すので、立替の総額と食い違う）。
 */
export type AdvanceResult = { ok: true; next: AppData } | { ok: false; error: string };

export const isAdvance = (t: Pick<Transaction, "advanceGross" | "amount"> & { claim?: true }): boolean => t.claim === true || (typeof t.advanceGross === "number" && t.advanceGross > t.amount);

/** 返してもらう分のもと：経費は払った全額、立替は総額 − 自分の分 */
export const owedBase = (t: Pick<Transaction, "advanceGross" | "amount"> & { claim?: true }): number => (t.claim ? t.amount : (t.advanceGross ?? t.amount) - t.amount);

/** 精算の記録（収支に数えない形のものだけ。数え方の無い精算は、手で直したデータとして点検に出す） */
const isSettlement = (t: Transaction) => !!t.settles && t.type === "income" && t.countAs === "transfer";

export function settledTotal(d: Pick<AppData, "transactions">, txId: string): number {
  return d.transactions.filter((t) => t.settles === txId && isSettlement(t)).reduce((a, t) => a + t.amount, 0);
}

/** 点検：立替が見つからない・数え方が違う・返してもらう分より多い精算の記録の ID */
export function settleProblems(d: Pick<AppData, "transactions">): string[] {
  const byId = new Map(d.transactions.map((t) => [t.id, t]));
  const bad: string[] = [];
  for (const t of d.transactions) {
    if (!t.settles) continue;
    const a = byId.get(t.settles);
    if (!a || a.type !== "expense" || !isAdvance(a) || !isSettlement(t)) bad.push(t.id);
    else if (settledTotal(d, a.id) > owedBase(a)) bad.push(t.id);
  }
  return bad;
}

/** 返してもらう分の残り */
export function owedLeft(d: Pick<AppData, "transactions">, tx: Transaction): number {
  if (!isAdvance(tx)) return 0;
  return Math.max(0, owedBase(tx) - settledTotal(d, tx.id));
}

/** 入力の確かめ：総額と自分の分（円の整数）。自分の分は 1 円以上・総額より少ない */
export function checkAdvance(gross: number, mine: number): string | null {
  if (!Number.isInteger(gross) || gross < 2 || gross > MAX_AMOUNT) return "払った総額は、2円以上の整数で入れてください";
  if (!Number.isInteger(mine) || mine < 1) return "自分の分は、1円以上の整数で入れてください（全部が友達の分のときは、収支に数えない記録にしてください）";
  if (mine >= gross) return "自分の分は、払った総額より少なくしてください（同じなら立替ではありません）";
  return null;
}

/** 返してもらう分がある立替の一覧（新しい順） */
export function openAdvances(d: Pick<AppData, "transactions">): { tx: Transaction; left: number }[] {
  return d.transactions
    .filter((t) => t.type === "expense" && isAdvance(t))
    .map((tx) => ({ tx, left: owedLeft(d, tx) }))
    .filter((x) => x.left > 0)
    .sort((a, b) => (a.tx.date === b.tx.date ? b.tx.createdAt.localeCompare(a.tx.createdAt) : b.tx.date.localeCompare(a.tx.date)));
}

/** 精算：返してもらった額を記録する（収支に数えない）。残りより多い額・0円・日付の誤りは断る */
export function applySettlement(d: AppData, txId: string, amount: number, date: string, id: string, ts: string): AdvanceResult {
  if (!id.trim() || d.transactions.some((t) => t.id === id)) return { ok: false, error: "精算の記録を保存できませんでした。もう一度お試しください" };
  const orig = d.transactions.find((t) => t.id === txId);
  if (!orig) return { ok: false, error: "立替の記録が見つかりません（ほかのタブなどで削除されています）" };
  if (orig.type !== "expense" || !isAdvance(orig)) return { ok: false, error: "この記録は立替ではありません" };
  const left = owedLeft(d, orig);
  if (!Number.isInteger(amount) || amount < 1) return { ok: false, error: "返してもらった額は、1円以上の整数で入れてください" };
  if (left <= 0) return { ok: false, error: "すでに全部返してもらっています" };
  if (amount > left) return { ok: false, error: `返してもらう残り（${left.toLocaleString("ja-JP")}円）より大きいです` };
  if (!isValidDateStr(date)) return { ok: false, error: "日付が正しくありません" };
  const incomeCat = d.categories.find((c) => c.kind === "income" && c.name === "その他の収入") ?? d.categories.find((c) => c.kind === "income");
  const s: Transaction = {
    id,
    type: "income",
    date,
    amount,
    currency: orig.currency,
    categoryId: incomeCat?.id ?? orig.categoryId,
    merchant: orig.merchant,
    paymentMethod: "",
    note: `精算（${orig.date} の立替）`,
    source: "manual",
    countAs: "transfer",
    settles: orig.id,
    createdAt: ts,
    updatedAt: ts,
  };
  return { ok: true, next: { ...d, transactions: [...d.transactions, s] } };
}

/** 返してもらう分の合計 */
export function owedTotal(d: Pick<AppData, "transactions">): number {
  return openAdvances(d).reduce((a, x) => a + x.left, 0);
}

/**
 * 割り勘（To-Be 02 家計簿・計画の精算。決定 2026-11-28）：払った支出を人数で割り、自分の分だけを支出に数える（残りは立替の「返してもらう分」）。
 * 自分の分は切り上げ（返してもらう分の合計が払った額を超えないように）。人数は 2〜50 人
 */
export function splitShare(amount: number, people: number): number {
  return Math.ceil(amount / people);
}

export function splitTx(d: AppData, txId: string, people: number, ts: string): AdvanceResult {
  const t = d.transactions.find((x) => x.id === txId);
  if (!t) return { ok: false, error: "支出の記録が見つかりません（ほかのタブなどで削除されています）" };
  if (t.type !== "expense" || t.countAs === "transfer" || t.refundOf || t.refundGross !== undefined || t.settles || isAdvance(t)) return { ok: false, error: "この記録は割り勘にできません（返金・立替・経費・収支に数えない記録）" };
  if (t.recurringId) return { ok: false, error: "固定費の支払いは、割り勘にできません" };
  if (!Number.isInteger(people) || people < 2 || people > 50) return { ok: false, error: "人数は 2〜50 人で入れてください" };
  const mine = splitShare(t.amount, people);
  const err = checkAdvance(t.amount, mine);
  if (err) return { ok: false, error: "金額が小さすぎて割れません" };
  return { ok: true, next: { ...d, transactions: d.transactions.map((x) => (x.id === txId ? { ...x, amount: mine, advanceGross: t.amount, updatedAt: ts } : x)) } };
}
