import { clampDay, parseDateStr } from "./date";
import type { Account, AppData, Transaction } from "./types";

/**
 * 口座・カード・電子マネーの残高の目安（To-Be 02 家計簿「口座/カード/電子マネー・振替・残高照合・カード締め・引落」。2026-11-28）。
 * 記録の「どこから払ったか」（accountId）と「入る先」（toAccountId）だけを見る。収支の集計（家計簿の支出・収入）は変えない。
 * 口座の値の動き（入ると＋、出ると−）：
 *   支出：払った額（返金の前の額・立替なら総額・経費なら全額）が出る
 *   収入：入る。返金の記録は元の支出の口座に戻る。精算（立替・経費を返してもらった）は、その記録の口座に入る
 *   振替（収支に数えない記録）：accountId から出て toAccountId に入る（カードの引き落とし＝口座からカードへ）
 * カードは値がマイナスの間「引き落とし待ち」（借りている額）。照合した残高（baseBalance）は、カードなら引き落とし待ちの額
 */
export type Move = { txId: string; date: string; delta: number; createdAt: string };

const paid = (t: Transaction) => (t.claim ? t.amount : (t.refundGross ?? t.advanceGross ?? t.amount));

export function accountMoves(d: Pick<AppData, "transactions">, accId: string): Move[] {
  const byId = new Map(d.transactions.map((t) => [t.id, t]));
  const out: Move[] = [];
  for (const t of d.transactions) {
    if (t.type === "expense" && (t.claim || t.countAs !== "transfer" || t.refundGross !== undefined)) {
      if (t.accountId === accId) out.push({ txId: t.id, date: t.date, delta: -paid(t), createdAt: t.createdAt });
      continue;
    }
    if (t.type === "income" && t.refundOf && t.countAs === "transfer") {
      if (byId.get(t.refundOf)?.accountId === accId) out.push({ txId: t.id, date: t.date, delta: t.amount, createdAt: t.createdAt });
      continue;
    }
    if (t.type === "income" && (t.settles || t.countAs !== "transfer")) {
      if (t.accountId === accId) out.push({ txId: t.id, date: t.date, delta: t.amount, createdAt: t.createdAt });
      continue;
    }
    // 振替（収支に数えない記録）：入る先があれば accountId から出て toAccountId に入る。同じ口座どうしは動かない（点検 低1）。
    // 入る先が無い振替は、支出なら出る・収入なら入る（点検 中1：収入の振替で出る口座を増やさない）
    if (t.toAccountId && t.toAccountId === t.accountId) continue;
    if (t.toAccountId) {
      if (t.accountId === accId) out.push({ txId: t.id, date: t.date, delta: -t.amount, createdAt: t.createdAt });
      if (t.toAccountId === accId) out.push({ txId: t.id, date: t.date, delta: t.amount, createdAt: t.createdAt });
    } else if (t.accountId === accId) out.push({ txId: t.id, date: t.date, delta: t.type === "income" ? t.amount : -t.amount, createdAt: t.createdAt });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface AccountView {
  /** 残高の目安（カードは引き落とし待ちをマイナスで）。照合していない口座・電子マネーは null */
  value: number | null;
  /** 照合のあと（照合していなければ全期間）の動きの合計 */
  change: number;
  known: boolean;
}

export function accountView(d: Pick<AppData, "transactions">, a: Account, today: string): AccountView {
  const base = a.baseDate && a.baseBalance !== null ? a.baseDate : "";
  // 照合した日の記録は、照合のあとに入れたものだけ数える（点検 中2）
  const after = (m: Move) => !base || m.date > base || (m.date === base && !!a.baseAt && m.createdAt > a.baseAt);
  const change = accountMoves(d, a.id)
    .filter((m) => m.date <= today && after(m))
    .reduce((s, m) => s + m.delta, 0);
  if (base) {
    const start = a.kind === "card" ? -(a.baseBalance as number) : (a.baseBalance as number);
    return { value: start + change, change, known: true };
  }
  // カードは、照合していなくても、記録した分の引き落とし待ちを出せる（初めの借りは 0 とみなす）
  if (a.kind === "card") return { value: change, change, known: false };
  return { value: null, change, known: false };
}

/** 残高を合わせる（照合）：実際の残高（カードは引き落とし待ちの額）を入れる。差＝実際 − 目安（目安が無ければ null） */
export function reconcile(d: AppData, id: string, actual: number, today: string, ts: string): { next: AppData; diff: number | null } {
  const a = d.accounts.find((x) => x.id === id);
  if (!a) return { next: d, diff: null };
  const v = accountView(d, a, today);
  const shown = v.value === null ? null : a.kind === "card" ? -v.value : v.value;
  return {
    next: { ...d, accounts: d.accounts.map((x) => (x.id === id ? { ...x, baseBalance: actual, baseDate: today, baseAt: ts, updatedAt: ts } : x)) },
    diff: shown === null ? null : actual - shown,
  };
}

const ymd = (y: number, m: number, day: number) => {
  const yy = m > 12 ? y + 1 : m < 1 ? y - 1 : y;
  const mm = m > 12 ? m - 12 : m < 1 ? m + 12 : m;
  return clampDay(yy, mm, day);
};

/**
 * カードの次の引き落とし（締め日・引き落とし日から。引き落とし日は締めた月の翌月。月末を超える日は月末）。
 * 返すのは、まだ来ていない一番近い引き落とし日と、その分の締めの期間・使った額（返金を引いたあと）
 */
export function nextCardPayment(d: Pick<AppData, "transactions">, a: Account, today: string): { closing: string; from: string; pay: string; amount: number } | null {
  if (a.kind !== "card" || !a.closingDay || !a.payDay) return null;
  const t = parseDateStr(today);
  for (let k = -2; k <= 1; k++) {
    const closing = ymd(t.y, t.m + k, a.closingDay);
    const c = parseDateStr(closing);
    const pay = ymd(c.y, c.m + 1, a.payDay);
    if (pay < today) continue;
    // 引き落とし日の当日に、締めのあとにカードへ入れた額がその分以上あれば、済んだとみなして次の分へ（点検 低2）
    const prevClosing = ymd(c.y, c.m - 1, a.closingDay);
    // 期間の中の使った額（出ていく動き）から、返金の戻りを引く。カードへの支払い（振替で入る分）は引かない
    const amount = -accountMoves(d, a.id)
      .filter((m) => m.date > prevClosing && m.date <= closing && (m.delta < 0 || isRefund(d, m.txId)))
      .reduce((s, m) => s + m.delta, 0);
    if (pay === today && amount > 0) {
      const paidIn = accountMoves(d, a.id).filter((m) => m.date > closing && m.date <= today && m.delta > 0 && !isRefund(d, m.txId)).reduce((s, m) => s + m.delta, 0);
      if (paidIn >= amount) continue;
    }
    return { closing, from: prevClosing, pay, amount: Math.max(0, amount) };
  }
  return null;
}

function isRefund(d: Pick<AppData, "transactions">, txId: string): boolean {
  const t = d.transactions.find((x) => x.id === txId);
  return !!t?.refundOf;
}
