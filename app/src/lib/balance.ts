import { isValidDateStr } from "./date";
import { ledgerEvents } from "./ledgerCore";
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
      /** cardDebt：もとの残高の日の、カードの引き落とし待ち。null＝入っていない（不明。0 とは決めつけない。o11 工程2） */
      base: { name: string; value: number; asOf: string; cardDebt: number | null };
      /** 引き落とし待ちの額が確かか（もとの日の額が不明なら false＝下の額は「少なくとも」の額） */
      cardPendingKnown: boolean;
      /** もとの日より後に、カードの買い物・引き落としがあったか（なければ「不明」の注意を出さない） */
      cardActivity: boolean;
      income: number;
      /** 現金・口座などで払った額（返金の前の元の額。買った日） */
      spend: number;
      /** 現金の買い物の返金で戻った額（返金の日） */
      refunded: number;
      /** 立替で友達の分として現金・口座から払った額（買った日。収支には数えない） */
      advancedOut: number;
      /** 立替を返してもらった額（精算の日。収支には数えない） */
      settledIn: number;
      cardSettled: number;
      /** 引き落とし前のカード払い＝基準の日のカード未払い＋基準の日より後のカード払い−引き落とし（マイナスにならない） */
      cardPending: number;
      /** 今の残高の目安 */
      balance: number;
      /** カード払いが引き落とされたあとの残高の目安 */
      afterCard: number;
    }
  | { ok: false; reason: "noBase" | "futureBase" };

export function cashBalance(d: AppData, today: string): BalanceResult {
  const bases = d.assets.filter((a) => a.kind === "cash" && a.value !== null && a.asOf !== "" && isValidDateStr(a.asOf) && a.asOf <= today);
  if (bases.length === 0) {
    // 現金の資産はあるが、日付が今日より後のものだけのとき（入れたのに「入っていない」と言わない。独立点検 低3）
    const future = d.assets.some((a) => a.kind === "cash" && a.value !== null && isValidDateStr(a.asOf) && a.asOf > today);
    return { ok: false, reason: future ? "futureBase" : "noBase" };
  }
  const b = bases.reduce((a, x) => (x.asOf > a.asOf ? x : a));
  // 共通台帳の出来事から計算する（o11 工程2：購入日・返金日・現金が動く日を分ける。独立点検 高1）
  //  ・現金の買い物：買った日に元の額が減る。返金は、返金の日に現金が戻る
  //  ・カードの買い物：買った日に引き落とし待ちが増える。返金は、返金の日に引き落とし待ちが減る（現金は動かない）
  //  ・カードの引き落とし：その日に現金が減り、引き落とし待ちも減る
  const events = ledgerEvents(d);
  const isCard = new Map<string, boolean>();
  for (const e of events) if (e.kind === "purchase") isCard.set(e.txId, e.card);
  // 精算は、立替の友達の分までしか数えない（指し先の無い・多すぎる精算で残高を増やさない。点検 中2）
  const advLeft = new Map<string, number>();
  for (const e of events) if (e.kind === "purchase" && e.advanced) advLeft.set(e.txId, e.advanced);
  let income = 0;
  let spend = 0;
  let refunded = 0;
  let cardSettled = 0;
  let cardBought = 0;
  let cardRefunded = 0;
  let cardActivity = false;
  let advancedOut = 0;
  let settledIn = 0;
  for (const e of events) {
    if (e.date <= b.asOf || e.date > today) continue;
    if (e.kind === "income") income += e.amount;
    else if (e.kind === "purchase") {
      // 立替は、友達の分も実際に払っている（カードなら引き落とし待ち、現金なら残高から出る）
      if (e.card) {
        cardBought += e.gross + (e.advanced ?? 0);
        cardActivity = true;
      }
      else {
        spend += e.gross;
        advancedOut += e.advanced ?? 0;
      }
    } else if (e.kind === "refund") {
      // 元の支出が見つからない返金は、足さない（データの点検で「要確認」に出す。再点検 高1）
      if (!isCard.has(e.of)) continue;
      if (isCard.get(e.of)) cardRefunded += e.amount;
      else refunded += e.amount;
    } else if (e.kind === "settlement") {
      const room = advLeft.get(e.of) ?? 0;
      const take = Math.min(room, e.amount);
      advLeft.set(e.of, room - take);
      settledIn += take;
    } else if (e.kind === "cardSettlement") {
      cardSettled += e.amount;
      cardActivity = true;
    }
  }
  const value = b.value as number;
  // 基準の日の時点のカード未払い。入っていなければ不明（0 と決めつけない）。計算には 0 を使うが、「少なくとも」の額として扱う
  const known = typeof b.cardDebt === "number";
  const debt0 = known ? (b.cardDebt as number) : 0;
  const cardPending = Math.max(0, debt0 + cardBought - cardRefunded - cardSettled);
  const balance = value + income + refunded + settledIn - spend - advancedOut - cardSettled;
  return { ok: true, base: { name: b.name, value, asOf: b.asOf, cardDebt: known ? debt0 : null }, cardPendingKnown: known, cardActivity, income, spend, refunded, advancedOut, settledIn, cardSettled, cardPending, balance, afterCard: balance - cardPending };
}
