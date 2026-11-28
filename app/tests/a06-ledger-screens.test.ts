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
import { countedEntries, isLifeExpense, ledgerEntries, ledgerEvents, sumEntries, txEntries } from "@/lib/ledgerCore";
import { isMoveOnly } from "@/lib/classify";
import type { Transaction } from "@/lib/types";
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

const TODAYS = ["2026-02-28", "2026-09-30", "2026-10-01", "2026-11-25", "2026-12-31", "2027-01-15", "2028-02-29"];

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
        // 2026-11-28 から special（特別支出）を足した。前の実装には無い（この合成データには特別支出が無いので 0）
        const nb = nMb.monthBreakdown(d, mo, today);
        expect(nb.special).toBe(0);
        expect({ ...nb, special: undefined }).toEqual(oMb.monthBreakdown(d, mo, today));
        const w = nPer.weekRange(today);
        expect(nPer.summarizePeriod(T, w.from, w.to)).toEqual(oPer.summarizePeriod(T, w.from, w.to));
        expect(nPer.dailyInWeek(T, w.from)).toEqual(oPer.dailyInWeek(T, w.from));
        expect(nPer.weeklyTrend(T, w.from)).toEqual(oPer.weeklyTrend(T, w.from));
        expect(nWr.weeklyReview(d, w.from, today, true)).toEqual(oWr.weeklyReview(d, w.from, today)); // 旧実装は投資を除く数え方
        // 「月末の見込み」の一文は 2026-11-26 に公開版も月末の見込みの計算にそろえた（旧実装は公開版で単純なペース）ので、比べるのはそれ以外
        const noPace = (xs: { key: string }[]) => xs.filter((x) => x.key !== "pace");
        expect(noPace(nRep.buildInsights(d, mo, today))).toEqual(noPace(oRep.buildInsights(d, mo, today)));
        // 旧実装は投資を除く数え方だけ（公開版の「すべての支出」は tests/budget-basis-public.test.ts）
        expect(nFc.forecastMonthEnd(d, today, undefined, true)).toEqual(oFc.forecastMonthEnd(d, today));
        expect(nFc.forecastCurve(d, today, true)).toEqual(oFc.forecastCurve(d, today));
      }
      for (const y of [2026, 2027, 2028]) {
        expect(nPer.monthlyInYear(T, y)).toEqual(oPer.monthlyInYear(T, y));
        const r = nPer.yearRange(y);
        expect(nPer.summarizePeriod(T, r.from, r.to)).toEqual(oPer.summarizePeriod(T, r.from, r.to));
      }
      expect(nRv.figures(d)).toEqual(oRv.figures(d));
    }
  }, 60_000); // 200通りは重いので、全部を同時に動かすときの待ち時間を広げる
});

describe("A06：速く作る ledgerEntries は、出来事から作るものと同じ", () => {
  it("200通りで countedEntries(ledgerEvents(d)) と一致（固定費・投資の分け方も）", () => {
    for (let s = 1; s <= 200; s++) {
      const d = synth(s);
      expect(ledgerEntries(d)).toEqual(countedEntries(ledgerEvents(d)));
    }
  }, 60_000); // 200通りは重いので、全部を同時に動かすときの待ち時間を広げる
});

