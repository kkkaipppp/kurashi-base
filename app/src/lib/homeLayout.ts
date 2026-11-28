import type { HomePrefs } from "./types";
import { IS_PERSONAL } from "./edition";
import type { SaveResult } from "./storage";

/**
 * ホームのカードの並びと、隠したカード（100点化の指示 E）。
 * - 公開版は今までの並びのまま（prefs.home.order / hidden は見ない）
 * - 自分用は、prefs.home.order の順に出し、hidden のものは出さない。知らないカードは無視し、足りないカードは最後に足す
 * - 「次の固定費」「確認したいこと」の表示は、今までの設定（nextRecurring / needsReview）と同じものとして扱う
 * - 「＋」とデータを守る大事な案内は、カードではないのでいつも出る
 */
export type HomeCardId = "budget" | "todayAll" | "today" | "nextFixed" | "todo" | "navi" | "week" | "insight" | "recent";

export const HOME_CARDS: { id: HomeCardId; label: string; desc: string }[] = [
  { id: "budget", label: "今月の残り予算", desc: "予算・使った額（投資を除く）・1日あたり" },
  { id: "todayAll", label: "今日のまとめ", desc: "予定・固定費・やること・期限を時間順に" },
  { id: "today", label: "今日の予定", desc: "今日の予定（なければ次の予定）" },
  { id: "nextFixed", label: "次の支払い", desc: "いちばん近い固定費の支払い" },
  { id: "todo", label: "今日やること", desc: "期限が今日までのやること（無い日は出ない）" },
  { id: "navi", label: "確認すること", desc: "期限・予算・バックアップの案内" },
  // 自分用だけ（版の値を直接比べる。公開版の組み立てに文字を入れない）
  ...(process.env.NEXT_PUBLIC_KB_EDITION === "personal" ? [{ id: "week" as const, label: "この先7日", desc: "明日から7日の予定・支払い・期限の数" }] : []),
  { id: "insight", label: "支出の変化", desc: "先月と比べて変わったこと" },
  { id: "recent", label: "最近の記録", desc: "新しい支出・収入3件" },
];
const KNOWN = new Set<string>([...HOME_CARDS.map((c) => c.id), "week"]);

export const PUBLIC_ORDER: HomeCardId[] = ["budget", "today", "nextFixed", "todo", "navi", "insight", "recent"];
// 自分用の初めの並びは To-Be 05「今日の予定／やること／今月の残り予算／次の支払い／確認すること」（2026-11-28。保存した並びは変えない）
export const PERSONAL_DEFAULT_ORDER: HomeCardId[] = ["today", "todo", "budget", "nextFixed", "navi", "week", "todayAll", "insight", "recent"];
/** 「今日のまとめ」は今日の予定・やることと中身が重なる。支出の変化・最近の記録は家計簿にある（To-Be 02「重複数値なし」）。はじめは隠す（編集で出せる） */
export const PERSONAL_DEFAULT_HIDDEN: HomeCardId[] = ["todayAll", "week", "insight", "recent"];
/** あとから足したカード。保存した並びに無ければ、隠して足す（勝手にホームを増やさない。編集で出せる。2026-11-28） */
const ADDED_LATER = new Set<HomeCardId>(["week"]);

export interface LayoutDraft {
  order: HomeCardId[];
  hidden: HomeCardId[];
}

const known = (xs: readonly string[] | undefined): HomeCardId[] => [...new Set((xs ?? []).filter((x) => KNOWN.has(x)))] as HomeCardId[];

/** 保存してある並び（知らないカードを除き、足りないカードを最後に足す） */
export function currentLayout(prefs: HomePrefs): LayoutDraft {
  const order = known(prefs.order ?? PERSONAL_DEFAULT_ORDER);
  const added: HomeCardId[] = [];
  for (const id of PERSONAL_DEFAULT_ORDER)
    if (!order.includes(id)) {
      order.push(id);
      if (prefs.order && ADDED_LATER.has(id)) added.push(id);
    }
  const hidden: HomeCardId[] = [...new Set([...known(prefs.hidden ?? PERSONAL_DEFAULT_HIDDEN), ...added])].filter((id) => id !== "nextFixed" && id !== "navi");
  if (!prefs.nextRecurring) hidden.push("nextFixed");
  if (!prefs.needsReview) hidden.push("navi");
  return { order, hidden };
}

export function defaultLayout(): LayoutDraft {
  return { order: [...PERSONAL_DEFAULT_ORDER], hidden: [...PERSONAL_DEFAULT_HIDDEN] };
}

/** ホームに出すカードの順番。編集中は、その並び（プレビュー） */
export function layoutFor(prefs: HomePrefs, draft: LayoutDraft | null, personal: boolean = IS_PERSONAL): HomeCardId[] {
  if (!personal) return PUBLIC_ORDER;
  const l = draft ?? currentLayout(prefs);
  return l.order.filter((id) => !l.hidden.includes(id));
}

export function moveCard(l: LayoutDraft, id: HomeCardId, dir: -1 | 1): LayoutDraft {
  const i = l.order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= l.order.length) return l;
  const order = [...l.order];
  [order[i], order[j]] = [order[j], order[i]];
  return { ...l, order };
}

export function toggleCard(l: LayoutDraft, id: HomeCardId): LayoutDraft {
  return { ...l, hidden: l.hidden.includes(id) ? l.hidden.filter((x) => x !== id) : [...l.hidden, id] };
}

type LayoutStore = {
  setHomeLayout: (order: string[], hidden: string[], flags: { nextRecurring: boolean; needsReview: boolean }) => Promise<SaveResult>;
};

/** 並びを保存する。「次の固定費」「確認したいこと」は今までの設定に書く（設定画面のオン・オフと食い違わない） */
export function saveLayout(store: LayoutStore, l: LayoutDraft): Promise<SaveResult> {
  // 1回の保存で書く（途中で失敗して一部だけ変わることがないように）
  return store.setHomeLayout(
    l.order,
    l.hidden.filter((id) => id !== "nextFixed" && id !== "navi"),
    { nextRecurring: !l.hidden.includes("nextFixed"), needsReview: !l.hidden.includes("navi") },
  );
}
