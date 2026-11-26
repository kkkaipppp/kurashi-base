import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { emptyData } from "@/lib/defaults";
import { monthTotals, ledgerEvents, BUDGET_EXCLUDES_INVEST } from "@/lib/ledgerCore";
import { summarizeMonth, remainingBudget, occursOn, eventsOnDay } from "@/lib/aggregate";
import { monthLedger } from "@/lib/ledger";
import { forecastMonthEnd } from "@/lib/forecast";
import { allowanceBreakdown } from "@/lib/allowanceBreakdown";
import { cashBalance } from "@/lib/balance";
import { applyRefund } from "@/lib/refund";
import { unlinkTripFromTx, applyRecurringPayment } from "@/lib/dataOps";
import { freeSlots } from "@/lib/freeTime";
import { StoreCore } from "@/lib/storeCore";
import { LocalStorageRepository } from "@/lib/repository";
import { STORAGE_KEY, type KV } from "@/lib/storage";
import { saveSheetDraft, loadSheetDraft } from "@/lib/sheetDraft";
import { IndexedDbRepository, migrateFromLocalStorage, openDb } from "@/lib/idbRepository";
import { buildBackup, parseBackup, applyRestore } from "@/lib/backup";
import { csvToIncoming } from "@/lib/csvImport";
import { FEATURES, IS_PERSONAL } from "@/lib/edition";
import { addDays, daysInMonth, isValidDateStr } from "@/lib/date";
import { advanceDueDate } from "@/lib/recurring";
import { searchAll } from "@/lib/search";
import { formatYen, parseAmount, MAX_AMOUNT } from "@/lib/money";
import type { AppData, CalendarEvent, RecurringExpense, Transaction } from "@/lib/types";

/**
 * 最終指示書 o29（00_受領資料/final_o29_20261127）の受入試験のうち、お金・保存・取り込みの分。
 * 期待値は 04_データ仕様.md（FIN01〜FIN04）・06_受入試験.csv・05_矛盾解消.csv から手で作った（実装から作っていない）。
 * o29 と今の PJ の既決事項（docs/STATE.md 11-26 昼の④⑤、docs/DECISIONS.md 2026-11-26、docs/RAID.md I-03）が食い違うときは、既決事項を期待値にする（各試験に注記）。
 * 試験は公開版の組み立て（NEXT_PUBLIC_KB_EDITION なし）で動く。自分用の数え方は excludeInvest=true を渡して確かめる。
 * 対象なし（今のアプリに概念がない）：T005・T006（配分 Allocation）、T011（操作ID）。試験を書いていない。
 */