describe("A06：旅行の合計・履歴の絞り込みの合計（画面の中の計算）", () => {
  // 切り替える前の画面の式（旅行：t.type === "expense" && t.countAs !== "transfer"、履歴：支出と収入の両方）
  const oldTrip = (list: Transaction[]) => list.reduce((s, t) => s + (t.type === "expense" && t.countAs !== "transfer" ? t.amount : 0), 0);
  const oldHist = (list: Transaction[]) => [list.filter((t) => t.type === "expense" && t.countAs !== "transfer").reduce((a, t) => a + t.amount, 0), list.filter((t) => t.type === "income" && t.countAs !== "transfer").reduce((a, t) => a + t.amount, 0)];
  it("200通り・いろいろな絞り込みで、前の式と同じ答え", () => {
    for (let s = 1; s <= 200; s++) {
      const d = synth(s);
      const lists = [d.transactions, d.transactions.filter((t) => t.type === "expense"), d.transactions.filter((t) => t.paymentMethod === "card"), d.transactions.filter((t) => t.categoryId === "exp-1"), d.transactions.filter((_, i) => i % 3 === 0)];
      for (const list of lists) {
        const n = sumEntries(txEntries(list), () => true);
        expect(n.expense).toBe(oldTrip(list));
        expect([n.expense, n.income]).toEqual(oldHist(list));
        expect(n.expense).toBe(list.filter((t) => t.type === "expense" && !isMoveOnly(t)).reduce((a, t) => a + t.amount, 0));
      }
    }
  }, 60_000); // 200通りは重いので、全部を同時に動かすときの待ち時間を広げる
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
      // 月末の日には、月末の見込みの「今月これまで」＝ その月の生活費（振り返りの月の内訳と同じ）
      for (const mo of MONTHS) {
        const [y, m] = mo.split("-").map(Number);
        const end = `${mo}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
        const fc = nFc.forecastMonthEnd(d, end, undefined, true);
        if (fc.ok) expect(fc.spent).toBe(nMb.monthBreakdown(d, mo, end).lifeExpense);
        // 月末のグラフの実線の終わり＝今月これまで
        const curve = nFc.forecastCurve(d, end, true);
        if (curve && fc.ok) expect(curve.actual[curve.actual.length - 1]).toBe(fc.spent);
      }
      // 週の見直しの「今週これまで」＝ その週の毎日の支出から投資を除いたもの（日曜を今日として）
      const wk = nPer.weekRange("2026-11-25");
      const w = nWr.weeklyReview(d, wk.from, wk.to, true);
      const lifeOfWeek = ledgerEntries(d).filter((e) => isLifeExpense(e) && e.date >= wk.from && e.date <= wk.to).reduce((a, e) => a + e.amount, 0);
      expect(w.spent).toBe(lifeOfWeek);
      const invOfWeek = ledgerEntries(d).filter((e) => e.kind === "expense" && e.invest && e.date >= wk.from && e.date <= wk.to).reduce((a, e) => a + e.amount, 0);
      expect(w.spent + invOfWeek).toBe(nPer.summarizePeriod(T, wk.from, wk.to).expense);
    }
  }, 60_000); // 200通りは重いので、全部を同時に動かすときの待ち時間を広げる
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
  it("見張り：app/src 全体で、記録の金額を足す書き方は、決めたファイルだけ（新しく増えたら、台帳を通すか、ここに理由つきで足す）", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(import.meta.dirname, "../src");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) files.push(path.relative(root, p).split(path.sep).join("/"));
      }
    };
    walk(root);
    // 金額を足す書き方（行ごと）：「amount」と「reduce( / += / ␣+␣ / .map(」が同じ行にある（独立点検の再点検 中1：
    //   s + (… ? t.amount : 0)・t.amount + s・(s, { amount }) => s + amount・s + t["amount"]・a + t?.amount・sum(txs.map((t) => t.amount)) も拾う）
    const LINE = /(reduce\(|\+=|\s\+\s|\.map\().*\bamount\b|\bamount\b.*(\s\+\s|\+=)/;
    // 決めたファイルと、その中の行数。増えたら落ちる（決めたファイルの中に、台帳を通さない足し算を新しく書いても見つかる）。
    // 減ったときも落ちるので、そのときはここの数を直す（直したことが見える）
    const ALLOWED: Record<string, [number, string]> = {
      "lib/perfData.ts": [4, "性能を測る合成データを作るだけ（記録の金額は足さない。A08）"],
      "lib/ledgerCore.ts": [7, "台帳そのもの"],
      "lib/aggregate.ts": [0, "台帳の出来事を sumEntries で足す"],
      "lib/periods.ts": [6, "台帳の出来事（CountedEntry）を足す"],
      "lib/monthBreakdown.ts": [8, "台帳の出来事と NISA の記録を足す（特別支出の分も。2026-11-28）"],
      "lib/specialBudget.ts": [1, "その年の特別支出（台帳の出来事を足す。2026-11-28）"],
      "lib/installments.ts": [2, "分割払いの予定の額を足す（記録の金額ではない。収支に数えない控え。2026-11-28）"],
      "lib/lookAhead.ts": [3, "この先7日の固定費の支払い（一部払いは残り）と、年のふりかえりの支出・投資・収入（台帳の出来事 ledgerEntries を足す）。2026-11-28"],
      "lib/paydayBudget.ts": [1, "給料日からの期間に使った額（台帳の出来事を isBudgetExpense で足す。2026-11-28）"],
      "lib/weeklyReview.ts": [4, "台帳の出来事を足す・固定費の予定"],
      "lib/report.ts": [3, "台帳の出来事を足す"],
      "lib/forecast.ts": [5, "台帳の出来事と、固定費の予定を足す・今日より後の日付の記録を見込みの線のその日に載せる（承認待ち⑤）"],
      "lib/balance.ts": [6, "台帳の出来事（ledgerEvents）を足す（精算は立替の分までに抑えて足す。To-Be 2026-11-28）。経費の払った額（現金・カード）"],
      "lib/refund.ts": [2, "返金の記録の合計（台帳の保存則と同じ）"],
      "lib/payBreakdown.ts": [2, "支払方法ごとの支出（共通台帳の収支に数える支出を、支払方法で分けて足す。To-Be 2026-11-28）"],
      "lib/advance.ts": [2, "立替の精算の記録の合計（と割り勘の自分の分の計算）（収支には数えない。To-Be 2026-11-28）"],
      "lib/allowance.ts": [1, "固定費の予定（記録ではない）"],
      "lib/nisa.ts": [1, "NISA の記録（収支ではない）"],
      "lib/inbox.ts": [1, "未整理の記録の店ごとの合計（整理の目安。収支ではない）"],
      "lib/idbRepository.ts": [1, "移行の点検用の合計（記録の全件。収支ではない）"],
      "lib/dataOps.ts": [2, "固定費の一部払いの残り"],
      "lib/decision.ts": [1, "買い物の判断（予定の額）"],
      "lib/lifeChange.ts": [2, "生活の変化（予定の額）"],
      "app/settings/page.tsx": [2, "CSV の取り込み前の合計（まだ記録ではない）"],
      "app/calendar/page.tsx": [1, "その日の固定費の予定"],
      "app/contracts/page.tsx": [1, "契約の月額"],
      "app/recurring/page.tsx": [1, "固定費の月額"],
      "app/report/page.tsx": [1, "固定費の月額"],
      "components/MoneyMonth.tsx": [1, "家計簿の支払いのタブ：これからの固定費の予定の合計（記録ではない。To-Be 2026-11-28）"],
      "app/trips/page.tsx": [1, "行程の費用（予定の cost）。旅行につないだ支出は sumEntries"],
    };
    const counts: Record<string, number> = {};
    for (const f of files) {
      const n = fs.readFileSync(path.join(root, f), "utf8").split("\n").filter((l) => LINE.test(l)).length;
      if (n || f in ALLOWED) counts[f] = n;
    }
    const expected: Record<string, number> = {};
    for (const [f, [n]] of Object.entries(ALLOWED)) if (n > 0 || f in counts) expected[f] = n;
    expect(counts).toEqual(expected);
    // 見張りそのものの確かめ：見逃したと指摘された書き方を、どれも拾う
    for (const c of ['s + (t.type === "expense" && t.countAs !== "transfer" ? t.amount : 0)', "t.amount + s", "(s, { amount }) => s + amount", 's + t["amount"]', "a + t?.amount", "sum(txs.map((t) => t.amount))", "total += t.amount"]) expect(LINE.test(c), c).toBe(true);
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
