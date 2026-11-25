import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { perfData, PERF_YEARS } from "@/lib/perfData";
import { benchText, runBench } from "@/lib/perfBench";
import { measureIdb, PERF_IDB_NAME } from "@/lib/perfIdb";
import { IDB_NAME } from "@/lib/idbRepository";
import { validateAppData, validateRelationships } from "@/lib/schema";
import { countData } from "@/lib/backup";
import { emptyData } from "@/lib/defaults";
import { buildCalendarItems } from "@/lib/calendarExport";
import { buildReminders, DEFAULT_REMINDERS } from "@/lib/reminders";
import { IdbRepositoryAdapter } from "@/lib/idbAdapter";
import { LocalStorageRepository } from "@/lib/repository";
import { StoreCore } from "@/lib/storeCore";
import { STORAGE_KEY, UNDO_KEY, type KV } from "@/lib/storage";
import type { AppData } from "@/lib/types";

// o11 A08：1・5・10・30年分の合成データで、主な計算の時間・保存の大きさ・容量がいっぱいのときのふるまいを測る。
// ここでの時間は手元の PC のもの。iPhone の時間は、自分用の「性能を測る」画面（app/perf）で測る（docs/integration/A08_PERF.md）
const today = "2026-11-25";
const now = "2026-11-25T00:00:00.000Z";
const cache = new Map<number, AppData>();
/** 年数ごとの合成データ（作るのは1回だけ） */
const data = (y: number) => {
  if (!cache.has(y)) cache.set(y, perfData(y, today, now));
  return cache.get(y)!;
};

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
  it("どの年数も、読み込みの検査と関係の検査に通る。件数は年数にほぼ比例する。同じ年数なら同じ中身。重い道（投資・旅行・NISA・返金・引き落とし・固定費の支払い・くり返し）を含む", () => {
    for (const y of PERF_YEARS) {
      const d = data(y);
      const v = validateAppData(JSON.parse(JSON.stringify(d)));
      expect(v.ok, `${y}年`).toBe(true);
      if (v.ok) expect(validateRelationships(v.data).ok, `${y}年`).toBe(true);
      expect(d.transactions.length).toBeGreaterThan(y * 1500);
      expect(d.transactions.length).toBeLessThan(y * 2000);
      expect(d.events.length).toBeGreaterThan(y * 360);
    }
    const d = data(5);
    expect(JSON.stringify(perfData(5, today, now))).toBe(JSON.stringify(d));
    expect(d.categories.some((c) => c.role === "invest")).toBe(true);
    expect(d.transactions.some((t) => t.categoryId === "perf-inv")).toBe(true);
    expect(d.transactions.some((t) => t.tripId)).toBe(true);
    expect(d.transactions.some((t) => t.recurringId)).toBe(true);
    expect(d.transactions.some((t) => t.refundOf)).toBe(true);
    expect(d.transactions.some((t) => t.transferKind === "card")).toBe(true);
    expect(d.trips.length).toBeGreaterThanOrEqual(14);
    expect(d.nisa.length).toBeGreaterThan(50);
    expect(new Set(d.events.map((e) => e.repeat ?? "none"))).toEqual(new Set(["none", "weekly", "monthly", "yearly"]));
    expect(d.events.some((e) => e.startDate !== e.endDate)).toBe(true);
  });
});

describe("A08：計算の時間（手元の PC）", () => {
  for (const y of PERF_YEARS) {
    it(`${y}年分：どの計算も上限の内側`, () => {
      const r = runBench(data(y), today);
      console.log(benchText(`${y}年分`, r, "手元の PC・node"));
      // 上限は、手元の PC の実測の数倍。遅い端末でも、操作が止まりきらない目安
      for (const row of r.rows) expect(row.ms, row.name).toBeLessThan(5000);
      // 速くした所が遅く戻っていないかの見張り（30年分の関係の検査：直す前 約830ms・直したあと 約5ms。点検2回目 低-3）
      if (y === 30) expect(r.rows.find((x) => x.name === "復元：関係の検査")!.ms).toBeLessThan(200);
    }, 180_000);
  }
  // 30年分と10年分の時間の比べは、試験の中ではメモリの片づけの揺れが大きく（JSON を読むだけでも10倍以上ばらつく）、比べ方として成り立たないので置かない。
  // 年数ごとの時間は、上の出力と、実機の「性能を測る」の結果で見る（docs/integration/A08_PERF.md。点検 中-3）
});

