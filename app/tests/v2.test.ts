import { describe, expect, it } from "vitest";
import { validateAppData } from "@/lib/schema";
import { loadData, saveData, STORAGE_KEY, type KV } from "@/lib/storage";
import { applyRestore, buildBackup, parseBackup } from "@/lib/backup";
import { checksum } from "@/lib/schema";
import { emptyData } from "@/lib/defaults";
import { eventsOnDay, occursOn } from "@/lib/aggregate";
import { advanceDueDate } from "@/lib/recurring";
import { NISA_LIMITS, nisaWarnings, summarizeNisa } from "@/lib/nisa";
import { goalProgress, studyStats, dueLabel, formatMinutes } from "@/lib/life";
import { buildNavi } from "@/lib/navi";
import { validateEvent } from "@/lib/validate";
import { COLLECTION_KEYS, type CalendarEvent, type Goal, type NisaEntry } from "@/lib/types";

class MemKV implements KV {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

/** Phase 1（v1）で保存されていた形そのままのデータ */
function v1Data() {
  return {
    schemaVersion: 1,
    transactions: [
      { id: "tx_a", type: "expense", date: "2026-11-21", amount: 1280, currency: "JPY", categoryId: "exp-1", merchant: "店", paymentMethod: "", note: "", source: "manual", createdAt: "x", updatedAt: "x" },
    ],
    events: [{ id: "ev_a", title: "食事", startDate: "2026-11-21", endDate: "2026-11-21", allDay: false, startTime: "19:00", endTime: "21:00", note: "", createdAt: "x", updatedAt: "x" }],
    categories: emptyData().categories,
    recurring: [
      { id: "rc_a", name: "家賃", amount: 80000, cycle: "monthly", anchorDay: 27, nextDueDate: "2026-11-27", categoryId: "exp-4", paymentMethod: "bank", active: true, createdAt: "x", updatedAt: "x" },
    ],
    budget: { monthly: 100000 },
    prefs: { home: { todaySpent: false, nextRecurring: true, needsReview: true } },
    meta: { createdAt: "2026-11-21T00:00:00.000Z", lastBackupAt: null },
  };
}

describe("v1 → v2 の移行（既存データを守る）", () => {
  it("v1 の保存データを読み込むと、既存のデータは1件も欠けず、新しい一覧が空で足される", () => {
    const kv = new MemKV();
    const raw = JSON.stringify(v1Data());
    kv.m.set(STORAGE_KEY, raw);
    const r = loadData(kv);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.data.schemaVersion).toBe(2);
    expect(r.data.transactions).toEqual(v1Data().transactions);
    expect(r.data.events).toEqual(v1Data().events);
    expect(r.data.recurring).toEqual(v1Data().recurring);
    expect(r.data.budget.monthly).toBe(100000);
    expect(r.data.prefs.home.todaySpent).toBe(false);
    for (const k of COLLECTION_KEYS) expect(r.data[k]).toEqual([]);
    // 読み込んだだけでは保存領域を書き換えない
    expect(kv.m.get(STORAGE_KEY)).toBe(raw);
    // 次に保存すると v2 になる
    expect(saveData(r.data, kv).ok).toBe(true);
    expect(JSON.parse(kv.m.get(STORAGE_KEY)!).schemaVersion).toBe(2);
  });

  it("v1 のバックアップファイルも復元できる（チェックサムは元の中身で確認）", () => {
    const d = v1Data();
    const file = { format: "kurashi-base-backup", schemaVersion: 1, exportedAt: "x", counts: { transactions: 1, events: 1, recurring: 1, categories: d.categories.length }, checksum: checksum(JSON.stringify(d)), data: d };
    const r = parseBackup(JSON.stringify(file));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preview.data.schemaVersion).toBe(2);
    expect(r.preview.warnings.some((w) => w.includes("古い形式"))).toBe(true);
    expect(r.preview.warnings.some((w) => w.includes("一致しません"))).toBe(false);
  });

  it("未来の形式（v3）は読み込まない", () => {
    expect(validateAppData({ ...v1Data(), schemaVersion: 3 }).ok).toBe(false);
  });

