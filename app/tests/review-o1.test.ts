import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { figures, sampleRows, similarButDifferentId } from "@/lib/restoreView";
import type { Transaction } from "@/lib/types";

// 2026-11-24 ChatGPT のレビュー o1（kurashi-base_review-uiux_result_9de9612-o1）の直し
const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");
const tx = (p: Partial<Transaction>): Transaction => ({
  id: "x", type: "expense", date: "2026-11-01", amount: 1000, currency: "JPY", categoryId: "exp-1",
  merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: "x", updatedAt: "x", ...p,
});

describe("P01 復元の意図をはっきりさせる", () => {
  it("復元方法はファイルを選ぶたびに未選択に戻り、選ぶまで実行できない", () => {
    const s = src("app/settings/page.tsx");
    expect(s).toContain('useState<"merge" | "replace" | null>(null)');
    expect(s).toContain("setMode(null);");
    expect(s).toContain("disabled={!mode || !plan?.ok}");
    expect(s).toContain("`${plan.added}件を追加`");
  });
  it("今と実行後の件数・合計、ID が違う似た記録の数", () => {
    const d = emptyData("2026-11-24T00:00:00.000Z");
    d.transactions = [tx({ id: "a", amount: 500 }), tx({ id: "b", type: "income", amount: 2000 })];
    expect(figures(d)).toMatchObject({ transactions: 2, expense: 500, income: 2000 });
    const incoming = [tx({ id: "a", amount: 500 }), tx({ id: "z", amount: 500 }), tx({ id: "y", amount: 500 }), tx({ id: "w", amount: 9 })];
    // a は同じ ID なので数えない。z は a と同じ日・金額で似ている。y は似た相手がもう残っていない
    expect(similarButDifferentId(d.transactions, incoming)).toBe(1);
    expect(sampleRows([tx({ id: "1", date: "2026-01-01" }), tx({ id: "2", date: "2026-03-01" })], 1)[0].id).toBe("2");
  });
});

describe("P04 消す操作を慎重に", () => {
  it("すべて削除は「削除」と打ってから。取り消しの注意。CSV の確認に合計と例", () => {
    const s = src("app/settings/page.tsx");
    expect(s).toContain('disabled={wipeWord.trim() !== "削除"}');
    expect(s).toContain("取り消すと、そのあとに入れた記録も消えます。");
    expect(s).toContain("例（新しい5件）");
    expect(s).toContain("CSV の合計：支出");
  });
});

describe("P03 保存場所の説明をアプリと Web 版で分ける", () => {
  it("Web 版はブラウザの中・アプリはアプリの中と自動バックアップ・削除で消えること", async () => {
    const { STORAGE_TEXT, isNativeApp } = await import("@/lib/platform");
    expect(STORAGE_TEXT.web.short).toContain("このブラウザの中だけ");
    expect(STORAGE_TEXT.app.backup).toContain("自動で書きます");
    expect(STORAGE_TEXT.app.backup).toContain("アプリを削除すると、自動バックアップも一緒に消える");
    expect(isNativeApp()).toBe(false); // テスト（ブラウザなし）では Web 版扱い
    for (const p of ["app/page.tsx", "app/settings/page.tsx", "app/guide/page.tsx"]) expect(src(p)).toContain("useIsNativeApp()");
  });
});

describe("P06・P07 週の見出しとグラフ", () => {
  it("週の見出しは短く、今年でなければ年を出す", async () => {
    const { weekLabel } = await import("@/components/PeriodReport");
    expect(weekLabel("2026-11-23", "2026-11-24")).toBe("11/23(月)");
    expect(weekLabel("2025-12-29", "2026-01-02")).toBe("2025/12/29(月)");
  });
  it("記録がない期間は「支出を追加」（棒グラフの目盛りだけ。紫の累計の線は、2026-11-25 にやめた）", () => {
    const s = src("components/TrendChart.tsx");
    expect(s).toContain("const yb = (v: number)");
    expect(s).toContain("この期間は、まだ記録がありません");
    expect(s).toContain('href="/?add=expense"');
  });
});

