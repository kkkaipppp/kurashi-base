import { parseCsvChecked, rowsToIncoming, TX_HEADER, type CsvResult } from "./csvImport";
import type { AppData } from "./types";

/**
 * 汎用の CSV 取り込み（NEXT v21 CSV:C01〜C07）。
 * 銀行・カード・家計簿アプリなど、見出しがバラバラな CSV を、列の対応づけ（自動の候補＋手で直す）で、
 * くらしベースの決まった形（lib/csvImport.ts の TX_HEADER）の行にしてから、同じ検証・同じ ID の作り方で取り込む。
 * - 区切りはカンマ・タブ、文字コードは UTF-8 のあと Shift_JIS（設定画面側で読む）
 * - 金額は整数の円だけ。小数・読めない金額は、その行をエラーにする（切り捨てない）
 * - 振替・計算対象外・0円は取り込まず「保留」に数える（黙って捨てない）
 * - 分類は、今のカテゴリの名前に合うものだけ使い、合わないものは「その他」にする（勝手にカテゴリを増やさない。増やすのは本人が選んだとき）
 * 取り込めると見せるのは、実際に読める列がある形だけ。サービスごとの専用対応は、実サンプルを確かめるまで書かない。
 */

export type Delim = "," | "\t";
export type AmountMode = "signed" | "split" | "kind";
/** signed のとき：プラスが支出か、マイナスが支出か */
export type SignRule = "negativeIsExpense" | "positiveIsExpense";

export interface GenericMap {
  date: number;
  amount: number;
  income: number;
  expense: number;
  kind: number;
  category: number;
  merchant: number;
  pay: number;
  memo: number;
  srcId: number;
  /** 「計算対象」の列（0 は取り込まない） */
  include: number;
  /** 「振替」の列（1 などは取り込まない） */
  transfer: number;
}

export interface GenericConfig {
  map: GenericMap;
  mode: AmountMode;
  sign: SignRule;
  /** 今のカテゴリにない名前を、新しいカテゴリとして作るか（作らないときは「その他」） */
  newCategories: boolean;
}

export interface Table {
  header: string[];
  /** 見出しを除いた行 */
  body: string[][];
  /** body の各行が、もとのファイルの何行目か。header は headerLine */
  lines: number[];
  headerLine: number;
  delim: Delim;
}

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\s　]+/g, "").replace(/[（(]円[）)]/g, "");

/** 区切り文字：1行目のカンマとタブの多いほう（引用符の中は数えない） */
export function detectDelimiter(text: string): Delim {
  const first = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  let q = false;
  let c = 0;
  let t = 0;
  for (const ch of first) {
    if (ch === '"') q = !q;
    else if (!q && ch === ",") c++;
    else if (!q && ch === "\t") t++;
  }
  return t > c ? "\t" : ",";
}

export function parseTable(text: string): { ok: true; table: Table } | { ok: false; error: string } {
  const delim = detectDelimiter(text);
  const { rows, unclosedLine, rowLines } = parseCsvChecked(text, delim);
  if (unclosedLine !== null) return { ok: false, error: `${unclosedLine}行目の引用符（"）が閉じていません。閉じるか、引用符を消してから、もう一度選んでください` };
  if (rows.length < 2) return { ok: false, error: "記録がありません（見出しの次の行から、記録が必要です）" };
  return { ok: true, table: { header: rows[0].map((h) => h.trim()), body: rows.slice(1), lines: rowLines.slice(1), headerLine: rowLines[0] ?? 1, delim } };
}

const SYN: Record<keyof GenericMap, string[]> = {
  date: ["日付", "年月日", "利用日", "取引日", "日時", "発生日", "取扱日", "ご利用日", "date"],
  amount: ["金額", "利用金額", "支払金額", "取引金額", "ご利用金額", "amount"],
  income: ["入金", "入金額", "入金金額", "預入", "預入金額", "お預り金額", "お預かり金額", "収入", "収入金額"],
  expense: ["出金", "出金額", "出金金額", "支出", "支出金額", "引出", "お引出し金額", "払出", "お支払金額", "支払"],
  kind: ["種類", "収支", "区分", "収支区分", "入出金", "取引区分"],
  category: ["カテゴリ", "カテゴリー", "大項目", "費目", "分類", "カテゴリ名"],
  merchant: ["内容", "摘要", "利用店名", "店名", "お店", "利用先", "ご利用先", "取引内容", "品目", "名称", "利用店名・商品名", "ご利用店名"],
  pay: ["支払い方法", "支払方法", "支払元", "方法", "保有金融機関", "口座", "金融機関", "支払区分"],
  memo: ["メモ", "備考", "ノート"],
  srcId: ["id", "元id", "明細id", "取引id", "取引番号", "伝票番号"],
  include: ["計算対象"],
  transfer: ["振替"],
};

const EMPTY_MAP = (): GenericMap => ({ date: -1, amount: -1, income: -1, expense: -1, kind: -1, category: -1, merchant: -1, pay: -1, memo: -1, srcId: -1, include: -1, transfer: -1 });

