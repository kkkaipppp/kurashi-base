import { emptyData } from "./defaults";
import type { AppData, Category, RecurringCycle, RecurringExpense, Transaction, TxType } from "./types";

/**
 * 家計簿の CSV（docs/import/KURASHI_IMPORT_SPEC.md の形）を、くらしベースの記録にする。
 * 取り込みは「今のデータに追加する」と同じ仕組み（applyRestore の merge）で行うので、同じ記録は二重に入らない。
 * ID は CSV の中身から作る（tools/import/mf_replace.mjs と同じ作り方。2026-11-24 にそろえた）ので、同じ CSV を2回入れても増えない。
 * 11/24 の取り込み（元ID がすべての行にあった）と、これからの取り込みの ID は同じになる。
 */

export const TX_HEADER = ["日付", "種類", "金額", "カテゴリ", "内容", "支払い方法", "メモ", "元ID"];
export const REC_HEADER = ["名前", "金額", "周期", "支払日", "次の支払日", "カテゴリ", "支払い方法"];

const PAY: Record<string, string> = { 現金: "cash", クレジットカード: "card", QRコード決済: "qr", 電子マネー: "emoney", "口座振替・振込": "bank", その他: "other", "": "" };
const CYCLE: Record<string, RecurringCycle> = { 毎月: "monthly", 毎年: "yearly", 毎週: "weekly" };
const KIND: Record<string, TxType> = { 支出: "expense", 収入: "income" };

const fnv = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};
const isDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  // 2026-02-31 のような、ない日付は断る
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** CSV を行と列に分ける（"…" の中のカンマ・改行・"" に対応） */
export function parseCsv(text: string): string[][] {
  return parseCsvChecked(text).rows;
}

/**
 * parseCsv に加えて、引用符（"）が閉じないまま終わったときの、その引用符が始まった行（1始まり）を返す。
 * 閉じていないと、後ろの行が全部1つのセルに吸い込まれて、記録が黙って欠けるため（NEXT v21 CSV:C04）
 */
export function parseCsvChecked(text: string, delim: string = ","): { rows: string[][]; unclosedLine: number | null; rowLines: number[] } {
  const t = text.replace(/^﻿/, "");
  let line = 1;
  let qLine = 0;
  // 各行が始まった、ファイルの実際の行番号（引用符の中の改行・空行があっても、エディタの行番号と同じ）
  let rs = 0;
  const rowLines: number[] = [];
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === "\n" || (c === "\r" && t[i + 1] !== "\n")) line++;
    if (rs === 0 && c !== "\n" && c !== "\r") rs = line;
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') {
      q = true;
      qLine = line;
    } else if (c === delim) {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") {
        i++; // CRLF は「\n」を飛ばすので、行の数えはここで1回
        line++;
      }
      row.push(cur);
      cur = "";
      if (row.some((x) => x !== "")) {
        rows.push(row);
        rowLines.push(rs);
      }
      row = [];
      rs = 0;
    } else cur += c;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    if (row.some((x) => x !== "")) {
      rows.push(row);
      rowLines.push(rs);
    }
  }
  return { rows, unclosedLine: q ? qLine : null, rowLines };
}

export type CsvKind = "transactions" | "recurring";
export type CsvResult =
  | {
      ok: true;
      kind: CsvKind;
      incoming: AppData;
      rows: number;
      from: string | null;
      to: string | null;
      newCategories: string[];
      /** 足さなかった固定費と、その理由（確認画面に見せる。NEXT v21 CSV:C05） */
      skipped: { name: string; reason: string }[];
    }
  | { ok: false; error: string };

/** CSV から、追加の取り込みに渡す記録（AppData）を作る。今のカテゴリは名前と種類で使い回し、ないものだけ作る */
export function csvToIncoming(text: string, current: AppData, nowIso: string): CsvResult {
  const { rows, unclosedLine, rowLines } = parseCsvChecked(text);
  if (unclosedLine !== null) return { ok: false, error: `${unclosedLine}行目の引用符（"）が閉じていません。閉じるか、引用符を消してから、もう一度選んでください` };
  return rowsToIncoming(rows, rowLines, current, nowIso);
}

/**
 * 決まった形（TX_HEADER か REC_HEADER）の行から、取り込む記録を作って検証する。
 * 汎用の取り込み（lib/csvGeneric.ts）も、決まった形の行にしてからここへ渡すので、検証・ID の作り方は同じ。
 * rowLines は、各行がもとのファイルの何行目か（エラーの行番号に使う）
 */
