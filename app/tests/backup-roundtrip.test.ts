import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { applyRestore, buildBackup, parseBackup } from "@/lib/backup";
import { emptyData } from "@/lib/defaults";
import { IdbRepositoryAdapter } from "@/lib/idbAdapter";
import { LocalStorageRepository } from "@/lib/repository";
import { StoreCore } from "@/lib/storeCore";
import { cashBalance } from "@/lib/balance";
import { ledgerEvents, monthTotals, refundConservationErrors } from "@/lib/ledgerCore";
import { summarizeMonth } from "@/lib/aggregate";
import { monthBreakdown } from "@/lib/monthBreakdown";
import type { KV } from "@/lib/storage";
import { checksum } from "@/lib/schema";
import type { AppData } from "@/lib/types";
import { MONTHS, now, synth } from "./fixtures/synth";

// v22 G0（P0）：バックアップの往復。書き出したファイルから戻して、記録が1件も欠けず・変わらず、
// お金の答え（各月の収支・生活費・投資・残高の目安）も同じになることを確かめる。
// 道すじ：今のデータ → 書き出し（ファイルの文字列）→ 読み込みの検査 → 置き換えで復元 → 保存（localStorage と IndexedDB）→ 開き直す
const memKV = (): KV => {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as KV;
};

/** 任意の項目をできるだけ使ったデータ（返金・一部払い・生活の変化・目標の節目・予定とタスクのつながり・旅行・カード開始債務） */
function rich(seed: number): AppData {
  const d = synth(seed);
  d.assets = [{ id: "as1", name: "銀行", kind: "cash", value: 500000, asOf: "2026-11-01", cardDebt: 40000, note: "", createdAt: now, updatedAt: now } as AppData["assets"][number]];
  d.goals = [{ id: "g1", title: "引っ越す", deadline: "2027-03-31", kind: "check", target: null, current: 0, unit: "", done: false, note: "", steps: [{ id: "st1", text: "見積り", done: false, due: "2026-12-10" }, { id: "st2", text: "契約", done: true }], createdAt: now, updatedAt: now } as AppData["goals"][number]];
  d.meta = { ...d.meta, lifeChanges: [{ id: "lc1", title: "引っ越し", date: "2026-12-01", status: "planned", createdAt: now, items: [{ kind: "budget", before: 150000, after: 170000 }] }] } as AppData["meta"];
  d.trips = [{ id: "tr1", title: "京都", destination: "京都駅", startDate: "2026-12-20", endDate: "2026-12-22", budget: 60000, note: "", createdAt: now, updatedAt: now } as NonNullable<AppData["trips"]>[number]];
  d.events = [...d.events, { id: "e2", title: "新幹線", startDate: "2026-12-20", endDate: "2026-12-20", allDay: false, startTime: "08:00", endTime: "10:15", note: "改行\nあり・\"引用\"・絵文字🚄", tripId: "tr1", createdAt: now, updatedAt: now } as AppData["events"][number]];
  d.tasks = [{ id: "t1", title: "切符を買う", due: "2026-12-01", done: false, note: "", eventId: "e2", createdAt: now, updatedAt: now } as AppData["tasks"][number]];
  d.recurring = d.recurring.map((r) => (r.id === "rc" ? { ...r, partialPaid: { due: r.nextDueDate, paid: 30000 } } : r));
  return d;
}

/** お金の答え（画面に出る数字）をまとめたもの。往復の前後で同じでなければならない */
const money = (d: AppData) => {
  const ev = ledgerEvents(d);
  return {
    months: MONTHS.map((m) => ({ m, s: summarizeMonth(d.transactions, m), t: monthTotals(ev, m), b: monthBreakdown(d, m, "2026-11-25") })),
    conservation: refundConservationErrors(ev),
    balance: cashBalance(d, "2026-11-30"),
  };
};

