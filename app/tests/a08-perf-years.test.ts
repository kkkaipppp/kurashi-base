import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { perfData, PERF_YEARS } from "@/lib/perfData";
import { benchText, runBench, type BenchResult } from "@/lib/perfBench";
import { measureIdb, PERF_IDB_NAME } from "@/lib/perfIdb";
import { IDB_NAME } from "@/lib/idbRepository";
import { validateAppData, validateRelationships } from "@/lib/schema";
import { emptyData } from "@/lib/defaults";
import { buildCalendarItems } from "@/lib/calendarExport";
import { buildReminders, DEFAULT_REMINDERS } from "@/lib/reminders";
import { IdbRepositoryAdapter } from "@/lib/idbAdapter";
import { LocalStorageRepository } from "@/lib/repository";
import { StoreCore } from "@/lib/storeCore";
import { STORAGE_KEY, type KV } from "@/lib/storage";

// o11 A08：1・5・10・30年分の合成データで、主な計算の時間・保存の大きさ・容量がいっぱいのときのふるまいを測る。
// ここでの時間は手元の PC のもの。iPhone の時間は、自分用の「性能を測る」画面（app/perf）で測る（docs/integration/A08_PERF.md）
const today = "2026-11-25";
const now = "2026-11-25T00:00:00.000Z";
const results = new Map<number, BenchResult>();
const data = new Map(PERF_YEARS.map((y) => [y, perfData(y, today, now)]));

/** 文字数で容量を数える保存場所（ブラウザの localStorage は、おおよそ 500万字まで） */
function quotaKV(limitChars = 5_000_000): KV & { m: Map<string, string> } {
  const m = new Map<string, string>();
  const used = () => [...m.entries()].reduce((s, [k, v]) => s + k.length + v.length, 0);
  return {
    m,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      const before = m.get(k);
      const next = used() - (before ? k.length + before.length : 0) + k.length + v.length;
      if (next > limitChars) throw new DOMException("full", "QuotaExceededError");
      m.set(k, v);
    },
    removeItem: (k) => void m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as KV & { m: Map<string, string> };
}

describe("A08：合成データ", () => {
  it("どの年数も、読み込みの検査と関係の検査に通る。件数は年数にほぼ比例する。同じ年数なら同じ中身", () => {
    for (const [y, d] of data) {
      const v = validateAppData(JSON.parse(JSON.stringify(d)));
      expect(v.ok, `${y}年`).toBe(true);
      if (v.ok) expect(validateRelationships(v.data).ok, `${y}年`).toBe(true);
      expect(d.transactions.length).toBeGreaterThan(y * 1500);
      expect(d.transactions.length).toBeLessThan(y * 1600);
      expect(d.events.length).toBeGreaterThan(y * 360);
    }
    expect(JSON.stringify(perfData(5, today, now))).toBe(JSON.stringify(data.get(5)));
  });
});

describe("A08：計算の時間（手元の PC）", () => {
  for (const y of PERF_YEARS) {
    it(`${y}年分：どの計算も上限の内側`, () => {
      const r = runBench(data.get(y)!, today);
      results.set(y, r);
      console.log(benchText(`${y}年分`, r, "手元の PC・node"));
      // 上限は、手元の PC の実測（30年分で最大 約0.3秒）の10倍ほど。遅い端末でも、操作が止まりきらない目安
      for (const row of r.rows) expect(row.ms, row.name).toBeLessThan(3000);
    }, 120_000);
  }
  it("30年分は、10年分の時間の6倍（＋20ms）を超えない（記録が増えるほど急に遅くなる計算がない）", () => {
    const a = results.get(10)!;
    const b = results.get(30)!;
    for (let i = 0; i < a.rows.length; i++) expect(b.rows[i].ms, b.rows[i].name).toBeLessThan(a.rows[i].ms * 6 + 20);
  });
});