const now = "2026-11-26T00:00:00.000Z";
const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({
  type: "expense",
  date: "2026-11-01",
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
const ev = (o: Partial<CalendarEvent> & { id: string; startDate: string }): CalendarEvent => ({
  title: o.id,
  endDate: o.startDate,
  allDay: true,
  startTime: "",
  endTime: "",
  note: "",
  createdAt: now,
  updatedAt: now,
  ...o,
});
const rc = (o: Partial<RecurringExpense> & { id: string; amount: number; nextDueDate: string }): RecurringExpense => ({
  name: o.id,
  cycle: "monthly",
  anchorDay: Number(o.nextDueDate.slice(8, 10)),
  categoryId: "exp-5",
  paymentMethod: "",
  active: true,
  createdAt: now,
  updatedAt: now,
  ...o,
});
const cashBase = (d: AppData, value: number, asOf: string) =>
  d.assets.push({ id: "cash", name: "財布と口座", kind: "cash", value, asOf, note: "", createdAt: now, updatedAt: now });
const memKV = (init: Record<string, string> = {}): KV & { store: Map<string, string> } => {
  const store = new Map(Object.entries(init));
  return { store, getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) };
};

// ---------------------------------------------------------------- FIN02 / T001・T007
describe("T001 予算：100000 − 45000 − 20000 − 15000 ＝ 20000、各段階を別に出す（FIN02）", () => {
  // 今日 11/26（11月は30日）。実績 45,000（11/14・11/20・11/25 に 15,000 ずつ）。確定した予定＝未払いの固定費 20,000（11/28）。
  // 推定：(a) 月末の見込みの変動費 1日 3,750（45,000 ÷ 12日。11/14〜11/25）× 残り4日 ＝ 15,000、(b) 予定の費用の目安 15,000（11/28）
  const data = (): AppData => {
    const d = emptyData(now);
    d.budget.monthly = 100000;
    d.transactions = ["2026-11-14", "2026-11-20", "2026-11-25"].map((date, i) => tx({ id: `v${i}`, date, amount: 15000 }));
    d.recurring = [rc({ id: "denki", amount: 20000, nextDueDate: "2026-11-28" })];
    d.events = [ev({ id: "nomikai", startDate: "2026-11-28", cost: 15000 })];
    return d;
  };
  const today = "2026-11-26";
  it("段階1 予算残額＝予算 − 実績 ＝ 55,000。段階2 確定予定を引いて 35,000（monthLedger）", () => {
    const l = monthLedger(data(), "2026-11", today);
    expect(l.budget).toBe(100000);
    expect(l.spent).toBe(45000);
    expect(l.lifeBudgetLeft).toBe(55000);
    expect(l.unpaidFixed).toBe(20000);
    expect(l.freeLeft).toBe(35000);
  });
  it("段階3（推定 a：月末の見込み）予算 − (実績 ＋ 確定 ＋ 推定) ＝ 20,000（forecastMonthEnd.vsBudget）", () => {
    const f = forecastMonthEnd(data(), today);
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    expect([f.spent, f.unpaidFixed, f.dailyVariable, f.daysAhead]).toEqual([45000, 20000, 3750, 4]);
    expect(f.projected).toBe(80000);
    expect(f.vsBudget).toBe(20000);
  });
  it("段階3（推定 b：予定の費用の目安）35,000 − 15,000 ＝ 20,000。1日あたりは今日を含む5日で 4,000（引く前は 7,000）", () => {
    const b = allowanceBreakdown(data(), today)!;
    expect(b.freeLeft).toBe(35000);
    expect(b.eventCostTotal).toBe(15000);
    expect(b.daysLeft).toBe(5);
    expect(b.perDay).toBe(7000);
    expect(b.perDayWithEvents).toBe(4000);
  });
  it("予算の数字は残高とは別（C007）：現金の残高の目安は予算に関係なく 基準 − 支出", () => {
    const d = data();
    cashBase(d, 300000, "2026-11-01");
    const r = cashBalance(d, today);
    expect(r.ok && r.balance).toBe(300000 - 45000);
  });
});

describe("T007 未設定の予算：0 と表示しない（FIN02：未設定は null、負数を隠さない）", () => {
  const d = () => {
    const x = emptyData(now);
    x.transactions = ["2026-11-14", "2026-11-20", "2026-11-25"].map((date, i) => tx({ id: `v${i}`, date, amount: 15000 }));
    return x;
  };
  it("予算なし：残り・自由に使える残り・1日あたり・見込みとの差は null（0 ではない）", () => {
    const l = monthLedger(d(), "2026-11", "2026-11-26");
    expect([l.budget, l.lifeBudgetLeft, l.freeLeft, l.perDay]).toEqual([null, null, null, null]);
    expect(remainingBudget(null, 0)).toBeNull();
    expect(allowanceBreakdown(d(), "2026-11-26")).toBeNull();
    const f = forecastMonthEnd(d(), "2026-11-26");
    expect(f.ok && f.vsBudget).toBeNull();
  });
  it("予算を超えたら負のまま出す：予算 10,000・実績 45,000 → 残り −35,000（表示にも − が付く）", () => {
    const x = d();
    x.budget.monthly = 10000;
    const l = monthLedger(x, "2026-11", "2026-11-26");
    expect(l.lifeBudgetLeft).toBe(-35000);
    expect(l.freeLeft).toBe(-35000);
    expect(formatYen(-35000)).toMatch(/[-−]/);
    expect(formatYen(-35000)).toContain("35,000");
  });
});

// ---------------------------------------------------------------- FIN01 / T002・T003・T004
describe("T002 カード：購入 10,000、引き落とし 10,000 → 費用は 10,000 だけ（FIN01・C009）", () => {
  const data = () => {
    const d = emptyData(now);
    d.transactions = [
      tx({ id: "buy", date: "2026-11-05", amount: 10000, paymentMethod: "card" }),
      tx({ id: "settle", date: "2026-11-26", amount: 10000, paymentMethod: "bank", countAs: "transfer", transferKind: "card" }),
    ];
    return d;
  };
  it("月の支出は 10,000（引き落としを足して 20,000 にしない）。収入は 0", () => {
    const d = data();
    expect(summarizeMonth(d.transactions, "2026-11").expense).toBe(10000);
    expect(summarizeMonth(d.transactions, "2026-11").income).toBe(0);
    const m = monthTotals(ledgerEvents(d), "2026-11");
    expect(m.purchaseNet).toBe(10000);
    expect(m.cardSettled).toBe(10000); // 現金の移動として別に持つ
    expect(monthLedger(d, "2026-11", "2026-11-27").spent).toBe(10000);
  });
  it("予算の自分用の数え方でも 10,000（版の差は投資だけ）", () => {
    expect(monthLedger(data(), "2026-11", "2026-11-27", true).spent).toBe(10000);
  });
  it("現金は引き落としの日に一度だけ減る：基準 100,000 → 90,000、引き落とし待ち 0", () => {
    const d = data();
    cashBase(d, 100000, "2026-10-31");
    const r = cashBalance(d, "2026-11-27");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.balance).toBe(90000);
    expect(r.cardPending).toBe(0);
  });
});

