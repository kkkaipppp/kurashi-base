import { isValidDateStr } from "./date";
import type { AppData } from "./types";

/**
 * 現金・預金の残高の目安（NEXT v21 X03・X05：カード払いは、買った日に支出、引き落としの日に現金が減る。基準の残高がないときは、残高を出さない）。
 * 基準：種類が「現金」の資産のうち、評価日がいちばん新しい1件（口座が複数あるときは、合計を1件に入れておく）。
 * 基準の日より後の動きだけを足し引きする：
 *  ＋ 収入（収支に数えない記録は除く）
 *  − 現金・口座・QR・電子マネーなどで払った支出（投資に回した分も、現金からは出ていくので引く）
 *  − カードの引き落とし（「数え方」で「カード引き落とし」にした記録）
 *  カードで払った支出は、引き落としの日まで現金を減らさない（「引き落とし前のカード払い」として別に出す）
 *  口座間の移動（収支に数えない）は、持ち分の合計が変わらないので、数えない
 * どの数字も目安で、確定した残高ではない（口座の実際の残高と合わないときは、基準の残高を入れ直す）。
 */
export type BalanceResult =
  | {
      ok: true;
      base: { name: string; value: number; asOf: string };
      income: number;
      spend: number;
      cardSettled: number;
      /** 基準の日より後のカード払いのうち、引き落としの記録がまだない分（マイナスにならない） */
      cardPending: number;
      /** 今の残高の目安 */
      balance: number;
      /** カード払いが引き落とされたあとの残高の目安 */
      afterCard: number;
    }
  | { ok: false; reason: "noBase" };

export function cashBalance(d: AppData, today: string): BalanceResult {
  const bases = d.assets.filter((a) => a.kind === "cash" && a.value !== null && a.asOf !== "" && isValidDateStr(a.asOf));
  if (bases.length === 0) return { ok: false, reason: "noBase" };
  const b = bases.reduce((a, x) => (x.asOf > a.asOf ? x : a));
  let income = 0;
  let spend = 0;
  let cardSettled = 0;
  let cardBought = 0;
  for (const t of d.transactions) {
    if (t.date <= b.asOf || t.date > today) continue;
    if (t.type === "income") {
      if (t.countAs !== "transfer") income += t.amount;
    } else if (t.countAs === "transfer") {
      if (t.transferKind === "card") cardSettled += t.amount;
    } else if (t.paymentMethod === "card") cardBought += t.amount;
    else spend += t.amount;
  }
  const value = b.value as number;
  const cardPending = Math.max(0, cardBought - cardSettled);
  const balance = value + income - spend - cardSettled;
  return { ok: true, base: { name: b.name, value, asOf: b.asOf }, income, spend, cardSettled, cardPending, balance, afterCard: balance - cardPending };
}
