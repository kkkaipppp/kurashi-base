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
export type HomeCardId = "budget" | "todayAll" | "today" | "nextFixed" | "todo" | "navi" | "insight" | "recent";

export const HOME_CARDS: { id: HomeCardId; label: string; desc: string }[] = [
  { id: "budget", label: "今月の残り予算", desc: "予算・使った額（投資を除く）・1日あたり" },
  { id: "todayAll", label: "今日のまとめ", desc: "今日の予定・固定費・タスク・期限を時間の順に" },
  { id: "today", label: "今日の予定", desc: "今日の予定（なければ次の予定）" },
  { id: "nextFixed", label: "次の固定費", desc: "いちばん近い固定費の支払い" },
  { id: "todo", label: "今日やること", desc: "期限が今日までのタスク" },
  { id: "navi", label: "確認したいこと", desc: "期限・予算・バックアップの案内" },
  { id: "insight", label: "支出の変化", desc: "先月と比べて変わったこと" },
  { id: "recent", label: "最近の記録", desc: "新しい支出・収入3件" },
];
const KNOWN = new Set<string>(HOME_CARDS.map((c) => c.id));

export const PUBLIC_ORDER: HomeCardId[] = ["budget", "today", "nextFixed", "todo", "navi", "insight", "recent"];
export const PERSONAL_DEFAULT_ORDER: HomeCardId[] = ["budget", "todayAll", "nextFixed", "navi", "insight", "recent", "today", "todo"];
/** 「今日のまとめ」と中身が重なるので、はじめは隠しておく（編集で出せる） */
export const PERSONAL_DEFAULT_HIDDEN: HomeCardId[] = ["today", "todo"];

export interface LayoutDraft {
  order: HomeCardId[];
  hidden: HomeCardId[];
}

const known = (xs: readonly string[] | undefined): HomeCardId[] => [...new Set((xs ?? []).filter((x) => KNOWN.has(x)))] as HomeCardId[];

/** 保存してある並び（知らないカードを除き、足りないカードを最後に足す） */
export function currentLayout(prefs: HomePrefs): LayoutDraft {
  const order = known(prefs.order ?? PERSONAL_DEFAULT_ORDER);
  for (const id of PERSONAL_DEFAULT_ORDER) if (!order.includes(id)) order.push(id);
  const hidden: HomeCardId[] = known(prefs.hidden ?? PERSONAL_DEFAULT_HIDDEN).filter((id) => id !== "nextFixed" && id !== "navi");
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
  setHomeLayout: (order: string[], hidden: string[]) => SaveResult;
  setHomePref: (key: "nextRecurring" | "needsReview", v: boolean) => SaveResult;
};

/** 並びを保存する。「次の固定費」「確認したいこと」は今までの設定に書く（設定画面のオン・オフと食い違わない） */
export function saveLayout(store: LayoutStore, l: LayoutDraft): SaveResult {
  const r1 = store.setHomeLayout(l.order, l.hidden.filter((id) => id !== "nextFixed" && id !== "navi"));
  if (!r1.ok) return r1;
  const r2 = store.setHomePref("nextRecurring", !l.hidden.includes("nextFixed"));
  if (!r2.ok) return r2;
  return store.setHomePref("needsReview", !l.hidden.includes("navi"));
}