describe("家計の機能 1〜3・P08・P09・P11・P16", () => {
  const now = "2026-11-24T00:00:00.000Z";
  it("今月あと使える生活費：予算 − 支出 − まだ来る固定費 を月末までの日数で割る。予算なしは出さない", async () => {
    const { dailyAllowance, unpaidRecurringThisMonth } = await import("@/lib/allowance");
    const rec = (p: object) => ({ id: "r", name: "家賃", amount: 80000, cycle: "monthly" as const, anchorDay: 27, nextDueDate: "2026-11-27", categoryId: "exp-4", paymentMethod: "", active: true, createdAt: now, updatedAt: now, ...p });
    const list = [rec({}), rec({ id: "x", amount: 1000, nextDueDate: "2026-11-20" }), rec({ id: "y", amount: 500, active: false })];
    // 11/20 の分は支払日を過ぎてもまだ記録していない（記録すると次の支払日が進む）ので引く。来月の分は引かない
    expect(unpaidRecurringThisMonth([...list, rec({ id: "z", amount: 7, nextDueDate: "2026-12-01" })], "2026-11-24")).toBe(81000);
    const a = dailyAllowance(200000, 50000, list, "2026-11-24");
    // 11/24〜11/30 は7日。(200000 − 50000 − 81000) / 7 = 9857
    expect(a).toMatchObject({ daysLeft: 7, unpaidFixed: 81000, left: 69000, perDay: 9857 });
    expect(dailyAllowance(null, 0, list, "2026-11-24")).toBeNull();
    expect(dailyAllowance(1000, 5000, [], "2026-11-24")?.perDay).toBe(0);
  });
  it("固定費と変動費・生活と投資・先月の同じ日より増えたもの", async () => {
    const { monthBreakdown } = await import("@/lib/monthBreakdown");
    const d = emptyData(now);
    d.categories.push({ id: "inv", name: "投資", kind: "expense", order: 99, archived: false });
    d.recurring = [{ id: "r", name: "家賃", amount: 80000, cycle: "monthly", anchorDay: 27, nextDueDate: "2026-11-27", categoryId: "exp-4", paymentMethod: "", active: true, createdAt: now, updatedAt: now }];
    d.transactions = [
      tx({ id: "1", date: "2026-11-05", amount: 80000, categoryId: "exp-4" }),
      tx({ id: "2", date: "2026-11-10", amount: 3000, categoryId: "exp-1" }),
      tx({ id: "3", date: "2026-11-11", amount: 100000, categoryId: "inv" }),
      tx({ id: "4", date: "2026-11-25", type: "income", amount: 250000, categoryId: "inc-1" }),
      tx({ id: "5", date: "2026-10-09", amount: 1000, categoryId: "exp-1" }),
      tx({ id: "6", date: "2026-10-28", amount: 9999, categoryId: "exp-1" }),
    ];
    d.nisa = [{ id: "n", date: "2026-11-12", kind: "buy", frame: "tsumitate", amount: 100000, name: "", note: "", createdAt: now, updatedAt: now }];
    const b = monthBreakdown(d, "2026-11", "2026-11-24");
    expect([b.fixed, b.variable, b.invest, b.lifeExpense, b.income, b.lifeBalance, b.nisaBuy]).toEqual([80000, 3000, 100000, 83000, 250000, 167000, 100000]);
    // 先月は24日まで（10/28 の 9999 は入れない）と比べる
    expect(b.increases[0]).toMatchObject({ categoryId: "exp-4", diff: 80000 });
    expect(b.increases.find((x) => x.categoryId === "exp-1")).toMatchObject({ prev: 1000, now: 3000, diff: 2000 });
  });
  it("ホーム：予算の案内は記録が10件たってから、超過の言い方、1日あたりは自分用だけ、はじめにやることは記録が先", () => {
    const s = src("app/page.tsx");
    expect(s).toContain("const BUDGET_HINT_AFTER = 10;");
    expect(s).toContain("`予算を${formatYen(-remaining)}超過`");
    expect(s).toContain('const PERSONAL = process.env.NEXT_PUBLIC_KB_EDITION === "personal";');
    expect(s.indexOf("支出か予定を1件追加する")).toBeLessThan(s.indexOf("1か月の予算を決める"));
  });
});

describe("P10・P13〜P17・P19 画面と言葉", () => {
  it("カレンダー：予定とお金・予定・お金の切り替え、支出に −、選んだ日の要約、固定費の支払日の説明", () => {
    const s = src("app/calendar/page.tsx");
    expect(s).toContain('aria-label="マスに出すもの"');
    expect(s).toContain("−{shortYen(info.exp)}");
    expect(s).toContain("予定 {dayEvents.length}件・");
    expect(s).toContain("期限・固定費の支払日");
  });
  it("取引履歴：種類・カテゴリ・支払方法の名前、絞り込み後の件数と合計、解除", () => {
    const s = src("app/history/page.tsx");
    for (const t of ["種類：すべて", "カテゴリ：すべて", "支払方法：すべて", "絞り込みを解除"]) expect(s).toContain(t);
  });
  it("予定：開始時刻を終わりと同じか後にしたら、終わりを1時間後に", () => {
    expect(src("components/EventSheet.tsx")).toContain('if (k === "startTime"');
  });
  it("設定の目次、空の月の振り返りは「支出を追加」、旅行の支出を追加、言葉の直し", () => {
    expect(src("app/settings/page.tsx")).toContain('aria-label="設定の目次"');
    expect(src("app/report/page.tsx")).toContain("<SectionTitle>支出の内訳</SectionTitle>");
    // 2026-11-26 から、その場で入力を開く（ホームへ移らない。今月以外はその月の1日から。tests/brushup-20261126）
    expect(src("app/report/page.tsx")).toContain('ui.openTx({ mode: "new", type: "expense"');
    expect(src("app/trips/page.tsx")).toContain("＋ この旅行の支出を追加");
    expect(src("components/AddChooser.tsx")).toContain("何を記録しますか？");
  });
});

describe("P02・P03・P05 アプリの中だけ（Web 版では動かない・出ない）", () => {
  it("ウィジェットの合図で、入力の途中なら先に聞く（入力を続ける／新しく入力する）", () => {
    const s = src("components/UIContext.tsx");
    expect(s).toContain('window.addEventListener("kb-open-add", onAdd)');
    expect(s).toContain('cancel: "入力を続ける"');
  });
  it("設定に iPhone の連携（自動バックアップの日時・カレンダーへのアクセスと最後の反映・反映し直す）。Web 版では出さない", () => {
    const s = src("components/NativeStatusCard.tsx");
    expect(s).toContain("if (!native) return null;");
    for (const t of ["最後の自動バックアップ", "カレンダーへのアクセス", "カレンダーへの最後の反映", "カレンダーに反映し直す"]) expect(s).toContain(t);
    expect(src("app/settings/page.tsx")).toContain("<NativeStatusCard />");
  });
});

describe("実機で見つけた直し（2026-11-24）", () => {
  it("グラフの目盛りの文字は、長さに合わせて間引く（12週の日付が重なった）", () => {
    const s = src("components/TrendChart.tsx");
    expect(s).toContain("const step = Math.max(1, Math.ceil(labelW / slot));");
  });
});
