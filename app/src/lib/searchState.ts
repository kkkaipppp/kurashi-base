/**
 * 検索の状態を、アドレスの「?q=」に残す（NEXT v22 UI13：検索から別の画面へ行って戻っても、検索語が残る）。
 * 保存データには入れない（画面の状態だけ。URL だけ）。検索語は個人の記録を探す言葉なので、外へは送らない。
 */
export const MAX_QUERY_LEN = 100;

/** アドレスの検索部分（?q=...）から、検索語を取り出す。なければ空 */
export function queryFromSearch(search: string): string {
  try {
    return (new URLSearchParams(search).get("q") ?? "").slice(0, MAX_QUERY_LEN);
  } catch {
    return "";
  }
}

/** いまの検索部分に、検索語を反映した、新しい検索部分（空なら q を外す）。ほかの項目は、そのまま */
export function searchWithQuery(search: string, q: string): string {
  const p = new URLSearchParams(search);
  const t = q.slice(0, MAX_QUERY_LEN);
  if (t.trim() === "") p.delete("q");
  else p.set("q", t);
  const s = p.toString();
  return s ? `?${s}` : "";
}
