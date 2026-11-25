import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { monthLedger } from "@/lib/ledger";
import { forecastMonthEnd, forecastCurve } from "@/lib/forecast";
import { dataHealth } from "@/lib/dataHealth";
import { suggestions } from "@/lib/suggestions";
import { buildReminders, DEFAULT_REMINDERS } from "@/lib/reminders";
import { inboxGroups } from "@/lib/inbox";
import { validateAppData } from "@/lib/schema";
import { weeklyReview } from "@/lib/weeklyReview";
import { addDays } from "@/lib/date";
import type { AppData, Transaction } from "@/lib/types";

// NEXT v21 Q11：10年相当の合成データ（支出 約 1.5万件（1日4件×10年。かなり多い使い方）・予定 約 3千件）で、主な計算が、遅すぎないこと。
// 上限は、遅い端末でも余裕のある、ゆるい値（手元の PC の数倍〜10倍以上）。測った時間は、結果の欄に出る
const now = "2026-11-25T00:00:00.000Z";
const today = "2026-11-25";

const big = (): AppData => {
  const d = emptyData(now);
  d.budget.monthly = 150000;
  const txs: Transaction[] = [];
  let n = 0;
  for (let i = 0; i < 3650; i++) {
    const date = addDays(today, -i);
    for (let k = 0; k < 4; k++) {
      txs.push({ id: `t${n++}`, type: "expense", date, amount: 300 + ((i * 7 + k * 13) % 5000), currency: "JPY", categoryId: k % 6 === 0 ? "exp-9" : "exp-1", merchant: `店${(i + k) % 200}`, paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now });
    }
  }
  d.transactions = txs;
  d.events = Array.from({ length: 3000 }, (_, i) => ({ id: `e${i}`, title: `予定${i}`, startDate: addDays(today, -(i % 3650) + 30), endDate: addDays(today, -(i % 3650) + 30), allDay: false, startTime: "10:00", endTime: "11:00", note: "", createdAt: now, updatedAt: now }));
  d.recurring = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, name: `固定費${i}`, amount: 1000 + i * 100, cycle: "monthly" as const, anchorDay: 1 + (i % 28), nextDueDate: addDays(today, i % 20), categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now }));
  return d;
};

const time = (f: () => unknown): number => {
  const t0 = performance.now();
  f();
  return performance.now() - t0;
};

describe("10年相当のデータ（性能）", () => {
  const d = big();
  const LIMIT = 1500; // ミリ秒。どれも1回の計算の上限（遅い端末でも、操作が止まらない目安。実測は数十ミリ秒以下の見込み）
  it("データの検査（読み込み時）", () => {
    const ms = time(() => expect(validateAppData(d).ok).toBe(true));
    console.log(`validateAppData: ${ms.toFixed(0)}ms`);
    expect(ms).toBeLessThan(3000);
  });
  it.each([
    ["今月の家計（ホーム）", () => monthLedger(d, today.slice(0, 7), today)],
    ["月末の見込み", () => forecastMonthEnd(d, today)],
    ["見込みのグラフ", () => forecastCurve(d, today)],
    ["データの点検", () => dataHealth(d, today)],
    ["提案", () => suggestions(d, today, { inbox: true })],
    ["通知の作り直し", () => buildReminders(d, "2026-11-25T09:00:00", { ...DEFAULT_REMINDERS, on: true })],
    ["未整理の記録", () => inboxGroups(d)],
    ["週の見直し", () => weeklyReview(d, addDays(today, -6), today)],
  ])("%s", (_name, f) => {
    const ms = time(f as () => unknown);
    console.log(`${_name}: ${ms.toFixed(0)}ms`);
    expect(ms).toBeLessThan(LIMIT);
  });
  it("データの大きさ（JSON）が、保存の上限の目安に収まる（localStorage は、おおよそ 5MB）", () => {
    const mb = new Blob([JSON.stringify(d)]).size / 1024 / 1024;
    console.log(`JSON: ${mb.toFixed(1)}MB`);
    // 10年相当の合成データが 5MB を超えるなら、保存の方式（容量）の見直しが要る。超えたら、その事実を結果に出す（失敗にして気づく）
    expect(mb).toBeLessThan(5);
  });
});

describe("保存容量のピーク（v22 G0：通常・取り消し用の控え・復元）", () => {
  it("取り消し用の控えを書く操作（復元・置き換え）の最大の使用量は、データの約3倍。5MB（約500万字）に収まるデータの目安を出す", () => {
    const sample = (n: number): AppData => {
      const x = big();
      x.transactions = x.transactions.slice(0, n);
      return x;
    };
    const chars = (data: AppData) => JSON.stringify(data).length;
    const N = 3000;
    const d3 = sample(N);
    const one = chars(d3);
    const wrapped = JSON.stringify({ savedAt: now, reason: "復元", raw: JSON.stringify(d3) }).length;
    const peak = one + wrapped + one; // 今のデータ ＋ 控え（文字列の中に入れるので、引用符が増える） ＋ 新しいデータ
    const base = chars(sample(0)); // 取引以外の分（予定3千件・固定費など）
    const perTx = (one - base) / N;
    const LIMIT = 5_000_000;
    const maxNormal = Math.floor((LIMIT - base) / perTx);
    const maxUndo = Math.floor((LIMIT - (base * 3 + 0.1 * base)) / (perTx * 3.1));
    console.log(`1件あたり ${perTx.toFixed(0)} 字／通常の保存で入る取引 約${maxNormal}件／控えを書く操作（復元・置き換え）で入る取引 約${maxUndo}件（予定3千件を含む計算）／ピーク倍率 ${(peak / one).toFixed(2)}倍`);
    // 控えを書く操作のピークは、データの 3 倍を超える（控えの引用符の分）。倍率が増えていたら気づけるようにしておく
    expect(peak / one).toBeGreaterThan(2.9);
    expect(peak / one).toBeLessThan(3.4);
    expect(maxUndo).toBeGreaterThan(1500); // 実際の使い方（数千件）では、まだ入る
  });
});
