// アプリの今のバックアップ（current）をもとに、2026-01-01〜2026-11-23 をマネフォの明細に入れ替えたバックアップを作る。
// 外すもの：前の別アプリの取り込み（imp20261123_*）のうちこの期間の分、カード明細の取り込み（card20261123_*）の全部。
// 残すもの：それ以外のすべて（2025年の記録・期間の後の記録・手で入れた記録・予定・NISA・設定）。
// 足すもの：マネフォの明細（ID は元IDから作る＝同じ CSV を2回使っても同じ ID）、固定費（同じ名前・金額がすでにあれば足さない）。
// 使い方：node mf_replace.mjs <current.json> <mf_transactions.csv> <mf_recurring.csv> <出力.json>
import { readFileSync, writeFileSync } from "node:fs";

const [, , curPath, txPath, recPath, outPath] = process.argv;
const FROM = "2026-01-01", TO = "2026-11-23";
const now = new Date().toISOString();

function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some((x) => x !== "")) rows.push(row); row = []; }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); if (row.some((x) => x !== "")) rows.push(row); }
  return rows;
}
const readCsv = (p, header) => {
  const rows = parseCsv(readFileSync(p, "utf8").replace(/^﻿/, ""));
  const h = rows.shift().join(",");
  if (h !== header) throw new Error(`見出しが違う: ${p}: ${h}`);
  return rows;
};
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, "0"); };
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

const cur = JSON.parse(readFileSync(curPath, "utf8"));
const data = cur.data;

// カテゴリ：名前と種類で今のものを使う。なければ新しく作る
const kindOf = { 支出: "expense", 収入: "income" };
let newCats = 0;
const catId = (kind, name) => {
  const hit = data.categories.find((c) => c.kind === kind && c.name === name);
  if (hit) { if (hit.archived) hit.archived = false; return hit.id; }
  const id = `mf-${kind === "expense" ? "exp" : "inc"}-${fnv(kind + name)}`;
  data.categories.push({ id, name, kind, order: data.categories.filter((c) => c.kind === kind).length, archived: false });
  newCats++;
  return id;
};
const PAY = { 現金: "cash", クレジットカード: "card", QRコード決済: "qr", 電子マネー: "emoney", "口座振替・振込": "bank", その他: "other", "": "" };

// 1. 外す
const before = data.transactions.length;
const removed = { imp: 0, card: 0 };
data.transactions = data.transactions.filter((t) => {
  if (t.id.startsWith("card20261123_")) { removed.card++; return false; }
  if (t.id.startsWith("imp20261123_") && t.date >= FROM && t.date <= TO) { removed.imp++; return false; }
  return true;
});

// 2. 足す（明細）
const txRows = readCsv(txPath, "日付,種類,金額,カテゴリ,内容,支払い方法,メモ,元ID");
const ids = new Set(data.transactions.map((t) => t.id));
const sameCount = new Map();
let added = 0;
txRows.forEach((r, i) => {
  const [date, kindJa, amt, cat, content, pay, memo, srcId] = r;
  const kind = kindOf[kindJa];
  const amount = Number(amt);
  if (!isDate(date) || !kind || !Number.isInteger(amount) || amount <= 0 || !cat) throw new Error(`${i + 2}行目が正しくない: ${r.join(",")}`);
  if (!(pay in PAY)) throw new Error(`${i + 2}行目の支払い方法: ${pay}`);
  // app/src/lib/csvImport.ts と同じ作り方（元ID がない行は、中身が同じ行の中で何番目か）
  let id;
  if (srcId) id = `mf_${fnv(srcId)}_${fnv(date + srcId)}`;
  else {
    const k = `${date}|${kindJa}|${amt}|${content}|${cat}`;
    const n = (sameCount.get(k) ?? 0) + 1;
    sameCount.set(k, n);
    id = `mfn_${fnv(k)}_${fnv(`${k}#${n}`)}`;
  }
  if (ids.has(id)) throw new Error(`ID が重なった: ${i + 2}行目`);
  ids.add(id);
  data.transactions.push({
    id, type: kind, date, amount, currency: "JPY", categoryId: catId(kind, cat), merchant: content.trim(),
    paymentMethod: PAY[pay], note: memo.trim(), source: "manual", createdAt: now, updatedAt: now,
  });
  added++;
});

// 3. 足す（固定費）
const CYCLE = { 毎月: "monthly", 毎年: "yearly", 毎週: "weekly" };
const recRows = readCsv(recPath, "名前,金額,周期,支払日,次の支払日,カテゴリ,支払い方法");
let recAdded = 0; const recSkipped = [];
for (const [name, amt, cyc, day, next, cat, pay] of recRows) {
  const amount = Number(amt);
  if (!CYCLE[cyc] || !isDate(next) || !Number.isInteger(amount) || amount <= 0) throw new Error(`固定費が正しくない: ${name}`);
  if (data.recurring.some((x) => x.amount === amount && (x.name === name || name.startsWith(x.name)))) { recSkipped.push(name); continue; }
  data.recurring.push({
    id: `mfrec_${fnv(`${name}|${amount}|${cyc}`)}`, name, amount, cycle: CYCLE[cyc], anchorDay: cyc === "毎週" ? 1 : Number(day),
    nextDueDate: next, categoryId: catId("expense", cat), paymentMethod: PAY[pay] ?? "", active: true, createdAt: now, updatedAt: now,
  });
  recAdded++;
}

// バックアップの形で書く（lib/backup.ts の buildBackup と同じ形）
const COLL = ["notes", "tasks", "assets", "contracts", "health", "documents", "studySubjects", "studyLogs", "goals"];
const counts = { transactions: data.transactions.length, events: data.events.length, recurring: data.recurring.length, categories: data.categories.length, trips: (data.trips ?? []).length, nisa: data.nisa.length };
for (const k of COLL) counts[k] = (data[k] ?? []).length;
const out = { format: cur.format, schemaVersion: data.schemaVersion, exportedAt: now, counts: { ...cur.counts, ...counts }, checksum: fnv(JSON.stringify(data)), data };
writeFileSync(outPath, JSON.stringify(out));

const sum = (f) => data.transactions.filter(f).reduce((s, t) => s + t.amount, 0);
console.log(JSON.stringify({ before, removed, added, after: data.transactions.length, newCats, recAdded, recSkipped,
  y2026: { expense: sum((t) => t.type === "expense" && t.date >= FROM && t.date <= TO), income: sum((t) => t.type === "income" && t.date >= FROM && t.date <= TO) },
  nisa: data.nisa.length, events: data.events.length }, null, 1));
