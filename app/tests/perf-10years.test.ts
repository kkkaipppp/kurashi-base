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
