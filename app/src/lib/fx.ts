import type { ForeignAmount } from "./types";

/**
 * 外貨（To-Be 02 家計簿「外貨」・04「外貨は最小単位＋通貨＋換算根拠」。2026-11-28。自分用）。
 * 記録の金額（amount）は、いつも円（換算したあと。収支・予算はこの円で数える）。外貨の額は控えとして持つだけで、計算には使わない。
 * レートを取りに行かない（外へ送らない）。換算の根拠（カードの明細のレートなど）は本人が書く
 */
// 自分用だけ（版の値を直接比べる。入力の画面は公開版でも使うので、公開版の組み立てに通貨の一覧を入れない）
export const CURRENCIES: { code: string; label: string; digits: number }[] = process.env.NEXT_PUBLIC_KB_EDITION !== "personal" ? [] : [
  { code: "USD", label: "米ドル", digits: 2 },
  { code: "EUR", label: "ユーロ", digits: 2 },
  { code: "GBP", label: "英ポンド", digits: 2 },
  { code: "KRW", label: "韓国ウォン", digits: 0 },
  { code: "TWD", label: "台湾ドル", digits: 2 },
  { code: "CNY", label: "人民元", digits: 2 },
  { code: "HKD", label: "香港ドル", digits: 2 },
  { code: "THB", label: "タイバーツ", digits: 2 },
  { code: "SGD", label: "シンガポールドル", digits: 2 },
  { code: "AUD", label: "豪ドル", digits: 2 },
];
export const currencyOf = (code: string) => CURRENCIES.find((c) => c.code === code);

/** 「12.5」「1,234.56」「１２．５」→ 最小単位の整数（USD なら 1250）。桁が多すぎる・0 以下・読めないなら null */
export function parseForeign(s: string, code: string): number | null {
  const c = currencyOf(code);
  if (!c) return null;
  // カンマは3桁ごとの区切りだけ（「12,50」を 1,250 と読まない。点検 中2）。「12.」「.5」も読む
  const t = s.normalize("NFKC").replace(/\s/g, "");
  if (t.includes(",") && !/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(t)) return null;
  const m = /^(\d{0,12})(?:\.(\d*))?$/.exec(t.replace(/,/g, ""));
  if (!m || (m[1] === "" && !m[2])) return null;
  if (!m) return null;
  const frac = m[2] ?? "";
  if (frac.length > c.digits) return null;
  const minor = Number(m[1] || "0") * 10 ** c.digits + Number(frac.padEnd(c.digits, "0") || "0");
  return minor > 0 && Number.isSafeInteger(minor) ? minor : null;
}

// 見せ方は fxFormat.ts（一覧の画面から読む。公開版の組み立てに通貨の一覧を入れない）
export { formatForeign } from "./fxFormat";

/** 入力の欄へ戻す（"12.50"） */
export function foreignToInput(f: ForeignAmount): string {
  return (f.minor / 10 ** f.digits).toFixed(f.digits);
}
