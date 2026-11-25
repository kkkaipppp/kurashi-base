import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { validateAppData } from "@/lib/schema";
import { categoryIsInvest, categoryMap, fixedCandidates, txIsFixed, txIsInvest } from "@/lib/classify";
import { monthBreakdown } from "@/lib/monthBreakdown";
import { monthLedger, investCategoryNames } from "@/lib/ledger";
import { applyTxUpdate, mergeCategoryData, setTxTripData, unlinkTripFromTx } from "@/lib/dataOps";
import { tripMemoCandidates } from "@/lib/tripMemo";
import { applyRestore } from "@/lib/backup";
import { PUBLIC_ORDER, currentLayout, defaultLayout, layoutFor, moveCard, saveLayout, toggleCard } from "@/lib/homeLayout";
import type { AppData, Transaction } from "@/lib/types";

// 2026-11-24 「100点化 開発指示 v1」のうち、保存の形に項目を足す分（平尾さん「①自分用で全部」）。
// 足すだけ・無くても動く・形式の番号は 2 のまま
const now = "2026-11-24T00:00:00.000Z";
const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({
  type: "expense",
  date: "2026-11-10",
  amount: 1000,
  currency: "JPY",
  categoryId: "exp-1",
  merchant: "",
  paymentMethod: "",
  note: "",
  source: "manual",
  createdAt: now,
  updatedAt: now,
  ...o,
});
const base = (): AppData => {
  const d = emptyData(now);
  d.categories.push({ id: "inv", name: "投資", kind: "expense", order: 99, archived: false });
  return d;
};

