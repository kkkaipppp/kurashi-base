import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { buildNavi } from "@/lib/navi";
import { buildTodayItems } from "@/lib/todayItems";

// NEXT v21（2026-11-25）の小さな単位。保存の形は変えない
const now = "2026-11-25T00:00:00.000Z";
const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");

describe("ホーム：「今日のまとめ」と「確認したいこと」で同じものを二重に出さない", () => {
  it("今日のまとめに出るもの（過ぎた固定費・期限切れのタスク・今日の更新日）は、確認したいことから除ける", () => {
    const d = emptyData(now);
    d.recurring = [{ id: "r", name: "スマホ", amount: 8000, cycle: "monthly", anchorDay: 20, nextDueDate: "2026-11-20", categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now }];
    d.tasks = [{ id: "t", title: "書類", due: "2026-11-24", done: false, note: "", createdAt: now, updatedAt: now }];
    d.contracts = [{ id: "c", name: "保険", provider: "", amount: null, cycle: "yearly", renewalDate: "2026-11-25", status: "active", note: "", createdAt: now, updatedAt: now }];
    const today = buildTodayItems(d, "2026-11-25");
    const keys = new Set(today.map((i) => i.key));
    expect([...keys].sort()).toEqual(["ct-c", "rc-r", "task-t"]);
    // 過ぎたものが先
    expect(today[0].warn).toBe(true);
    const navi = buildNavi(d, "2026-11-25").filter((n) => !keys.has(n.key));
    expect(navi.map((n) => n.key)).not.toContain("rc-r");
    expect(navi.map((n) => n.key)).not.toContain("ct-c");
    // 元のナビには出ている（除くのは「今日のまとめ」を出しているときだけ）
    expect(buildNavi(d, "2026-11-25").map((n) => n.key)).toContain("rc-r");
  });
  it("ホームは、自分用で今日のまとめを出しているときだけ除く（公開版は今のまま）", () => {
    const s = src("app/page.tsx");
    expect(s).toContain('const todayShown = PERSONAL && layoutFor(prefs, editLayout).includes("todayAll");');
    expect(s).toContain("!dup?.has(n.key)");
  });
});

// --- FINAL_INTEGRATION の X 項目（合成データ。実データは使わない） ---
import { summarizeMonth } from "@/lib/aggregate";
import { budgetSpent, monthLedger } from "@/lib/ledger";
import { monthBreakdown } from "@/lib/monthBreakdown";
import { monthReport } from "@/lib/report";
import { setTxTripData, unlinkTripFromTx, mergeCategoryData } from "@/lib/dataOps";
import type { AppData, Transaction } from "@/lib/types";

const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({
  type: "expense", date: "2026-11-10", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now, ...o,
});
const withInvest = (): AppData => {
  const d = emptyData(now);
  d.categories.push({ id: "inv", name: "証券口座へ", kind: "expense", order: 99, archived: false, role: "invest" });
  d.trips = [{ id: "trip1", title: "京都", startDate: "2026-11-01", endDate: "2026-11-03", destination: "", budget: null, note: "", createdAt: now, updatedAt: now }];
  return d;
};

describe("X01 旅行・家計の二重計上なし（取引ID一件を参照）", () => {
  it("15000円の支出を旅行につないでも、家計の総額は15000円のまま。旅行を消しても支出は残る", () => {
    const d = withInvest();
    d.transactions = [tx({ id: "a", amount: 15000 })];
    const before = summarizeMonth(d.transactions, "2026-11").expense;
    const linked = setTxTripData(d, ["a"], "trip1", now);
    expect(summarizeMonth(linked.transactions, "2026-11").expense).toBe(before);
    expect(monthReport(linked, "2026-11").expense).toBe(15000);
    expect(budgetSpent(linked, "2026-11", "2026-11-25", true)).toBe(15000);
    const after = unlinkTripFromTx(linked, "trip1", now);
    expect(after).toHaveLength(1);
    expect(after[0].amount).toBe(15000);
    expect(after[0].tripId).toBeUndefined();
  });
});

describe("X04 投資／生活費（投資100000円は資産の移動。生活費は増えない）", () => {
  it("投資のカテゴリの支出は、生活費・予算との比較に入らない", () => {
    const d = withInvest();
    d.budget.monthly = 120000;
    d.transactions = [tx({ id: "a", amount: 3000 }), tx({ id: "b", categoryId: "inv", amount: 100000 })];
    const b = monthBreakdown(d, "2026-11", "2026-11-25");
    expect([b.lifeExpense, b.invest]).toEqual([3000, 100000]);
    expect(budgetSpent(d, "2026-11", "2026-11-25", true)).toBe(3000);
    expect(monthLedger(d, "2026-11", "2026-11-25").lifeBudgetLeft).toBe(117000);
  });
});

