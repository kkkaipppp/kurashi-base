import { daysBetween } from "./date";
import type { Transaction, TxType } from "./types";

// 重複「候補」の検出。警告のみで、自動削除・自動統合はしない。

export interface DupCandidate {
  tx: Transaction;
  reason: string;
  strength: "exact" | "similar";
}

export function normalizeMerchant(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s・\-ー_.,、。()（）「」]/g, "")
    .replace(/(株式会社|有限会社|\(株\)|㈱)/g, "");
}

export interface DupInput {
  type: TxType;
  date: string;
  amount: number;
  merchant: string;
  paymentMethod: string;
  sourceFingerprint?: string;
  excludeId?: string; // 編集中の自分自身は除外
  /** 立替の総額（amount は自分の分）。総額でも比べる（To-Be 2026-11-28 点検 中1） */
  advanceGross?: number;
}

export function findDuplicates(input: DupInput, txs: Transaction[]): DupCandidate[] {
  const out: DupCandidate[] = [];
  const nm = normalizeMerchant(input.merchant);
  for (const t of txs) {
    if (t.id === input.excludeId) continue;
    if (input.sourceFingerprint && t.sourceFingerprint === input.sourceFingerprint) {
      out.push({ tx: t, reason: "同じ画像から追加した記録があります", strength: "exact" });
      continue;
    }
    // 立替は金額が自分の分なので、払った総額でも比べる（カード明細の総額と、立替の記録を見比べられるように）
    const sameAmount = t.amount === input.amount || (t.advanceGross ?? t.amount) === (input.advanceGross ?? input.amount);
    if (t.type !== input.type || !sameAmount) continue;
    const gap = Math.abs(daysBetween(t.date, input.date));
    if (gap > 1) continue;
    // 金額一致＋日付近接に加え、店名か決済手段のどちらかが一致したときだけ候補にする
    const tm = normalizeMerchant(t.merchant);
    const merchantMatch = nm !== "" && tm !== "" && (nm === tm || nm.includes(tm) || tm.includes(nm));
    const bothBlank = nm === "" && tm === "";
    const payMatch = input.paymentMethod !== "" && input.paymentMethod === t.paymentMethod;
    if (merchantMatch || (bothBlank && (payMatch || gap === 0))) {
      out.push({
        tx: t,
        reason: merchantMatch ? "同じ金額・近い日付・同じ店名の記録があります" : "同じ金額・近い日付の記録があります",
        strength: "similar",
      });
    }
  }
  return out;
}

/** 画像の指紋（SHA-256）。ブラウザ内で計算し外部送信しない */
export async function fingerprintBytes(buf: ArrayBuffer): Promise<string> {
  // crypto.subtle は安全な接続（https / localhost）でしか使えない。LAN の http で開いた実機では代替ハッシュを使う
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return fallbackFingerprint(new Uint8Array(buf));
}

/** 重複確認用の代替指紋（FNV-1a 32bit を2系統＋バイト長）。暗号強度は不要な用途 */
export function fallbackFingerprint(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ bytes.length;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 0x01000193);
    h2 = Math.imul(h2 ^ bytes[bytes.length - 1 - i], 0x01000193);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return `fnv:${hex(h1)}${hex(h2)}:${bytes.length}`;
}
