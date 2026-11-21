import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { applyRestore, buildBackup, parseBackup } from "@/lib/backup";
import {
  clearUndo,
  loadData,
  readUndo,
  restoreUndo,
  saveDataIfUnchanged,
  saveWithUndo,
  STORAGE_KEY,
  UNDO_KEY,
  type KV,
} from "@/lib/storage";
import type { AppData, Transaction } from "@/lib/types";

const NOW = "2026-11-22T09:00:00.000Z";

class MemoryKV implements KV {
  values = new Map<string, string>();
  failKeys = new Set<string>();
  getItem(k: string) {
    return this.values.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failKeys.has(k)) throw new DOMException("quota", "QuotaExceededError");
    this.values.set(k, v);
  }
  removeItem(k: string) {
    this.values.delete(k);
  }
}

const tx = (id: string, amount = 1000): Transaction => ({
  id, type: "expense", date: "2026-11-21", amount, currency: "JPY", categoryId: "exp-1",
  merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: "x", updatedAt: "x",
});

const withTx = (...ids: string[]): AppData => {
  const d = emptyData();
  d.transactions.push(...ids.map((id) => tx(id)));
  return d;
};

/** 端末に保存済みの状態を作り、その raw を返す */
const seed = (kv: MemoryKV, d: AppData) => {
  const r = saveDataIfUnchanged(d, kv.getItem(STORAGE_KEY), kv);
  if (!r.ok) throw new Error(r.error);
  return r.persistedRaw;
};

describe("直前の操作の取り消し（復元・置き換えの前の状態を控える）", () => {
  it("置き換えの前の状態を控え、取り消すと元の記録が戻る", () => {
    const kv = new MemoryKV();
    const before = seed(kv, withTx("mine-1", "mine-2"));
    const r = saveWithUndo(withTx("backup-1"), before, "バックアップから置き換え", NOW, kv);
    expect(r.ok).toBe(true);
    expect(readUndo(kv)?.reason).toBe("バックアップから置き換え");

    const u = restoreUndo(r.ok ? r.persistedRaw : null, NOW, kv);
    expect(u.ok).toBe(true);
    const loaded = loadData(kv);
    expect(loaded.status === "ok" && loaded.data.transactions.map((t) => t.id)).toEqual(["mine-1", "mine-2"]);
  });

  it("取り消しをもう一度押すと、取り消す前（置き換えた後）に戻れる", () => {
    const kv = new MemoryKV();
    const before = seed(kv, withTx("mine-1"));
    const r1 = saveWithUndo(withTx("backup-1"), before, "バックアップから置き換え", NOW, kv);
    const r2 = restoreUndo(r1.ok ? r1.persistedRaw : null, NOW, kv);
    const r3 = restoreUndo(r2.ok ? r2.persistedRaw : null, NOW, kv);
    expect(r3.ok).toBe(true);
    const loaded = loadData(kv);
    expect(loaded.status === "ok" && loaded.data.transactions.map((t) => t.id)).toEqual(["backup-1"]);
  });

  it("控えを書けない（容量不足など）ときは、置き換えもしない", () => {
    const kv = new MemoryKV();
    const before = seed(kv, withTx("mine-1"));
    kv.failKeys.add(UNDO_KEY);
    const r = saveWithUndo(withTx("backup-1"), before, "バックアップから置き換え", NOW, kv);
    expect(r.ok).toBe(false);
    expect(kv.getItem(STORAGE_KEY)).toBe(before);
  });

  it("まだ何も保存していない端末では、控えなしで保存できる", () => {
    const kv = new MemoryKV();
    const r = saveWithUndo(withTx("backup-1"), null, "バックアップから置き換え", NOW, kv);
    expect(r.ok).toBe(true);
    expect(readUndo(kv)).toBeNull();
  });

  it("壊れた控えは「控えなし」として扱い、取り消しで今のデータを壊さない", () => {
    const kv = new MemoryKV();
    const before = seed(kv, withTx("mine-1"));
    kv.values.set(UNDO_KEY, JSON.stringify({ savedAt: NOW, reason: "x", raw: "{壊れている" }));
    expect(readUndo(kv)).toBeNull();
    expect(restoreUndo(before, NOW, kv).ok).toBe(false);
    expect(kv.getItem(STORAGE_KEY)).toBe(before);
  });

  it("すべて削除のあとは控えも消える（端末に記録を残さない）", () => {
    const kv = new MemoryKV();
    const before = seed(kv, withTx("mine-1"));
    saveWithUndo(withTx("backup-1"), before, "バックアップから置き換え", NOW, kv);
    clearUndo(kv);
    expect(kv.getItem(UNDO_KEY)).toBeNull();
  });

  it("v1 の形で保存されていた状態も、控えから戻せる", () => {
    const kv = new MemoryKV();
    const v1 = { ...withTx("old-1"), schemaVersion: 1 } as Record<string, unknown>;
    for (const k of ["nisa", "notes", "tasks", "assets", "contracts", "health", "documents", "studySubjects", "studyLogs", "goals"]) delete v1[k];
    const raw = JSON.stringify(v1);
    kv.values.set(STORAGE_KEY, raw);
    const r = saveWithUndo(withTx("backup-1"), raw, "バックアップから置き換え", NOW, kv);
    expect(r.ok).toBe(true);
    const u = restoreUndo(r.ok ? r.persistedRaw : null, NOW, kv);
    expect(u.ok).toBe(true);
    expect(u.ok && u.data?.transactions.map((t) => t.id)).toEqual(["old-1"]);
  });
});