describe("A08：大きさと容量", () => {
  it("保存の大きさは年数にほぼ比例する。iPhone アプリへ渡す一覧は、30年分でもアプリの上限の内側", () => {
    const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
    const b1 = enc(data(1));
    const b30 = enc(data(30));
    expect(b1).toBeLessThan(700_000);
    expect(b30 / b1).toBeGreaterThan(25);
    expect(b30 / b1).toBeLessThan(35);
    // 自動バックアップ（Swift の writeBackup は 50,000,000 バイトまで）
    expect(b30).toBeLessThan(50_000_000);
    expect(enc(buildCalendarItems(data(30), today))).toBeLessThan(5_000_000);
    expect(enc(buildReminders(data(30), `${today}T09:00:00`, { ...DEFAULT_REMINDERS, on: true }))).toBeLessThan(200_000);
  });
  it("公開版（localStorage・約500万字）のふつうの保存：8年分までは入る。9年分は入らず、保存は失敗と言い、前の記録はそのまま", async () => {
    const kv = quotaKV();
    const core = new StoreCore(new LocalStorageRepository(kv));
    await core.reload();
    const d8 = perfData(8, today, now);
    expect((await core.commit(() => d8)).ok).toBe(true);
    const before = kv.getItem(STORAGE_KEY);
    const r = await core.commit(() => perfData(9, today, now));
    expect(r.ok).toBe(false);
    expect(kv.getItem(STORAGE_KEY)).toBe(before);
    expect(core.snapshot.data?.transactions.length).toBe(d8.transactions.length);
    const again = new StoreCore(new LocalStorageRepository(kv));
    await again.reload();
    expect(again.snapshot.data?.transactions.length).toBe(d8.transactions.length);
  }, 120_000);
  it("公開版で取り消し用の控えを書く操作（復元・取り込み・まとめた変更など）は、ある年数から失敗する（点検 高-1）。失敗しても前の記録はそのまま", async () => {
    const tryYears = async (y: number) => {
      const kv = quotaKV();
      const core = new StoreCore(new LocalStorageRepository(kv));
      await core.reload();
      const d = perfData(y, today, now);
      expect((await core.commit(() => d)).ok, `${y}年分のふつうの保存`).toBe(true);
      const before = kv.getItem(STORAGE_KEY);
      // 復元（置き換え）と同じ：控えを書いてから、同じくらいの大きさの中身を保存する
      const r = await core.commit(() => ({ ...d, transactions: d.transactions.slice(1) }), { undoReason: "復元" });
      if (!r.ok) {
        expect(kv.getItem(STORAGE_KEY)).toBe(before);
        expect(kv.getItem(UNDO_KEY)).toBeNull();
        expect(r.error).toBeTruthy();
      }
      return r.ok;
    };
    const ok = new Map<number, boolean>();
    for (const y of [1, 2, 3, 4, 5]) ok.set(y, await tryYears(y));
    console.log(`[A08] 公開版で控えを書く操作が入るか：${[...ok].map(([y, v]) => `${y}年分 ${v ? "入る" : "入らない"}`).join("・")}`);
    for (const y of [1, 2, 3, 4]) expect(ok.get(y), `${y}年分`).toBe(true);
    expect(ok.get(5)).toBe(false); // 5年分では入らない（字数で数えた場合。docs/integration/A08_PERF.md・RAID R-06）
  }, 300_000);
  it("自分用（IndexedDB）：30年分を保存して読み直すと、同じ中身。容量がいっぱいの失敗では、前の記録がそのまま。1回の保存の時間を出す", async () => {
    const factory = new IDBFactory();
    const core = new StoreCore(new IdbRepositoryAdapter({ factory, legacy: null }));
    await core.reload();
    expect((await core.commit(() => data(30))).ok).toBe(true);
    const t0 = performance.now();
    expect((await core.commit((d) => ({ ...d, transactions: d.transactions.slice(1) }))).ok).toBe(true);
    const plain = performance.now() - t0;
    const t1 = performance.now();
    expect((await core.commit((d) => ({ ...d }), { undoReason: "試し" })).ok).toBe(true);
    const withUndo = performance.now() - t1;
    console.log(`[A08] 30年分・1回の保存（StoreCore を通す。IndexedDB は試験用の作り物なので、実機とは違う）：ふつう ${plain.toFixed(0)}ms・控えつき ${withUndo.toFixed(0)}ms`);
    const again = new StoreCore(new IdbRepositoryAdapter({ factory, legacy: null }));
    await again.reload();
    // 読み直した中身が、保存したものと全部同じ（件数だけでなく。点検2回目 中-2）
    expect(JSON.stringify(again.snapshot.data)).toBe(JSON.stringify({ ...data(30), transactions: data(30).transactions.slice(1) }));
    expect(countData(again.snapshot.data!).transactions).toBe(data(30).transactions.length - 1);
    // 容量がいっぱい（書き込みの失敗を注入）：失敗と言い、前の記録はそのまま
    const full = new StoreCore(new IdbRepositoryAdapter({ factory, legacy: null, fault: () => true }));
    await full.reload();
    expect((await full.commit((d) => ({ ...d, transactions: [] }))).ok).toBe(false);
    const third = new StoreCore(new IdbRepositoryAdapter({ factory, legacy: null }));
    await third.reload();
    expect(third.snapshot.data?.transactions.length).toBe(data(30).transactions.length - 1);
  }, 300_000);
});

describe("A08：測る画面の安全", () => {
  it("IndexedDB の時間は、別の名前の場所で測り、終わったら消す。本物の記録の場所には触れない", async () => {
    expect(PERF_IDB_NAME).not.toBe(IDB_NAME);
    const factory = new IDBFactory();
    const core = new StoreCore(new IdbRepositoryAdapter({ factory, legacy: null }));
    await core.reload();
    const mine = { ...emptyData(now), transactions: data(1).transactions.slice(0, 3) };
    expect((await core.commit(() => mine)).ok).toBe(true);
    const t = await measureIdb(factory, JSON.stringify(data(1)));
    expect(t.same).toBe(true);
    const names = (await factory.databases()).map((x) => x.name);
    expect(names).toContain(IDB_NAME);
    expect(names).not.toContain(PERF_IDB_NAME);
    const again = new StoreCore(new IdbRepositoryAdapter({ factory, legacy: null }));
    await again.reload();
    expect(JSON.stringify(again.snapshot.data)).toBe(JSON.stringify(mine));
  });
  it("測る部品と画面は、記録を読み書きせず（useData・useStore を使わない）、外へ送らない。公開版では無効", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const files = ["src/app/perf/page.tsx", "src/lib/perfData.ts", "src/lib/perfBench.ts", "src/lib/perfIdb.ts"];
    for (const f of files) {
      const s = fs.readFileSync(path.join(root, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(s, f).not.toMatch(/\b(useData|useStore|localStorage|fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\b|window\.open|\bimport\(|https?:\/\//);
    }
    expect(fs.readFileSync(path.join(root, "src/lib/edition.ts"), "utf8")).toMatch(/perfLab: \{ personal: true, public: false \}/);
  });
});
