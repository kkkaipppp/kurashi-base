/**
 * 検索の状態を、アドレスの「?q=」に残す（NEXT v22 UI13：検索から別の画面へ行って戻っても、検索語が残る）。
 * 保存データには入れない（画面の状態だけ。URL だけ）。検索語は個人の記録を探す言葉なので、外へは送らない。
 */
export const MAX_QUERY_LEN = 100;

/** 種類の絞り込み（?k=tx など）。許す種類の中にあるときだけ。なければ空（＝すべて） */
export function kindFromSearch(search: string, allowed: readonly string[]): string {
  try {
    const k = new URLSearchParams(search).get("k") ?? "";
    return allowed.includes(k) ? k : "";
  } catch {
    return "";
  }
}

/** 検索語と種類を、いまの検索部分に反映する（空なら外す。ほかの項目は、そのまま） */
export function searchWithState(search: string, q: string, kind: string): string {
  const p = new URLSearchParams(searchWithQuery(search, q));
  if (kind) p.set("k", kind);
  else p.delete("k");
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** カレンダーで選んだ日（?d=YYYY-MM-DD）。実在する日付のときだけ。なければ空 */
export function dayFromSearch(search: string): string {
  try {
    const d = new URLSearchParams(search).get("d") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
    const t = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d ? d : "";
  } catch {
    return "";
  }
}

/** 選んだ日を、いまの検索部分に反映する。今日を選んでいるときは外す（アドレスを汚さない） */
export function searchWithDay(search: string, day: string, today: string): string {
  const p = new URLSearchParams(search);
  if (!day || day === today) p.delete("d");
  else p.set("d", day);
  const s = p.toString();
  return s ? `?${s}` : "";
}

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