describe("別のタブとの上書き競合", () => {
  it("競合したときは conflict を返し、端末の新しい記録を残す", () => {
    const kv = new MemoryKV();
    const stale = seed(kv, withTx("a"));
    // 別のタブが記録を追加した
    const newer = seed(kv, withTx("a", "b"));
    const r = saveDataIfUnchanged(withTx("a", "c"), stale, kv);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.conflict).toBe(true);
    expect(kv.getItem(STORAGE_KEY)).toBe(newer);
  });

  it("置き換え（復元）でも、別のタブの変更を上書きしない", () => {
    const kv = new MemoryKV();
    const stale = seed(kv, withTx("a"));
    seed(kv, withTx("a", "b"));
    const r = saveWithUndo(withTx("z"), stale, "バックアップから置き換え", NOW, kv);
    expect(!r.ok && r.conflict).toBe(true);
    expect(readUndo(kv)).toBeNull();
  });
});

describe("バックアップ → 復元の往復（1日分の記録）", () => {
  it("書き出したファイルを空の端末に置き換えで戻すと、全項目が一致する", () => {
    const d = withTx("t1", "t2");
    d.events.push({ id: "e1", title: "歯医者", startDate: "2026-11-22", endDate: "2026-11-22", allDay: false, startTime: "10:00", endTime: "11:00", note: "", createdAt: "x", updatedAt: "x" });
    d.tasks.push({ id: "k1", title: "書類を出す", due: "2026-11-23", done: false, note: "", createdAt: "x", updatedAt: "x" });
    d.budget.monthly = 100000;
    const file = JSON.stringify(buildBackup(d, NOW));
    const p = parseBackup(file);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const r = applyRestore(emptyData(), p.preview.data, "replace");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.transactions).toEqual(d.transactions);
    expect(r.data.events).toEqual(d.events);
    expect(r.data.tasks).toEqual(d.tasks);
    expect(r.data.budget.monthly).toBe(100000);
  });

  it("同じバックアップを2回追加しても、記録は二重にならない", () => {
    const file = JSON.stringify(buildBackup(withTx("t1", "t2"), NOW));
    const p = parseBackup(file);
    if (!p.ok) throw new Error(p.error);
    const first = applyRestore(emptyData(), p.preview.data, "merge");
    if (!first.ok) throw new Error(first.error);
    const second = applyRestore(first.data, p.preview.data, "merge");
    expect(second.ok && second.data.transactions).toHaveLength(2);
    expect(second.ok && second.added).toBe(0);
    expect(second.ok && second.duplicates).toBe(2);
  });

  it("途中で切れたファイル・別のファイルは、説明付きで断る", () => {
    const file = JSON.stringify(buildBackup(withTx("t1"), NOW));
    expect(parseBackup(file.slice(0, file.length / 2))).toMatchObject({ ok: false });
    expect(parseBackup("[]")).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify({ format: "other" }))).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify({ format: "kurashi-base-backup", schemaVersion: 2, checksum: "x", data: [] }))).toMatchObject({ ok: false });
  });
});
