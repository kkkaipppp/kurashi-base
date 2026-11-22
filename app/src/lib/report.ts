import { summarizeMonth, txInMonth } from "./aggregate";
import { addMonthsToKey, daysInMonth, monthKey } from "./date";
import { formatYen } from "./money";
import type { AppData, Transaction } from "./types";

// 振り返り（レポート）の計算。記録されたデータから算出するだけで、理由や原因は推測しない。

/** その月の d 日までの支出（d が月の日数を超えたら月末まで） */
export function expenseUntilDay(txs: Transaction[], key: string, day: number): number {
  const [y, m] = key.split("-").map(Number);
  const last = Math.min(day, daysInMonth(y, m));
  const until = `${key}-${String(last).padStart(2, "0")}`;
  return txInMonth(txs, key)
    .filter((t) => t.type === "expense" && t.date <= until)
    .reduce((s, t) => s + t.amount, 0);
}

export interface WeekBucket {
  label: string; // 例：1〜7日
  from: string;
  to: string;
  expense: number;
}

/** 月を 1〜7日・8〜14日・15〜21日・22〜28日・29日〜月末 に分けた支出 */
export function weeklyBuckets(txs: Transaction[], key: string): WeekBucket[] {
  const [y, m] = key.split("-").map(Number);
  const dim = daysInMonth(y, m);
  const out: WeekBucket[] = [];
  for (let start = 1; start <= dim; start += 7) {
    const end = Math.min(start + 6, dim);
    const from = `${key}-${String(start).padStart(2, "0")}`;
    const to = `${key}-${String(end).padStart(2, "0")}`;
    const expense = txs.filter((t) => t.type === "expense" && t.date >= from && t.date <= to).reduce((s, t) => s + t.amount, 0);
    out.push({ label: start === end ? `${start}日` : `${start}〜${end}日`, from, to, expense });
  }
  return out;
}

export interface Insight {
  key: string;
  text: string;
  href?: string;
}

/**
 * 「くらしの気づき」。データがあるときだけ、数字で言えることだけを出す。
 * today を渡すと、その月は「先月の同じ日まで」と比べる（月の途中で全月と比べない）。
 */
export function buildInsights(data: AppData, key: string, today: string): Insight[] {
  const out: Insight[] = [];
  const isCurrent = monthKey(today) === key;
  const day = isCurrent ? Number(today.slice(8, 10)) : 31;
  const prevKey = addMonthsToKey(key, -1);
  const [prevYear, prevMonth] = prevKey.split("-").map(Number);
  const previousHasSameDay = day <= daysInMonth(prevYear, prevMonth);
  const cur = expenseUntilDay(data.transactions, key, day);
  const prev = expenseUntilDay(data.transactions, prevKey, day);
  const span = isCurrent ? (previousHasSameDay ? "先月の同じ日まで" : "先月の月末まで") : "前月";
  const period = isCurrent ? "今月" : `${Number(key.slice(5))}月`;
  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? "（不明なカテゴリ）";

  if (cur > 0 && prev > 0) {
    const diff = cur - prev;
    const pct = Math.round((diff / prev) * 100);
    out.push({
      key: "total",
      text:
        diff === 0
          ? `${period}の支出は${span}と同じです`
          : `${period}の支出は${span}より${formatYen(Math.abs(diff))}${diff > 0 ? "多い" : "少ない"}です（${diff > 0 ? "+" : "−"}${Math.abs(pct)}%）`,
      href: `/history?m=${key}`,
    });

    // いちばん増えたカテゴリ（増加が1,000円以上のときだけ）
    const until = (k: string) => {
      const [y, m] = k.split("-").map(Number);
      return `${k}-${String(Math.min(day, daysInMonth(y, m))).padStart(2, "0")}`;
    };
    const byCat = (k: string) => {
      const m = new Map<string, number>();
      for (const t of txInMonth(data.transactions, k)) if (t.type === "expense" && t.date <= until(k)) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + t.amount);
      return m;
    };
    const a = byCat(key);
    const b = byCat(prevKey);
    let best: { id: string; diff: number; prev: number } | null = null;
    for (const [id, v] of a) {
      const p = b.get(id) ?? 0;
      if (p > 0 && v - p >= 1000 && (!best || v - p > best.diff)) best = { id, diff: v - p, prev: p };
    }
    if (best)
      out.push({
        key: "cat",
        text: `${catName(best.id)}が${span}より${formatYen(best.diff)}多いです（+${Math.round((best.diff / best.prev) * 100)}%）`,
        href: `/history?m=${key}&cat=${best.id}`,
      });
  }

  // 今のペースのまま月末まで使った場合の単純計算（7日目以降、予算があるときだけ）
  if (isCurrent && data.budget.monthly !== null && day >= 7 && cur > 0) {
    const [y, m] = key.split("-").map(Number);
    // 細かい金額は見込みとして不自然なので、100円単位に丸める
    const projected = Math.round(((cur / day) * daysInMonth(y, m)) / 100) * 100;
    out.push({
      key: "pace",
      text: `このペースだと、月末の支出は約${formatYen(projected)}になりそうです（予算は ${formatYen(data.budget.monthly)}）`,
    });
  }
  return out;
}

/** 月の支出・収入・前月との差（全月どうし） */
export function monthReport(data: AppData, key: string) {
  const s = summarizeMonth(data.transactions, key);
  const p = summarizeMonth(data.transactions, addMonthsToKey(key, -1));
  return { ...s, prevExpense: p.expense, hasPrev: p.count > 0 };
}
