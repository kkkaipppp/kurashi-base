import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { BUDGET_EXCLUDES_INVEST } from "@/lib/ledgerCore";
import { forecastMonthEnd, forecastCurve } from "@/lib/forecast";
import { budgetSpent, monthLedger } from "@/lib/ledger";
import { assessPurchase } from "@/lib/decision";
import { buildInsights } from "@/lib/report";
import { weeklyReview } from "@/lib/weeklyReview";
import type { AppData, Transaction } from "@/lib/types";

// 2026-11-26 平尾さん「全部おすすめで」（朝の報告の 4）：公開版の予算の比べ方を「すべての支出」にそろえる。
// 期待値は手で計算した（実装から作っていない）。
const now = "2026-11-25T00:00:00.000Z";
const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({ type: "expense", date: "2026-11-01", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now, ...o });

// 予算 100,000。変動費 1,000 円 × 4日（11/1〜11/4）、投資 100,000（11/5）。固定費：スマホ 8,000・積立 30,000（どちらも 11/28、未払い）。今日 11/25
const data = (): AppData => {
  const d = emptyData(now);
  d.categories.push({ id: "inv", name: "証券", kind: "expense", order: 99, archived: false, role: "invest" });
  d.budget.monthly = 100000;
  d.recurring = [
    { id: "r1", name: "スマホ", amount: 8000, cycle: "monthly", anchorDay: 28, nextDueDate: "2026-11-28", categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now },
    { id: "r2", name: "積立", amount: 30000, cycle: "monthly", anchorDay: 28, nextDueDate: "2026-11-28", categoryId: "inv", paymentMethod: "", active: true, createdAt: now, updatedAt: now },
  ];
  d.transactions = [...Array.from({ length: 4 }, (_, i) => tx({ id: `v${i}`, date: `2026-11-0${i + 1}` })), tx({ id: "inv", categoryId: "inv", amount: 100000, date: "2026-11-05" })];
  return d;
};
const today = "2026-11-25";

describe("公開版の予算の比べ方：すべての支出", () => {
  it("公開版の組み立て（試験の既定）では、投資を除かない", () => {
    expect(BUDGET_EXCLUDES_INVEST).toBe(false);
  });
  it("予算の使った額：すべての支出 104,000（変動費 4,000 ＋ 投資 100,000）。ホームの monthLedger と、振り返り・ナビ・ウィジェットの budgetSpent が同じ", () => {
    const d = data();
    expect(budgetSpent(d, "2026-11", today)).toBe(104000);
    const l = monthLedger(d, "2026-11", today);
    expect(l.spent).toBe(104000);
    expect(l.lifeBudgetLeft).toBe(-4000); // 100,000 − 104,000
    expect(l.unpaidFixed).toBe(38000); // スマホ 8,000 ＋ 積立 30,000
    expect(l.freeLeft).toBe(-42000); // 100,000 − 104,000 − 38,000
    expect(l.perDay).toBe(0);
  });
  it("月末の見込み：104,000 ＋ 固定費 38,000 ＋ 1日 4,333（104,000 ÷ 24日。11/1〜11/24）× 残り5日 ＝ 163,665", () => {
    const f = forecastMonthEnd(data(), today);
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    expect([f.spent, f.unpaidFixed, f.basisDays, f.dailyVariable, f.daysAhead, f.projected, f.vsBudget]).toEqual([104000, 38000, 24, 4333, 5, 163665, -63665]);
    const c = forecastCurve(data(), today)!;
    expect(c.actual[c.actual.length - 1]).toBe(104000); // 実線の終わり＝今月これまで
    expect(c.projected[c.projected.length - 1]).toBe(163665); // 破線の終わり＝月末の見込み
  });
  it("自分用の数え方（投資を除く）は、今までどおり：4,000 ＋ 8,000 ＋ 166 × 5 ＝ 12,830", () => {
    const f = forecastMonthEnd(data(), today, undefined, true);
    expect(f.ok && [f.spent, f.unpaidFixed, f.dailyVariable, f.projected]).toEqual([4000, 8000, 166, 12830]);
    expect(monthLedger(data(), "2026-11", today, true).spent).toBe(4000);
  });
  it("振り返りの一文「月末の見込み」は、見込みと同じ数字（100円単位）", () => {
    expect(buildInsights(data(), "2026-11", today).find((i) => i.key === "pace")?.text).toBe("月末の見込み：約¥163,700（予算 ¥100,000）");
  });
  it("買い物の判断：自由に使える残りと来月の固定費も、すべての支出（積立も入れる）", () => {
    const a = assessPurchase(data(), 10000, today);
    expect(a.freeLeft).toEqual({ before: -42000, after: -52000 });
    expect(a.projected).toEqual({ before: 163665, after: 173665 });
    expect(a.nextMonth.fixed).toBe(38000);
  });
  it("週の見直し：公開版は投資も「使ったお金」に入れる", () => {
    const d = data();
    // 11/2（月）〜11/8 の週：変動費 3,000（11/2〜11/4）＋ 投資 100,000
    expect(weeklyReview(d, "2026-11-02", "2026-11-08", false).spent).toBe(103000);
    expect(weeklyReview(d, "2026-11-02", "2026-11-08").spent).toBe(103000); // 既定（引数なし）は版の数え方（公開版はすべての支出）
    expect(weeklyReview(d, "2026-11-02", "2026-11-08", true).spent).toBe(3000); // 自分用の数え方
  });
  it("画面：公開版では「投資を除く」「生活と投資（この年）」を出さない", () => {
    expect(src("components/ForecastCard.tsx")).toContain('LIFE ? "（投資を除く・見込み）" : "（見込み）"');
    expect(src("components/WeeklyReviewCard.tsx")).toContain("weeklyReview(data, from, today, BUDGET_EXCLUDES_INVEST)");
    expect(src("components/PeriodReport.tsx")).toContain("const yb = !BUDGET_EXCLUDES_INVEST ? null :");
    expect(src("lib/report.ts")).not.toContain("IS_PERSONAL");
  });
});
