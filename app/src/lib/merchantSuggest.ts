import { addDays } from "./date";
import type { Transaction, TxType } from "./types";

/**
 * 店名の候補と、その店でいつも使うカテゴリ（A2：入力を減らす。自分用。2026-11-26）。
 * 記録から作るだけで、外へは送らない。候補は押したときだけ入る（勝手に変えない）。
 */
const norm = (s: string) => s.trim().normalize("NFKC").toLowerCase();

/** 直近90日でよく使った店名（多い順、同じ数なら新しい順）。空の店名は数えない */
export function recentMerchants(txs: Transaction[], type: TxType, today: string, n = 5): string[] {
  const since = addDays(today, -90);
  const m = new Map<string, { name: string; count: number; last: string }>();
  for (const t of txs) {
    if (t.type !== type || t.date < since || t.date > today) continue;
    const k = norm(t.merchant);
    if (!k) continue;
    const cur = m.get(k) ?? { name: t.merchant.trim(), count: 0, last: "" };
    cur.count++;
    const at = `${t.date}|${t.createdAt}`;
    if (at > cur.last) {
      cur.last = at;
      cur.name = t.merchant.trim();
    }
    m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last)).slice(0, n).map((x) => x.name);
}

/** その店名で、いちばん新しい記録のカテゴリ（なければ null） */
export function categoryForMerchant(txs: Transaction[], type: TxType, merchant: string): string | null {
  const k = norm(merchant);
  if (!k) return null;
  let best: Transaction | null = null;
  for (const t of txs) {
    if (t.type !== type || norm(t.merchant) !== k) continue;
    if (!best || `${t.date}|${t.createdAt}` > `${best.date}|${best.createdAt}`) best = t;
  }
  return best ? best.categoryId : null;
}
