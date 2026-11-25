/** 入力欄の下書き（項目名 → 文字か、チェックの入り切り）。lib から components を読まないよう、ここで決める（o11 A01 の棚卸しの指摘） */
export type Draft = Record<string, string | boolean>;

/** 入力の下書きから文字列を取り出す（前後の空白は除く） */
export const str = (d: Draft, k: string): string => (typeof d[k] === "string" ? (d[k] as string).trim() : "");
export const bool = (d: Draft, k: string): boolean => d[k] === true;
export const numStr = (n: number | null): string => (n === null ? "" : String(n));
