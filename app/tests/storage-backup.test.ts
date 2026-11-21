import { describe, expect, it } from "vitest";
import { applyRestore, buildBackup, parseBackup } from "@/lib/backup";
import { emptyData } from "@/lib/defaults";
import { loadData, saveData, STORAGE_KEY, type KV } from "@/lib/storage";
import type { AppData } from "@/lib/types";

class MemKV implements KV {
  m = new Map<string, string>();
  failWrites = false;
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new DOMException("full", "QuotaExceededError");
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

const sample = (): AppData => {
  const d = emptyData("2026-11-21T00:00:00.000Z");
  d.transactions.push({
    id: "tx1", type: "expense", date: "2026-11-21", amount: 1000, currency: "JPY", categoryId: "exp-1",
    merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: "x", updatedAt: "x",
  });
  d.events.push({
    id: "ev1", title: "食事", startDate: "2026-11-21", endDate: "2026-11-21", allDay: false,
    startTime: "19:00", endTime: "21:00", note: "", createdAt: "x", updatedAt: "x",
  });
  d.budget.monthly = 30000;
  d.prefs.home.todaySpent = false;
  return d;
};

describe("保存・読み込み", () => {
  it("AT-001: 保存→再読み込みで同じ内容が1件だけ残る", () => {
    const kv = new MemKV();
    expect(saveData(sample(), kv).ok).toBe(true);
    const r = loadData(kv);
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.data.transactions).toHaveLength(1);
      expect(r.data.prefs.home.todaySpent).toBe(false); // AT-018 表示設定の保持
    }
  });
  it("データなしは new（初回）", () => expect(loadData(new MemKV()).status).toBe("new"));
  it("保存領域なしは unavailable（クラッシュしない）", () => expect(loadData(null).status).toBe("unavailable"));
  it("壊れたJSON・不正構造は corrupt（初期化して上書きしない）", () => {
    const kv = new MemKV();
    kv.m.set(STORAGE_KEY, "{broken");
    expect(loadData(kv).status).toBe("corrupt");
    kv.m.set(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, transactions: [{ id: 1 }] }));
    expect(loadData(kv).status).toBe("corrupt");
    expect(kv.m.get(STORAGE_KEY)).toContain("transactions"); // 元の文字列は残っている
  });
  it("AT-014: 書き込み失敗は ok:false を返し、成功扱いしない", () => {
    const kv = new MemKV();
    saveData(sample(), kv);
    kv.failWrites = true;
    const r = saveData(emptyData(), kv);
    expect(r.ok).toBe(false);
    const l = loadData(kv);
    expect(l.status === "ok" && l.data.transactions.length).toBe(1); // 既存データは維持
  });
});

describe("バックアップ・復元", () => {
  it("AT-015: 書き出し→読み込みで件数・金額・予定・設定が一致", () => {
    const d = sample();
    const text = JSON.stringify(buildBackup(d));
    const r = parseBackup(text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.preview.counts.transactions).toBe(1);
      expect(r.preview.counts.events).toBe(1);
      expect(r.preview.period).toEqual({ from: "2026-11-21", to: "2026-11-21" });
      const rr = applyRestore(emptyData(), r.preview.data, "replace");
      expect(rr.ok).toBe(true);
      const restored = rr.ok ? rr.data : null;
      expect(restored).toEqual(d);
    }
  });
  it("AT-016: 壊れたファイル・別形式・改変は拒否", () => {
    expect(parseBackup("not json").ok).toBe(false);
    expect(parseBackup(JSON.stringify({ hello: 1 })).ok).toBe(false);
    const b = buildBackup(sample());
    b.data.transactions[0].amount = 999999;
    expect(parseBackup(JSON.stringify(b)).ok).toBe(false); // checksum 不一致
    const b2 = buildBackup(sample());
    (b2 as unknown as { schemaVersion: number }).schemaVersion = 99;
    expect(parseBackup(JSON.stringify(b2)).ok).toBe(false);
  });
  it("追加モードは同じIDを二重取込しない", () => {
    const d = sample();
    const r = applyRestore(d, structuredClone(d), "merge");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.transactions).toHaveLength(1);
    expect(r.duplicates).toBe(2); // 取引1件・予定1件（カテゴリは数えない）
    expect(r.added).toBe(0);
  });
});
