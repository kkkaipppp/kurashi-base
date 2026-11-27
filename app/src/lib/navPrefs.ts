/**
 * 自分用の下のメニュー（o31 F001・F002、o30 D003・D004・D007）。
 * - 下は、利用者が選ぶ 1〜4 個の画面と、右端に固定の「追加」。初期はカレンダー・家計簿・やること・その他
 * - 0 個は許さない。保存が壊れている・知らない ID だけ・重複は、取り除くか初期に戻す（o31 01：旧設定0件・未知IDのみなら初期構成に復帰）
 * - 全機能の入口（メニュー）と検索は、画面の上に常にある（PageHeader の GlobalActions）。その他を外しても、全機能・設定・復元へ行ける（D005）
 * - 端末ごとの表示の設定で、記録ではない（バックアップには入らない）。読めない・書けないときも、初期の構成で動く
 * - 追加のお気に入り（最大4件）：右端の「追加」の一覧の先頭に出す種類
 */

export type NavId = "calendar" | "money" | "tasks" | "more" | "study" | "goals" | "trips" | "search" | "notes" | "home" | "recurring" | "assets";

export interface NavItem {
  id: NavId;
  label: string;
  href: string;
  /** この画面の中にいるとき、タブを選んだ状態にする道筋（先頭一致） */
  paths: string[];
}

/** 下のメニューに置ける画面の登録表（許可済みの道筋だけ。o30 D004） */
export const NAV_ITEMS: NavItem[] = [
  { id: "calendar", label: "カレンダー", href: "/calendar", paths: ["/calendar"] },
  { id: "money", label: "家計簿", href: "/report", paths: ["/report", "/history", "/decide", "/inbox"] },
  { id: "tasks", label: "やること", href: "/tasks", paths: ["/tasks"] },
  { id: "more", label: "メニュー", href: "/menu", paths: ["/menu", "/plans"] },
  { id: "study", label: "勉強", href: "/study", paths: ["/study"] },
  { id: "goals", label: "目標", href: "/goals", paths: ["/goals"] },
  { id: "trips", label: "旅行", href: "/trips", paths: ["/trips"] },
  { id: "search", label: "検索", href: "/search", paths: ["/search"] },
  { id: "notes", label: "メモ", href: "/notes", paths: ["/notes"] },
  { id: "home", label: "ホーム", href: "/", paths: [] },
  { id: "recurring", label: "固定費", href: "/recurring", paths: ["/recurring"] },
  { id: "assets", label: "資産", href: "/assets", paths: ["/assets", "/nisa"] },
];

export const NAV_MAX = 4;
export const NAV_MIN = 1;
// 初期の並びは o31 で平尾さんが決めたまま（To-Be の「ホーム・カレンダー・＋・家計簿・メニュー」とは食い違う → 判断待ち Q-T01。反証 中：やることを黙って外さない）
export const DEFAULT_NAV: NavId[] = ["calendar", "money", "tasks", "more"];
export const NAV_KEY = "kurashi-base:ui:nav";

const known = new Set<string>(NAV_ITEMS.map((n) => n.id));

/** 保存された値（JSON の文字列）を読む。知らない ID・重複を除き、最大4個。何も残らなければ初期の構成 */
export function parseNav(raw: string | null | undefined): NavId[] {
  let arr: unknown = null;
  try {
    arr = raw ? JSON.parse(raw) : null;
  } catch {
    arr = null;
  }
  const items = Array.isArray(arr) ? arr : arr && typeof arr === "object" && Array.isArray((arr as { items?: unknown }).items) ? (arr as { items: unknown[] }).items : [];
  const out: NavId[] = [];
  for (const x of items) {
    if (typeof x === "string" && known.has(x) && !out.includes(x as NavId)) out.push(x as NavId);
    if (out.length === NAV_MAX) break;
  }
  return out.length >= NAV_MIN ? out : [...DEFAULT_NAV];
}

