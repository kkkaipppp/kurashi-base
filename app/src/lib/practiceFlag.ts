/**
 * 練習中かどうか（決定 Q34 ①。lib/practice.ts）。印はこのタブのあいだだけ（sessionStorage）。
 * 公開版のファイル（入力の書きかけ・お知らせ）からも読むので、見本の記録を持たない小さいファイルにする。公開版ではいつも false
 */
export const PRACTICE_KEY = "kurashi-base:practice:v1";

export function isPractice(): boolean {
  if (process.env.NEXT_PUBLIC_KB_EDITION !== "personal") return false;
  try {
    return typeof sessionStorage !== "undefined" && sessionStorage.getItem(PRACTICE_KEY) === "1";
  } catch {
    return false;
  }
}
