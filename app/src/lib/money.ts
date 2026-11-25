export const MAX_AMOUNT = 999_999_999;

export type AmountResult = { ok: true; value: number } | { ok: false; error: string };

/** 入力文字列を正の整数（円）に変換。全角数字・カンマ・¥ を許容する。 */
export function parseAmount(input: string): AmountResult {
  const normalized = input
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，\s¥￥円]/g, "");
  if (normalized === "") return { ok: false, error: "金額を入力してください" };
  if (/^[-−ー]/.test(normalized)) return { ok: false, error: "金額はマイナスを付けずに入力してください（支出か収入かは上で選びます）" };
  if (!/^\d+$/.test(normalized)) return { ok: false, error: "金額は円単位の数字で入力してください（小数は使えません）" };
  const value = Number(normalized);
  if (value <= 0) return { ok: false, error: "金額は1円以上で入力してください" };
  if (value > MAX_AMOUNT) return { ok: false, error: "金額が大きすぎます" };
  return { ok: true, value };
}

const fmt = new Intl.NumberFormat("ja-JP");

export function formatYen(n: number): string {
  return `¥${fmt.format(n)}`;
}

/**
 * 符号付き表示（残りがマイナスの場合など）。マイナスは「−」（U+2212）、プラスの印は付けない。
 * 符号の書き方は画面全体で「−」と半角の「+」にそろえる（2026-11-26 承認5の1）
 */
export function formatSignedYen(n: number): string {
  return n < 0 ? `−¥${fmt.format(-n)}` : `¥${fmt.format(n)}`;
}

/** 差の表示：増えたら「+¥」、減ったら「−¥」、同じなら「¥0」 */
export function formatDiffYen(n: number): string {
  return n > 0 ? `+¥${fmt.format(n)}` : formatSignedYen(n);
}
