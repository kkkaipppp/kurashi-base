import { categoryMap, txIsFixed, txIsInvest } from "./classify";
import type { AppData, Transaction } from "./types";

/**
 * 共通台帳（o11 工程2・A03）。今の保存データ（AppData）から、お金の「出来事」を作る（読むだけ。保存の形は変えない）。
 * 出来事の種類（独立したイベント）：
 *  - purchase  … 支出（買った日）。gross＝返金の前の元の額、net＝返金を引いたあとの額（＝今の記録の金額。全額返金なら 0）
 *  - refund    … 返金（返金の日）。どの購入の返金か（of）を持つ。収支には数えない（購入の net を減らしている）
 *  - income    … 収入
 *  - cardSettlement … カードの引き落とし（口座から現金が出る日）。収支には数えない
 *  - transfer  … 口座間の移動など（収支にも残高にも数えない）
 * 日付は3つを分ける：購入日（purchase.date）・返金日（refund.date）・現金が動く日（cardSettlement.date）。
 * 今の集計（summarizeMonth・monthBreakdown）と同じ答えになることを、並行比較の試験で確かめる（tests/ledger-core.test.ts）。
 */
export type LedgerEvent =
  | { kind: "purchase"; txId: string; date: string; gross: number; net: number; categoryId: string; invest: boolean; fixed: boolean; card: boolean }
  | { kind: "refund"; txId: string; of: string; date: string; amount: number }
  | { kind: "income"; txId: string; date: string; amount: number; categoryId: string }
  | { kind: "cardSettlement"; txId: string; date: string; amount: number }
  | { kind: "transfer"; txId: string; date: string; amount: number; direction: "out" | "in" };

export function ledgerEvents(d: Pick<AppData, "transactions" | "categories" | "recurring">): LedgerEvent[] {
  const cats = categoryMap(d);
  const out: LedgerEvent[] = [];
  for (const t of d.transactions) out.push(toEvent(t, cats, d.recurring));
  return out;
}

function toEvent(t: Transaction, cats: ReturnType<typeof categoryMap>, recurring: AppData["recurring"]): LedgerEvent {
  if (t.type === "income") {
    // 返金の記録は「収支に数えない」（countAs=transfer）で作る。付いていないもの（手で直したデータなど）は、今の集計と同じく収入として扱い、
    // 元の購入の保存則が合わなくなるので、データの点検で「要確認」に出る（勝手に直さない。独立点検 中1）
    if (t.refundOf && t.countAs === "transfer") return { kind: "refund", txId: t.id, of: t.refundOf, date: t.date, amount: t.amount };
    if (t.countAs === "transfer") return { kind: "transfer", txId: t.id, date: t.date, amount: t.amount, direction: "in" };
    return { kind: "income", txId: t.id, date: t.date, amount: t.amount, categoryId: t.categoryId };
  }
  // 全額返金された購入（数え方が transfer で、元の額の控えがある）は、購入として残し、net を 0 にする
  if (t.countAs === "transfer" && t.refundGross !== undefined) {
    const was = t.refundWas ? { ...t, countAs: t.refundWas } : { ...t, countAs: undefined };
    return { kind: "purchase", txId: t.id, date: t.date, gross: t.refundGross, net: 0, categoryId: t.categoryId, invest: txIsInvest(was, cats), fixed: txIsFixed(t, recurring), card: t.paymentMethod === "card" };
  }
  if (t.countAs === "transfer") {
    if (t.transferKind === "card") return { kind: "cardSettlement", txId: t.id, date: t.date, amount: t.amount };
    return { kind: "transfer", txId: t.id, date: t.date, amount: t.amount, direction: "out" };
  }
  return { kind: "purchase", txId: t.id, date: t.date, gross: t.refundGross ?? t.amount, net: t.amount, categoryId: t.categoryId, invest: txIsInvest(t, cats), fixed: txIsFixed(t, recurring), card: t.paymentMethod === "card" };
}

const inMonth = (date: string, month: string) => date.slice(0, 7) === month;

export interface MonthTotals {
  /** 購入月の実績：返金を引いたあとの支出（今の「支出」と同じ） */
  purchaseNet: number;
  /** 購入月の元の額（返金の前） */
  purchaseGross: number;
  /** その月に返金された額（返金日の月で数える。キャッシュの戻り） */
  refundedInMonth: number;
  income: number;
  /** 投資を除いた支出（生活費） */
  lifeNet: number;
  investNet: number;
  fixedLifeNet: number;
  /** カードの引き落とし（現金が出る額。収支には数えない） */
  cardSettled: number;
}

export function monthTotals(events: LedgerEvent[], month: string): MonthTotals {
  const m: MonthTotals = { purchaseNet: 0, purchaseGross: 0, refundedInMonth: 0, income: 0, lifeNet: 0, investNet: 0, fixedLifeNet: 0, cardSettled: 0 };
  for (const e of events) {
    if (!inMonth(e.date, month)) continue;
    if (e.kind === "purchase") {
      m.purchaseNet += e.net;
      m.purchaseGross += e.gross;
      if (e.invest) m.investNet += e.net;
      else {
        m.lifeNet += e.net;
        if (e.fixed) m.fixedLifeNet += e.net;
      }
    } else if (e.kind === "refund") m.refundedInMonth += e.amount;
    else if (e.kind === "income") m.income += e.amount;
    else if (e.kind === "cardSettlement") m.cardSettled += e.amount;
  }
  return m;
}

/**
 * 保存則の点検：どの購入も「元の額 − その購入の返金の合計 ＝ 今の額」。合わない購入の ID を返す（空なら合っている）。
 * データを書き換えない。合わないときは、画面で「要確認」を出す材料にする（勝手に直さない）
 */
export function refundConservationErrors(events: LedgerEvent[]): string[] {
  const refunded = new Map<string, number>();
  for (const e of events) if (e.kind === "refund") refunded.set(e.of, (refunded.get(e.of) ?? 0) + e.amount);
  const bad: string[] = [];
  for (const e of events) {
    if (e.kind !== "purchase") continue;
    const r = refunded.get(e.txId) ?? 0;
    if (e.gross - r !== e.net) bad.push(e.txId);
  }
  return bad;
}
