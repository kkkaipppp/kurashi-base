import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyRestore } from "@/lib/backup";
import { csvToIncoming } from "@/lib/csvImport";
import { emptyData } from "@/lib/defaults";
import { newBatchId, recordBatch, stampBatch, undoBatch, undoableBatches } from "@/lib/importBatch";
import { validateAppData } from "@/lib/schema";
import type { AppData } from "@/lib/types";

// NEXT v21 CSV:C08：取り込みの履歴と取り消し（後続の編集を守る）
const now = "2026-11-25T00:00:00.000Z";
const TXH = "日付,種類,金額,カテゴリ,内容,支払い方法,メモ,元ID\n";
const csv = TXH + "2026-11-01,支出,500,食費,A,,,id1\n2026-11-02,支出,700,食費,B,,,id2\n2026-11-03,支出,900,食費,C,,,id3\n";

function importInto(cur: AppData, text: string, name: string, at: string) {
  const r = csvToIncoming(text, cur, at);
  if (!r.ok || r.kind !== "transactions") throw new Error("csv");
  const id = newBatchId(at);
  const m = applyRestore(cur, { ...r.incoming, transactions: stampBatch(r.incoming.transactions, id) }, "merge");
  if (!m.ok) throw new Error("merge");
  return { id, data: recordBatch(m.data, { id, at, source: name, from: r.from, to: r.to }).data };
}

describe("取り込みの履歴と取り消し", () => {
  it("足した記録に取り込みの ID が付き、履歴に件数が残る。同じファイルをもう一度入れても増えず、履歴の件数は0件", () => {
    const a = importInto(emptyData(now), csv, "a.csv", "2026-11-25T01:00:00.000Z");
    expect(a.data.transactions).toHaveLength(3);
    expect(a.data.transactions.every((t) => t.importBatchId === a.id)).toBe(true);
    expect(a.data.meta.imports).toMatchObject([{ id: a.id, source: "a.csv", added: 3, from: "2026-11-01", to: "2026-11-03" }]);
    const b = importInto(a.data, csv, "a2.csv", "2026-11-25T02:00:00.000Z");
    expect(b.data.transactions).toHaveLength(3); // 増えない
    expect(b.data.meta.imports?.at(-1)?.added).toBe(0);
    expect(b.data.transactions.every((t) => t.importBatchId === a.id)).toBe(true); // 最初の取り込みの記録のまま
  });
  it("取り消し：あとから変えた記録・旅行や固定費につないだ記録は残す。履歴は消さず、取り消した日時を付ける", () => {
    const a = importInto(emptyData(now), csv, "a.csv", "2026-11-25T01:00:00.000Z");
    const d = structuredClone(a.data);
    d.transactions[0].updatedAt = "2026-11-26T00:00:00.000Z"; // 金額やメモを直した
    d.transactions[1].tripId = "trip1"; // 旅行につないだ
    const r = undoBatch(d, a.id, "2026-11-27T00:00:00.000Z");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result).toMatchObject({ removed: 1, kept: 2 });
    expect(r.result.next.transactions.map((t) => t.merchant)).toEqual(["A", "B"]);
    expect(r.result.next.meta.imports?.[0].undoneAt).toBe("2026-11-27T00:00:00.000Z");
    expect(undoableBatches(r.result.next)).toEqual([]);
    expect(undoBatch(r.result.next, a.id, now)).toMatchObject({ ok: false, error: expect.stringContaining("すでに") });
    expect(d.transactions).toHaveLength(3); // 元のデータは書き換えない
  });
  it("ほかの取り込み・手で入れた記録は消さない。見つからない ID は断る", () => {
    const a = importInto(emptyData(now), csv, "a.csv", "2026-11-25T01:00:00.000Z");
    const b = importInto(a.data, TXH + "2026-11-10,支出,100,食費,Z,,,idz\n", "b.csv", "2026-11-25T03:00:00.000Z");
    const manual = structuredClone(b.data);
    manual.transactions.push({ id: "m", type: "expense", date: "2026-11-11", amount: 1, currency: "JPY", categoryId: "exp-1", merchant: "手入力", paymentMethod: "", note: "", source: "manual", createdAt: now, updatedAt: now });
    const r = undoBatch(manual, a.id, now);
    if (!r.ok) throw new Error("undo");
    expect(r.result.next.transactions.map((t) => t.merchant).sort()).toEqual(["Z", "手入力"].sort());
    expect(undoBatch(manual, "nope", now)).toMatchObject({ ok: false });
    expect(undoableBatches(manual).map((x) => x.source)).toEqual(["b.csv", "a.csv"]); // 新しい順
  });
  it("バックアップの書き出し→読み込みで、取り込みの ID と履歴が残る。おかしな履歴は断る", () => {
    const a = importInto(emptyData(now), csv, "a.csv", "2026-11-25T01:00:00.000Z");
    const r = validateAppData(JSON.parse(JSON.stringify(a.data)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.meta.imports).toHaveLength(1);
    const bad = JSON.parse(JSON.stringify(a.data));
    bad.meta.imports = "x";
    expect(validateAppData(bad).ok).toBe(false);
    const bad2 = JSON.parse(JSON.stringify(a.data));
    bad2.transactions[0].importBatchId = 5;
    expect(validateAppData(bad2).ok).toBe(false);
  });
  it("設定の画面は、自分用だけ（履歴と取り消し）。取り消しの控えも残す", () => {
    const page = readFileSync(join(__dirname, "..", "src", "app", "settings", "page.tsx"), "utf8");
    expect(page).toContain("const ImportHistoryCard = IS_PERSONAL ? dynamic(");
    expect(page).toContain("IS_PERSONAL && csv.result.kind === \"transactions\"");
    expect(readFileSync(join(__dirname, "..", "src", "components", "ImportHistoryCard.tsx"), "utf8")).toContain("store.replaceAll(r.result.next,");
  });
});
