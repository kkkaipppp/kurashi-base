import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { daysInMonth } from "@/lib/date";
import type { AppData, Transaction } from "@/lib/types";
import * as nAgg from "@/lib/aggregate";
import * as nMb from "@/lib/monthBreakdown";
import * as nWr from "@/lib/weeklyReview";
import * as nFc from "@/lib/forecast";
import * as oAgg from "./legacy/aggregate";
import * as oMb from "./legacy/monthBreakdown";
import * as oWr from "./legacy/weeklyReview";
import * as oFc from "./legacy/forecast";

// o11 A06（独立点検 中1）：1.5万件（10年相当）で、台帳から作る集計が、切り替える前より大きく遅くならないこと。
// 時間は機械で変わるので、同じ機械で前の実装と並べて比べる（中央値）。答えが同じことも確かめる
const now = "2026-11-25T00:00:00.000Z";
function big(): AppData {
  const d = emptyData(now);
  d.categories.push({ id: "inv", name: "投資", kind: "expense", order: 99, archived: false });
  d.recurring = Array.from({ length: 30 }, (_, i) => ({ id: `rc${i}`, name: `固定${i}`, amount: 1000 + i * 100, cycle: "monthly" as const, anchorDay: 1 + (i % 28), nextDueDate: `2026-12-${String(1 + (i % 28)).padStart(2, "0")}`, categoryId: i < 20 ? "exp-1" : `exp-${1 + (i % 5)}`, paymentMethod: "", active: i % 3 !== 0, createdAt: now, updatedAt: now }));
  const txs: Transaction[] = [];
  let seed = 7;
  const r = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 15000; i++) {
    const y = 2017 + Math.floor(r() * 10);
    const mo = 1 + Math.floor(r() * 12);
    const day = 1 + Math.floor(r() * daysInMonth(y, mo));
    const date = `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const k = r();
    txs.push({ id: `t${i}`, type: k < 0.1 ? "income" : "expense", date, amount: 100 + Math.floor(r() * 30000), currency: "JPY", categoryId: k < 0.1 ? "inc-1" : k < 0.15 ? "inv" : `exp-${1 + Math.floor(r() * 5)}`, merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now, ...(k > 0.97 ? { countAs: "transfer" as const } : {}) });
  }
  d.transactions = txs;
  return d;
}
/** 新と旧を交互に測って、それぞれの中央値（一時的な負荷が片方だけに重ならないように） */
const medians = (fa: () => unknown, fb: () => unknown, n = 21): [number, number] => {
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < n; i++) {
    for (const [f, ts] of i % 2 ? ([[fb, b], [fa, a]] as const) : ([[fa, a], [fb, b]] as const)) {
      const t0 = performance.now();
      f();
      ts.push(performance.now() - t0);
    }
  }
  const mid = (ts: number[]) => ts.sort((x, y) => x - y)[Math.floor(ts.length / 2)];
  return [mid(a), mid(b)];
};

describe("A06：1.5万件での速さ（前の実装と並べて）", () => {
  const d = big();
  const today = "2026-11-25";
  const cases: [string, () => unknown, () => unknown][] = [
    // 2026-11-28 から特別支出（special）を足した。前の実装には無いので外して比べる
    ["月の内訳", () => ({ ...nMb.monthBreakdown(d, "2026-11", today), special: undefined }), () => oMb.monthBreakdown(d, "2026-11", today)],
    ["年の画面（月の内訳×12）", () => { for (let i = 1; i <= 12; i++) nMb.monthBreakdown(d, `2026-${String(i).padStart(2, "0")}`, today); }, () => { for (let i = 1; i <= 12; i++) oMb.monthBreakdown(d, `2026-${String(i).padStart(2, "0")}`, today); }],
    ["週の見直し", () => nWr.weeklyReview(d, "2026-11-23", today), () => oWr.weeklyReview(d, "2026-11-23", today)],
    ["月末の見込みのグラフ", () => nFc.forecastCurve(d, today), () => oFc.forecastCurve(d, today)],
    ["カレンダー30日分", () => { for (let i = 1; i <= 30; i++) nAgg.daySummary(d.transactions, `2026-11-${String(i).padStart(2, "0")}`); }, () => { for (let i = 1; i <= 30; i++) oAgg.daySummary(d.transactions, `2026-11-${String(i).padStart(2, "0")}`); }],
  ];
  for (const [name, fNew, fOld] of cases) {
    it(`${name}：答えが同じで、前の実装の1.5倍＋2ms以内`, () => {
      expect(fNew()).toEqual(fOld());
      medians(fNew, fOld, 5); // 温める
      const [tn, to] = medians(fNew, fOld);
      console.log(`[A06 速さ] ${name}：新 ${tn.toFixed(2)}ms・旧 ${to.toFixed(2)}ms`);
      expect(tn).toBeLessThanOrEqual(to * 1.5 + 2);
    }, 60_000); // 1.5万件を何回も測るので、全体を同時に動かすときの待ち時間を広げる
  }
});
