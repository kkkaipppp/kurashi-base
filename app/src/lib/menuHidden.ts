/**
 * メニューから隠せる機能（NEXT v21 X16・X19・D11：不要な機能を非表示にできる。非表示でも記録は消えず、集計・検索・バックアップにも残る）。
 * 家計と予定の基本（取引履歴・固定費・設定・使い方・バックアップ）は、隠せない。
 */
export const HIDEABLE_MENU: { href: string; label: string }[] = [
  { href: "/tasks", label: "タスク" },
  { href: "/trips", label: "旅行" },
  { href: "/import", label: "レシートを見て入力" },
  { href: "/assets", label: "資産・NISA" },
  { href: "/contracts", label: "契約" },
  { href: "/goals", label: "目標" },
  { href: "/study", label: "資格の学習" },
  { href: "/notes", label: "生活記録・メモ" },
  { href: "/health", label: "健康記録" },
  { href: "/documents", label: "生活書類" },
];

/** 保存してある隠した一覧から、今も隠せる機能だけを残す（知らない道筋は無視） */
export function cleanMenuHidden(list: readonly string[] | undefined): string[] {
  const ok = new Set(HIDEABLE_MENU.map((m) => m.href));
  return [...new Set(list ?? [])].filter((h) => ok.has(h));
}
