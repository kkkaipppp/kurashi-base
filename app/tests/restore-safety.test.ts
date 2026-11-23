import { describe, expect, it } from "vitest";
import { applyRestore, buildBackup, parseBackup } from "@/lib/backup";
import { emptyData } from "@/lib/defaults";
import { migrate, validateAppData } from "@/lib/schema";
import { buildNavi } from "@/lib/navi";
import { summarizeNisa } from "@/lib/nisa";
import { occursOn } from "@/lib/aggregate";
import type { AppData, CalendarEvent, NisaEntry, Transaction } from "@/lib/types";

// docs/ux-autonomous/05_SAFETY_REVIEW.md の「必須のテスト例」と 06 の A03〜A09

const tx = (p: Partial<Transaction>): Transaction => ({
  id: "tx_1", type: "expense", date: "2026-11-21", amount: 1000, currency: "JPY", categoryId: "exp-1",
  merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: "x", updatedAt: "x", ...p,
});

function withCustomCategory(name: string): AppData {
  const d = emptyData("2026-11-01T00:00:00.000Z");
  d.categories.push({ id: "cat_x", name, kind: "expense", order: 99, archived: false });
  return d;
}

describe("A03：同じIDで意味の違うカテゴリを含むバックアップを追加復元", () => {
  it("違うカテゴリに取引が紐づかない（その取引は取り込まず、理由を数える）", () => {
    const current = withCustomCategory("ペット");
    current.transactions.push(tx({ id: "tx_a", categoryId: "cat_x", amount: 500 }));
    const incoming = withCustomCategory("ゲーム課金"); // 同じ cat_x だが意味が違う
    incoming.transactions.push(tx({ id: "tx_b", categoryId: "cat_x", amount: 9800 }));
    incoming.transactions.push(tx({ id: "tx_c", categoryId: "exp-1", amount: 300 })); // 共通カテゴリはOK
    const r = applyRestore(current, incoming, "merge");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.categories.find((c) => c.id === "cat_x")?.name).toBe("ペット");
    expect(r.data.transactions.map((t) => t.id).sort()).toEqual(["tx_a", "tx_c"]);
    expect(r.conflicts).toBe(1); // カテゴリ1件
    expect(r.dependentSkipped).toBe(1); // tx_b
    expect(validateAppData(r.data).ok).toBe(true);
  });
  it("名前と種別が同じなら同じカテゴリとして扱い、取引は取り込む", () => {
    const current = withCustomCategory("ペット");
    const incoming = withCustomCategory("ペット");
    incoming.categories.find((c) => c.id === "cat_x")!.order = 3; // 並び順だけ違う
    incoming.transactions.push(tx({ id: "tx_b", categoryId: "cat_x" }));
    const r = applyRestore(current, incoming, "merge");
    expect(r.ok && r.data.transactions.length).toBe(1);
    expect(r.ok && r.conflicts).toBe(0);
  });
});

describe("初期カテゴリの名前を変えたあとの追加復元（2026-11-23 カテゴリの名前変更を入れたとき）", () => {
  it("名前を変えた初期カテゴリ（exp-1）の取引は、名前が違っても取り込む。今の名前を残す", () => {
    const current = emptyData("2026-11-01T00:00:00.000Z"); // exp-1 は「食費」のまま（新しい端末）
    const incoming = emptyData("2026-11-01T00:00:00.000Z");
    incoming.categories.find((c) => c.id === "exp-1")!.name = "ごはん";
    incoming.transactions.push(tx({ id: "tx_r", categoryId: "exp-1", amount: 1200 }));
    const r = applyRestore(current, incoming, "merge");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.transactions.map((t) => t.id)).toEqual(["tx_r"]);
    expect(r.dependentSkipped).toBe(0);
    expect(r.conflicts).toBe(0);
    expect(r.data.categories.find((c) => c.id === "exp-1")?.name).toBe("食費");
  });
  it("自分で作ったカテゴリは、今までどおり名前が違えば取り込まない（A03）", () => {
    const current = withCustomCategory("ペット");
    const incoming = withCustomCategory("ゲーム課金");
    incoming.transactions.push(tx({ id: "tx_b", categoryId: "cat_x" }));
    const r = applyRestore(current, incoming, "merge");
    expect(r.ok && r.dependentSkipped).toBe(1);
  });
});