describe("X05 ホーム・振り返りで計算結果が一致する", () => {
  it("同じ月の生活費は、monthBreakdown・budgetSpent・monthLedger で同じ", () => {
    const d = withInvest();
    d.budget.monthly = 50000;
    d.transactions = [tx({ id: "a", amount: 1200 }), tx({ id: "b", amount: 800, date: "2026-11-20" }), tx({ id: "c", categoryId: "inv", amount: 5000 })];
    const life = monthBreakdown(d, "2026-11", "2026-11-25").lifeExpense;
    expect(budgetSpent(d, "2026-11", "2026-11-25", true)).toBe(life);
    expect(monthLedger(d, "2026-11", "2026-11-25").lifeExpense).toBe(life);
    expect(life).toBe(2000);
  });
});

describe("X16 非表示と削除を区別（非表示でも集計と参照を保持）", () => {
  it("カテゴリを非表示にしても、その記録は集計に残る。まとめるときも ID は変わらない", () => {
    const d = withInvest();
    d.categories = d.categories.map((c) => (c.id === "exp-1" ? { ...c, archived: true } : c));
    d.transactions = [tx({ id: "a", amount: 700 })];
    expect(summarizeMonth(d.transactions, "2026-11").expense).toBe(700);
    expect(monthBreakdown(d, "2026-11", "2026-11-25").lifeExpense).toBe(700);
    // 非表示のカテゴリを、表示中のカテゴリにまとめられる。記録の ID と金額は変わらない
    const m = mergeCategoryData(d, "exp-1", "exp-2", now);
    expect(m.ok).toBe(true);
    if (m.ok) {
      expect(m.next.transactions.map((t) => [t.id, t.amount, t.categoryId])).toEqual([["a", 700, "exp-2"]]);
      expect(summarizeMonth(m.next.transactions, "2026-11").expense).toBe(700);
    }
    // 非表示の先へはまとめられない（見えないカテゴリに記録が移らないように）
    const toHidden = mergeCategoryData(d, "exp-2", "exp-1", now);
    expect(toHidden.ok).toBe(false);
  });
});

describe("グラフの「数字で見る」：合計行と根拠の一文（CH:G01・G08）", () => {
  it("表に合計行があり、投資を含むことを書く", () => {
    const s = src("components/TrendChart.tsx");
    expect(s).toContain("<tfoot>");
    expect(s).toContain("投資として数えた支出も含みます");
    expect(s).toContain("const totalExpense = rows.reduce(");
  });
});

describe("カレンダー：表示の切り替えを覚える・読み上げを見た目に合わせる（CAL:C12）", () => {
  it("見たいほう（予定とお金／予定／お金）を表示用のキーに覚える。覚えられなくても動く", () => {
    const s = src("app/calendar/page.tsx");
    expect(s).toContain('const SHOW_KEY = "kurashi-base:ui:calendar-show:v1";');
    expect(s).toContain("localStorage.setItem(SHOW_KEY, k);");
    expect(s).toContain("/* 覚えられなくても使える */");
    expect(s).toContain("${showEv && info.ev ?");
    expect(s).toContain("${showMoney && info.exp ?");
  });
  it("カレンダー用ファイルの説明に、時刻は書き出した端末の時刻のままと書く（CAL:C11）", () => {
    expect(src("app/settings/page.tsx")).toContain("書き出した端末の時刻のままで入ります");
  });
});

describe("ホームの二重表示：まとめに出ない分は確認したいことに残す／試験日もそろえる／予定の時間帯を出す", () => {
  it("今日のまとめの件数を超えた分は、確認したいことから除かない", () => {
    const s = src("app/page.tsx");
    expect(s).toContain("buildTodayItems(data, today).slice(0, TODAY_SHOWN)");
    expect(src("lib/todayItems.ts")).toContain("export const TODAY_SHOWN = 8;");
  });
  it("試験日の key は確認したいこと（navi.ts）と同じ study-", () => {
    const d = emptyData(now);
    d.studySubjects = [{ id: "s1", name: "簿記", examDate: "2026-11-25", targetHours: null, archived: false, createdAt: now, updatedAt: now }];
    const keys = buildTodayItems(d, "2026-11-25").map((i) => i.key);
    expect(keys).toEqual(["study-s1"]);
    expect(buildNavi(d, "2026-11-25").map((n) => n.key)).toContain("study-s1");
  });
  it("今日のまとめの予定に、時間帯などの補足を出す", () => {
    expect(src("components/HomeLayout.tsx")).toContain("eventTimeLabel(ev, today)");
  });
});

