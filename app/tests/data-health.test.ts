import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { dataHealth } from "@/lib/dataHealth";
import type { AppData, Transaction } from "@/lib/types";

// NEXT v21 Q09：データの点検（読むだけ）
const now = "2026-11-25T00:00:00.000Z";
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({
  type: "expense", date: "2026-11-20", amount: 1000, currency: "JPY", categoryId: "exp-1", merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now, ...o,
});
const ids = (d: AppData) => dataHealth(d, "2026-11-25").map((f) => f.id);

describe("データの点検", () => {
  it("きれいなデータは、何も出ない（バックアップ済み）", () => {
    const d = emptyData(now);
    d.transactions = [tx({ id: "a" })];
    d.meta.lastBackupAt = "2026-11-24T00:00:00.000Z";
    expect(dataHealth(d, "2026-11-25")).toEqual([]);
  });
  it("関連の欠け（カテゴリ・旅行・固定費）を見つける。記録は消さない", () => {
    const d = emptyData(now);
    d.meta.lastBackupAt = "2026-11-24T00:00:00.000Z";
    d.transactions = [tx({ id: "a", categoryId: "gone" }), tx({ id: "b", tripId: "tgone" }), tx({ id: "c", recurringId: "rgone" })];
    d.events = [{ id: "e", title: "x", startDate: "2026-12-01", endDate: "2026-12-01", allDay: true, startTime: "", endTime: "", note: "", tripId: "tgone", createdAt: now, updatedAt: now }];
    expect(ids(d).sort()).toEqual(["ev-trip", "tx-cat", "tx-rec", "tx-trip"]);
    expect(d.transactions).toHaveLength(3);
  });
  it("二重かもしれない記録（同じ日・種類・金額・店名）を数える。店名なしは数えない", () => {
    const d = emptyData(now);
    d.meta.lastBackupAt = "2026-11-24T00:00:00.000Z";
    d.transactions = [tx({ id: "a", merchant: "ｾﾌﾞﾝ" }), tx({ id: "b", merchant: "セブン" }), tx({ id: "c", merchant: "" }), tx({ id: "d", merchant: "" })];
    const f = dataHealth(d, "2026-11-25").find((x) => x.id === "dup");
    expect(f?.count).toBe(1);
  });
  it("2か月以上過ぎた固定費・間隔の空いたバックアップ・「その他」のまま・非表示のカテゴリの記録", () => {
    const d = emptyData(now);
    d.categories = d.categories.map((c) => (c.id === "exp-2" ? { ...c, archived: true } : c));
    d.transactions = [tx({ id: "a", categoryId: "exp-2" }), tx({ id: "b", categoryId: "exp-10" })];
    d.recurring = [{ id: "r", name: "古い", amount: 100, cycle: "monthly", anchorDay: 1, nextDueDate: "2026-08-01", categoryId: "exp-5", paymentMethod: "", active: true, createdAt: now, updatedAt: now }];
    d.meta.lastBackupAt = "2026-11-01T00:00:00.000Z";
    expect(ids(d).sort()).toEqual(["backup", "hidden-cat", "inbox", "rec-old"]);
    const e = emptyData(now);
    e.transactions = [tx({ id: "z" })];
    expect(dataHealth(e, "2026-11-25").map((f) => f.text)).toContain("まだバックアップを書き出していません");
  });
  it("読むだけ（データを書き換えない）。設定に自分用だけで出る", () => {
    const lib = readFileSync(join(__dirname, "..", "src", "lib", "dataHealth.ts"), "utf8");
    expect(lib).not.toMatch(/useStore|replaceAll|localStorage|setItem/); // 保存を呼ばない（結果の配列を作るだけ）
    expect(readFileSync(join(__dirname, "..", "src", "app", "settings", "page.tsx"), "utf8")).toContain("const DataHealthCard = IS_PERSONAL ? dynamic(");
  });
});