describe("A04：同じIDで別の資格＋勉強記録を追加復元", () => {
  it("勉強記録が別の資格に付け替わらない", () => {
    const current = emptyData();
    current.studySubjects.push({ id: "subj_1", name: "簿記2級", examDate: "", targetHours: null, archived: false, createdAt: "x", updatedAt: "x" });
    current.studyLogs.push({ id: "slog_a", subjectId: "subj_1", date: "2026-11-20", minutes: 60, note: "", createdAt: "x", updatedAt: "x" });
    const incoming = emptyData();
    incoming.studySubjects.push({ id: "subj_1", name: "TOEIC", examDate: "", targetHours: null, archived: false, createdAt: "x", updatedAt: "x" });
    incoming.studyLogs.push({ id: "slog_b", subjectId: "subj_1", date: "2026-11-21", minutes: 30, note: "", createdAt: "x", updatedAt: "x" });
    const r = applyRestore(current, incoming, "merge");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.studySubjects).toHaveLength(1);
    expect(r.data.studySubjects[0].name).toBe("簿記2級");
    expect(r.data.studyLogs.map((l) => l.id)).toEqual(["slog_a"]);
    expect(r.conflicts).toBe(1);
    expect(r.dependentSkipped).toBe(1);
  });
  it("同じ資格（名前が同じ）なら、その勉強記録は取り込む", () => {
    const current = emptyData();
    current.studySubjects.push({ id: "subj_1", name: "簿記2級", examDate: "", targetHours: null, archived: false, createdAt: "x", updatedAt: "x" });
    const incoming = structuredClone(current);
    incoming.studySubjects[0].examDate = "2027-02-22"; // 試験日を後で入れただけ
    incoming.studyLogs.push({ id: "slog_b", subjectId: "subj_1", date: "2026-11-21", minutes: 30, note: "", createdAt: "x", updatedAt: "x" });
    const r = applyRestore(current, incoming, "merge");
    expect(r.ok && r.data.studyLogs.length).toBe(1);
  });
});

describe("同じIDで中身の違う記録（取引など）", () => {
  it("今の記録を残し、競合として数える", () => {
    const current = emptyData();
    current.transactions.push(tx({ id: "tx_1", amount: 1000 }));
    const incoming = emptyData();
    incoming.transactions.push(tx({ id: "tx_1", amount: 99999 }));
    const r = applyRestore(current, incoming, "merge");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.transactions[0].amount).toBe(1000);
    expect(r.conflicts).toBe(1);
    expect(r.duplicates).toBe(0);
  });
  it("まったく同じ記録は「同じ記録」として数える", () => {
    const d = emptyData();
    d.transactions.push(tx({}));
    const r = applyRestore(d, structuredClone(d), "merge");
    expect(r.ok && r.duplicates).toBe(1);
    expect(r.ok && r.added).toBe(0);
  });
});

describe("復元結果の再検証", () => {
  it("合成した結果が壊れていたら、保存用のデータを返さない", () => {
    const current = emptyData();
    const incoming = emptyData();
    // 取り込む側に、今のデータの資格を指す記録だけがある（資格は今のデータにだけ存在）→ 合成すると有効
    current.studySubjects.push({ id: "subj_1", name: "簿記", examDate: "", targetHours: null, archived: false, createdAt: "x", updatedAt: "x" });
    incoming.studySubjects.push({ id: "subj_1", name: "簿記", examDate: "", targetHours: null, archived: false, createdAt: "x", updatedAt: "x" });
    incoming.studyLogs.push({ id: "slog_1", subjectId: "subj_1", date: "2026-11-21", minutes: 10, note: "", createdAt: "x", updatedAt: "x" });
    expect(applyRestore(current, incoming, "merge").ok).toBe(true);
    // 置き換えでも検証する
    const broken = structuredClone(incoming);
    broken.studySubjects = [];
    expect(applyRestore(current, broken, "replace").ok).toBe(false);
  });
  it("A05：0件のバックアップを追加しても何も変わらない", () => {
    const current = emptyData();
    current.transactions.push(tx({}));
    const r = applyRestore(current, emptyData(), "merge");
    expect(r.ok && r.data.transactions).toEqual(current.transactions);
    expect(r.ok && r.added).toBe(0);
  });
  it("A05：壊れたファイル・チェックサム違い・参照先なしは読み込まない", () => {
    expect(parseBackup("{").ok).toBe(false);
    const d = emptyData();
    d.studyLogs.push({ id: "slog_1", subjectId: "none", date: "2026-11-21", minutes: 10, note: "", createdAt: "x", updatedAt: "x" });
    expect(parseBackup(JSON.stringify(buildBackup(d))).ok).toBe(false);
  });
});