/** 見出しから、列の対応づけの候補を作る（同じ列を2つの項目に割り当てない） */
export function suggestConfig(table: Table): GenericConfig {
  const map = EMPTY_MAP();
  const used = new Set<number>();
  const names = table.header.map(norm);
  for (const key of Object.keys(SYN) as (keyof GenericMap)[]) {
    const syn = SYN[key].map(norm);
    const i = names.findIndex((n, idx) => !used.has(idx) && syn.includes(n));
    if (i >= 0) {
      map[key] = i;
      used.add(i);
    }
  }
  const mode: AmountMode = map.amount >= 0 ? (map.kind >= 0 ? "kind" : "signed") : "split";
  // プラスが支出か：マイナスの金額があれば「マイナスが支出」、なければ「プラスが支出」（カードの利用明細など）
  const hasNeg = map.amount >= 0 && table.body.some((r) => /^[-−▲△(（]/.test((r[map.amount] ?? "").trim()));
  const cardLike = map.amount >= 0 && /利用|支払/.test(table.header[map.amount] ?? "");
  const sign: SignRule = hasNeg && !cardLike ? "negativeIsExpense" : "positiveIsExpense";
  return { map, mode, sign, newCategories: false };
}

/** 日付：2026-11-24・2026/11/24・2026.11.24・2026年11月24日・20261124（時刻は無視）。年がないもの・読めないものは null */
export function normalizeDate(raw: string): string | null {
  const s = raw.normalize("NFKC").trim().split(/[T\s]/)[0] ?? "";
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s) ?? /^(\d{4})年(\d{1,2})月(\d{1,2})日?$/.exec(s) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [m[1], m[2].padStart(2, "0"), m[3].padStart(2, "0")];
  const iso = `${y}-${mo}-${d}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso ? iso : null;
}

/** 金額：円・￥・カンマ・全角を外す。(1,000)・△1000・▲1000・-1000 はマイナス。小数点以下が0以外・読めないものは null（切り捨てない） */
export function normalizeAmount(raw: string): number | null {
  let s = raw.normalize("NFKC").trim().replace(/[¥￥円,\s]/g, "");
  if (s === "") return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (/^[△▲−-]/.test(s)) {
    neg = !neg;
    s = s.replace(/^[△▲−-]/, "");
  }
  s = s.replace(/^\+/, "");
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  if (m[2] && /[1-9]/.test(m[2])) return null;
  const n = Number(m[1]);
  if (!Number.isSafeInteger(n)) return null;
  return neg ? -n : n;
}

const PAY_WORDS: [RegExp, string][] = [
  [/現金/, "現金"],
  [/デビット/, "口座振替・振込"],
  [/クレジット|カード|visa|master|jcb|amex/i, "クレジットカード"],
  [/qr|paypay|ペイ|pay/i, "QRコード決済"],
  [/電子マネー|suica|pasmo|icoca|nanaco|waon|edy|楽天edy|交通系/i, "電子マネー"],
  [/銀行|口座|振込|振替|引落|ゆうちょ|信金|信用金庫|農協/, "口座振替・振込"],
];
function payName(raw: string): string {
  const s = raw.normalize("NFKC").trim();
  if (!s) return "";
  for (const [re, name] of PAY_WORDS) if (re.test(s)) return name;
  return "その他";
}

const EXPENSE_WORDS = /^(支出|出金|支払|引落|引き落とし|お支払|費用)$/;
const INCOME_WORDS = /^(収入|入金|預入|入|給与|振込入金)$/;
const TRANSFER_WORDS = /振替|移動|精算|チャージ|カード引落|口座間/;
const FALSY = new Set(["", "0", "false", "no", "いいえ", "×"]);

export interface HeldRow {
  line: number;
  reason: string;
}

export interface GenericBuild {
  rows: string[][];
  lines: number[];
  held: HeldRow[];
  /** 今のカテゴリにないので、「その他」にした名前と件数 */
  unknownCategories: { name: string; count: number }[];
}

/** 設定に従って、決まった形の行にする（取り込めない行は held に理由つきで数える。エラーの行は、そのまま渡して検証で行番号つきのエラーにする） */
export function buildStandardRows(table: Table, cfg: GenericConfig, current: AppData): GenericBuild {
  const { map: m } = cfg;
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const expenseCats = new Set(current.categories.filter((c) => c.kind === "expense").map((c) => c.name));
  const incomeCats = new Set(current.categories.filter((c) => c.kind === "income").map((c) => c.name));
  const rows: string[][] = [TX_HEADER];
  const lines: number[] = [table.headerLine];
  const held: HeldRow[] = [];
  const unknown = new Map<string, number>();
  const seen = new Map<string, number>();

  table.body.forEach((r, idx) => {
    const line = table.lines[idx] ?? idx + 2;
    if (m.include >= 0 && FALSY.has(norm(cell(r, m.include)))) return void held.push({ line, reason: "「計算対象」が0のため（取り込みません）" });
    if (m.transfer >= 0 && !FALSY.has(norm(cell(r, m.transfer)))) return void held.push({ line, reason: "振替のため（取り込みません。収支ではないので）" });

    let type: "支出" | "収入" | null = null;
    let amount: number | null = null;
    let raw = "";
    if (cfg.mode === "split") {
      const e = cell(r, m.expense);
      const i = cell(r, m.income);
      const en = e ? normalizeAmount(e) : null;
      const inn = i ? normalizeAmount(i) : null;
      if (e && en === null) raw = e;
      else if (i && inn === null) raw = i;
      else if (en && inn) return void held.push({ line, reason: "出金と入金の両方に金額があるため（確かめてから取り込んでください）" });
      else if (en) [type, amount] = ["支出", Math.abs(en)];
      else if (inn) [type, amount] = ["収入", Math.abs(inn)];
      else if (en === 0 || inn === 0) return void held.push({ line, reason: "0円のため" });
      else return void held.push({ line, reason: "出金・入金のどちらも空のため" });
    } else {
      raw = cell(r, m.amount);
      const n = normalizeAmount(raw);
      if (n !== null) {
        if (n === 0) return void held.push({ line, reason: "0円のため" });
        if (cfg.mode === "kind") {
          const k = norm(cell(r, m.kind));
          if (TRANSFER_WORDS.test(k)) return void held.push({ line, reason: `種類が「${cell(r, m.kind)}」のため（収支ではないので取り込みません）` });
          type = EXPENSE_WORDS.test(k) ? "支出" : INCOME_WORDS.test(k) ? "収入" : null;
          if (!type) return void held.push({ line, reason: `種類「${cell(r, m.kind)}」が支出か収入か分からないため` });
        } else {
          type = (n < 0) === (cfg.sign === "negativeIsExpense") ? "支出" : "収入";
        }
        amount = Math.abs(n);
      }
    }

    // 金額が読めない行は、そのまま渡して、検証で「金額は…」と行番号つきのエラーにする（種類のエラーにならないように、仮に支出とする）
    if (amount === null && !type) type = "支出";
    const date = normalizeDate(cell(r, m.date)) ?? cell(r, m.date);
    const origCat = cell(r, m.category);
    let cat = origCat;
    if (type && cat) {
      const known = (type === "支出" ? expenseCats : incomeCats).has(cat);
      if (!known && !cfg.newCategories) {
        unknown.set(cat, (unknown.get(cat) ?? 0) + 1);
        cat = type === "支出" ? "その他" : "その他の収入";
      }
    }
    if (!cat) cat = type === "収入" ? "その他の収入" : "その他";
    // 種類・金額が決められなかった行は、そのまま渡す（検証で、行番号つきのエラーになる）
    // 元 ID がない行は、読み取った内容（変換前のカテゴリを含む）と、同じ内容の何番目かから、元 ID を作る。
    // 変換後のカテゴリ（「その他」にしたか）で ID が変わると、同じファイルを取り込み直したときに二重になるため
    let srcId = cell(r, m.srcId);
    if (!srcId) {
      const base = `gen|${date}|${type ?? ""}|${amount ?? raw}|${cell(r, m.merchant)}|${origCat}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      srcId = `${base}#${n}`;
    }
    rows.push([date, type ?? "", amount !== null ? String(amount) : raw, cat, cell(r, m.merchant), payName(cell(r, m.pay)), cell(r, m.memo), srcId]);
    lines.push(line);
  });

  return { rows, lines, held, unknownCategories: [...unknown.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count) };
}

