import { isValidDateStr } from "./date";

/**
 * レシート・決済画面の読み取り結果（行の文字）から、日付・合計金額・店名の「候補」を取り出す（NEXT v21 AUTOMATION_EXPERIENCE：OCR は候補を出すだけで、
 * 本人が確認するまで取引を作らない。曖昧なものは候補のままにして、確定扱いにしない）。
 * 文字の読み取り（iPhone の Vision）は端末の中で行い、画像も文字も外へ送らない。この関数は、読み取った行を解釈するだけ。
 */
export interface ReceiptGuess {
  /** YYYY-MM-DD。年がない・読めない・今日から離れすぎている日付は null（候補にしない） */
  date: string | null;
  /** 合計金額（円）。「合計」「お会計」などの行からだけ。なければ、お預り・お釣りを除いた最大の金額（confidence: low） */
  amount: number | null;
  amountConfidence: "high" | "low" | null;
  /** 店名の候補（最初のそれらしい行） */
  merchant: string | null;
}

const nfkc = (s: string) => s.normalize("NFKC");

/** 令和（R）の年から西暦（2019 年が令和元年） */
const reiwa = (n: number) => 2018 + n;

export function findDate(lines: string[], today: string): string | null {
  const t = Date.parse(`${today}T00:00:00Z`);
  const ok = (iso: string) => {
    if (!isValidDateStr(iso)) return false;
    const d = Date.parse(`${iso}T00:00:00Z`);
    // 今日の翌日より先・5年より前は、読み間違いの可能性が高いので候補にしない
    return d <= t + 86_400_000 && d >= t - 5 * 366 * 86_400_000;
  };
  for (const raw of lines) {
    const s = nfkc(raw);
    const pats: [RegExp, (m: RegExpExecArray) => string][] = [
      [/(20\d{2})\s*[/.\-年]\s*(\d{1,2})\s*[/.\-月]\s*(\d{1,2})/, (m) => `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`],
      [/(?:令和|R)\s*(\d{1,2})\s*[/.\-年]\s*(\d{1,2})\s*[/.\-月]\s*(\d{1,2})/i, (m) => `${reiwa(Number(m[1]))}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`],
    ];
    for (const [re, f] of pats) {
      const m = re.exec(s);
      if (m) {
        const iso = f(m);
        if (ok(iso)) return iso;
      }
    }
  }
  return null;
}

const NUM = /[¥￥]?\s*(\d{1,3}(?:,\d{3})+|\d+)\s*円?/g;
const amountsIn = (line: string): number[] => {
  const out: number[] = [];
  const s = nfkc(line)
    .replace(/(?:\d{2,4}[/.\-]\d{1,2}[/.\-]\d{1,2})|(?:\d{1,2}:\d{2})|(?:\d{2,4}-\d{2,4}-\d{3,4})/g, " ") // 日付・時刻・電話番号は除く
    .replace(/(?:点数|No\.?|NO\.?|番号|伝票|レジ|カード)\s*[:：#]?\s*\d+|\d+\s*点/g, " "); // 点数・伝票番号・カード番号も除く
  for (const m of s.matchAll(NUM)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isSafeInteger(n) && n > 0 && n <= 100_000_000) out.push(n);
  }
  return out;
};

// 合計の行の言葉。「税込」だけの行（商品ごとに付く）は合計にしない
const TOTAL = /合計|お会計|ご請求|総額|お支払金額|ご利用金額|お買上金額|請求金額/;
// 合計ではない行の言葉（「ポイント合計」「割引合計」のように、合計の言葉と一緒でも、合計にしない）
const NOT_TOTAL = /小計|お預り|お預かり|釣|ポイント|割引|値引|クーポン|チャージ残高|残高|点数|対象/;

export function findAmount(lines: string[]): { amount: number | null; confidence: "high" | "low" | null } {
  const high: number[] = [];
  const low: number[] = [];
  const conflict: number[] = [];
  for (const raw of lines) {
    const line = nfkc(raw);
    // 小計・お預り・お釣り・ポイント・割引などの行は、合計の言葉が一緒にあっても使わない。
    // ただし「お支払金額 ¥1,000（ポイント利用）」のような、支払いの行は、合計と違う金額かもしれないので、あとで確かめる印にする
    if (NOT_TOTAL.test(line)) {
      if (/お支払|お会計|ご請求|請求金額|ご利用金額/.test(line) && !/お預り|お預かり|釣/.test(line)) conflict.push(...amountsIn(line));
      continue;
    }
    const a = amountsIn(line);
    if (a.length === 0) continue;
    if (TOTAL.test(line)) high.push(Math.max(...a));
    else if (!/消費税|内税|外税|税込/.test(line)) low.push(...a);
  }
  const uniq = [...new Set(high)];
  // 合計の行が1種類の金額だけなら、確度は高い。違う金額の合計の行が複数あるとき（「合計」と「お支払金額」など）は、確度を低くして、確かめてもらう
  if (uniq.length === 1) return { amount: uniq[0], confidence: conflict.some((c) => c !== uniq[0]) ? "low" : "high" };
  if (uniq.length > 1) return { amount: Math.max(...uniq), confidence: "low" };
  // 合計の行がないときは、いちばん大きい金額（低い確度）
  return low.length ? { amount: Math.max(...low), confidence: "low" } : { amount: null, confidence: null };
}

const SKIP_MERCHANT = /レシート|領収|領収書|明細|ご利用|ありがとう|TEL|電話|〒|住所|登録番号|^T\d{10,}|担当|責任者|\d{2,4}[/.\-]\d{1,2}[/.\-]\d{1,2}|^\d[\d\s,.¥円:-]*$/i;

export function findMerchant(lines: string[]): string | null {
  for (const raw of lines.slice(0, 8)) {
    const s = nfkc(raw).replace(/\s+/g, " ").trim();
    if (s.length < 2 || s.length > 30) continue;
    if (SKIP_MERCHANT.test(s)) continue;
    if (!/[぀-ヿ一-鿿A-Za-z]/.test(s)) continue; // 文字（かな・漢字・英字）がない行は店名にしない
    return s.replace(/^(株式会社|\(株\))\s*/, "").slice(0, 100);
  }
  return null;
}

export function parseReceipt(lines: string[], today: string): ReceiptGuess {
  const clean = lines.map((l) => l.trim()).filter(Boolean);
  const a = findAmount(clean);
  return { date: findDate(clean, today), amount: a.amount, amountConfidence: a.confidence, merchant: findMerchant(clean) };
}
