import { describe, expect, it } from "vitest";
import { addMonthsToKey, isValidDateStr, monthGrid, toDateStr, addDays, isValidTimeStr } from "@/lib/date";
import { parseAmount, formatYen, formatSignedYen } from "@/lib/money";
import { summarizeMonth, remainingBudget, eventsOnDay, daySummary } from "@/lib/aggregate";
import { advanceDueDate } from "@/lib/recurring";
import { findDuplicates, normalizeMerchant } from "@/lib/duplicates";
import { validateEvent, validateTx } from "@/lib/validate";
import { defaultCategories, emptyData } from "@/lib/defaults";
import type { CalendarEvent, Transaction } from "@/lib/types";

const tx = (p: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36),
  type: "expense",
  date: "2026-11-21",
  amount: 1000,
  currency: "JPY",
  categoryId: "exp-1",
  merchant: "",
  paymentMethod: "",
  note: "",
  source: "manual",
  createdAt: "2026-11-21T00:00:00.000Z",
  updatedAt: "2026-11-21T00:00:00.000Z",
  ...p,
});

describe("日付（ローカル）", () => {
  it("日本時間の深夜0時台でも前日にならない（toISOString を使わない）", () => {
    // ローカル 2026-11-21 00:30。UTC では 11/20 15:30 になるが、ローカル日付で扱う
    const d = new Date(2026, 10, 21, 0, 30);
    expect(toDateStr(d)).toBe("2026-11-21");
  });
  it("実在しない日付・形式違いを拒否", () => {
    expect(isValidDateStr("2026-02-29")).toBe(false);
    expect(isValidDateStr("2028-02-29")).toBe(true);
    expect(isValidDateStr("2026-13-01")).toBe(false);
    expect(isValidDateStr("2026/11/21")).toBe(false);
    expect(isValidDateStr("")).toBe(false);
    expect(isValidTimeStr("24:00")).toBe(false);
    expect(isValidTimeStr("09:05")).toBe(true);
  });
  it("月移動は年跨ぎを正しく扱う", () => {
    expect(addMonthsToKey("2026-12", 1)).toBe("2027-01");
    expect(addMonthsToKey("2027-01", -1)).toBe("2026-12");
    expect(addMonthsToKey("2026-11", -23)).toBe("2024-12");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("月グリッドは日曜始まり・全日を含む", () => {
    const g = monthGrid("2026-11"); // 2026-11-01 は日曜
    expect(g[0][0]).toBe("2026-11-01");
    expect(g.flat().filter(Boolean)).toHaveLength(30);
    expect(g.every((w) => w.length === 7)).toBe(true);
  });
});

describe("金額の入力検証", () => {
  it("正の整数を受け付ける（カンマ・全角・¥ 可）", () => {
    expect(parseAmount("1000")).toEqual({ ok: true, value: 1000 });
    expect(parseAmount("¥1,280")).toEqual({ ok: true, value: 1280 });
    expect(parseAmount("１２８０")).toEqual({ ok: true, value: 1280 });
  });
  it("未入力・0・負数・非数値・小数を拒否", () => {
    for (const s of ["", "0", "-100", "abc", "12.5", "1e3", "１０ー"]) expect(parseAmount(s).ok).toBe(false);
  });
  it("表示は桁区切りの日本円", () => {
    expect(formatYen(82450)).toBe("¥82,450");
    expect(formatSignedYen(-500)).toBe("-¥500");
  });
});

describe("月次集計・今月の残り", () => {
  const txs = [
    tx({ amount: 1000, date: "2026-11-01" }),
    tx({ amount: 200, date: "2026-11-30", categoryId: "exp-2" }),
    tx({ amount: 5000, date: "2026-12-01" }),
    tx({ type: "income", amount: 300000, date: "2026-11-25", categoryId: "inc-1" }),
    tx({ amount: 999, date: "2025-11-15" }),
  ];
  it("該当月だけを集計し、収入と支出を混同しない", () => {
    const s = summarizeMonth(txs, "2026-11");
    expect(s.expense).toBe(1200);
    expect(s.income).toBe(300000);
    expect(s.balance).toBe(298800);
    expect(s.byCategory[0]).toEqual({ categoryId: "exp-1", total: 1000 });
    expect(summarizeMonth(txs, "2026-12").expense).toBe(5000);
    expect(summarizeMonth(txs, "2025-11").expense).toBe(999);
  });
  it("AT-004: 予算3万円・支出1万円なら残り2万円", () => {
    expect(remainingBudget(30000, 10000)).toBe(20000);
  });
  it("AT-005: 予算未設定なら残額を出さない（null）", () => {
    expect(remainingBudget(null, 10000)).toBeNull();
  });
  it("日別集計", () => {
    const d = daySummary(txs, "2026-11-30");
    expect(d.expense).toBe(200);
    expect(d.list).toHaveLength(1);
  });
});

describe("予定", () => {
  const ev = (p: Partial<CalendarEvent>): CalendarEvent => ({
    id: Math.random().toString(36),
    title: "x",
    startDate: "2026-11-21",
    endDate: "2026-11-21",
    allDay: false,
    startTime: "19:00",
    endTime: "20:00",
    note: "",
    createdAt: "",
    updatedAt: "",
    ...p,
  });
  it("日跨ぎ予定は期間中の各日に一度だけ表示", () => {
    const list = [ev({ title: "旅行", startDate: "2026-12-31", endDate: "2027-01-02", allDay: true })];
    expect(eventsOnDay(list, "2026-12-31")).toHaveLength(1);
    expect(eventsOnDay(list, "2027-01-01")).toHaveLength(1);
    expect(eventsOnDay(list, "2027-01-03")).toHaveLength(0);
  });
  it("終日→時刻順に並ぶ", () => {
    const list = [ev({ title: "B", startTime: "19:00" }), ev({ title: "A", startTime: "08:00" }), ev({ title: "終日", allDay: true })];
    expect(eventsOnDay(list, "2026-11-21").map((e) => e.title)).toEqual(["終日", "A", "B"]);
  });
  it("終了が開始より前・空タイトルを拒否", () => {
    const base = { title: "a", startDate: "2026-11-21", endDate: "2026-11-21", allDay: false, startTime: "19:00", endTime: "18:00", note: "" };
    expect(validateEvent(base).ok).toBe(false);
    expect(validateEvent({ ...base, endTime: "19:00" }).ok).toBe(true);
    expect(validateEvent({ ...base, endTime: "20:00", title: "  " }).ok).toBe(false);
    expect(validateEvent({ ...base, allDay: true, startTime: "", endTime: "", endDate: "2026-11-20" }).ok).toBe(false);
  });
});

describe("取引の入力検証", () => {
  const cats = defaultCategories();
  const draft = { type: "expense" as const, date: "2026-11-21", amount: "1000", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "" };
  it("正しい入力は通る", () => expect(validateTx(draft, cats)).toEqual({ ok: true, amount: 1000 }));
  it("不正な日付・空カテゴリ・種別違いカテゴリを拒否", () => {
    expect(validateTx({ ...draft, date: "2026-02-30" }, cats).ok).toBe(false);
    expect(validateTx({ ...draft, categoryId: "" }, cats).ok).toBe(false);
    expect(validateTx({ ...draft, categoryId: "inc-1" }, cats).ok).toBe(false);
    expect(validateTx({ ...draft, amount: "0" }, cats).ok).toBe(false);
  });
});

describe("固定費", () => {
  it("月末日を基準にした毎月の次回予定日（31日→2月末→3/31）", () => {
    expect(advanceDueDate("2026-01-31", "monthly", 31)).toBe("2026-02-28");
    expect(advanceDueDate("2026-02-28", "monthly", 31)).toBe("2026-03-31");
    expect(advanceDueDate("2026-12-27", "monthly", 27)).toBe("2027-01-27");
    expect(advanceDueDate("2028-02-29", "yearly", 29)).toBe("2029-02-28");
  });
  it("AT-009: 固定費を登録しただけでは支出集計に入らない", () => {
    const d = emptyData();
    d.recurring.push({
      id: "r1", name: "家賃", amount: 80000, cycle: "monthly", anchorDay: 27, nextDueDate: "2026-11-27",
      categoryId: "exp-4", paymentMethod: "bank", active: true, createdAt: "", updatedAt: "",
    });
    expect(summarizeMonth(d.transactions, "2026-11").expense).toBe(0);
  });
});

describe("重複候補", () => {
  const existing = [tx({ id: "a", amount: 1280, merchant: "ローソン 渋谷店", date: "2026-11-21", sourceFingerprint: "fp1" })];
  it("同じ画像指紋は確定的な候補", () => {
    const r = findDuplicates({ type: "expense", date: "2026-11-25", amount: 1, merchant: "", paymentMethod: "", sourceFingerprint: "fp1" }, existing);
    expect(r[0]?.strength).toBe("exact");
  });
  it("同額・近い日付・店名類似は類似候補", () => {
    const r = findDuplicates({ type: "expense", date: "2026-11-22", amount: 1280, merchant: "ローソン渋谷店", paymentMethod: "" }, existing);
    expect(r).toHaveLength(1);
    expect(r[0].strength).toBe("similar");
  });
  it("金額だけ一致・店名が別なら候補にしない（単一項目一致で重複扱いしない）", () => {
    const r = findDuplicates({ type: "expense", date: "2026-11-21", amount: 1280, merchant: "スーパーA", paymentMethod: "" }, existing);
    expect(r).toHaveLength(0);
  });
  it("編集中の自分自身は除外", () => {
    const r = findDuplicates({ type: "expense", date: "2026-11-21", amount: 1280, merchant: "ローソン渋谷店", paymentMethod: "", excludeId: "a" }, existing);
    expect(r).toHaveLength(0);
  });
  it("店名正規化", () => expect(normalizeMerchant("ＡＢＣ　ストア")).toBe("abcストア"));
});
