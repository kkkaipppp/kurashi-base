import { addDays } from "./date";
import { emptyData } from "./defaults";
import { LocalStorageRepository } from "./repository";
import { STORAGE_KEY, type KV } from "./storage";
import type { AppData } from "./types";

/**
 * 練習用のデータ（To-Be 02 設定「練習用データ分離」。決定 Q34 ①。2026-11-28。自分用）。
 * - 練習は「保存しない」：保存の先を、閉じれば消えるメモリーに替える（いつもの保存の仕組みをそのまま使う。本当の記録の入れ物には触れない）
 * - 練習の印はこのタブのあいだだけ（sessionStorage）。閉じる・「練習をやめる」で本当の記録に戻る
 * - 練習の間は、記録から作る写し（ウィジェット・自動バックアップ・iPhone のカレンダー・通知）と、入力の書きかけの控えを書かない
 */
// 印のキーと読み方は1か所（practiceFlag.ts。点検 低-5）
import { PRACTICE_KEY, isPractice } from "./practiceFlag";
export { PRACTICE_KEY, isPractice };

export function setPractice(on: boolean): boolean {
  try {
    if (on) sessionStorage.setItem(PRACTICE_KEY, "1");
    else sessionStorage.removeItem(PRACTICE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** 練習を始める・やめるときは、保存の先を替えるので、ホームをまるごと読み直す（画面の中の移動では替わらない） */
export function reloadHome(): void {
  window.location.replace(new URL("/", window.location.href).href);
}

/** メモリーだけの保存の場所（閉じれば消える） */
export function memoryKV(): KV {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as KV;
}

/** 練習の見本（どの記録も架空。今日の前後に少しだけ） */
export function practiceData(today: string, nowIso: string = new Date().toISOString()): AppData {
  const d = emptyData(nowIso);
  const ts = nowIso;
  const tx = (id: string, date: string, amount: number, merchant: string, categoryId: string, type: "expense" | "income" = "expense") => ({ id, type, date, amount, currency: "JPY" as const, categoryId, merchant, paymentMethod: "", note: "", source: "manual" as const, createdAt: ts, updatedAt: ts });
  d.budget.monthly = 150000;
  d.transactions = [
    tx("pt-tx1", addDays(today, -2), 1280, "練習のスーパー", "exp-1"),
    tx("pt-tx2", addDays(today, -1), 650, "練習のカフェ", "exp-1"),
    tx("pt-tx3", today, 980, "練習のランチ", "exp-1"),
  ];
  d.events = [
    { id: "pt-ev1", title: "（練習）歯医者", startDate: addDays(today, 1), endDate: addDays(today, 1), allDay: false, startTime: "10:00", endTime: "11:00", note: "", createdAt: ts, updatedAt: ts },
    { id: "pt-ev2", title: "（練習）友達とごはん", startDate: addDays(today, 3), endDate: addDays(today, 3), allDay: false, startTime: "19:00", endTime: "21:00", note: "", createdAt: ts, updatedAt: ts },
  ];
  d.tasks = [{ id: "pt-t1", title: "（練習）住民票を取りに行く", due: addDays(today, 5), done: false, note: "", createdAt: ts, updatedAt: ts }];
  return d;
}

/** 練習用の保存の先：見本を入れたメモリー（いつもの保存の仕組み LocalStorageRepository に、メモリーを渡す） */
export function practiceRepository(today: string): LocalStorageRepository {
  const kv = memoryKV();
  kv.setItem(STORAGE_KEY, JSON.stringify(practiceData(today)));
  return new LocalStorageRepository(kv);
}
