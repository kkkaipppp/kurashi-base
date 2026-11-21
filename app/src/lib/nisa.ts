import type { NisaEntry, NisaFrame } from "./types";

// NISA（2024年からの制度）の枠の計算。投資の助言ではなく、記録した買付・売却から枠の使用状況を数えるだけ。
// 制度が変わったときは、この値を更新する。
export const NISA_LIMITS = {
  annual: { tsumitate: 1_200_000, growth: 2_400_000 } as Record<NisaFrame, number>,
  lifetime: 18_000_000, // 生涯の非課税保有限度額（簿価）
  lifetimeGrowth: 12_000_000, // うち成長投資枠
};

export const FRAME_LABEL: Record<NisaFrame, string> = { tsumitate: "つみたて投資枠", growth: "成長投資枠" };

export interface NisaSummary {
  year: number;
  annualUsed: Record<NisaFrame, number>; // その年の買付額
  annualLeft: Record<NisaFrame, number>; // 年間枠の残り（生涯枠の残りも考慮）
  lifetimeUsed: number; // 生涯枠の使用額（簿価。前年までの売却分は戻る）
  lifetimeGrowthUsed: number;
  lifetimeLeft: number;
  lifetimeGrowthLeft: number;
  restoreNextYear: number; // 今年売却した簿価（翌年に生涯枠へ戻る）
  holdingBook: Record<NisaFrame, number>; // 保有中の簿価（買付 − 売却）
}

const yearOf = (date: string) => Number(date.slice(0, 4));

export function summarizeNisa(entries: NisaEntry[], year: number): NisaSummary {
  const sum = (f: (e: NisaEntry) => boolean) => entries.filter(f).reduce((s, e) => s + e.amount, 0);
  const upToYear = (e: NisaEntry) => yearOf(e.date) <= year;
  const annualUsed = {
    tsumitate: sum((e) => e.kind === "buy" && e.frame === "tsumitate" && yearOf(e.date) === year),
    growth: sum((e) => e.kind === "buy" && e.frame === "growth" && yearOf(e.date) === year),
  };
  // 生涯枠：買付の合計から、前年までに売却した簿価を引く（今年の売却分は翌年に戻る）
  const buys = sum((e) => e.kind === "buy" && upToYear(e));
  const sellsBefore = sum((e) => e.kind === "sell" && yearOf(e.date) < year);
  const growthBuys = sum((e) => e.kind === "buy" && e.frame === "growth" && upToYear(e));
  const growthSellsBefore = sum((e) => e.kind === "sell" && e.frame === "growth" && yearOf(e.date) < year);
  const lifetimeUsed = Math.max(0, buys - sellsBefore);
  const lifetimeGrowthUsed = Math.max(0, growthBuys - growthSellsBefore);
  const lifetimeLeft = Math.max(0, NISA_LIMITS.lifetime - lifetimeUsed);
  const lifetimeGrowthLeft = Math.max(0, Math.min(NISA_LIMITS.lifetimeGrowth - lifetimeGrowthUsed, lifetimeLeft));
  const holding = (f: NisaFrame) =>
    sum((e) => e.kind === "buy" && e.frame === f && upToYear(e)) - sum((e) => e.kind === "sell" && e.frame === f && upToYear(e));
  return {
    year,
    annualUsed,
    annualLeft: {
      tsumitate: Math.max(0, Math.min(NISA_LIMITS.annual.tsumitate - annualUsed.tsumitate, lifetimeLeft)),
      growth: Math.max(0, Math.min(NISA_LIMITS.annual.growth - annualUsed.growth, lifetimeGrowthLeft)),
    },
    lifetimeUsed,
    lifetimeGrowthUsed,
    lifetimeLeft,
    lifetimeGrowthLeft,
    restoreNextYear: sum((e) => e.kind === "sell" && yearOf(e.date) === year),
    holdingBook: { tsumitate: holding("tsumitate"), growth: holding("growth") },
  };
}

/** 記録しようとしている買付・売却が枠を超えていないかの警告（保存は止めない。記録の誤りに気づくため） */
export function nisaWarnings(entries: NisaEntry[], draft: Pick<NisaEntry, "date" | "kind" | "frame" | "amount">, excludeId?: string): string[] {
  const others = entries.filter((e) => e.id !== excludeId);
  const s = summarizeNisa(others, yearOf(draft.date));
  const w: string[] = [];
  if (draft.kind === "buy") {
    if (draft.amount > s.annualLeft[draft.frame]) w.push(`${FRAME_LABEL[draft.frame]}の${s.year}年の残り枠を超えています`);
  } else if (draft.amount > s.holdingBook[draft.frame]) {
    w.push(`${FRAME_LABEL[draft.frame]}で保有している簿価より多い金額です`);
  }
  return w;
}
