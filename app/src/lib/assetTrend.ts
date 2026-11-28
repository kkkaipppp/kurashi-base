import { daysInMonth } from "./date";
import type { Asset } from "./types";

/**
 * 資産の負債・純資産・推移（To-Be 段階3。決定 2026-11-28 S3-1 ①）。
 * 負債（debt=true）の評価額は正の数で持ち、純資産では引く。評価額が空欄の記録は数えない（0 にしない）。
 * 推移：評価額か評価日を直したとき、前の値を history に残す（同じ評価日は新しい値で置き換え、評価日の古い順に最大 24 件）。
 */
export const HISTORY_MAX = 24;
export type AssetPoint = { asOf: string; value: number };

export function netWorth(list: Pick<Asset, "debt" | "value">[]): { assets: number; debts: number; net: number; unknown: number } {
  let assets = 0;
  let debts = 0;
  let unknown = 0;
  for (const a of list) {
    if (a.value === null) {
      unknown++;
      continue;
    }
    if (a.debt) debts += a.value;
    else assets += a.value;
  }
  return { assets, debts, net: assets - debts, unknown };
}

/** 保存の前に、前の評価額を推移に残す（評価額も評価日も変わらないなら、そのまま） */
export function withHistory(prev: Pick<Asset, "value" | "asOf" | "history"> | undefined, next: Pick<Asset, "value" | "asOf">): AssetPoint[] | undefined {
  const old = prev?.history ?? [];
  if (!prev || prev.value === null || !prev.asOf) return prev?.history;
  if (prev.value === next.value && prev.asOf === next.asOf) return prev.history;
  const merged = [...old.filter((p) => p.asOf !== prev.asOf), { asOf: prev.asOf, value: prev.value }]
    // 今の評価日と同じ日の古い値は、今の値で置き換わるので残さない（評価額を空欄にしたときは、前の値を残す。点検 低）
    .filter((p) => next.value === null || p.asOf !== next.asOf)
    .sort((a, b) => a.asOf.localeCompare(b.asOf));
  return merged.slice(-HISTORY_MAX);
}

/** その日の時点の評価額（評価日がその日以前の、いちばん新しい値。無ければ null） */
export function valueAt(a: Pick<Asset, "value" | "asOf" | "history">, date: string): number | null {
  const pts: AssetPoint[] = [...(a.history ?? [])];
  if (a.value !== null && a.asOf) pts.push({ asOf: a.asOf, value: a.value });
  let best: AssetPoint | null = null;
  for (const p of pts) if (p.asOf <= date && (!best || p.asOf >= best.asOf)) best = p;
  return best ? best.value : null;
}

/** 月末ごとの純資産（その月末に値の分かる記録だけで計算。counted＝数えた記録の数） */
export function monthlyNet(list: Pick<Asset, "debt" | "value" | "asOf" | "history">[], months: string[]): { month: string; net: number; counted: number }[] {
  return months.map((m) => {
    const [y, mo] = m.split("-").map(Number);
    const end = `${m}-${String(daysInMonth(y, mo)).padStart(2, "0")}`;
    let net = 0;
    let counted = 0;
    for (const a of list) {
      const v = valueAt(a, end);
      if (v === null) continue;
      counted++;
      net += a.debt ? -v : v; // 今の印で過去も数える（負債に直すと過去の符号も変わる）
    }
    return { month: m, net, counted };
  });
}