describe("A08：大きさと容量", () => {
  it("保存の大きさは年数にほぼ比例する（1年 約0.5MB）。iPhone アプリへ渡す一覧は、30年分でもアプリの上限の内側", () => {
    const r1 = results.get(1)!;
    const r30 = results.get(30)!;
    expect(r1.dataBytes).toBeLessThan(700_000);
    expect(r30.dataBytes / r1.dataBytes).toBeGreaterThan(25);
    expect(r30.dataBytes / r1.dataBytes).toBeLessThan(35);
    // 自動バックアップ（Swift の writeBackup は 50,000,000 バイトまで）
    expect(r30.backupBytes).toBeLessThan(50_000_000);
    const d = data.get(30)!;
    const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
    expect(enc(buildCalendarItems(d, today))).toBeLessThan(5_000_000);
    expect(enc(buildReminders(d, `${today}T09:00:00`, { ...DEFAULT_REMINDERS, on: true }))).toBeLessThan(200_000);
  });
  it("公開版（localStorage・約500万字）：10年分までは入る。30年分は入らず、保存は失敗と言い、前の記録はそのまま", async () => {
    const kv = quotaKV();
    const core = new StoreCore(new LocalStorageRepository(kv));
    await core.reload();
    expect((await core.commit(() => data.get(10)!)).ok).toBe(true);
    const before = kv.getItem(STORAGE_KEY);
    const r = await core.commit(() => data.get(30)!);
    expect(r.ok).toBe(false);
    expect(kv.getItem(STORAGE_KEY)).toBe(before);
    expect(core.snapshot.data?.transactions.length).toBe(data.get(10)!.transactions.length);
    const again = new StoreCore(new LocalStorageRepository(kv));
    await again.reload();
    expect(again.snapshot.data?.transactions.length).toBe(data.get(10)!.transactions.length);
  }, 120_000);
  it("自分用（IndexedDB）：30年分を保存して読み直すと、同じ中身。容量がいっぱいの失敗では、前の記録がそのまま", async () => {
    const factory = new IDBFactory();
    const core = new StoreCore(new IdbRepositoryAdapter({ factory, legacy: null }));
    await core.reload();
    expect((await core.commit(() => data.get(30)!)).ok).toBe(true);
    const again = new StoreCore(new IdbRepositoryAdapter({ factory, legacy: null }));
    await again.reload();
    expect(JSON.stringify(again.snapshot.data)).toBe(JSON.stringify(data.get(30)));
    // 容量がいっぱい（書き込みの失敗を注入）：失敗と言い、前の記録はそのまま
    const full = new StoreCore(new IdbRepositoryAdapter({ factory, legacy: null, fault: () => true }));
    await full.reload();
    const r = await full.commit((d) => ({ ...d, transactions: [] }));
    expect(r.ok).toBe(false);
    const third = new StoreCore(new IdbRepositoryAdapter({ factory, legacy: null }));
    await third.reload();
    expect(third.snapshot.data?.transactions.length).toBe(data.get(30)!.transactions.length);
  }, 120_000);
});

describe("A08：測る画面の安全", () => {
  it("IndexedDB の時間は、別の名前の場所で測り、終わったら消す。本物の記録の場所には触れない", async () => {
    expect(PERF_IDB_NAME).not.toBe(IDB_NAME);
    const factory = new IDBFactory();
    const core = new StoreCore(new IdbRepositoryAdapter({ factory, legacy: null }));
    await core.reload();
    const mine = { ...emptyData(now), transactions: data.get(1)!.transactions.slice(0, 3) };
    expect((await core.commit(() => mine)).ok).toBe(true);
    const t = await measureIdb(factory, JSON.stringify(data.get(1)));
    expect(t.same).toBe(true);
    const names = (await factory.databases()).map((x) => x.name);
    expect(names).toContain(IDB_NAME);
    expect(names).not.toContain(PERF_IDB_NAME);
    const again = new StoreCore(new IdbRepositoryAdapter({ factory, legacy: null }));
    await again.reload();
    expect(JSON.stringify(again.snapshot.data)).toBe(JSON.stringify(mine));
  });
  it("測る部品と画面は、記録を読み書きせず（useData・useStore を使わない）、外へ送らない", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const files = ["src/app/perf/page.tsx", "src/lib/perfData.ts", "src/lib/perfBench.ts", "src/lib/perfIdb.ts"];
    for (const f of files) {
      const s = fs.readFileSync(path.join(root, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(s, f).not.toMatch(/\b(useData|useStore|localStorage|fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\b/);
    }
    // 自分用だけ（公開版では消える）
    expect(fs.readFileSync(path.join(root, "src/lib/edition.ts"), "utf8")).toMatch(/perfLab: \{ personal: true, public: false \}/);
  });
});