describe("保存の形：足すだけ（古いデータはそのまま読め、新しい項目は形を確かめる）", () => {
  it("新しい項目のない今までのデータ（v2）は、そのまま読める", () => {
    const d = base();
    d.transactions = [tx({ id: "a" })];
    const r = validateAppData(JSON.parse(JSON.stringify(d)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.schemaVersion).toBe(2);
  });
  it("新しい項目は、書き出し→読み込みで消えずに残る（バックアップの往復）", () => {
    const d = base();
    d.categories = d.categories.map((c) => (c.id === "inv" ? { ...c, role: "invest" as const } : c));
    d.trips = [{ id: "trip1", title: "京都", startDate: "2026-11-01", endDate: "2026-11-02", destination: "", budget: null, note: "", createdAt: now, updatedAt: now }];
    d.transactions = [tx({ id: "a", countAs: "life", tripId: "trip1" })];
    d.prefs.home = { ...d.prefs.home, order: ["recent", "budget", "未来のカード"], hidden: ["todo"] };
    const r = validateAppData(JSON.parse(JSON.stringify(d)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.transactions[0]).toMatchObject({ countAs: "life", tripId: "trip1" });
    expect(r.data.categories.find((c) => c.id === "inv")?.role).toBe("invest");
    expect(r.data.prefs.home.order).toEqual(["recent", "budget", "未来のカード"]);
  });
  it("おかしな値は「壊れています」で止め、今のデータには触れない", () => {
    const bad = (f: (d: AppData) => void) => {
      const d = base();
      d.transactions = [tx({ id: "a" })];
      f(d);
      return validateAppData(JSON.parse(JSON.stringify(d))).ok;
    };
    expect(bad((d) => ((d.transactions[0] as unknown as Record<string, unknown>).countAs = "food"))).toBe(false);
    expect(bad((d) => ((d.transactions[0] as unknown as Record<string, unknown>).tripId = 3))).toBe(false);
    expect(bad((d) => ((d.categories[0] as unknown as Record<string, unknown>).role = "fixed"))).toBe(false);
    expect(bad((d) => ((d.prefs.home as unknown as Record<string, unknown>).order = "budget"))).toBe(false);
  });
  it("形式の番号は 2 のまま", () => {
    expect(src("lib/schema.ts")).toContain("export const CURRENT_SCHEMA = 2;");
  });
});

describe("D 分類：名前ではなく、本人が決めた分け方で数える", () => {
  it("カテゴリの分類 → 名前の順。名前を変えても、決めた分類は変わらない", () => {
    expect(categoryIsInvest({ kind: "expense", name: "投資" })).toBe(true);
    expect(categoryIsInvest({ kind: "expense", name: "証券口座" })).toBe(false);
    expect(categoryIsInvest({ kind: "expense", name: "証券口座", role: "invest" })).toBe(true);
    expect(categoryIsInvest({ kind: "expense", name: "投資の本", role: "life" })).toBe(false);
    expect(categoryIsInvest({ kind: "income", name: "投資", role: "invest" })).toBe(false);
  });
  it("取引ごとの上書きがいちばん強い", () => {
    const d = base();
    const cats = categoryMap(d);
    expect(txIsInvest(tx({ id: "a", categoryId: "inv" }), cats)).toBe(true);
    expect(txIsInvest(tx({ id: "a", categoryId: "inv", countAs: "life" }), cats)).toBe(false);
    expect(txIsInvest(tx({ id: "a", categoryId: "exp-1", countAs: "invest" }), cats)).toBe(true);
  });
  it("固定費は、支払いとしてつないだ記録。古い記録は、同じカテゴリで金額も同じときだけ", () => {
    const rc = [{ id: "r", name: "スマホ", amount: 8000, cycle: "monthly" as const, anchorDay: 28, nextDueDate: "2026-11-28", categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now }];
    expect(txIsFixed(tx({ id: "a", categoryId: "exp-5", amount: 8000 }), rc)).toBe(true);
    expect(txIsFixed(tx({ id: "a", categoryId: "exp-5", amount: 1200 }), rc)).toBe(false); // 同じカテゴリの変動費
    expect(txIsFixed(tx({ id: "a", categoryId: "exp-1", amount: 999, recurringId: "r" }), rc)).toBe(true);
  });
  it("月の内訳・投資として数えるカテゴリの一覧が、分類に従う", () => {
    const d = base();
    d.categories = d.categories.map((c) => (c.id === "inv" ? { ...c, name: "証券口座へ", role: "invest" as const } : c));
    d.transactions = [tx({ id: "a", categoryId: "inv", amount: 100000 }), tx({ id: "b", categoryId: "exp-1", amount: 3000 }), tx({ id: "c", categoryId: "inv", amount: 5000, countAs: "life" })];
    const b = monthBreakdown(d, "2026-11", "2026-11-24");
    expect([b.invest, b.lifeExpense]).toEqual([100000, 8000]);
    expect(investCategoryNames(d)).toEqual(["証券口座へ"]);
  });
});

describe("D 固定費を二重に数えない（＋から手で入れた支払いを、固定費につなぐ）", () => {
  const setup = () => {
    const d = base();
    d.budget.monthly = 120000;
    d.recurring = [{ id: "r", name: "スマホ", amount: 8000, cycle: "monthly", anchorDay: 28, nextDueDate: "2026-11-28", categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now }];
    d.transactions = [tx({ id: "a", amount: 96420 })];
    return d;
  };
  it("候補：同じカテゴリで同じ金額、または店名に固定費の名前。支払日の前後10日だけ", () => {
    const d = setup();
    expect(fixedCandidates({ type: "expense", categoryId: "exp-5", amount: 8000, merchant: "", date: "2026-11-24" }, d.recurring).map((r) => r.id)).toEqual(["r"]);
    expect(fixedCandidates({ type: "expense", categoryId: "exp-1", amount: 7980, merchant: "ドコモ スマホ代", date: "2026-11-27" }, d.recurring).map((r) => r.id)).toEqual(["r"]);
    expect(fixedCandidates({ type: "expense", categoryId: "exp-5", amount: 8000, merchant: "", date: "2026-10-01" }, d.recurring)).toEqual([]);
    expect(fixedCandidates({ type: "income", categoryId: "exp-5", amount: 8000, merchant: "", date: "2026-11-24" }, d.recurring)).toEqual([]);
  });
  it("つながずに入れると二重（今までの作り）、編集でつなぐと次の支払日が進み、自由に使える残りは同じに戻る", () => {
    const d = setup();
    const before = monthLedger(d, "2026-11", "2026-11-24");
    expect([before.unpaidFixed, before.freeLeft]).toEqual([8000, 15580]);
    // ＋から手で入れた（つないでいない）：生活費にも未記録の固定費にも入る＝二重
    d.transactions.push(tx({ id: "b", amount: 8000, categoryId: "exp-5" }));
    expect(monthLedger(d, "2026-11", "2026-11-24").freeLeft).toBe(7580);
    // 編集で「固定費の支払いです」とつなぐ
    const { id: _i, createdAt: _c, updatedAt: _u, currency: _cur, ...patch } = d.transactions[1]; // eslint-disable-line @typescript-eslint/no-unused-vars
    const next = applyTxUpdate(d, "b", { ...patch, recurringId: "r" }, now);
    expect(next.recurring[0].nextDueDate).toBe("2026-12-28");
    expect(monthLedger(next, "2026-11", "2026-11-24").freeLeft).toBe(15580);
    // もう一度保存しても、二度は進めない
    const again = applyTxUpdate(next, "b", { ...patch, recurringId: "r" }, now);
    expect(again.recurring[0].nextDueDate).toBe("2026-12-28");
  });
  it("編集で数え方・旅行を外すと、その項目は記録から消える", () => {
    const d = setup();
    d.transactions = [tx({ id: "a", countAs: "invest", tripId: "t" })];
    const { id: _i, createdAt: _c, updatedAt: _u, currency: _cur, ...patch } = d.transactions[0]; // eslint-disable-line @typescript-eslint/no-unused-vars
    const next = applyTxUpdate(d, "a", { ...patch, countAs: undefined, tripId: undefined }, now);
    expect("countAs" in next.transactions[0]).toBe(false);
    expect("tripId" in next.transactions[0]).toBe(false);
  });
});

describe("E カテゴリをまとめる（消さない・取り消しの控えを残す）", () => {
  it("記録と固定費を移し、元は非表示。種類が違う・同じ・非表示の先は止める", () => {
    const d = base();
    d.categories.push({ id: "cafe", name: "カフェ", kind: "expense", order: 98, archived: false });
    d.transactions = [tx({ id: "a", categoryId: "cafe" }), tx({ id: "b", categoryId: "cafe" }), tx({ id: "c", categoryId: "exp-2" })];
    d.recurring = [{ id: "r", name: "サブスク", amount: 500, cycle: "monthly", anchorDay: 1, nextDueDate: "2026-12-01", categoryId: "cafe", paymentMethod: "", active: true, createdAt: now, updatedAt: now }];
    const m = mergeCategoryData(d, "cafe", "exp-1", now);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.moved).toBe(2);
    expect(m.next.transactions.map((t) => t.categoryId)).toEqual(["exp-1", "exp-1", "exp-2"]);
    expect(m.next.recurring[0].categoryId).toBe("exp-1");
    expect(m.next.categories.find((c) => c.id === "cafe")).toMatchObject({ archived: true });
    expect(m.next.transactions.map((t) => t.id)).toEqual(["a", "b", "c"]); // 記録の ID は変えない
    expect(mergeCategoryData(d, "cafe", "cafe", now).ok).toBe(false);
    expect(mergeCategoryData(d, "cafe", "inc-1", now).ok).toBe(false);
    // o11 A06：取り消しの控えを残す保存は、Repository の save に理由（label）を渡す。localStorage の版は saveWithUndo を使う
    expect(src("lib/store.tsx")).toContain("undoReason: () => label"); // 控えの理由は、列の中で計算したラベル（o11 A06 点検 中-1・中-2）
    expect(src("lib/storeCore.ts")).toContain("this.repo.save(next, this.token, reason)");
    expect(src("lib/repository.ts")).toContain("saveWithUndo(next, base, undoReason");
  });
});

describe("E ホームのカードの並び（自分用）", () => {
  const prefs = () => emptyData(now).prefs.home;
  it("公開版は今までの並びのまま", () => {
    expect(layoutFor({ ...prefs(), order: ["recent"], hidden: ["budget"] }, null, false)).toEqual(PUBLIC_ORDER);
  });
  it("知らないカードは無視し、足りないカードは最後に足す。はじめは「今日のまとめ」で、重なるカードは隠す", () => {
    const l = currentLayout({ ...prefs(), order: ["recent", "未来のカード", "budget", "recent"] });
    expect(l.order.slice(0, 2)).toEqual(["recent", "budget"]);
    expect(l.order).toHaveLength(8);
    expect(currentLayout(prefs()).hidden).toEqual(["today", "todo"]);
    expect(layoutFor(prefs(), null, true)[1]).toBe("todayAll");
  });
  it("並べ替え・隠す・はじめに戻す。編集中は、その並びで見える（プレビュー）", () => {
    let l = defaultLayout();
    l = moveCard(moveCard(l, "recent", -1), "recent", -1);
    l = toggleCard(l, "insight");
    const shown = layoutFor(prefs(), l, true);
    expect(shown).not.toContain("insight");
    expect(shown.indexOf("recent")).toBeLessThan(shown.indexOf("navi"));
    expect(moveCard(l, "budget", -1)).toBe(l); // いちばん上より上へは動かない
    expect(defaultLayout()).toEqual({ order: currentLayout(prefs()).order, hidden: ["today", "todo"] });
  });
  it("保存は、並び・隠したもの・今までの設定（次の固定費・確認したいこと）に分けて書く", async () => {
    const calls: unknown[] = [];
    const store = {
      setHomeLayout: (o: string[], h: string[], f: { nextRecurring: boolean; needsReview: boolean }) => (calls.push(["layout", o.length, h, f]), Promise.resolve({ ok: true as const })),
    };
    expect((await saveLayout(store, { order: defaultLayout().order, hidden: ["today", "nextFixed"] })).ok).toBe(true); // 保存は完了を待つ（o11 A06）
    // 1回の保存で書く（途中で失敗して一部だけ変わらない）
    expect(calls).toEqual([["layout", 8, ["today"], { nextRecurring: false, needsReview: true }]]);
  });
  it("自分用だけ読み込む（公開版のホームは今のまま）", () => {
    const s = src("app/page.tsx");
    expect(s).toContain('const HomeEditor = PERSONAL ? dynamic(');
    expect(s).toContain('const TodayAll = PERSONAL ? dynamic(');
  });
});

describe("F 旅行と支出を ID でつなぐ（メモは候補として確かめてから）", () => {
  it("つなぐ・外す。旅行を消しても支出は消さず、外すだけ", () => {
    const d = base();
    d.transactions = [tx({ id: "a", note: "旅行：京都" }), tx({ id: "b" })];
    const linked = setTxTripData(d, ["a"], "trip1", now);
    expect(linked.transactions[0].tripId).toBe("trip1");
    expect(linked.transactions[0].note).toBe("旅行：京都"); // メモはそのまま
    expect("tripId" in linked.transactions[1]).toBe(false);
    const after = unlinkTripFromTx(linked, "trip1", now);
    expect(after).toHaveLength(2);
    expect("tripId" in after[0]).toBe(false);
    expect(setTxTripData(linked, ["a"], null, now).transactions[0].tripId).toBeUndefined();
  });
  it("旅行の画面は、自分用で ID のつなぎと、メモの候補（押したときだけつなぐ）", () => {
    const s = src("app/trips/page.tsx");
    expect(s).toContain("initial: IS_PERSONAL ? { tripId: trip.id } : { note: `旅行：${trip.title}` }");
    expect(s).toContain("をこの旅行につなぐ");
  });
  it("メニューの「準備中」は、自分用では開いたときだけ出す", () => {
    expect(src("app/menu/page.tsx")).toContain("準備中のもの（{items.length}件）を見る");
  });
});

describe("点検の直し（100点化 D・E・F）", () => {
  it("続けて追加・種別の切り替えで、固定費のつなぎを次に残さない。保存の直前にも今の候補か確かめる", () => {
    const s = src("components/TxSheet.tsx");
    expect(s).toContain('const next: TxDraft = { ...draft, amount: "", merchant: "", note: "", linkRecurringId: "" };');
    expect(s).toContain('categoryId: first, linkRecurringId: "", countAs: ""');
    expect(s).toContain(".some((r) => r.id === draft.linkRecurringId)");
  });
  it("公開版の「はじめにやること」は、今までどおり「今日やること」の下", () => {
    expect(src("app/page.tsx")).toContain('{(PERSONAL ? i === 0 : id === "todo") && cards.firstUse}');
    expect(PUBLIC_ORDER.indexOf("todo")).toBe(3);
  });
  it("数え方の違うカテゴリにまとめても、移した記録は元の数え方のまま（予算の数字が黙って変わらない）", () => {
    const d = base();
    d.transactions = [tx({ id: "a", categoryId: "inv", amount: 50000 }), tx({ id: "b", categoryId: "inv", countAs: "life" })];
    const before = monthBreakdown(d, "2026-11", "2026-11-24");
    const m = mergeCategoryData(d, "inv", "exp-1", now);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.next.transactions.map((t) => t.countAs)).toEqual(["invest", "life"]);
    const after = monthBreakdown(m.next, "2026-11", "2026-11-24");
    expect([after.invest, after.lifeExpense]).toEqual([before.invest, before.lifeExpense]);
  });
  it("追加の復元で、取引も意味の違う旅行（同じ ID で名前・期間が違う）にはつながない", () => {
    const cur = base();
    cur.trips = [{ id: "trip1", title: "京都", startDate: "2026-11-01", endDate: "2026-11-02", destination: "", budget: null, note: "", createdAt: now, updatedAt: now }];
    const inc = base();
    inc.trips = [{ id: "trip1", title: "沖縄", startDate: "2027-01-01", endDate: "2027-01-03", destination: "", budget: null, note: "", createdAt: now, updatedAt: now }];
    inc.transactions = [tx({ id: "x", tripId: "trip1" }), tx({ id: "y" })];
    const r = applyRestore(cur, inc, "merge");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.transactions.map((t) => t.id)).toEqual(["y"]);
  });
  it("旅行のメモの候補：名前は最後まで一致・旅行の期間の前後7日・まだつないでいないもの", () => {
    const trip = { title: "沖縄", startDate: "2026-08-10", endDate: "2026-08-12" };
    const list = [
      tx({ id: "ok", date: "2026-08-11", note: "旅行：沖縄" }),
      tx({ id: "ok2", date: "2026-08-05", note: "旅行：沖縄 おみやげ" }),
      tx({ id: "ok3", date: "2026-08-12", note: "旅行：沖縄・ランチ" }),
      tx({ id: "name", date: "2026-08-11", note: "旅行：沖縄2025" }),
      tx({ id: "far", date: "2025-08-11", note: "旅行：沖縄" }),
      tx({ id: "linked", date: "2026-08-11", note: "旅行：沖縄", tripId: "t" }),
    ];
    expect(tripMemoCandidates(list, trip).map((t) => t.id)).toEqual(["ok", "ok2", "ok3"]);
  });
  it("毎週の固定費は、支払日の前後3日だけ候補にする（前の回につながない）", () => {
    const rc = [{ id: "w", name: "ジム", amount: 2000, cycle: "weekly" as const, anchorDay: 1, nextDueDate: "2026-11-30", categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now }];
    expect(fixedCandidates({ type: "expense", categoryId: "exp-5", amount: 2000, merchant: "", date: "2026-11-28" }, rc)).toHaveLength(1);
    expect(fixedCandidates({ type: "expense", categoryId: "exp-5", amount: 2000, merchant: "", date: "2026-11-24" }, rc)).toHaveLength(0);
  });
});
