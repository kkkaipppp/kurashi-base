/**
 * 起動時の画面と、下のタブの区分（o29：A カレンダー中心。2026-11-27）。
 * - 下のタブは「カレンダー・家計簿・やること・その他」。D 案（家計簿中心）とはタブが同じで、違いは起動時の画面だけなので、
 *   起動時の画面を選べるようにして A と D の両方を満たす（docs/design/o29/UI_DECISION.md）
 * - 起動時の画面は端末ごとの表示の設定（記録ではない）。localStorage に置き、読めなくても既定（カレンダー）で動く
 * - ホーム（今日のまとめ）は互換の入口として残す（o29 C001）。「その他」と起動時の画面の選択から開ける
 */

export type StartScreen = "calendar" | "report" | "tasks" | "home";

export const START_KEY = "kurashi-base:ui:start-screen";
/** このタブで一度起動したかの印（sessionStorage）。起動のときだけ移り、そのあとはホームも開ける */
export const LAUNCHED_KEY = "kurashi-base:ui:launched";

export const START_SCREENS: { id: StartScreen; label: string; path: string }[] = [
  { id: "calendar", label: "カレンダー", path: "/calendar" },
  { id: "report", label: "家計簿", path: "/report" },
  { id: "tasks", label: "やること", path: "/tasks" },
  { id: "home", label: "ホーム（今日のまとめ）", path: "/" },
];

export const DEFAULT_START: StartScreen = "calendar";

export function parseStart(v: string | null | undefined): StartScreen {
  return START_SCREENS.some((s) => s.id === v) ? (v as StartScreen) : DEFAULT_START;
}

/**
 * 起動したときに移る先。移らないときは null。
 * - "/" をクエリなしで開いた、このタブで最初の1回だけ（ウィジェット・通知の ?add= などは、そのまま）
 * - 起動時の画面がホームなら移らない
 */
export function startRedirect(path: string, search: string, start: StartScreen, launched: boolean): string | null {
  if (launched || path !== "/" || search.replace(/^\?/, "") !== "") return null;
  if (start === "home") return null;
  return START_SCREENS.find((s) => s.id === start)!.path;
}

export type Tab = "calendar" | "money" | "tasks" | "more";

/** 家計簿のタブに入る画面（お金の一覧・集計・固定費・買う前の確認・整理・取り込み） */
const MONEY = ["/report", "/history", "/recurring", "/decide", "/inbox", "/assets", "/nisa"];

/** 今の画面が、どのタブの中か。どれにも入らない画面は「その他」 */
export function tabOf(path: string): Tab {
  const under = (p: string) => path === p || path.startsWith(p + "/");
  if (under("/calendar")) return "calendar";
  if (MONEY.some(under)) return "money";
  if (under("/tasks")) return "tasks";
  return "more";
}

export type PlusAction = { kind: "event" } | { kind: "expense" } | { kind: "task" } | { kind: "choose" };

/** 画面ごとの＋の既定（o29 C005：画面別の直接入力。ほかの種類は入力の中の切り替えか「この日に追加」から） */
export function plusFor(path: string): PlusAction {
  const t = tabOf(path);
  if (t === "calendar") return { kind: "event" };
  if (t === "money") return { kind: "expense" };
  if (t === "tasks") return { kind: "task" };
  return { kind: "choose" };
}

export const PLUS_LABEL: Record<PlusAction["kind"], string> = {
  event: "予定を追加",
  expense: "支出を追加",
  task: "やることを追加",
  choose: "追加",
};