export type GenericResult = (CsvResult & { held?: HeldRow[]; unknownCategories?: { name: string; count: number }[] }) | { ok: false; error: string };

export function genericToIncoming(table: Table, cfg: GenericConfig, current: AppData, nowIso: string): GenericResult {
  if (cfg.map.date < 0) return { ok: false, error: "「日付」の列を選んでください" };
  if (cfg.mode === "split" ? cfg.map.expense < 0 && cfg.map.income < 0 : cfg.map.amount < 0) return { ok: false, error: "「金額」（または出金・入金）の列を選んでください" };
  if (cfg.mode === "kind" && cfg.map.kind < 0) return { ok: false, error: "「種類」（支出か収入か）の列を選んでください" };
  const used = Object.values(cfg.map).filter((i) => i >= 0);
  if (new Set(used).size !== used.length) return { ok: false, error: "同じ列を2つの項目に選んでいます。どちらかを「使わない」にしてください" };
  const b = buildStandardRows(table, cfg, current);
  if (b.rows.length < 2) return { ok: false, error: b.held.length ? `取り込める記録がありません（${b.held.length}行は取り込まない行でした）` : "取り込める記録がありません" };
  const r = rowsToIncoming(b.rows, b.lines, current, nowIso);
  return r.ok ? { ...r, held: b.held, unknownCategories: b.unknownCategories } : r;
}
