import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { applyRestore, buildBackup, parseBackup } from "@/lib/backup";
import { validateAppData, validateRelationships } from "@/lib/schema";
import { saveDataIfUnchanged, loadData, STORAGE_KEY, type KV } from "@/lib/storage";
import { deadlineDays, deadlinesOn } from "@/lib/deadlines";
import { buildInsights } from "@/lib/report";
import type { Transaction } from "@/lib/types";

const tx = (patch: Partial<Transaction> = {}): Transaction => ({
  id: "tx_1", type: "expense", date: "2026-11-21", amount: 1000, currency: "JPY", categoryId: "exp-1",
  merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: "x", updatedAt: "x", ...patch,
});

class MemoryKV implements KV {
  values = new Map<string, string>();
  getItem(k: string) { return this.values.get(k) ?? null; }
  setItem(k: string, value: string) { this.values.set(k, value); }
  removeItem(k: string) { this.values.delete(k); }
}

describe("友人β前の保存・復元の安全性", () => {
  it("データ項目がないバックアップでも例外を投げない", () => {
    expect(parseBackup(JSON.stringify({ format: "kurashi-base-backup", schemaVersion: 2, checksum: "a" })).ok).toBe(false);
  });
  it("正常なバックアップは引き続き復元できる", () => {
    const source = emptyData();
    source.transactions.push(tx());
    const parsed = parseBackup(JSON.stringify(buildBackup(source)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const restored = applyRestore(emptyData(), parsed.preview.data, "replace");
    expect(restored.ok && restored.data.transactions).toHaveLength(1);
  });
  it("カテゴリのIDが同じなら破損を検出する", () => {
    const source = emptyData();
    source.categories.push({ ...source.categories[0] });
    expect(validateAppData(source).ok).toBe(false);
  });
  it("固定費のIDが同じなら破損を検出する", () => {
    const source = emptyData();
    const fixed = { id: "r", name: "家賃", amount: 60000, cycle: "monthly" as const, anchorDay: 1, nextDueDate: "2026-11-21", categoryId: "exp-4", paymentMethod: "", active: true, createdAt: "x", updatedAt: "x" };
    source.recurring.push(fixed, { ...fixed });
    expect(validateAppData(source).ok).toBe(false);
  });
  it("従来の端末データを読み込む構造検査と、復元用の参照検査は分離する", () => {
    const source = emptyData();
    source.transactions.push(tx({ categoryId: "missing" }));
    expect(validateAppData(source).ok).toBe(true); // 勝手に破棄せず保護画面から書き出せる
    expect(validateRelationships(source).ok).toBe(false);
    expect(applyRestore(emptyData(), source, "replace").ok).toBe(false);
  });
  it("収入を支出カテゴリに紐づける復元を拒否する", () => {
    const source = emptyData();
    source.transactions.push(tx({ type: "income", categoryId: "exp-1" }));
    expect(validateRelationships(source).ok).toBe(false);
    expect(applyRestore(emptyData(), source, "merge").ok).toBe(false);
  });
  it("保存済みの内容が他タブで変われば、古い状態で上書きしない", () => {
    const kv = new MemoryKV();
    const first = emptyData();
    const a = saveDataIfUnchanged(first, null, kv);
    expect(a.ok).toBe(true);
    expect(saveDataIfUnchanged(emptyData(), null, kv).ok).toBe(false);
    expect(kv.getItem(STORAGE_KEY)).toBe(a.ok && a.persistedRaw);
    const loaded = loadData(kv);
    expect(loaded.status).toBe("ok");
    if (loaded.status !== "ok") return;
    const updated = saveDataIfUnchanged(loaded.data, loaded.persistedRaw, kv);
    expect(updated.ok).toBe(true);
  });
  it("同じIDのカテゴリ競合時、別カテゴリへ取引を誤登録しない", () => {
    // 2026-11-23：初期カテゴリは名前を変えられるようになったので、名前違いでも同じものとみなす（restore-safety で確認）。
    // 自分で作ったカテゴリの ID がぶつかったときは、今までどおり取り込まない。
    const current = emptyData();
    current.categories.push({ id: "cat_x", name: "ペット", kind: "expense", order: 99, archived: false });
    const incoming = structuredClone(current);
    incoming.categories.find((c) => c.id === "cat_x")!.name = "別の意味";
    incoming.transactions.push(tx({ categoryId: "cat_x" }));
    const r = applyRestore(current, incoming, "merge");
    expect(r.ok && r.data.transactions).toHaveLength(0);
  });
});

describe("利用者が迷いやすい日付と日本語", () => {
  it("資格の試験日は期限一覧と印の両方に載る", () => {
    const d = emptyData();
    d.studySubjects.push({ id: "s1", name: "資格試験", examDate: "2026-11-28", targetHours: null, archived: false, createdAt: "x", updatedAt: "x" });
    expect(deadlineDays(d, "2026-11").has("2026-11-28")).toBe(true);
    expect(deadlinesOn(d, "2026-11-28")).toContainEqual(expect.objectContaining({ kind: "試験", href: "/study?open=s1" }));
  });
  it("終了した資格は期限一覧に載せない", () => {
    const d = emptyData();
    d.studySubjects.push({ id: "s1", name: "資格試験", examDate: "2026-11-28", targetHours: null, archived: true, createdAt: "x", updatedAt: "x" });
    expect(deadlineDays(d, "2026-11").has("2026-11-28")).toBe(false);
  });
  it("過去の月は『今月』と表示しない", () => {
    const d = emptyData();
    d.transactions.push(tx({ id: "a", date: "2026-09-01", amount: 5000 }));
    d.transactions.push(tx({ id: "b", date: "2026-08-01", amount: 1000 }));
    expect(buildInsights(d, "2026-09", "2026-11-21")[0].text).toContain("9月の支出");
  });
  it("当月31日の先月比較は、先月が短ければ先月全体と比べると表示する", () => {
    const d = emptyData();
    d.transactions.push(tx({ id: "a", date: "2026-03-30", amount: 2000 }));
    d.transactions.push(tx({ id: "b", date: "2026-02-28", amount: 1000 }));
    expect(buildInsights(d, "2026-03", "2026-03-31")[0].text).toContain("先月全体より");
  });
});

describe("振り返りの月の境目（友人β）", () => {
  it("1日でも前月の1日分と比べ、0除算にならない", () => {
    const d = emptyData();
    d.transactions.push(tx({ id: "a", date: "2026-12-01", amount: 2000 }));
    d.transactions.push(tx({ id: "b", date: "2026-11-01", amount: 1000 }));
    const text = buildInsights(d, "2026-12", "2026-12-01")[0].text;
    expect(text).toContain("先月の同じ日より");
    expect(text).not.toMatch(/NaN|Infinity/);
  });
  it("うるう年の2月29日から3月を見ても日付が壊れない", () => {
    const d = emptyData();
    d.transactions.push(tx({ id: "a", date: "2028-03-31", amount: 3000 }));
    d.transactions.push(tx({ id: "b", date: "2028-02-29", amount: 1000 }));
    expect(buildInsights(d, "2028-03", "2028-03-31")[0].text).toContain("先月全体より");
  });
  it("1月の前月は前の年の12月", () => {
    const d = emptyData();
    d.transactions.push(tx({ id: "a", date: "2027-01-10", amount: 3000 }));
    d.transactions.push(tx({ id: "b", date: "2026-12-05", amount: 1000 }));
    expect(buildInsights(d, "2027-01", "2027-01-15")[0].text).toContain("先月の同じ日より");
  });
});