export function rowsToIncoming(rows: string[][], rowLines: number[], current: AppData, nowIso: string): CsvResult {
  if (rows.length < 2) return { ok: false, error: "CSV に記録がありません" };
  const header = rows[0].map((h) => h.trim());
  const kind: CsvKind | null =
    TX_HEADER.slice(0, 7).every((h, i) => header[i] === h) ? "transactions" : REC_HEADER.every((h, i) => header[i] === h) ? "recurring" : null;
  if (!kind)
    return {
      ok: false,
      error: `1行目の見出しが違います。「${TX_HEADER.join(",")}」か「${REC_HEADER.join(",")}」にしてください。文字が化けているときは、CSV を UTF-8 で保存し直してください`,
    };

  const incoming = emptyData(nowIso);
  const categories: Category[] = current.categories.map((c) => ({ ...c }));
  const newCategories: string[] = [];
  const catId = (k: TxType, name: string) => {
    const hit = categories.find((c) => c.kind === k && c.name === name);
    if (hit) return hit.id;
    const id = `mf-${k === "expense" ? "exp" : "inc"}-${fnv(k + name)}`;
    categories.push({ id, name, kind: k, order: categories.filter((c) => c.kind === k).length, archived: false });
    newCategories.push(name);
    return id;
  };

  const body = rows.slice(1);
  // エラーは最初の1行で止めず、最大10件を行番号つきでまとめて返す（NEXT v21 CSV:C04）。確定は、エラーが0件のときだけ
  const errs: string[] = [];
  const fail = () => {
    const shown = errs.slice(0, 10).join("\n");
    const more = errs.length > 10 ? `\nほか${errs.length - 10}件` : "";
    return { ok: false as const, error: `直してほしい行があります（${errs.length}件）。\n${shown}${more}` };
  };
  if (body.length > 20000) return { ok: false, error: "一度に取り込めるのは20,000行までです" };
  if (kind === "transactions") {
    const txs: Transaction[] = [];
    // 元ID がない行は、中身が同じ行の中で何番目かで ID を作る（行の並びが変わっても、期間が重なる別の CSV でも、同じ明細は同じ ID）
    const sameCount = new Map<string, number>();
    for (let i = 0; i < body.length; i++) {
      const [date = "", kindJa = "", amt = "", cat = "", content = "", pay = "", memo = "", srcId = ""] = body[i].map((x) => x.trim());
      const type = KIND[kindJa];
      const amount = Number(amt);
      const line = rowLines[i + 1] ?? i + 2;
      if (!isDate(date)) {
        errs.push(`${line}行目の日付が正しくありません（YYYY-MM-DD）`);
        continue;
      }
      if (!type) {
        errs.push(`${line}行目の種類は「支出」か「収入」にしてください`);
        continue;
      }
      if (!/^\d+$/.test(amt) || amount <= 0 || amount > 1_000_000_000) {
        errs.push(`${line}行目の金額は、正の整数（円）にしてください`);
        continue;
      }
      if (!cat) {
        errs.push(`${line}行目のカテゴリが空です`);
        continue;
      }
      if (!(pay in PAY)) {
        errs.push(`${line}行目の支払い方法「${pay}」は使えません`);
        continue;
      }
      const noIdKey = (k: string) => {
        const n = (sameCount.get(k) ?? 0) + 1;
        sameCount.set(k, n);
        return `mfn_${fnv(k)}_${fnv(`${k}#${n}`)}`;
      };
      txs.push({
        id: srcId ? `mf_${fnv(srcId)}_${fnv(date + srcId)}` : noIdKey(`${date}|${kindJa}|${amt}|${content}|${cat}`),
        type, date, amount, currency: "JPY", categoryId: catId(type, cat), merchant: content.slice(0, 200),
        paymentMethod: PAY[pay], note: memo.slice(0, 1000), source: "manual", createdAt: nowIso, updatedAt: nowIso,
      });
    }
    if (errs.length) return fail();
    const ids = new Set(txs.map((t) => t.id));
    if (ids.size !== txs.length) return { ok: false, error: "同じ元IDの行が2つ以上あります" };
    incoming.transactions = txs;
    const dates = txs.map((t) => t.date).sort();
    incoming.categories = categories;
    return { ok: true, kind, incoming, rows: txs.length, from: dates[0] ?? null, to: dates.at(-1) ?? null, newCategories, skipped: [] };
  }

  const recs: RecurringExpense[] = [];
  const skipped: { name: string; reason: string }[] = [];
  for (let i = 0; i < body.length; i++) {
    const [name = "", amt = "", cyc = "", day = "", next = "", cat = "", pay = ""] = body[i].map((x) => x.trim());
    const amount = Number(amt);
    const line = rowLines[i + 1] ?? i + 2;
    if (!name) {
        errs.push(`${line}行目の名前が空です`);
        continue;
      }
    if (!/^\d+$/.test(amt) || amount <= 0) {
        errs.push(`${line}行目の金額は、正の整数（円）にしてください`);
        continue;
      }
    if (!CYCLE[cyc]) {
        errs.push(`${line}行目の周期は「毎月・毎年・毎週」にしてください`);
        continue;
      }
    const anchor = cyc === "毎週" ? 1 : Number(day);
    if (!Number.isInteger(anchor) || anchor < 1 || anchor > 31) {
        errs.push(`${line}行目の支払日は1〜31にしてください`);
        continue;
      }
    if (!isDate(next)) {
        errs.push(`${line}行目の次の支払日が正しくありません（YYYY-MM-DD）`);
        continue;
      }
    if (!(pay in PAY)) {
        errs.push(`${line}行目の支払い方法「${pay}」は使えません`);
        continue;
      }
    // すでに同じ名前・金額の固定費があれば足さない（例：「家賃」と「家賃（全保連）」）
    const same = current.recurring.find((r) => r.amount === amount && (r.name === name || name.startsWith(r.name)));
    if (same) {
      skipped.push({ name, reason: same.name === name ? "同じ名前・金額の固定費がすでにあります" : `名前が「${same.name}」で始まり、金額が同じ固定費がすでにあります` });
      continue;
    }
    recs.push({
      id: `mfrec_${fnv(`${name}|${amount}|${cyc}`)}`, name: name.slice(0, 100), amount, cycle: CYCLE[cyc], anchorDay: anchor, nextDueDate: next,
      categoryId: catId("expense", cat || "その他"), paymentMethod: PAY[pay], active: true, createdAt: nowIso, updatedAt: nowIso,
    });
  }
  if (errs.length) return fail();
  incoming.recurring = recs;
  incoming.categories = categories;
  return { ok: true, kind, incoming, rows: recs.length, from: null, to: null, newCategories, skipped };
}