/** 保存する前の検査。1〜4個・重複なし・登録済みの ID だけ。通らなければ理由を返す（保存しない） */
export function validateNav(ids: string[]): { ok: true; ids: NavId[] } | { ok: false; error: string } {
  if (ids.length < NAV_MIN) return { ok: false, error: "1つ以上選んでください" };
  if (ids.length > NAV_MAX) return { ok: false, error: `${NAV_MAX}つまで選べます` };
  if (new Set(ids).size !== ids.length) return { ok: false, error: "同じ画面が2回選ばれています" };
  if (ids.some((x) => !known.has(x))) return { ok: false, error: "選べない画面が入っています" };
  return { ok: true, ids: ids as NavId[] };
}

export function serializeNav(ids: NavId[]): string {
  return JSON.stringify({ v: 1, items: ids });
}

export function navItem(id: NavId): NavItem {
  return NAV_ITEMS.find((n) => n.id === id)!;
}

/** 今の画面に当たるタブ（並んでいるものの中から。どれにも当たらなければ null） */
export function activeNav(path: string, ids: NavId[]): NavId | null {
  const under = (p: string) => path === p || path.startsWith(p + "/");
  for (const id of ids) {
    const n = navItem(id);
    if (id === "home" ? path === "/" : n.paths.some(under)) return id;
  }
  return null;
}

/** 並べ替え：i 番目を d（-1 上へ／+1 下へ）に動かす。端なら変えない（ドラッグ以外の操作。o30 02） */
export function moveNav(ids: NavId[], i: number, d: -1 | 1): NavId[] {
  const j = i + d;
  if (i < 0 || i >= ids.length || j < 0 || j >= ids.length) return ids;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// --- 右端の「追加」の一覧 ---

export type AddKindId = "expense" | "income" | "event" | "task" | "goal" | "note" | "trip" | "study";

export interface AddKindDef {
  id: AddKindId;
  label: string;
  /** 一覧の小さい説明（意味が分かる最小限） */
  desc: string;
}

export const ADD_KINDS: AddKindDef[] = [
  { id: "expense", label: "支出", desc: "使ったお金" },
  { id: "income", label: "収入", desc: "入ったお金" },
  { id: "event", label: "予定", desc: "日時の決まった用事" },
  { id: "task", label: "やること", desc: "期限のある用事" },
  { id: "study", label: "資格", desc: "勉強する資格・試験" },
  { id: "goal", label: "目標", desc: "達成したいこと" },
  { id: "note", label: "メモ", desc: "日々の記録" },
  { id: "trip", label: "旅行", desc: "日程と行程" },
];

export const ADD_FAV_MAX = 4;
export const ADD_FAV_KEY = "kurashi-base:ui:add-favorites";
export const DEFAULT_ADD_FAV: AddKindId[] = ["expense", "event", "task", "income"];

const addKnown = new Set<string>(ADD_KINDS.map((k) => k.id));

export function parseAddFav(raw: string | null | undefined): AddKindId[] {
  let arr: unknown = null;
  try {
    arr = raw ? JSON.parse(raw) : null;
  } catch {
    arr = null;
  }
  const out: AddKindId[] = [];
  for (const x of Array.isArray(arr) ? arr : []) {
    if (typeof x === "string" && addKnown.has(x) && !out.includes(x as AddKindId)) out.push(x as AddKindId);
    if (out.length === ADD_FAV_MAX) break;
  }
  return out.length ? out : [...DEFAULT_ADD_FAV];
}

/** 今の画面に合う種類（一覧の先頭に出す。勝手に保存はしない。o31 F002） */
export function contextKind(path: string): AddKindId | null {
  const under = (p: string) => path === p || path.startsWith(p + "/");
  if (under("/calendar")) return "event";
  if (["/report", "/history", "/recurring", "/decide", "/inbox"].some(under)) return "expense";
  if (under("/tasks")) return "task";
  if (under("/goals")) return "goal";
  if (under("/notes")) return "note";
  if (under("/trips")) return "trip";
  if (under("/study")) return "study";
  return null;
}

/** 一覧の並び：文脈の種類 → お気に入り → 残り（重複なし）。お気に入りの区切りの位置も返す */
export function addOrder(path: string, fav: AddKindId[]): { top: AddKindId[]; rest: AddKindId[] } {
  const ctx = contextKind(path);
  const top: AddKindId[] = [];
  if (ctx) top.push(ctx);
  for (const f of fav) if (!top.includes(f)) top.push(f);
  const rest = ADD_KINDS.map((k) => k.id).filter((k) => !top.includes(k));
  return { top, rest };
}
