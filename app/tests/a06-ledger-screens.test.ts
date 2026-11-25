import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { applyRefund } from "@/lib/refund";
import { validateAppData } from "@/lib/schema";
import { addDays, daysInMonth } from "@/lib/date";
// 新しい実装（共通台帳から作る）
import * as nAgg from "@/lib/aggregate";
import * as nPer from "@/lib/periods";
import * as nMb from "@/lib/monthBreakdown";
import * as nWr from "@/lib/weeklyReview";
import * as nRep from "@/lib/report";
import * as nFc from "@/lib/forecast";
import * as nRv from "@/lib/restoreView";
// 切り替える前の実装（HEAD 5830afe 時点の写し。比べるためだけに置く）
import * as oAgg from "./legacy/aggregate";
import * as oPer from "./legacy/periods";
import * as oMb from "./legacy/monthBreakdown";
import * as oWr from "./legacy/weeklyReview";
import * as oRep from "./legacy/report";
import * as oFc from "./legacy/forecast";
import * as oRv from "./legacy/restoreView";

// o11 A06：画面の金額を共通台帳（lib/ledgerCore.ts の countedEntries）から作るように切り替えた。
// 1) 切り替えの前と後で、すべての集計が同じ答えになること（200通りの合成データ・いろいろな日付）
// 2) 同じ条件の金額が、画面どうしで一致すること（日の合計＝月＝年の月＝期間＝週の区切り、生活費＋投資＝支出 など）
// 3) 手で決めた期待値（全額返金の記録はカテゴリ別にも件数にも出ない、など）
import { MONTHS, now, synth, tx } from "./fixtures/synth";

const TODAYS = ["2026-02-28", "2026-09-30", "2026-10-01", "2026-11-25", "2026-12-31", "2027-01-15"];

describe("A06：切り替えの前と後で、すべての集計が同じ答え（200通り）", () => {
  it("月・日・期間・週・年・月の内訳・週の見直し・振り返り・月末の見込み・復元の確認", () => {
    for (let s = 1; s <= 200; s++) {
      const d = synth(s);
      { const v = validateAppData(structuredClone(d)); expect(v.ok ? "" : JSON.stringify(v).slice(0, 300)).toBe(""); }
      const T = d.transactions;
      for (const mo of MONTHS) {
        expect(nAgg.summarizeMonth(T, mo)).toEqual(oAgg.summarizeMonth(T, mo));
        expect(nRep.weeklyBuckets(T, mo)).toEqual(oRep.weeklyBuckets(T, mo));
        expect(nRep.monthReport(d, mo)).toEqual(oRep.monthReport(d, mo));
        for (const day of [1, 15, 28, 29, 31]) expect(nRep.expenseUntilDay(T, mo, day)).toEqual(oRep.expenseUntilDay(T, mo, day));
        const dim = daysInMonth(Number(mo.slice(0, 4)), Number(mo.slice(5, 7)));
        for (let i = 1; i <= dim; i++) {
          const date = `${mo}-${String(i).padStart(2, "0")}`;
          expect(nAgg.daySummary(T, date)).toEqual(oAgg.daySummary(T, date));
        }
      }
      for (const today of TODAYS) {
        const mo = today.slice(0, 7);
        expect(nMb.monthBreakdown(d, mo, today)).toEqual(oMb.monthBreakdown(d, mo, today));
        const w = nPer.weekRange(today);
        expect(nPer.summarizePeriod(T, w.from, w.to)).toEqual(oPer.summarizePeriod(T, w.from, w.to));
        expect(nPer.dailyInWeek(T, w.from)).toEqual(oPer.dailyInWeek(T, w.from));
        expect(nPer.weeklyTrend(T, w.from)).toEqual(oPer.weeklyTrend(T, w.from));
        expect(nWr.weeklyReview(d, w.from, today)).toEqual(oWr.weeklyReview(d, w.from, today));
        expect(nRep.buildInsights(d, mo, today)).toEqual(oRep.buildInsights(d, mo, today));
        expect(nFc.forecastMonthEnd(d, today)).toEqual(oFc.forecastMonthEnd(d, today));
        expect(nFc.forecastCurve(d, today)).toEqual(oFc.forecastCurve(d, today));
      }
      for (const y of [2026, 2027]) {
        expect(nPer.monthlyInYear(T, y)).toEqual(oPer.monthlyInYear(T, y));
        const r = nPer.yearRange(y);
        expect(nPer.summarizePeriod(T, r.from, r.to)).toEqual(oPer.summarizePeriod(T, r.from, r.to));
      }
      expect(nRv.figures(d)).toEqual(oRv.figures(d));
    }
  });
});