describe("移行：v1 と書かれていても、すでにある新しい一覧は消さない", () => {
  it("正しい配列があればそのまま使う", () => {
    const d = emptyData() as unknown as Record<string, unknown>;
    d.schemaVersion = 1;
    d.tasks = [{ id: "task_1", title: "残すべきタスク", due: "", done: false, note: "", createdAt: "x", updatedAt: "x" }];
    const m = migrate(d) as AppData;
    expect(m.schemaVersion).toBe(2);
    expect(m.tasks).toHaveLength(1);
    expect(m.notes).toEqual([]);
  });
  it("配列でない値は空にせず、壊れたデータとして止める", () => {
    const d = emptyData() as unknown as Record<string, unknown>;
    d.schemaVersion = 1;
    d.tasks = "おかしな値";
    expect(validateAppData(d).ok).toBe(false);
  });
});

describe("今日のナビ（UX-004 / UX-010）", () => {
  it("バックアップの案内は、タスクだけ使う人にも出る（0件では出ない）", () => {
    const d = emptyData("2026-10-01T00:00:00.000Z");
    expect(buildNavi(d, "2026-11-21").some((i) => i.key === "backup")).toBe(false);
    d.tasks.push({ id: "t", title: "a", due: "", done: false, note: "", createdAt: "", updatedAt: "" });
    expect(buildNavi(d, "2026-11-21").some((i) => i.key === "backup")).toBe(true);
  });
  it("試験は30日以内だけ出す（先の試験で大事な通知が埋もれない）", () => {
    const d = emptyData("2026-11-21T00:00:00.000Z");
    d.studySubjects.push({ id: "s1", name: "遠い試験", examDate: "2027-06-01", targetHours: null, archived: false, createdAt: "", updatedAt: "" });
    d.studySubjects.push({ id: "s2", name: "近い試験", examDate: "2026-12-10", targetHours: null, archived: false, createdAt: "", updatedAt: "" });
    const titles = buildNavi(d, "2026-11-21").map((i) => i.title);
    expect(titles.some((t) => t.includes("遠い試験"))).toBe(false);
    expect(titles.some((t) => t.includes("近い試験"))).toBe(true);
  });
  it("ナビの項目は、対象の記録を開くリンクを持つ", () => {
    const d = emptyData("2026-11-21T00:00:00.000Z");
    d.tasks.push({ id: "task_9", title: "期限切れ", due: "2026-11-01", done: false, note: "", createdAt: "", updatedAt: "" });
    expect(buildNavi(d, "2026-11-21")[0].href).toBe("/tasks?open=task_9");
  });
});

const ne = (p: Partial<NisaEntry>): NisaEntry => ({ id: Math.random().toString(36), date: "2026-03-01", kind: "buy", frame: "tsumitate", amount: 100000, name: "", note: "", createdAt: "", updatedAt: "", ...p });

describe("A08：NISA の境界", () => {
  it("同じ年に売っても、その年の年間枠も生涯枠も戻らない", () => {
    const s = summarizeNisa([ne({ amount: 1200000, date: "2026-01-05" }), ne({ kind: "sell", amount: 1200000, date: "2026-12-31" })], 2026);
    expect(s.annualLeft.tsumitate).toBe(0);
    expect(s.lifetimeUsed).toBe(1200000);
    expect(summarizeNisa([ne({ amount: 1200000, date: "2026-01-05" }), ne({ kind: "sell", amount: 1200000, date: "2026-12-31" })], 2027).lifetimeUsed).toBe(0);
  });
  it("2024年より前の日付の記録は、どの年の枠にも数えない（記録の誤りとして扱う）", () => {
    const s = summarizeNisa([ne({ date: "2023-05-01", amount: 500000 })], 2026);
    expect(s.lifetimeUsed).toBe(0);
  });
});

describe("A09：繰り返し予定の終了日の境界", () => {
  const e: CalendarEvent = { id: "e", title: "t", startDate: "2026-01-31", endDate: "2026-01-31", allDay: true, startTime: "", endTime: "", note: "", repeat: "monthly", repeatUntil: "2026-04-30", createdAt: "", updatedAt: "" };
  it("終了日の当日は出て、翌日以降は出ない", () => {
    expect(occursOn(e, "2026-04-30")).toBe(true);
    expect(occursOn(e, "2026-05-31")).toBe(false);
  });
  it("閏年の2月は29日に出る", () => {
    expect(occursOn({ ...e, repeatUntil: "" }, "2028-02-29")).toBe(true);
    expect(occursOn({ ...e, repeatUntil: "" }, "2028-02-28")).toBe(false);
  });
});
