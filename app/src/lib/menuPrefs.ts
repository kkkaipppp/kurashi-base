/**
 * 自分用の「その他（すべての機能）」のお気に入りと最近（o31 F003・C003）。
 * - 端末ごとの表示の設定で、記録ではない。読めない・壊れているときは空として扱う
 * - お気に入りは利用者が星で選ぶ（自動で並べ替えない。o31 01「自動並べ替えは明示選択のみ」）
 * - 最近は、メニューに載っている画面を開いた順（新しい順に最大5件）。同じ画面は1回だけ
 * - 隠した機能（menuHidden）は、お気に入り・最近にも出さない（隠すのは表示だけで、記録は消えない）
 */
export const MENU_FAV_KEY = "kurashi-base:ui:menu-favorites";
export const MENU_RECENT_KEY = "kurashi-base:ui:menu-recent";
export const MENU_RECENT_MAX = 5;
export const MENU_FAV_MAX = 8;

function parseList(raw: string | null | undefined): string[] {
  try {
    const a: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(a) ? [...new Set(a.filter((x): x is string => typeof x === "string" && x.startsWith("/")))] : [];
  } catch {
    return [];
  }
}

/** 保存されたお気に入り。メニューに今ある道筋だけ（知らない道筋・消えた機能は除く） */
export function parseMenuFav(raw: string | null | undefined, known: readonly string[]): string[] {
  const ok = new Set(known);
  return parseList(raw).filter((h) => ok.has(h)).slice(0, MENU_FAV_MAX);
}

export function toggleMenuFav(list: string[], href: string): string[] {
  if (list.includes(href)) return list.filter((h) => h !== href);
  return list.length >= MENU_FAV_MAX ? list : [...list, href];
}

export function parseMenuRecent(raw: string | null | undefined, known: readonly string[]): string[] {
  const ok = new Set(known);
  return parseList(raw).filter((h) => ok.has(h)).slice(0, MENU_RECENT_MAX);
}

/** 開いた画面を最近の先頭に足す。メニューに無い画面（設定・その他自身など）は足さない */
export function pushRecent(list: string[], path: string, known: readonly string[]): string[] {
  const href = known.find((k) => path === k || path.startsWith(k + "/"));
  if (!href) return list;
  return [href, ...list.filter((h) => h !== href)].slice(0, MENU_RECENT_MAX);
}