  it("v2 のバックアップは新しい一覧も含めて往復でき、追加モードで二重に入らない", () => {
    const d = emptyData();
    d.tasks.push({ id: "task_1", title: "牛乳を買う", due: "", done: false, note: "", createdAt: "x", updatedAt: "x" });
    d.studySubjects.push({ id: "subj_1", name: "簿記2級", examDate: "2027-02-22", targetHours: 200, archived: false, createdAt: "x", updatedAt: "x" });
    d.studyLogs.push({ id: "slog_1", subjectId: "subj_1", date: "2026-11-21", minutes: 60, note: "", createdAt: "x", updatedAt: "x" });
    const r = parseBackup(JSON.stringify(buildBackup(d)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preview.counts.tasks).toBe(1);
    const merged = applyRestore(d, r.preview.data, "merge");
    expect(merged.data.tasks).toHaveLength(1);
    expect(merged.data.studyLogs).toHaveLength(1);
  });

  it("存在しない資格を指す勉強記録は壊れたデータとして拒否", () => {
    const d = emptyData();
    d.studyLogs.push({ id: "slog_1", subjectId: "none", date: "2026-11-21", minutes: 30, note: "", createdAt: "x", updatedAt: "x" });
    expect(validateAppData(d).ok).toBe(false);
  });
});

const ev = (p: Partial<CalendarEvent>): CalendarEvent => ({
  id: "e", title: "t", startDate: "2026-01-31", endDate: "2026-01-31", allDay: true, startTime: "", endTime: "", note: "", createdAt: "", updatedAt: "", ...p,
});

describe("繰り返し予定", () => {
  it("毎週：7日ごと、開始日より前と終了日の後は出ない", () => {
    const e = ev({ startDate: "2026-11-02", endDate: "2026-11-02", repeat: "weekly", repeatUntil: "2026-11-30" });
    expect(occursOn(e, "2026-11-09")).toBe(true);
    expect(occursOn(e, "2026-11-10")).toBe(false);
    expect(occursOn(e, "2026-10-26")).toBe(false);
    expect(occursOn(e, "2026-12-07")).toBe(false);
  });
  it("毎月31日は、31日のない月は月末に出る", () => {
    const e = ev({ repeat: "monthly" });
    expect(occursOn(e, "2026-02-28")).toBe(true);
    expect(occursOn(e, "2026-04-30")).toBe(true);
    expect(occursOn(e, "2026-03-31")).toBe(true);
    expect(occursOn(e, "2026-03-30")).toBe(false);
  });
  it("毎年 2/29 は平年 2/28", () => {
    const e = ev({ startDate: "2028-02-29", endDate: "2028-02-29", repeat: "yearly" });
    expect(occursOn(e, "2029-02-28")).toBe(true);
    expect(occursOn(e, "2032-02-29")).toBe(true);
  });
  it("繰り返しなし（v1 の予定）は今までどおり", () => {
    expect(eventsOnDay([ev({})], "2026-02-28")).toHaveLength(0);
  });
  it("繰り返しは1日の予定だけ・終了日は開始日以降", () => {
    const base = { title: "a", startDate: "2026-11-21", endDate: "2026-11-22", allDay: true, startTime: "", endTime: "", note: "", repeat: "weekly" as const, repeatUntil: "" };
    expect(validateEvent(base).ok).toBe(false);
    expect(validateEvent({ ...base, endDate: "2026-11-21" }).ok).toBe(true);
    expect(validateEvent({ ...base, endDate: "2026-11-21", repeatUntil: "2026-11-01" }).ok).toBe(false);
  });
});

describe("毎週の固定費", () => {
  it("次回予定日は7日後（年またぎも）", () => {
    expect(advanceDueDate("2026-12-28", "weekly", 28)).toBe("2027-01-04");
  });
});

const ne = (p: Partial<NisaEntry>): NisaEntry => ({ id: Math.random().toString(36), date: "2026-03-01", kind: "buy", frame: "tsumitate", amount: 100000, name: "", note: "", createdAt: "", updatedAt: "", ...p });