describe("T003 振替：口座 A から B へ 5,000 → 全体の収支 0（FIN01）。※口座 A・B の概念はない。今の「口座間の移動（収支に数えない）」で確かめる", () => {
  const data = () => {
    const d = emptyData(now);
    d.transactions = [
      tx({ id: "outA", date: "2026-11-10", amount: 5000, countAs: "transfer", note: "A→B" }),
      tx({ id: "inB", type: "income", categoryId: "inc-3", date: "2026-11-10", amount: 5000, countAs: "transfer", note: "A→B" }),
    ];
    return d;
  };
  it("支出 0・収入 0・収支 0", () => {
    const s = summarizeMonth(data().transactions, "2026-11");
    expect([s.expense, s.income, s.balance]).toEqual([0, 0, 0]);
  });
  it("持ち分の合計（現金の残高の目安）も変わらない", () => {
    const d = data();
    cashBase(d, 100000, "2026-10-31");
    const r = cashBalance(d, "2026-11-20");
    expect(r.ok && r.balance).toBe(100000);
  });
});

describe("T004 返金：購入 10,000、返金 3,000 → 純費用 7,000、現金の戻りは別（FIN01・C010 現行の意味を維持）", () => {
  it("同じ月：支出 7,000、収入 0（返金を収入にしない）、返金の戻り 3,000 は別に持つ", () => {
    const d = emptyData(now);
    d.transactions = [tx({ id: "buy", date: "2026-11-05", amount: 10000, paymentMethod: "cash" })];
    const r = applyRefund(d, "buy", 3000, "2026-11-20", "ref1", now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = summarizeMonth(r.next.transactions, "2026-11");
    expect([s.expense, s.income]).toEqual([7000, 0]);
    const m = monthTotals(ledgerEvents(r.next), "2026-11");
    expect([m.purchaseGross, m.purchaseNet, m.refundedInMonth, m.income]).toEqual([10000, 7000, 3000, 0]);
  });
  it("月をまたぐ：10月の購入は 10月の純額 7,000。11月の返金は11月の支出・収入を動かさず、現金の戻り 3,000 として11月に出る", () => {
    const d = emptyData(now);
    d.transactions = [tx({ id: "buy", date: "2026-10-25", amount: 10000, paymentMethod: "cash" })];
    const r = applyRefund(d, "buy", 3000, "2026-11-03", "ref1", now);
    if (!r.ok) throw new Error(r.error);
    expect(summarizeMonth(r.next.transactions, "2026-10").expense).toBe(7000);
    const nov = summarizeMonth(r.next.transactions, "2026-11");
    expect([nov.expense, nov.income]).toEqual([0, 0]);
    expect(monthTotals(ledgerEvents(r.next), "2026-11").refundedInMonth).toBe(3000);
  });
  it("現金の残高の目安：基準 100,000 − 10,000（購入日）＋ 3,000（返金日）＝ 93,000", () => {
    const d = emptyData(now);
    cashBase(d, 100000, "2026-10-31");
    d.transactions = [tx({ id: "buy", date: "2026-11-05", amount: 10000, paymentMethod: "cash" })];
    const r = applyRefund(d, "buy", 3000, "2026-11-20", "ref1", now);
    if (!r.ok) throw new Error(r.error);
    const b = cashBalance(r.next, "2026-11-26");
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect([b.spend, b.refunded, b.balance]).toEqual([10000, 3000, 93000]);
  });
});

// ---------------------------------------------------------------- T008
describe("T008 区間和：10–13 と 12–15 → 5時間（重なりを二重に数えない）。今のアプリでは予定のない時間（freeSlots）から確かめる", () => {
  it("活動時間 8:00〜22:00（14時間）のうち、ふさがっているのは 10:00〜15:00 の5時間。空きは 8〜10 と 15〜22", () => {
    const d = emptyData(now);
    d.events = [
      ev({ id: "a", startDate: "2026-11-27", allDay: false, startTime: "10:00", endTime: "13:00" }),
      ev({ id: "b", startDate: "2026-11-27", allDay: false, startTime: "12:00", endTime: "15:00" }),
    ];
    const slots = freeSlots(d, "2026-11-27");
    expect(slots.map((s) => [s.from, s.to])).toEqual([
      ["08:00", "10:00"],
      ["15:00", "22:00"],
    ]);
    const free = slots.reduce((a, s) => a + s.minutes, 0);
    expect(14 * 60 - free).toBe(5 * 60);
  });
});

// ---------------------------------------------------------------- T009
describe("T009 削除：旅行を消しても支出は残す（C012 実績保持）", () => {
  it("旅行につないだ支出は、件数・金額・日付そのままで、旅行とのつながりだけ外れる。ほかの旅行の支出は触らない", () => {
    const d = emptyData(now);
    d.trips = [
      { id: "t1", title: "京都", startDate: "2026-11-01", endDate: "2026-11-03", destination: "京都", budget: 50000, note: "", createdAt: now, updatedAt: now },
      { id: "t2", title: "大阪", startDate: "2026-12-01", endDate: "2026-12-02", destination: "大阪", budget: null, note: "", createdAt: now, updatedAt: now },
    ];
    d.transactions = [tx({ id: "a", amount: 12000, tripId: "t1" }), tx({ id: "b", amount: 3000, tripId: "t1" }), tx({ id: "c", amount: 800, tripId: "t2" })];
    const after = unlinkTripFromTx(d, "t1", "2026-11-27T00:00:00.000Z");
    expect(after.map((t) => [t.id, t.amount, t.date, t.tripId])).toEqual([
      ["a", 12000, "2026-11-01", undefined],
      ["b", 3000, "2026-11-01", undefined],
      ["c", 800, "2026-11-01", "t2"],
    ]);
    expect(summarizeMonth(after, "2026-11").expense).toBe(15800);
  });
  it("画面の旅行の削除（store の deleteTrip）は、支出を消さずに unlinkTripFromTx で外す（ソースの確認）", () => {
    const s = src("lib/store.tsx");
    const start = s.indexOf("deleteTrip: (id) =>");
    expect(start).toBeGreaterThan(0);
    const body = s.slice(start, s.indexOf("setTxTrip:", start));
    expect(body).toContain("transactions: unlinkTripFromTx(d, id");
    expect(body).not.toMatch(/transactions:\s*d\.transactions\.filter/);
  });
});

// ---------------------------------------------------------------- T010
describe("T010 保存の失敗（容量不足）：成功と言わない・書きかけを残す", () => {
  it("容量不足で保存できないと ok:false。画面のデータと保存済みの中身は前のまま、書きかけも残る", async () => {
    const before = emptyData(now);
    before.transactions = [tx({ id: "old", amount: 500 })];
    const raw = JSON.stringify(before);
    const kv = memKV({ [STORAGE_KEY]: raw });
    // 入力の途中の書きかけ（入力画面が控える）
    expect(saveSheetDraft("tx", null, { amount: "1200", merchant: "パン屋" }, new Date(now), kv)).toBe(true);
    // ここから容量不足（本体の保存だけ失敗させる）
    const full: KV = { ...kv, setItem: (k, v) => { if (k === STORAGE_KEY) throw new DOMException("full", "QuotaExceededError"); kv.setItem(k, v); } };
    const core = new StoreCore(new LocalStorageRepository(full));
    await core.reload();
    const r = await core.commit((d) => ({ ...d, transactions: [...d.transactions, tx({ id: "new", amount: 1200, merchant: "パン屋" })] }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("容量");
    expect(core.snapshot.data?.transactions.map((t) => t.id)).toEqual(["old"]);
    expect(kv.store.get(STORAGE_KEY)).toBe(raw);
    expect(loadSheetDraft<{ amount: string }>("tx", null, kv)?.draft.amount).toBe("1200");
  });
});

// ---------------------------------------------------------------- T012
describe("T012 移行：途中で強制終了しても、旧か新のどちらかの整合した状態（自分用の localStorage → IndexedDB）", () => {
  const old = () => {
    const d = emptyData(now);
    d.transactions = [tx({ id: "a", amount: 1000 }), tx({ id: "b", amount: 2500 })];
    return d;
  };
  it("仮置きを書いたところで終了 → 次の起動では正本はまだ旧データ（IndexedDB の本体なし）。やり直すと新に切り替わり、中身は同じ", async () => {
    const raw = JSON.stringify(old());
    const kv = memKV({ [STORAGE_KEY]: raw });
    const db = await openDb(new IDBFactory());
    const first = new IndexedDbRepository(db);
    expect(await first.putStaging(raw)).toBe(true); // ここで強制終了したとする
    const second = new IndexedDbRepository(db);
    expect(await second.load()).toEqual({ ok: true, data: null, revision: 0 });
    expect(await second.meta()).toBeNull();
    expect(kv.store.get(STORAGE_KEY)).toBe(raw);
    expect((await migrateFromLocalStorage(kv, second, now)).status).toBe("done");
    const l = await second.load();
    if (!l.ok || !l.data) throw new Error("読めない");
    expect(l.data.transactions.map((t) => [t.id, t.amount])).toEqual([
      ["a", 1000],
      ["b", 2500],
    ]);
  });
  it("切り替えの書き込みが途中で失敗 → 本体も印もない（旧のまま）。旧データは消えない", async () => {
    const raw = JSON.stringify(old());
    const kv = memKV({ [STORAGE_KEY]: raw });
    const repo = new IndexedDbRepository(await openDb(new IDBFactory()), (k) => k === "data");
    expect((await migrateFromLocalStorage(kv, repo, now)).status).toBe("failed");
    expect(await repo.load()).toEqual({ ok: true, data: null, revision: 0 });
    expect(await repo.meta()).toBeNull();
    expect(kv.store.get(STORAGE_KEY)).toBe(raw);
  });
  it("切り替えのあとに足した記録を、旧データからの移行のやり直しで上書きしない", async () => {
    const kv = memKV({ [STORAGE_KEY]: JSON.stringify(old()) });
    const repo = new IndexedDbRepository(await openDb(new IDBFactory()));
    expect((await migrateFromLocalStorage(kv, repo, now)).status).toBe("done");
    const l = await repo.load();
    if (!l.ok || !l.data) throw new Error("読めない");
    const next = { ...l.data, transactions: [...l.data.transactions, tx({ id: "afterMove", amount: 777 })] };
    expect((await repo.save(next, l.revision, now)).ok).toBe(true);
    expect((await migrateFromLocalStorage(kv, repo, now)).status).toBe("already");
    const l2 = await repo.load();
    expect(l2.ok && l2.data?.transactions.map((t) => t.id)).toEqual(["a", "b", "afterMove"]);
  });
});

// ---------------------------------------------------------------- T013
describe("T013 復元：壊れたファイル → 正本は変わらない", () => {
  const current = () => {
    const d = emptyData(now);
    d.transactions = [tx({ id: "keep", amount: 4321 })];
    return d;
  };
  const good = () => {
    const d = emptyData(now);
    d.transactions = [tx({ id: "x", amount: 100 })];
    return JSON.stringify(buildBackup(d, now));
  };
  it.each([
    ["途中で切れた", (t: string) => t.slice(0, Math.floor(t.length / 2))],
    ["中身を書き換えた（チェックサム不一致）", (t: string) => t.replace('"amount":100', '"amount":999')],
    ["ほかのアプリの JSON", () => JSON.stringify({ hello: "world" })],
    ["空", () => ""],
  ])("%s：プレビューの前に断り、保存の中身は前のまま", async (_name, broken) => {
    const raw = JSON.stringify(current());
    const kv = memKV({ [STORAGE_KEY]: raw });
    const core = new StoreCore(new LocalStorageRepository(kv));
    await core.reload();
    const p = parseBackup(broken(good()));
    expect(p.ok).toBe(false);
    expect(kv.store.get(STORAGE_KEY)).toBe(raw);
    expect(core.snapshot.data?.transactions.map((t) => [t.id, t.amount])).toEqual([["keep", 4321]]);
  });
  it("中身が検査を通らないデータでの置き換えは断る（金額が負）", () => {
    const cur = current();
    const bad = structuredClone(cur);
    bad.transactions = [tx({ id: "neg", amount: -5 })];
    expect(applyRestore(cur, bad, "replace").ok).toBe(false);
    expect(cur.transactions.map((t) => t.id)).toEqual(["keep"]);
  });
});

// ---------------------------------------------------------------- T014
describe("T014 CSV：同じ外部ID（元ID）を取り込み直しても重複しない", () => {
  const H = "日付,種類,金額,カテゴリ,内容,支払い方法,メモ,元ID\n";
  const importInto = (cur: AppData, text: string) => {
    const r = csvToIncoming(text, cur, now);
    if (!r.ok) throw new Error(r.error);
    const m = applyRestore(cur, r.incoming, "merge");
    if (!m.ok) throw new Error(m.error);
    return m;
  };
  it("1回目 3件 → 同じファイルをもう一度：足すのは 0件、件数・合計は同じ", () => {
    const csv = H + "2026-11-01,支出,500,食費,A,,,mf1\n2026-11-02,支出,700,食費,B,,,mf2\n2026-11-03,支出,900,食費,C,,,mf3\n";
    const a = importInto(emptyData(now), csv);
    expect(a.added).toBe(3);
    const b = importInto(a.data, csv);
    expect(b.added).toBe(0);
    expect(b.data.transactions).toHaveLength(3);
    expect(summarizeMonth(b.data.transactions, "2026-11").expense).toBe(2100);
  });
  it("期間が重なる別のファイル（同じ元ID を含む）：新しい元ID の分だけ足す", () => {
    const a = importInto(emptyData(now), H + "2026-11-01,支出,500,食費,A,,,mf1\n2026-11-02,支出,700,食費,B,,,mf2\n");
    const b = importInto(a.data, H + "2026-11-02,支出,700,食費,B,,,mf2\n2026-11-03,支出,900,食費,C,,,mf3\n");
    expect(b.added).toBe(1);
    expect(b.data.transactions).toHaveLength(3);
  });
  it("同じ日・同じ額でも、元ID が違えば別の明細として両方足す（同額同日だけで重複と決めない）", () => {
    const a = importInto(emptyData(now), H + "2026-11-05,支出,300,食費,コンビニ,,,mf10\n2026-11-05,支出,300,食費,コンビニ,,,mf11\n");
    expect(a.added).toBe(2);
    expect(summarizeMonth(a.data.transactions, "2026-11").expense).toBe(600);
  });
});

// ---------------------------------------------------------------- T016
describe("T016 版の境界：公開版では自分用だけの機能を出さない（C015・C025）", () => {
  it("試験の既定は公開版の組み立て", () => {
    expect(IS_PERSONAL).toBe(false);
  });
  it("自分用だけの機能（生活の変化・性能を測る・続けて使えているか）は公開版で無効", () => {
    expect([FEATURES.lifeChange, FEATURES.perfLab, FEATURES.usageDays]).toEqual([false, false, false]);
  });
  it("その画面は、公開版では中身を出さない（入口のページで FEATURES を見る）", () => {
    expect(src("app/life/page.tsx")).toMatch(/if \(!FEATURES\.lifeChange\)/);
    expect(src("app/perf/page.tsx")).toMatch(/if \(!FEATURES\.perfLab/);
  });
  it("予算の対象の版差を保つ（DECISIONS 2026-11-26 の 4）：公開版はすべての支出、自分用は投資を除く", () => {
    expect(BUDGET_EXCLUDES_INVEST).toBe(false);
    const d = emptyData(now);
    d.categories.push({ id: "inv", name: "証券", kind: "expense", order: 99, archived: false, role: "invest" });
    d.transactions = [tx({ id: "life", amount: 4000 }), tx({ id: "inv", categoryId: "inv", amount: 30000 })];
    expect(monthLedger(d, "2026-11", "2026-11-26").spent).toBe(34000);
    expect(monthLedger(d, "2026-11", "2026-11-26", true).spent).toBe(4000);
  });
});

// ---------------------------------------------------------------- T023
describe("T023 オフライン：基本の記録は外部の API なしで動く", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("通信を止めても、記録の追加・保存・読み込み直し・月の集計ができる（通信の呼び出しは 0 回）", async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetchSpy);
    const kv = memKV();
    const core = new StoreCore(new LocalStorageRepository(kv));
    await core.reload();
    expect(core.snapshot.status).toBe("ready");
    const r = await core.commit((d) => ({ ...d, transactions: [...d.transactions, tx({ id: "o1", amount: 650 })] }));
    expect(r.ok).toBe(true);
    const again = new StoreCore(new LocalStorageRepository(kv));
    await again.reload();
    expect(summarizeMonth(again.snapshot.data!.transactions, "2026-11").expense).toBe(650);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- T025（FIN03・C014）
describe("T025 未来日付：11/26 の承認④⑤を保つ（STATE 承認待ち 2026-11-26 昼、DECISIONS 2026-11-26）", () => {
  // 今日 11/20。変動費 3,000 × 3（11/5・11/10・11/15）、今日より後の日付の記録 8,000（11/25）、来月の記録 9,000（12/2）
  const data = () => {
    const d = emptyData(now);
    d.budget.monthly = 100000;
    d.transactions = [
      tx({ id: "v1", date: "2026-11-05", amount: 3000 }),
      tx({ id: "v2", date: "2026-11-10", amount: 3000 }),
      tx({ id: "v3", date: "2026-11-15", amount: 3000 }),
      tx({ id: "later", date: "2026-11-25", amount: 8000 }),
      tx({ id: "next", date: "2026-12-02", amount: 9000 }),
    ];
    return d;
  };
  const today = "2026-11-20";
  it("⑤ 今日より後の今月の日付の記録は、予算の使った額にも月末の見込みにも入る（来月の分は入らない）", () => {
    expect(monthLedger(data(), "2026-11", today).spent).toBe(17000);
    const f = forecastMonthEnd(data(), today);
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    // 変動費の1日あたり：9,000 ÷ 15日（11/5〜11/19）＝ 600。残り10日 → 6,000。見込み 17,000 ＋ 6,000
    expect([f.spent, f.dailyVariable, f.daysAhead, f.projected, f.vsBudget]).toEqual([17000, 600, 10, 23000, 77000]);
  });
  it("⑤ 自分用の数え方でも同じ（投資がないので 17,000）", () => {
    const f = forecastMonthEnd(data(), today, undefined, true);
    expect(f.ok && f.spent).toBe(17000);
  });
  it("FIN03 未来日付の記録を勝手に分け直さない（計算のあとも記録はそのまま）", () => {
    const d = data();
    const snap = structuredClone(d.transactions);
    monthLedger(d, "2026-11", today);
    forecastMonthEnd(d, today);
    allowanceBreakdown(d, today);
    expect(d.transactions).toEqual(snap);
  });
  it("④ 今日も続いている何日もの予定の費用は「これから」に1回だけ数える。終わった予定・来月の予定は入らない", () => {
    const d = data();
    d.events = [
      ev({ id: "ryokou", startDate: "2026-11-18", endDate: "2026-11-22", cost: 30000 }), // 今日（11/20）も続いている
      ev({ id: "owatta", startDate: "2026-11-10", endDate: "2026-11-12", cost: 5000 }),
      ev({ id: "kore", startDate: "2026-11-28", cost: 2000 }),
      ev({ id: "raigetsu", startDate: "2026-12-01", cost: 7000 }),
    ];
    const b = allowanceBreakdown(d, today)!;
    expect(b.eventCosts.map((e) => [e.title, e.cost])).toEqual([
      ["ryokou", 30000],
      ["kore", 2000],
    ]);
    expect(b.eventCostTotal).toBe(32000);
  });
  it("C014 二重計上を防ぐ：固定費（家賃 50,000・11/25）を固定費から先の日付で記録しても、見込みと残りは1回分だけ", () => {
    const d = data();
    d.transactions = d.transactions.filter((t) => t.id.startsWith("v"));
    d.recurring = [rc({ id: "yachin", amount: 50000, nextDueDate: "2026-11-25", categoryId: "exp-4" })];
    const l0 = monthLedger(d, "2026-11", today);
    const f0 = forecastMonthEnd(d, today);
    expect([l0.spent, l0.unpaidFixed, l0.freeLeft]).toEqual([9000, 50000, 41000]);
    // 固定費から記録（recurringId つき・次の支払日が進む）
    const paid: AppData = {
      ...d,
      transactions: [...d.transactions, tx({ id: "pay", date: "2026-11-25", amount: 50000, categoryId: "exp-4", recurringId: "yachin" })],
      recurring: applyRecurringPayment(d.recurring, "yachin", 50000, false, now),
    };
    const l1 = monthLedger(paid, "2026-11", today);
    const f1 = forecastMonthEnd(paid, today);
    expect([l1.spent, l1.unpaidFixed, l1.freeLeft]).toEqual([59000, 0, 41000]);
    expect(f0.ok && f1.ok && f1.projected).toBe(f0.ok ? f0.projected : NaN);
    // 固定費と結びつけずに手で先の日付で入れた場合の二重は、RAID I-03（低・友人βのあと）の既知の扱い。ここでは期待値にしない
  });
});

// ---------------------------------------------------------------- T026
describe("T026 期間：月末・閏日・日跨ぎの境界", () => {
  it("暦：2月の日数（平年 28・閏年 29・2100年は 28・2000年は 29）、2/29 の実在、年またぎ", () => {
    expect([daysInMonth(2026, 2), daysInMonth(2028, 2), daysInMonth(2100, 2), daysInMonth(2000, 2)]).toEqual([28, 29, 28, 29]);
    expect([isValidDateStr("2026-02-29"), isValidDateStr("2028-02-29"), isValidDateStr("2026-11-31")]).toEqual([false, true, false]);
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });
  it("固定費の次の支払日：月末を超える日は月末に丸め、次の月では元の日に戻る（PJ の決まり）", () => {
    expect(advanceDueDate("2026-01-31", "monthly", 31)).toBe("2026-02-28");
    expect(advanceDueDate("2026-02-28", "monthly", 31)).toBe("2026-03-31");
    expect(advanceDueDate("2028-01-31", "monthly", 31)).toBe("2028-02-29");
    expect(advanceDueDate("2026-12-15", "monthly", 15)).toBe("2027-01-15");
    expect(advanceDueDate("2028-02-29", "yearly", 29)).toBe("2029-02-28");
  });
  it("月の集計：11/30 は11月、12/1 は12月。12/31 と 1/1 も別の月", () => {
    const txs = [
      tx({ id: "a", date: "2026-11-30", amount: 1000 }),
      tx({ id: "b", date: "2026-12-01", amount: 2000 }),
      tx({ id: "c", date: "2026-12-31", amount: 4000 }),
      tx({ id: "d", date: "2027-01-01", amount: 8000 }),
    ];
    expect(["2026-11", "2026-12", "2027-01"].map((k) => summarizeMonth(txs, k).expense)).toEqual([1000, 6000, 8000]);
  });
  it("月末の日：残りの日数は今日を含めて 1、見込みの残りの日は 0（閏年の 2/29、2/28 は 2日）", () => {
    const d = emptyData(now);
    d.budget.monthly = 50000;
    expect(monthLedger(d, "2026-11", "2026-11-30").daysLeft).toBe(1);
    expect(monthLedger(d, "2028-02", "2028-02-29").daysLeft).toBe(1);
    expect(monthLedger(d, "2028-02", "2028-02-28").daysLeft).toBe(2);
    d.transactions = ["2026-11-10", "2026-11-20", "2026-11-29"].map((date, i) => tx({ id: `m${i}`, date, amount: 1000 }));
    const f = forecastMonthEnd(d, "2026-11-30");
    expect(f.ok && [f.daysAhead, f.projected]).toEqual([0, 3000]);
  });
  it("予定：毎月31日の予定は30日の月では30日に、毎年 2/29 の予定は平年は 2/28 に出る", () => {
    const m = ev({ id: "m", startDate: "2026-10-31", repeat: "monthly" });
    expect([occursOn(m, "2026-11-30"), occursOn(m, "2026-11-29"), occursOn(m, "2026-12-31")]).toEqual([true, false, true]);
    const y = ev({ id: "y", startDate: "2028-02-29", repeat: "yearly" });
    expect([occursOn(y, "2029-02-28"), occursOn(y, "2032-02-29"), occursOn(y, "2032-02-28")]).toEqual([true, true, false]);
  });
  it("日跨ぎ：11/30 23:00〜12/1 1:00 の予定は両方の日に出る。12/1 の活動時間 8〜22 はふさがない", () => {
    const d = emptyData(now);
    d.events = [ev({ id: "yakin", startDate: "2026-11-30", endDate: "2026-12-01", allDay: false, startTime: "23:00", endTime: "01:00" })];
    expect(eventsOnDay(d.events, "2026-11-30").map((e) => e.id)).toEqual(["yakin"]);
    expect(eventsOnDay(d.events, "2026-12-01").map((e) => e.id)).toEqual(["yakin"]);
    expect(eventsOnDay(d.events, "2026-12-02")).toEqual([]);
    expect(freeSlots(d, "2026-12-01").reduce((a, s) => a + s.minutes, 0)).toBe(14 * 60);
  });
});

// ---------------------------------------------------------------- T027
describe("T027 検索：日本語の表記の違いでも候補に出し、原文はそのまま", () => {
  const data = () => {
    const d = emptyData(now);
    d.transactions = [tx({ id: "sb", merchant: "スターバックス", amount: 1200 }), tx({ id: "cafe", merchant: "ｶﾌｪ ﾄﾞﾄｰﾙ", amount: 450 })];
    d.events = [ev({ id: "abc", title: "ＡＢＣ会議", startDate: "2026-11-30" })];
    return d;
  };
  const titles = (d: AppData, q: string) => searchAll(d, q).flatMap((g) => g.hits.map((h) => h.title));
  it("全角・半角・大文字小文字：「abc」で「ＡＢＣ会議」、「カフェ」で「ｶﾌｪ ﾄﾞﾄｰﾙ」。出すのは原文", () => {
    expect(titles(data(), "abc")).toEqual(["ＡＢＣ会議"]);
    expect(titles(data(), "カフェ")).toEqual(["ｶﾌｪ ﾄﾞﾄｰﾙ"]);
    expect(titles(data(), "ＤＯＵＴＯＲ")).toEqual([]); // 英字と仮名は別の語
  });
  it("全角の金額「１，２００」で 1,200円の記録", () => {
    expect(titles(data(), "１，２００")).toEqual(["スターバックス"]);
  });
  it("ひらがなとカタカナの違い：「すたーばっくす」で「スターバックス」", () => {
    expect(titles(data(), "すたーばっくす")).toEqual(["スターバックス"]);
  });
  it("検索しても記録は書き換えない", () => {
    const d = data();
    const snap = structuredClone(d);
    searchAll(d, "かふぇ");
    searchAll(d, "abc");
    expect(d).toEqual(snap);
  });
});

// ---------------------------------------------------------------- FIN04
describe("FIN04 金額：円の正の整数、MAX_AMOUNT と安全な整数を守る", () => {
  it("全角・カンマ・¥ を受け、0・小数・負・上限超えは断る", () => {
    expect(parseAmount("１，２００")).toEqual({ ok: true, value: 1200 });
    expect(parseAmount("¥1,200")).toEqual({ ok: true, value: 1200 });
    expect(parseAmount(String(MAX_AMOUNT))).toEqual({ ok: true, value: MAX_AMOUNT });
    for (const bad of ["0", "12.5", "-100", String(MAX_AMOUNT + 1), ""]) expect(parseAmount(bad).ok).toBe(false);
    expect(MAX_AMOUNT).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
  });
});
