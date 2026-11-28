import { isValidDateStr } from "./date";
import { MAX_AMOUNT } from "./money";

/**
 * 貼り付けた文章・URL から、予定と支出の「候補」を取り出す（To-Be 02「＋：文章・URL…解析結果は確認後保存」）。
 * 候補を入力の画面に入れるだけで、保存は本人が入力の画面で押したとき。URL は開かない・外へ送らない（文字として持つだけ）。
 * LINE やメールの文を想定し、年の無い「12月5日」「12/5」も読む（予定は先の日付なので、レシートの読み取りと違い、未来の日を許す）。
 */
export const PASTE_MAX = 2000;

export interface PasteGuess {
  /** 予定の名前の候補（URL を除いた最初の行。100字まで） */
  title: string | null;
  /** 予定の日付の候補 YYYY-MM-DD（年の無い日付は、30日より前なら来年） */
  date: string | null;
  /** 支出の日付の候補（年の無い日付は、明日より先なら去年。支出は先の日付にならないため） */
  pastDate: string | null;
  /** HH:MM */
  time: string | null;
  /** 円。「円」「¥」の付いた金額だけを読む（日付や時刻の数字を金額にしない。「3万円」は読まない） */
  amount: number | null;
  amountConfidence: "high" | "low" | null;
  /** 最初の http(s) の URL */
  url: string | null;
}

const nfkc = (s: string) => s.normalize("NFKC");
const pad = (n: number) => String(n).padStart(2, "0");
// URL に使える ASCII の文字だけ（日本語の文が続いても URL に含めない）
const URL_RE = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&*+,;=%]+/i;

export function findUrl(text: string): string | null {
  const m = URL_RE.exec(text);
  if (!m) return null;
  // 文の終わりの句読点は URL に含めない
  return m[0].replace(/[.,、。!?！？]+$/, "");
}

/**
 * 年の無い日付の年の決め方：
 *   "future"（予定）＝今日から 30 日より前なら来年（年末に来年の予定を貼るとき）
 *   "past"（支出）＝明日より先なら去年（支出は先の日付にならない）
 */
export function findAnyDate(lines: string[], today: string, mode: "future" | "past" = "future"): string | null {
  const [ty, tm, td] = today.split("-").map(Number);
  const todayNum = Date.UTC(ty, tm - 1, td);
  for (const raw of lines) {
    const s = nfkc(raw);
    let m = /(20\d{2})\s*[/.\-年]\s*(\d{1,2})\s*[/.\-月]\s*(\d{1,2})/.exec(s);
    if (m) {
      const iso = `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
      if (isValidDateStr(iso)) return iso;
      continue;
    }
    // 「1/2カップ」「第1/2回」のような分数・回数は日付にしない
    m = /(?<![\d/第])(\d{1,2})\s*(?:月\s*(\d{1,2})\s*日|\/(\d{1,2})(?![\d/]|\s*(?:カップ|杯|個|本|枚|人|回|番|切れ)))/.exec(s);
    if (m) {
      const mo = Number(m[1]);
      const da = Number(m[2] ?? m[3]);
      let y = ty;
      if (mode === "future" && Date.UTC(y, mo - 1, da) < todayNum - 30 * 86_400_000) y += 1;
      if (mode === "past" && Date.UTC(y, mo - 1, da) > todayNum + 86_400_000) y -= 1;
      const iso = `${y}-${pad(mo)}-${pad(da)}`;
      if (isValidDateStr(iso)) return iso;
    }
  }
  return null;
}

/** 「19:00」「19時」「19時30分」。0〜23 時だけ。「2時間」（かかる時間）は時刻にしない */
export function findTime(lines: string[]): string | null {
  for (const raw of lines) {
    const s = nfkc(raw);
    const m = /(?<!\d)([01]?\d|2[0-3])(?::([0-5]\d)(?!\d)|時(?!間)(?:\s*([0-5]?\d)\s*分|半)?)/.exec(s);
    if (m) {
      const min = m[2] ?? m[3] ?? (/時半/.test(m[0]) ? "30" : "0");
      return `${pad(Number(m[1]))}:${pad(Number(min))}`;
    }
  }
  return null;
}

const MARKED = /[¥￥]\s*(\d{1,3}(?:,\d{3})+|\d+)|(\d{1,3}(?:,\d{3})+|\d+)\s*円/g;
const TOTAL = /合計|お会計|ご請求|総額|お支払|ご利用金額|会費|代金|料金|一人|1人/;
const NOT_TOTAL = /お預り|お預かり|釣|ポイント|割引|値引|クーポン|残高/;

export function findMarkedAmount(lines: string[]): { amount: number | null; confidence: "high" | "low" | null } {
  const high: number[] = [];
  const low: number[] = [];
  for (const raw of lines) {
    const s = nfkc(raw);
    if (NOT_TOTAL.test(s)) continue;
    const a: number[] = [];
    for (const m of s.matchAll(MARKED)) {
      const n = Number((m[1] ?? m[2]).replace(/,/g, ""));
      if (Number.isSafeInteger(n) && n > 0 && n <= MAX_AMOUNT) a.push(n);
    }
    if (!a.length) continue;
    if (TOTAL.test(s)) high.push(...a);
    else low.push(...a);
  }
  const uniq = [...new Set(high)];
  if (uniq.length === 1) return { amount: uniq[0], confidence: "high" };
  if (uniq.length > 1) return { amount: Math.max(...uniq), confidence: "low" };
  const lu = [...new Set(low)];
  if (lu.length === 1) return { amount: lu[0], confidence: "low" };
  return lu.length ? { amount: Math.max(...lu), confidence: "low" } : { amount: null, confidence: null };
}

export function parsePasted(text: string, today: string): PasteGuess {
  const src = text.slice(0, PASTE_MAX);
  const url = findUrl(src);
  // URL の中の数字を日付・金額にしない
  const lines = src
    .replace(new RegExp(URL_RE.source, "gi"), " ")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const first = lines[0] ? Array.from(nfkc(lines[0]).replace(/\s+/g, " ").trim()).slice(0, 100).join("") : "";
  const a = findMarkedAmount(lines);
  return {
    title: first || null,
    date: findAnyDate(lines, today, "future"),
    pastDate: findAnyDate(lines, today, "past"),
    time: findTime(lines),
    amount: a.amount,
    amountConfidence: a.confidence,
    url,
  };
}
