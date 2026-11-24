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
  const t = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    if (row.some((x) => x !== "")) rows.push(row);
  }
  return rows;
}

export type CsvKind = "transactions" | "recurring";
export type CsvResult =
  | { ok: true; kind: CsvKind; incoming: AppData; rows: number; from: string | null; to: string | null; newCategories: string[] }
  | { ok: false; error: string };

/** CSV から、追加の取り込みに渡す記録（AppData）を作る。今のカテゴリは名前と種類で使い回し、ないものだけ作る */
export function csvToIncoming(text: string, current: AppData, nowIso: string): CsvResult {
  const rows = parseCsv(text);
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
  if (body.length > 20000) return { ok: false, error: "一度に取り込めるのは20,000行までです" };
  if (kind === "transactions") {
    const txs: Transaction[] = [];
    // 元ID がない行は、中身が同じ行の中で何番目かで ID を作る（行の並びが変わっても、期間が重なる別の CSV でも、同じ明細は同じ ID）
    const sameCount = new Map<string, number>();
    for (let i = 0; i < body.length; i++) {
      const [date = "", kindJa = "", amt = "", cat = "", content = "", pay = "", memo = "", srcId = ""] = body[i].map((x) => x.trim());
      const type = KIND[kindJa];
      const amount = Number(amt);
      const line = i + 2;
      if (!isDate(date)) return { ok: false, error: `${line}行目の日付が正しくありません（YYYY-MM-DD）` };
      if (!type) return { ok: false, error: `${line}行目の種類は「支出」か「収入」にしてください` };
      if (!/^\d+$/.test(amt) || amount <= 0 || amount > 1_000_000_000) return { ok: false, error: `${line}行目の金額は、正の整数（円）にしてください` };
      if (!cat) return { ok: false, error: `${line}行目のカテゴリが空です` };
      if (!(pay in PAY)) return { ok: false, error: `${line}行目の支払い方法「${pay}」は使えません` };
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
    const ids = new Set(txs.map((t) => t.id));
    if (ids.size !== txs.length) return { ok: false, error: "同じ元IDの行が2つ以上あります" };
    incoming.transactions = txs;
    const dates = txs.map((t) => t.date).sort();
    incoming.categories = categories;
    return { ok: true, kind, incoming, rows: txs.length, from: dates[0] ?? null, to: dates.at(-1) ?? null, newCategories };
  }

  const recs: RecurringExpense[] = [];
  for (let i = 0; i < body.length; i++) {
    const [name = "", amt = "", cyc = "", day = "", next = "", cat = "", pay = ""] = body[i].map((x) => x.trim());
    const amount = Number(amt);
    const line = i + 2;
    if (!name) return { ok: false, error: `${line}行目の名前が空です` };
    if (!/^\d+$/.test(amt) || amount <= 0) return { ok: false, error: `${line}行目の金額は、正の整数（円）にしてください` };
    if (!CYCLE[cyc]) return { ok: false, error: `${line}行目の周期は「毎月・毎年・毎週」にしてください` };
    const anchor = cyc === "毎週" ? 1 : Number(day);
    if (!Number.isInteger(anchor) || anchor < 1 || anchor > 31) return { ok: false, error: `${line}行目の支払日は1〜31にしてください` };
    if (!isDate(next)) return { ok: false, error: `${line}行目の次の支払日が正しくありません（YYYY-MM-DD）` };
    if (!(pay in PAY)) return { ok: false, error: `${line}行目の支払い方法「${pay}」は使えません` };
    // すでに同じ名前・金額の固定費があれば足さない（例：「家賃」と「家賃（全保連）」）
    if (current.recurring.some((r) => r.amount === amount && (r.name === name || name.startsWith(r.name)))) continue;
    recs.push({
      id: `mfrec_${fnv(`${name}|${amount}|${cyc}`)}`, name: name.slice(0, 100), amount, cycle: CYCLE[cyc], anchorDay: anchor, nextDueDate: next,
      categoryId: catId("expense", cat || "その他"), paymentMethod: PAY[pay], active: true, createdAt: nowIso, updatedAt: nowIso,
    });
  }
  incoming.recurring = recs;
  incoming.categories = categories;
  return { ok: true, kind, incoming, rows: recs.length, from: null, to: null, newCategories };
}
