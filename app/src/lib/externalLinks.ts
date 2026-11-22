// 外部サイトを開くためのリンクを作る（v5）。
// ここで作るのは「開く先の URL」だけ。アプリから外部へデータを自動で送らない。
// ユーザーがボタンを押したときに、入力した語・予定の内容だけが URL に入る。

import { isValidDateStr, isValidTimeStr } from "./date";

function nextDay(s: string): string {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const compact = (s: string) => s.replaceAll("-", "").replaceAll(":", "");

/** http / https の URL だけを通す（javascript: などは拒否）。空や不正は null */
export function safeExternalLink(href: string): string | null {
  const s = href.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** 保存できる URL か（空は OK。入力されていれば http/https のみ） */
export function isSavableUrl(href: string): boolean {
  return href.trim() === "" || safeExternalLink(href) !== null;
}

export type TravelMode = "walking" | "driving" | "transit";

/** Googleマップで行き方を調べる（目的地だけを渡す。出発地は端末の現在地を Google 側が使う） */
export function mapsDirections(destination: string, travelmode: TravelMode = "transit"): string | null {
  const q = destination.trim();
  if (!q) return null;
  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  u.searchParams.set("destination", q);
  u.searchParams.set("travelmode", travelmode);
  return u.toString();
}

/** Googleマップで場所を探す */
export function mapsSearch(query: string): string | null {
  const q = query.trim();
  if (!q) return null;
  const u = new URL("https://www.google.com/maps/search/");
  u.searchParams.set("api", "1");
  u.searchParams.set("query", q);
  return u.toString();
}

/** 入力した語で Web 検索する（アプリは検索結果を読まない） */
export function webSearch(query: string): string | null {
  const q = query.trim();
  if (!q) return null;
  const u = new URL("https://www.google.com/search");
  u.searchParams.set("q", q);
  return u.toString();
}

/**
 * Googleカレンダーの「予定を作成」画面を開く URL。
 * Google 側で「保存」を押すまで登録されない（同期ではない）。
 * 終日の終了日は Google の仕様で「翌日」（含まない）を渡す。時刻つきは日本時間。
 */
export function calendarTemplate(e: {
  title: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
  description?: string;
  location?: string;
}): string | null {
  if (!e.title.trim() || !isValidDateStr(e.startDate) || !isValidDateStr(e.endDate) || e.endDate < e.startDate) return null;
  const u = new URL("https://calendar.google.com/calendar/render");
  u.searchParams.set("action", "TEMPLATE");
  u.searchParams.set("text", e.title.trim());
  if (e.allDay) {
    u.searchParams.set("dates", `${compact(e.startDate)}/${compact(nextDay(e.endDate))}`);
  } else {
    if (!isValidTimeStr(e.startTime ?? "") || !isValidTimeStr(e.endTime ?? "")) return null;
    const st = `${e.startDate}T${e.startTime}`;
    const ed = `${e.endDate}T${e.endTime}`;
    if (ed <= st) return null;
    u.searchParams.set("dates", `${compact(st)}00/${compact(ed)}00`);
    u.searchParams.set("ctz", "Asia/Tokyo");
  }
  if (e.description?.trim()) u.searchParams.set("details", e.description.trim());
  if (e.location?.trim()) u.searchParams.set("location", e.location.trim());
  return u.toString();
}

/**
 * Amazon で参考書を探す（検索ページを開くだけ）。
 * アソシエイトのタグは付けない（正式な登録・審査・表示の準備ができるまで付けない決まり）
 */
export function bookSearch(query: string): string | null {
  const q = query.trim();
  if (!q) return null;
  const u = new URL("https://www.amazon.co.jp/s");
  u.searchParams.set("k", q);
  u.searchParams.set("i", "stripbooks");
  return u.toString();
}

/** note の勉強法の記事を Web 検索で探す */
export function noteSearch(query: string): string | null {
  const q = query.trim();
  if (!q) return null;
  return webSearch(`${q} site:note.com`);
}
