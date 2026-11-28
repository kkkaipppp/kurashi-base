import { FEATURES } from "./edition";
import { inboxCount } from "./inbox";
import { todayStr } from "./date";
import type { AppData } from "./types";

/**
 * To-Be のメニュー（2026-11-27 最終To-Be 02「メニュー: 計画、目標、資産、契約・固定費、健康、メモ、書類。3列アイコン、短い名称、編集、検索、設定、使い方」）。
 * - 分類は目的別の入口で、データの置き場所ではない。中の画面（旅行・勉強・NISA など）は今までの画面と記録をそのまま使う（03「独立ページの削除は機能廃止ではない」）
 * - 家計簿の画面（取引履歴・未分類の記録・固定費）とやることは、下のナビの「家計簿」「カレンダー」から行く。メニューには重ねない（02「重複した導線は不要」）。検索からも行ける
 * - 隠すのは表示だけで、記録は消えない（prefs.menuHidden。A05）
 */
export type HubItem = { href: string; label: string; count?: (d: AppData) => number };
export type HubCategory = { key: string; label: string; icon: HubIcon; items: HubItem[] };
export type HubIcon = "plan" | "goal" | "asset" | "contract" | "health" | "memo" | "document";

export function hubCategories(): HubCategory[] {
  const plan: HubItem[] = [
    { href: "/plans", label: "計画", count: (d) => (d.plans ?? []).filter((p) => p.status === "considering" || p.status === "preparing").length },
    { href: "/trips", label: "旅行", count: (d) => (d.trips ?? []).filter((t) => t.endDate >= todayStr()).length },
    ...(FEATURES.lifeChange ? [{ href: "/life", label: "引っ越し・転職のお金" }] : []),
    ...(FEATURES.decide ? [{ href: "/decide", label: "買う前に確認" }] : []),
    { href: "/wishes", label: "欲しいもの", count: (d) => (d.wishes ?? []).filter((w) => w.status === "want").length },
  ];
  return [
    { key: "plan", label: "計画", icon: "plan", items: plan },
    {
      key: "goal",
      label: "目標",
      icon: "goal",
      items: [
        { href: "/goals", label: "目標", count: (d) => d.goals.filter((g) => !g.done).length },
        { href: "/study", label: "資格・勉強", count: (d) => d.studySubjects.filter((s) => !s.archived).length },
      ],
    },
    { key: "asset", label: "資産", icon: "asset", items: [{ href: "/assets", label: "資産・NISA", count: (d) => d.assets.length + d.nisa.length }, { href: "/accounts", label: "口座・カード", count: (d) => (d.accounts ?? []).filter((a) => !a.archived).length }] },
    {
      key: "contract",
      label: "契約・固定費",
      icon: "contract",
      items: [
        { href: "/contracts", label: "契約", count: (d) => d.contracts.filter((c) => c.status === "active").length },
        { href: "/recurring", label: "固定費", count: (d) => d.recurring.filter((r) => r.active).length },
      ],
    },
    { key: "health", label: "健康", icon: "health", items: [{ href: "/health", label: "健康", count: (d) => d.health.length }] },
    { key: "memo", label: "メモ", icon: "memo", items: [{ href: "/notes", label: "メモ", count: (d) => d.notes.length }] },
    { key: "document", label: "書類", icon: "document", items: [{ href: "/documents", label: "書類", count: (d) => d.documents.length }] },
  ];
}

/**
 * 分類に入れていない画面（To-Be では家計簿・＋・カレンダー・設定の中に移す予定。移すまではメニューの下に出して、行けなくならないようにする。
 * To-Be 反証 中：前のメニューにあった入口を落とさない。03「独立ページの削除は機能廃止ではない」）
 */
export function otherLinks(): HubItem[] {
  return [
    { href: "/tasks", label: "やること", count: (d) => d.tasks.filter((t) => !t.done).length },
    { href: "/history", label: "お金の記録", count: (d) => d.transactions.length },
    ...(FEATURES.inbox ? [{ href: "/inbox", label: "分類していない記録", count: (d: AppData) => inboxCount(d) }] : []),
    { href: "/import", label: "レシートを見て入力" },
    { href: "/widget", label: "ウィジェット" },
    { href: "/settings#backup", label: "バックアップと復元" },
  ];
}

export const MENU_ORDER_KEY = "kurashi-base:ui:menu-order";

/** 本人が決めた並び（端末ごとの表示の設定）。知らない分類は捨て、足りない分類は後ろに元の順で足す */
export function orderCategories<T extends { key: string }>(cats: T[], raw: string | null | undefined): T[] {
  let saved: string[] = [];
  try {
    const a: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(a)) saved = a.filter((x): x is string => typeof x === "string");
  } catch {
    saved = [];
  }
  const byKey = new Map(cats.map((c) => [c.key, c]));
  const first = [...new Set(saved)].map((k) => byKey.get(k)).filter((c): c is T => !!c);
  return [...first, ...cats.filter((c) => !first.includes(c))];
}

/** 1つ前・後ろへ動かす（端なら動かさない） */
export function moveCategory(keys: string[], key: string, dir: -1 | 1): string[] {
  const i = keys.indexOf(key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= keys.length) return keys;
  const a = [...keys];
  [a[i], a[j]] = [a[j], a[i]];
  return a;
}

/** 隠した画面を除いた中身。中身が0になった分類は出さない（記録は消えていない） */
export function visibleItems(cat: HubCategory, hidden: ReadonlySet<string>): HubItem[] {
  return cat.items.filter((i) => !hidden.has(i.href));
}