// --- X03 カード/現金（購入は一度だけ。引落は収支に数えない） ---
import { daySummary } from "@/lib/aggregate";
import { monthlyInYear, summarizePeriod, weeklyTrend } from "@/lib/periods";
import { expenseUntilDay } from "@/lib/report";
import { forecastMonthEnd } from "@/lib/forecast";
import { validateAppData } from "@/lib/schema";

describe("X03 カードで買った支出は一度だけ。翌月の引落は収支に数えない（NEXT v21 D01）", () => {
  const card = (): AppData => {
    const d = withInvest();
    d.transactions = [
      tx({ id: "buy", date: "2026-10-20", amount: 50000, paymentMethod: "card", merchant: "家電" }), // 買った日に一度だけ数える
      tx({ id: "pay", date: "2026-11-10", amount: 50000, paymentMethod: "bank", merchant: "カード引落", countAs: "transfer" }),
      tx({ id: "food", date: "2026-11-11", amount: 1200 }),
    ];
    return d;
  };
  it("10月の支出は50000円、11月の支出は1200円（引落の50000円は11月の支出に入らない）。記録は消えない", () => {
    const d = card();
    expect(summarizeMonth(d.transactions, "2026-10").expense).toBe(50000);
    expect(summarizeMonth(d.transactions, "2026-11").expense).toBe(1200);
    expect(d.transactions).toHaveLength(3);
    expect(daySummary(d.transactions, "2026-11-10").expense).toBe(0);
    expect(daySummary(d.transactions, "2026-11-10").list).toHaveLength(1); // 一覧には残る
  });
  it("どの集計でも同じ：期間・週・年・月の内訳・振り返り・見込み・予算との比較", () => {
    const d = card();
    d.budget.monthly = 100000;
    expect(summarizePeriod(d.transactions, "2026-11-01", "2026-11-30").expense).toBe(1200);
    expect(monthlyInYear(d.transactions, 2026)[10].expense).toBe(1200);
    expect(weeklyTrend(d.transactions, "2026-11-09", 1)[0].expense).toBe(1200);
    expect(expenseUntilDay(d.transactions, "2026-11", 30)).toBe(1200);
    expect(monthBreakdown(d, "2026-11", "2026-11-25").lifeExpense).toBe(1200);
    expect(budgetSpent(d, "2026-11", "2026-11-25", true)).toBe(1200);
    expect(budgetSpent(d, "2026-11", "2026-11-25", false)).toBe(1200); // 公開版の比べ方でも
    expect(monthLedger(d, "2026-11", "2026-11-25").lifeBudgetLeft).toBe(98800);
    // 見込みの変動費にも入らない
    d.transactions = [...d.transactions, ...Array.from({ length: 4 }, (_, i) => tx({ id: `f${i}`, date: `2026-11-0${i + 1}`, amount: 1000 }))];
    const f = forecastMonthEnd(d, "2026-11-25");
    expect(f.ok && f.basisDays).toBe(28); // 10/28〜11/24
    expect(f.ok && f.dailyVariable).toBe(Math.floor((4000 + 1200) / 28)); // 引落の50000円は入らない
  });
  it("新しい項目（transfer）は、書き出し→読み込みで残り、バックアップから戻せる", () => {
    const d = card();
    const r = validateAppData(JSON.parse(JSON.stringify(d)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.transactions.find((t) => t.id === "pay")?.countAs).toBe("transfer");
    const bad = JSON.parse(JSON.stringify(d));
    bad.transactions[1].countAs = "refund";
    expect(validateAppData(bad).ok).toBe(false);
  });
  it("入力で「収支に数えない」を選べる。一覧に印が出る", () => {
    expect(src("components/TxSheet.tsx")).toContain("収支に数えない（カード引落・口座間の移動など）");
    expect(src("components/Rows.tsx")).toContain("収支に数えない");
  });
});

describe("予定の複製（自分用。CAL:C05）", () => {
  const s = () => src("components/EventSheet.tsx");
  it("詳細に「複製」。内容だけ引き継ぎ、持ち物は未チェック・新しい ID。完了・実績は引き継がない", () => {
    expect(s()).toContain("ui.openEvent({ mode: \"new\", copyOf: ev.id })");
    expect(s()).toContain("items: x.items.map((i) => ({ ...i, id: newId(\"it\"), done: false }))");
    expect(s()).toContain("{IS_PERSONAL && (");
  });
  it("複製のときは、書きかけの控えを使わず、上書きもしない（空の新しい入力の書きかけを壊さない）", () => {
    expect(s()).toContain("copySrc ? null : loadSheetDraft");
    expect(s()).toContain("if (saved.current || copySrc) return;");
  });
});