describe("A06：同じ条件の金額は、画面どうしで一致する（200通り）", () => {
  it("日の合計＝月（カレンダーと履歴）＝年の各月＝期間＝週の区切り。生活費＋投資＝支出（ホームと振り返り）。全期間＝復元の確認", () => {
    for (let s = 1; s <= 200; s++) {
      const d = synth(s);
      const T = d.transactions;
      let allExp = 0;
      let allInc = 0;
      for (const mo of MONTHS) {
        const [y, m] = mo.split("-").map(Number);
        const dim = daysInMonth(y, m);
        const month = nAgg.summarizeMonth(T, mo);
        let de = 0;
        let di = 0;
        for (let i = 1; i <= dim; i++) {
          const ds = nAgg.daySummary(T, `${mo}-${String(i).padStart(2, "0")}`);
          de += ds.expense;
          di += ds.income;
        }
        expect([de, di]).toEqual([month.expense, month.income]); // カレンダーの日 → 月
        const yr = nPer.monthlyInYear(T, y)[m - 1];
        expect([yr.expense, yr.income]).toEqual([month.expense, month.income]); // 年の振り返りの月
        const per = nPer.summarizePeriod(T, `${mo}-01`, `${mo}-${String(dim).padStart(2, "0")}`);
        expect([per.expense, per.income]).toEqual([month.expense, month.income]); // 期間
        expect(nRep.weeklyBuckets(T, mo).reduce((a, b) => a + b.expense, 0)).toBe(month.expense); // 月の週の区切り
        expect(month.byCategory.reduce((a, c) => a + c.total, 0)).toBe(month.expense); // カテゴリ別の合計
        const mb = nMb.monthBreakdown(d, mo, "2026-11-25");
        expect(mb.lifeExpense + mb.invest).toBe(month.expense); // 生活費＋投資＝支出
        expect(mb.fixed + mb.variable).toBe(mb.lifeExpense);
        expect(mb.income).toBe(month.income);
        allExp += month.expense;
        allInc += month.income;
      }
      const f = nRv.figures(d);
      expect([f.expense, f.income]).toEqual([allExp, allInc]); // 復元の確認の合計＝各月の合計
      // 月末の見込みの「今月これまで」＝ 今日までの生活費（週の見直しと同じ数え方）
      const fc = nFc.forecastMonthEnd(d, "2026-11-25");
      if (fc.ok) {
        const w = nWr.weeklyReview(d, "2026-11-01", "2026-11-25"); // 月曜でなくても、期間の生活費として使える
        const life = nMb.monthBreakdown(d, "2026-11", "2026-11-25");
        expect(fc.spent).toBeLessThanOrEqual(life.lifeExpense);
        expect(w.spent).toBeLessThanOrEqual(fc.spent + 0); // 11/1〜11/7 は 11/1〜11/25 の一部
      }
    }
  });
});

