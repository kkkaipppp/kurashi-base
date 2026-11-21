export const MAX_AMOUNT = 999_999_999;

export type AmountResult = { ok: true; value: number } | { ok: false; error: string };

/** 入力文字列を正の整数（円）に変換。全角数字・カンマ・¥ を許容する。 */
export function parseAmount(input: string): AmountResult {
  const normalized = input
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，\s¥￥円]/g, "");
  if (normalized === "") return { ok: false, error: "金額を入力してください" };
  if (/^[-−ー]/.test(normalized)) return { ok: false, error: "金額は正の数で入力してください（収入・支出は種別で選びます）" };
  if (!/^\d+$/.test(normalized)) return { ok: false, error: "金額は数字（整数・円）で入力してください" };
  const value = Number(normalized);
  if (value <= 0) return { ok: false, error: "金額は1円以上で入力してください" };
  if (value > MAX_AMOUNT) return { ok: false, error: "金額が大きすぎます" };
  return { ok: true, value };
}

const fmt = new Intl.NumberFormat("ja-JP");

export function formatYen(n: number): string {
  return `¥${fmt.format(n)}`;
}

/** 符号付き表示（残りがマイナスの場合など） */
export function formatSignedYen(n: number): string {
  return n < 0 ? `-¥${fmt.format(-n)}` : `¥${fmt.format(n)}`;
}
