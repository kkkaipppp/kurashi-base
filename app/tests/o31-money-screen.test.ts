import { describe, expect, it } from "vitest";
import { perfData } from "@/lib/perfData";
import { monthLedger } from "@/lib/ledger";
import { monthReport } from "@/lib/report";
import { daySummary, txInMonth } from "@/lib/aggregate";
import { emptyData } from "@/lib/defaults";
import { addMonthsToKey } from "@/lib/date";

// o31 D011（T011）：自分用の家計簿の上の数字（MoneySummary＝monthLedger）と、集計・カレンダー（monthReport・daySummary）の金額が一致する。
// 合成データ（カードの引き落とし・返金・投資・移動を含む。lib/perfData.ts）の24か月で、版の両方の数え方を確かめる
describe("o31 T011 家計簿の数字が画面どうしで一致する", () => {
  const d = perfData(2);
  const months = Array.from({ length: 24 }, (_, i) => addMonthsToKey("2026-11", -i));
  it("支出・収入：家計簿の上（生活費＋投資）＝ 集計の月 ＝ 日ごとの合計（公開版と自分用の両方）", () => {
    for (const m of months) {
      for (const excludeInvest of [false, true]) {
        const l = monthLedger(d, m, "2026-11-25", excludeInvest);
        const r = monthReport(d, m);
        expect(l.lifeExpense + l.investMove, `${m} 支出`).toBe(r.expense);
        expect(l.income, `${m} 収入`).toBe(r.income);
      }
      const days = [...new Set(txInMonth(d.transactions, m).map((t) => t.date))];
      const sumDays = days.reduce((s, day) => s + daySummary(d.transactions, day).expense, 0);
      expect(sumDays, `${m} 日ごと`).toBe(monthReport(d, m).expense);
    }
  });
  it("予算が無い月は null（0 と出さない。o29 T007・o31 07）", () => {
    const e = emptyData("2026-11-25T00:00:00.000Z");
    expect(monthLedger(e, "2026-11", "2026-11-25").lifeBudgetLeft).toBeNull();
  });
});