describe("バックアップの往復（v22 G0）", () => {
  it("50通りのデータ：書き出し → 読み込み → 置き換えで復元 → 中身もお金の答えも同じ", () => {
    for (let s = 1; s <= 50; s++) {
      const d = rich(s);
      const text = JSON.stringify(buildBackup(d, now)); // ファイルに書かれる文字列
      const p = parseBackup(text);
      if (!p.ok) throw new Error(`seed ${s}: ${p.error}`);
      expect(p.preview.warnings).toEqual([]);
      const r = applyRestore(emptyData(now), p.preview.data, "replace");
      if (!r.ok) throw new Error(`seed ${s}: ${r.error}`);
      expect(r.data).toStrictEqual(d); // 1件も欠けず（値が undefined の項目の違いも見る）、どの項目も変わらない（任意の項目も残る）
      expect(money(r.data)).toEqual(money(d));
      expect(money(d).conservation).toEqual([]);
    }
  });

  it("同じバックアップを、同じデータに「追加」で戻しても、何も増えない・変わらない", () => {
    for (let s = 1; s <= 20; s++) {
      const d = rich(s);
      const p = parseBackup(JSON.stringify(buildBackup(d, now)));
      if (!p.ok) throw new Error(p.error);
      const r = applyRestore(d, p.preview.data, "merge");
      if (!r.ok) throw new Error(r.error);
      expect(r.added).toBe(0);
      expect(r.conflicts).toBe(0);
      expect(r.data).toEqual(d);
      expect(money(r.data)).toEqual(money(d));
    }
  });

  it("空の端末に「追加」で戻すと、全部入る（中身もお金の答えも同じ）", () => {
    const d = rich(7);
    const p = parseBackup(JSON.stringify(buildBackup(d, now)));
    if (!p.ok) throw new Error(p.error);
    const r = applyRestore(emptyData(now), p.preview.data, "merge");
    if (!r.ok) throw new Error(r.error);
    expect(r.dependentSkipped).toBe(0);
    expect(r.data.transactions).toEqual(d.transactions);
    expect(r.data.goals).toEqual(d.goals);
    expect(r.data.tasks).toEqual(d.tasks);
    expect(r.data.assets).toEqual(d.assets); // 資産も入る（上書きして比べない。独立点検 低3）
    expect(money(r.data)).toEqual(money(d));
  });

  for (const kind of ["localStorage", "indexedDB"] as const) {
    it(`${kind}：復元して保存 → 開き直しても同じ。取り消すと復元の前に戻る`, async () => {
      const make = () => {
        if (kind === "localStorage") {
          const kv = memKV();
          return () => new LocalStorageRepository(kv);
        }
        const factory = new IDBFactory();
        const legacy = memKV();
        return () => new IdbRepositoryAdapter({ factory, legacy });
      };
      const repoOf = make();
      const before = rich(3);
      const core = new StoreCore(repoOf());
      await core.reload();
      // 復元の前に、端末に別のデータがある
      expect((await core.commit(() => before)).ok).toBe(true);
      const target = rich(11);
      const p = parseBackup(JSON.stringify(buildBackup(target, now)));
      if (!p.ok) throw new Error(p.error);
      const r = applyRestore(core.snapshot.data!, p.preview.data, "replace");
      if (!r.ok) throw new Error(r.error);
      const saved = await core.commit(() => r.data, { undoReason: "バックアップから復元", base: core.snapshot.data! });
      expect(saved.ok).toBe(true);
      // 開き直す（新しい store・同じ保存場所）
      const again = new StoreCore(repoOf());
      await again.reload();
      expect(again.snapshot.status).toBe("ready");
      expect(again.snapshot.data).toStrictEqual(target);
      expect(money(again.snapshot.data!)).toEqual(money(target));
      // 取り消すと、復元の前のデータに戻る（復元で記録を失わない）
      expect((await again.undoLast()).ok).toBe(true);
      const third = new StoreCore(repoOf());
      await third.reload();
      expect(third.snapshot.data).toEqual(before);
    });
  }

  it("IndexedDB：復元の保存に失敗したら「失敗」と返し、開き直すと復元の前のデータのまま", async () => {
    const factory = new IDBFactory();
    const legacy = memKV();
    let fail = false;
    const repoOf = () => new IdbRepositoryAdapter({ factory, legacy, fault: (k) => fail && k === "data" });
    const before = rich(4);
    const core = new StoreCore(repoOf());
    await core.reload();
    expect((await core.commit(() => before)).ok).toBe(true);
    const p = parseBackup(JSON.stringify(buildBackup(rich(9), now)));
    if (!p.ok) throw new Error(p.error);
    const r = applyRestore(core.snapshot.data!, p.preview.data, "replace");
    if (!r.ok) throw new Error(r.error);
    fail = true;
    const saved = await core.commit(() => r.data, { undoReason: "バックアップから復元", base: core.snapshot.data! });
    expect(saved.ok).toBe(false);
    fail = false;
    const again = new StoreCore(repoOf());
    await again.reload();
    expect(again.snapshot.data).toStrictEqual(before);
  });

  it("別のタブで先に保存されていたら、古い画面からの復元は保存しない（新しい記録を上書きしない）", async () => {
    const kv = memKV();
    const a = new StoreCore(new LocalStorageRepository(kv));
    const b = new StoreCore(new LocalStorageRepository(kv));
    await a.reload();
    await b.reload();
    const base = a.snapshot.data!;
    // ほかのタブ（b）が先に記録を足す
    expect((await b.commit((d) => ({ ...d, transactions: [...d.transactions, { ...rich(1).transactions[0], id: "newer" }] }))).ok).toBe(true);
    const p = parseBackup(JSON.stringify(buildBackup(rich(2), now)));
    if (!p.ok) throw new Error(p.error);
    const r = applyRestore(base, p.preview.data, "replace");
    if (!r.ok) throw new Error(r.error);
    const saved = await a.commit(() => r.data, { undoReason: "バックアップから復元", base });
    expect(saved.ok).toBe(false);
    const c = new StoreCore(new LocalStorageRepository(kv));
    await c.reload();
    expect(c.snapshot.data!.transactions.some((t) => t.id === "newer")).toBe(true);
  });

  it("古い形（v1）のバックアップも戻せる。記録と金額はそのまま", () => {
    const d = rich(6);
    const v1 = { schemaVersion: 1, transactions: d.transactions.filter((t) => !t.refundOf && !t.refundGross && !t.countAs).map(({ id, type, date, amount, currency, categoryId, merchant, paymentMethod, note, source, createdAt, updatedAt }) => ({ id, type, date, amount, currency, categoryId, merchant, paymentMethod, note, source, createdAt, updatedAt })), events: [], categories: d.categories, recurring: [], budget: { monthly: 100000 }, prefs: d.prefs, meta: { createdAt: now, lastBackupAt: null } };
    const file = { format: "kurashi-base-backup", schemaVersion: 1, exportedAt: now, checksum: "", data: v1 };
    file.checksum = checksum(JSON.stringify(v1)); // チェックサムは中身の文字列から
    const p = parseBackup(JSON.stringify(file));
    if (!p.ok) throw new Error(p.error);
    expect(p.preview.warnings.join("")).toContain("古い形式");
    const r = applyRestore(emptyData(now), p.preview.data, "replace");
    if (!r.ok) throw new Error(r.error);
    expect(r.data.schemaVersion).toBe(2);
    expect(r.data.transactions.map((t) => [t.id, t.amount])).toEqual(v1.transactions.map((t) => [t.id, t.amount]));
    for (const mo of MONTHS) expect(summarizeMonth(r.data.transactions, mo)).toEqual(summarizeMonth(v1.transactions as AppData["transactions"], mo));
  });

  it("ファイルが1文字でも書き換わっていたら、読み込まない（今のデータに触れない）", () => {
    const d = rich(5);
    const text = JSON.stringify(buildBackup(d, now));
    const i = text.indexOf('"amount":') + 9;
    const tampered = text.slice(0, i) + (text[i] === "9" ? "8" : "9") + text.slice(i + 1);
    const p = parseBackup(tampered);
    expect(p.ok).toBe(false);
  });
});