describe("NISA の枠", () => {
  it("年間枠は年ごと・枠ごとに数える", () => {
    const s = summarizeNisa([ne({ amount: 600000 }), ne({ frame: "growth", amount: 1000000 }), ne({ date: "2025-05-01", amount: 1200000 })], 2026);
    expect(s.annualUsed).toEqual({ tsumitate: 600000, growth: 1000000 });
    expect(s.annualLeft).toEqual({ tsumitate: 600000, growth: 1400000 });
    expect(s.lifetimeUsed).toBe(2800000);
    expect(s.lifetimeLeft).toBe(NISA_LIMITS.lifetime - 2800000);
  });
  it("売却した簿価は翌年から生涯枠に戻る（年間枠は戻らない）", () => {
    const list = [ne({ date: "2026-01-10", amount: 1200000 }), ne({ kind: "sell", date: "2026-06-01", amount: 500000 })];
    const y2026 = summarizeNisa(list, 2026);
    expect(y2026.lifetimeUsed).toBe(1200000);
    expect(y2026.restoreNextYear).toBe(500000);
    expect(y2026.annualLeft.tsumitate).toBe(0);
    expect(summarizeNisa(list, 2027).lifetimeUsed).toBe(700000);
  });
  it("成長投資枠は生涯1,200万円まで", () => {
    const list = [2024, 2025, 2026, 2027, 2028].map((y) => ne({ date: `${y}-01-01`, frame: "growth", amount: 2400000 }));
    const s = summarizeNisa(list, 2028);
    expect(s.lifetimeGrowthUsed).toBe(12000000);
    expect(s.annualLeft.growth).toBe(0);
  });
  it("枠を超える買付・保有より多い売却は警告", () => {
    const list = [ne({ amount: 1000000 })];
    expect(nisaWarnings(list, { date: "2026-08-01", kind: "buy", frame: "tsumitate", amount: 300000 })).toHaveLength(1);
    expect(nisaWarnings(list, { date: "2026-08-01", kind: "buy", frame: "tsumitate", amount: 200000 })).toHaveLength(0);
    expect(nisaWarnings(list, { date: "2026-08-01", kind: "sell", frame: "growth", amount: 1 })).toHaveLength(1);
  });
});

describe("勉強・目標", () => {
  it("勉強時間の合計・直近7日・今日・試験までの日数", () => {
    const subj = { id: "s", name: "簿記", examDate: "2026-11-30", targetHours: 10, archived: false, createdAt: "", updatedAt: "" };
    const logs = [
      { id: "1", subjectId: "s", date: "2026-11-21", minutes: 90, note: "", createdAt: "", updatedAt: "" },
      { id: "2", subjectId: "s", date: "2026-11-15", minutes: 30, note: "", createdAt: "", updatedAt: "" },
      { id: "3", subjectId: "s", date: "2026-11-10", minutes: 60, note: "", createdAt: "", updatedAt: "" },
      { id: "4", subjectId: "other", date: "2026-11-21", minutes: 999, note: "", createdAt: "", updatedAt: "" },
    ];
    const st = studyStats(subj, logs, "2026-11-21");
    expect(st).toEqual({ totalMinutes: 180, weekMinutes: 120, todayMinutes: 90, daysToExam: 9, targetPct: 30 });
    expect(formatMinutes(90)).toBe("1時間30分");
    expect(formatMinutes(120)).toBe("2時間");
  });
  it("目標の進み具合は 0〜100 に収まる", () => {
    const g = (p: Partial<Goal>): Goal => ({ id: "g", title: "", deadline: "", kind: "number", target: 100, current: 0, unit: "", done: false, note: "", createdAt: "", updatedAt: "", ...p });
    expect(goalProgress(g({}))).toBe(0);
    expect(goalProgress(g({ current: 150 }))).toBe(100);
    expect(goalProgress(g({ current: 40 }))).toBe(40);
    expect(goalProgress(g({ target: null, current: 40 }))).toBe(0);
    expect(goalProgress(g({ kind: "check" }))).toBe(0);
    expect(goalProgress(g({ kind: "check", done: true }))).toBe(100);
    expect(dueLabel(null)).toBe("期限なし");
    expect(dueLabel(-2)).toBe("期限を2日過ぎています");
  });
});

describe("今日のナビ", () => {
  it("記録されたデータからだけ作り、注意→今日→お知らせの順に並ぶ", () => {
    const d = emptyData("2026-11-21T00:00:00.000Z");
    expect(buildNavi(d, "2026-11-21")).toEqual([]);
    d.tasks.push({ id: "t1", title: "期限切れ", due: "2026-11-20", done: false, note: "", createdAt: "", updatedAt: "" });
    d.tasks.push({ id: "t2", title: "今日まで", due: "2026-11-21", done: false, note: "", createdAt: "", updatedAt: "" });
    d.tasks.push({ id: "t3", title: "完了済み", due: "2026-11-20", done: true, note: "", createdAt: "", updatedAt: "" });
    d.contracts.push({ id: "c1", name: "スマホ", provider: "", amount: null, cycle: "monthly", renewalDate: "2026-12-10", status: "active", note: "", createdAt: "", updatedAt: "" });
    d.contracts.push({ id: "c2", name: "解約済み", provider: "", amount: null, cycle: "monthly", renewalDate: "2026-11-25", status: "cancelled", note: "", createdAt: "", updatedAt: "" });
    const items = buildNavi(d, "2026-11-21");
    expect(items.map((i) => i.title)).toEqual(["期限切れ", "今日まで", "スマホの更新まであと19日"]);
  });
});
