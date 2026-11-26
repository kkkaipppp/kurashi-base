/**
 * 起動時の画面（o29 で作り、o31 D006 で続ける。2026-11-27）。
 * - 初期はカレンダー。家計簿・やること・勉強・ホームも選べる
 * - 起動時の画面は端末ごとの表示の設定（記録ではない）。localStorage に置き、読めなくても既定（カレンダー）で動く
 * - ホーム（今日のまとめ）は互換の入口として残す（o29 C001）。「その他」と起動時の画面の選択から開ける
 */

export type StartScreen = "calendar" | "report" | "tasks" | "study" | "home";

export const START_KEY = "kurashi-base:ui:start-screen";
/** このタブで一度起動したかの印（sessionStorage）。起動のときだけ移り、そのあとはホームも開ける */
export const LAUNCHED_KEY = "kurashi-base:ui:launched";

export const START_SCREENS: { id: StartScreen; label: string; path: string }[] = [
  { id: "calendar", label: "カレンダー", path: "/calendar" },
  { id: "report", label: "家計簿", path: "/report" },
  { id: "tasks", label: "やること", path: "/tasks" },
  { id: "study", label: "勉強", path: "/study" },
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

// 下のタブの区分と画面ごとの＋（o29）は、o31 C001（右端の「追加」・下のメニューの自由化）で lib/navPrefs.ts に置き換えた（2026-11-27）
