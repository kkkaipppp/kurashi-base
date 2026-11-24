import type { AppData, Category, Transaction, TxType } from "./types";

/**
 * 未整理の記録（NEXT v21 Phase 2「未整理の記録」「自動分類」。CSV 取り込みで「その他」になったものを、店名ごとにまとめて整理する）。
 * - 「その他」（支出）・「その他の収入」（収入）のカテゴリに入っている記録を、店名（空なら「店名なし」）でまとめる
 * - 候補は、同じ店名の別の記録が、すでにほかのカテゴリに入っているときだけ（いちばん多いカテゴリ）。勝手に変えない：本人が押したときだけ
 * - 変えるのはカテゴリだけ。金額・日付・ID は変えない。まとめて変えるので、取り消しの控えを残して保存する
 */
export const UNSORTED_NAMES: Record<TxType, string> = { expense: "その他", income: "その他の収入" };

const keyOf = (merchant: string) => merchant.normalize("NFKC").trim().toLowerCase().replace(/[\s　]+/g, " ");

export interface InboxGroup {
  key: string;
  /** 表示用の店名（いちばん多い書き方） */
  merchant: string;
  type: TxType;
  ids: string[];
  total: number;
  firstDate: string;
  lastDate: string;
  /** 同じ店名がほかのカテゴリに入っている中で、いちばん多いカテゴリ（なければ null）と、その件数 */
  suggest: { categoryId: string; name: string; count: number } | null;
}

function unsortedIds(cats: Category[]): Map<TxType, string> {
  const m = new Map<TxType, string>();
  for (const c of cats) if (c.name === UNSORTED_NAMES[c.kind] && !m.has(c.kind)) m.set(c.kind, c.id);
  return m;
}

export function inboxGroups(data: AppData): InboxGroup[] {
  const un = unsortedIds(data.categories);
  const unIds = new Set(un.values());
  const catById = new Map(data.categories.map((c) => [c.id, c]));
  // 同じ店名の、ほかのカテゴリの件数
  const seen = new Map<string, Map<string, number>>();
  for (const t of data.transactions) {
    if (unIds.has(t.categoryId) || !t.merchant.trim()) continue;
    const k = `${t.type}|${keyOf(t.merchant)}`;
    const m = seen.get(k) ?? new Map<string, number>();
    m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1);
    seen.set(k, m);
  }
  const groups = new Map<string, InboxGroup & { names: Map<string, number> }>();
  for (const t of data.transactions) {
    if (!unIds.has(t.categoryId)) continue;
    const k = `${t.type}|${keyOf(t.merchant)}`;
    let g = groups.get(k);
    if (!g) {
      g = { key: k, merchant: "", type: t.type, ids: [], total: 0, firstDate: t.date, lastDate: t.date, suggest: null, names: new Map() };
      groups.set(k, g);
    }
    g.ids.push(t.id);
    g.total += t.amount;
    if (t.date < g.firstDate) g.firstDate = t.date;
    if (t.date > g.lastDate) g.lastDate = t.date;
    const nm = t.merchant.trim();
    g.names.set(nm, (g.names.get(nm) ?? 0) + 1);
  }
  return [...groups.values()]
    .map(({ names, ...g }) => {
      const merchant = [...names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
      const cand = seen.get(g.key);
      let suggest: InboxGroup["suggest"] = null;
      if (cand && merchant) {
        const [cid, count] = [...cand.entries()].sort((a, b) => b[1] - a[1])[0];
        const c = catById.get(cid);
        if (c && !c.archived) suggest = { categoryId: cid, name: c.name, count };
      }
      return { ...g, merchant: merchant || "（店名なし）", suggest };
    })
    .sort((a, b) => b.ids.length - a.ids.length || b.total - a.total);
}

export function inboxCount(data: AppData): number {
  const un = new Set(unsortedIds(data.categories).values());
  return data.transactions.filter((t) => un.has(t.categoryId)).length;
}

/** 選んだ記録のカテゴリだけを変える（種類が違うカテゴリ・非表示のカテゴリには移さない） */
export function recategorize(d: AppData, txIds: string[], toCategoryId: string, ts: string): { ok: true; next: AppData; changed: number } | { ok: false; error: string } {
  const to = d.categories.find((c) => c.id === toCategoryId);
  if (!to || to.archived) return { ok: false, error: "移す先のカテゴリを選び直してください" };
  const set = new Set(txIds);
  let changed = 0;
  for (const t of d.transactions) if (set.has(t.id) && t.type !== to.kind) return { ok: false, error: "支出と収入は、別の種類のカテゴリには移せません" };
  const next: AppData = {
    ...d,
    transactions: d.transactions.map((t: Transaction) => {
      if (!set.has(t.id) || t.categoryId === toCategoryId) return t;
      changed++;
      return { ...t, categoryId: toCategoryId, updatedAt: ts };
    }),
  };
  return { ok: true, next, changed };
}
