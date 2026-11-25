import { daysBetween } from "./date";
import { forecastMonthEnd } from "./forecast";
import { goalPace } from "./goalPlan";
import { inboxCount } from "./inbox";
import { formatYen } from "./money";
import type { AppData } from "./types";

/**
 * 提案の集約（NEXT v21 X14：ホーム全体で原則3件・同じ対象は1つに・期限と影響で並べる）。
 * 読むだけ：何も書き換えない。押すと、直す画面へ行くだけ（承認前の再検証は、行った先の画面が今のデータで行う）。
 * 緊急の保存障害などは「提案」ではなく、状態の表示（別の仕組み）で出す。
 */
export const MAX_SUGGESTIONS = 3;
/** 固定費の支払いを出す日数（今日から数えて） */
export const RECURRING_AHEAD_DAYS = 3;
/** 目標の期限を出す日数 */
export const GOAL_AHEAD_DAYS = 30;

export interface Suggestion {
  /** 対象の印。同じ対象は1つにまとめる */
  key: string;
  title: string;
  why: string;
  href: string;
  /** 大きいほど先に出す */
  score: number;
}

export interface SuggestionOptions {
  /** 未整理の記録の提案を出す（自分用） */
  inbox?: boolean;
  /** すでにホームの別の場所に出ている固定費の ID（二重に出さない。例：「確認したいこと」の期限切れ・今日の分） */
  skipRecurringIds?: Set<string>;
}

export function suggestions(d: AppData, today: string, opt: SuggestionOptions): Suggestion[] {
  const all: Suggestion[] = [];

  for (const r of d.recurring) {
    if (!r.active || opt.skipRecurringIds?.has(r.id)) continue;
    const days = daysBetween(today, r.nextDueDate);
    if (days > RECURRING_AHEAD_DAYS) continue;
    const left = r.partialPaid && r.partialPaid.due === r.nextDueDate ? Math.max(0, r.amount - r.partialPaid.paid) : r.amount;
    const when = days < 0 ? `${-days}日過ぎています` : days === 0 ? "今日" : `${days}日後`;
    // 期限が過ぎたものを最上位に。そのあと近い順（影響＝金額の大きさで、同点を分ける）
    all.push({ key: `rec:${r.id}`, title: `${r.name}の支払い（${when}）`, why: `未払いは ${formatYen(left)}`, href: `/recurring?open=${r.id}`, score: 1000 - days * 100 + Math.min(left / 10000, 9) });
  }

  for (const g of d.goals) {
    const p = goalPace(g, today);
    if (!p.ok || p.days > GOAL_AHEAD_DAYS) continue;
    all.push({ key: `goal:${g.id}`, title: `目標「${g.title}」の期限まで${p.days}日`, why: `残り ${p.remaining.toLocaleString("ja-JP")}${g.unit}`, href: `/goals?open=${g.id}`, score: 600 - p.days * 10 });
  }

  // 目標の節目（やることの日付）：3日以内・過ぎたもの（終わっていないものだけ）
  for (const g of d.goals) {
    if (g.done) continue;
    for (const st of g.steps ?? []) {
      if (st.done || !st.due) continue;
      const days = daysBetween(today, st.due);
      if (days > RECURRING_AHEAD_DAYS) continue;
      const when = days < 0 ? `${-days}日過ぎています` : days === 0 ? "今日" : `${days}日後`;
      all.push({ key: `step:${g.id}:${st.id}`, title: `${g.title}：${st.text}（${when}）`, why: "目標の節目です", href: `/goals?open=${g.id}`, score: 900 - days * 100 });
    }
  }

  const f = forecastMonthEnd(d, today);
  if (f.ok && f.vsBudget !== null && f.vsBudget < 0) {
    all.push({ key: "forecast", title: "今月は予算を超える見込みです", why: `約 ${formatYen(-f.vsBudget)} 超える見込み（確定ではありません）`, href: "/#forecast", score: 500 });
  }

  if (opt.inbox) {
    const n = inboxCount(d);
    if (n > 0) all.push({ key: "inbox", title: `未整理の記録が${n}件あります`, why: "店名ごとにまとめて整理できます", href: "/inbox", score: 200 });
  }

  // 同じ対象は、いちばん点の高いものだけ
  const best = new Map<string, Suggestion>();
  for (const s of all) {
    const cur = best.get(s.key);
    if (!cur || s.score > cur.score) best.set(s.key, s);
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)).slice(0, MAX_SUGGESTIONS);
}