describe("A06：手で決めた期待値", () => {
  const base = () => {
    const d = emptyData(now);
    d.categories.push({ id: "inv", name: "投資", kind: "expense", order: 99, archived: false });
    return d;
  };
  it("全額返金した買い物は、支出にも、カテゴリ別にも、件数（期間）にも出ない。返金の記録も収入に入らない", () => {
    let d = base();
    d.transactions = [tx({ id: "a", amount: 5000, categoryId: "exp-2" }), tx({ id: "b", amount: 1200, categoryId: "exp-1" })];
    const r = applyRefund(d, "a", 5000, "2026-11-12", "ra", now);
    if (!r.ok) throw new Error(r.error);
    d = r.next;
    const m = nAgg.summarizeMonth(d.transactions, "2026-11");
    expect(m.expense).toBe(1200);
    expect(m.income).toBe(0);
    expect(m.byCategory).toEqual([{ categoryId: "exp-1", total: 1200 }]);
    expect(m.count).toBe(3); // その月の記録の件数（返金の記録・全額返金の買い物も含む。履歴の件数と同じ）
    expect(nPer.summarizePeriod(d.transactions, "2026-11-01", "2026-11-30").count).toBe(1); // 収支に数える記録だけ
    expect(nAgg.daySummary(d.transactions, "2026-11-12")).toMatchObject({ expense: 0, income: 0 });
  });
  it("一部返金：10,000 のうち 3,000 返金 → 支出 7,000（買った日の月）。返金の日の月は 0", () => {
    let d = base();
    d.transactions = [tx({ id: "a", date: "2026-10-30", amount: 10000 })];
    const r = applyRefund(d, "a", 3000, "2026-11-02", "ra", now);
    if (!r.ok) throw new Error(r.error);
    d = r.next;
    expect(nAgg.summarizeMonth(d.transactions, "2026-10").expense).toBe(7000);
    expect(nAgg.summarizeMonth(d.transactions, "2026-11")).toMatchObject({ expense: 0, income: 0 });
    expect(nMb.monthBreakdown(d, "2026-10", "2026-11-25").variable).toBe(7000);
  });
  it("投資：カテゴリの名前・役割・記録ごとの上書きの順。生活費 1,000＋投資 50,000＋上書きで投資 2,000", () => {
    const d = base();
    d.transactions = [tx({ id: "a", amount: 1000 }), tx({ id: "b", amount: 50000, categoryId: "inv" }), tx({ id: "c", amount: 2000, countAs: "invest" })];
    const mb = nMb.monthBreakdown(d, "2026-11", "2026-11-25");
    expect([mb.lifeExpense, mb.invest]).toEqual([1000, 52000]);
    expect(nAgg.summarizeMonth(d.transactions, "2026-11").expense).toBe(53000);
  });
  it("旅行の画面・履歴の絞り込みの合計も、台帳の数え方（画面のコードが台帳を使っている）", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const read = (p: string) => fs.readFileSync(path.resolve(import.meta.dirname, "../src", p), "utf8");
    expect(read("app/trips/page.tsx")).toContain("sumEntries(txEntries(linkedTx)");
    expect(read("app/history/page.tsx")).toContain("sumEntries(txEntries(list)");
    // 画面と集計のコードに、台帳を通さない金額の足し算（収支に数えない記録の除き方の書き写し）が残っていない
    for (const p of ["lib/aggregate.ts", "lib/periods.ts", "lib/monthBreakdown.ts", "lib/weeklyReview.ts", "lib/report.ts", "lib/forecast.ts", "lib/restoreView.ts", "app/trips/page.tsx", "app/history/page.tsx"]) {
      const src = read(p);
      expect(src, p).not.toMatch(/isMoveOnly\(|countAs !== "transfer"|countAs === "transfer"/);
    }
  });
  it("日付の境界：うるう年でない2月の28日・年またぎの週", () => {
    const d = base();
    d.transactions = [tx({ id: "a", date: "2026-02-28", amount: 100 }), tx({ id: "b", date: "2026-12-31", amount: 200 }), tx({ id: "c", date: "2027-01-01", amount: 400 })];
    expect(nRep.expenseUntilDay(d.transactions, "2026-02", 31)).toBe(100);
    const w = nPer.weekRange("2026-12-31");
    expect(nPer.summarizePeriod(d.transactions, w.from, w.to).expense).toBe(600);
    expect(addDays(w.from, 6)).toBe(w.to);
  });
});
