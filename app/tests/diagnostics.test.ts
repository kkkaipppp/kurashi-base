import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { buildDiagnostics } from "@/lib/diagnostics";

// NEXT v21 H10：診断情報。記録の中身を入れない
const now = "2026-11-25T00:00:00.000Z";
describe("診断情報", () => {
  it("件数・日付の範囲・保存の大きさ・版・端末だけ。店名・メモ・金額・予定の名前は入らない", () => {
    const d = emptyData(now);
    d.transactions = [{ id: "a", type: "expense", date: "2026-11-02", amount: 123456, currency: "JPY", categoryId: "exp-1", merchant: "秘密の店", paymentMethod: "", note: "ひみつのメモ", source: "manual", createdAt: now, updatedAt: now }];
    d.events = [{ id: "e", title: "内緒の予定", startDate: "2026-12-01", endDate: "2026-12-01", allDay: true, startTime: "", endTime: "", note: "", createdAt: now, updatedAt: now }];
    const t = buildDiagnostics({ data: d, edition: "personal", native: true, storedChars: 4096, hasUndo: true, userAgent: "UA-TEST", nowIso: now });
    for (const secret of ["秘密の店", "ひみつのメモ", "123456", "内緒の予定"]) expect(t).not.toContain(secret);
    expect(t).toContain("自分用・iPhone アプリ");
    expect(t).toContain("schemaVersion 2");
    expect(t).toContain("2026-11-02〜2026-11-02");
    expect(t).toContain("4,096 文字");
    expect(t).toContain("直前の操作の取り消し：あり");
    expect(t).toContain("UA-TEST");
  });
  it("記録がないときも作れる。読めない保存の大きさは「読めません」", () => {
    const t = buildDiagnostics({ data: emptyData(now), edition: "public", native: false, storedChars: null, hasUndo: false, userAgent: "x", nowIso: now });
    expect(t).toContain("公開・ブラウザ（Web）");
    expect(t).toContain("取引の期間：なし");
    expect(t).toContain("読めません");
  });
  it("自動では送らない（通信しない）。設定に自分用だけで出る", () => {
    const lib = readFileSync(join(__dirname, "..", "src", "lib", "diagnostics.ts"), "utf8");
    const comp = readFileSync(join(__dirname, "..", "src", "components", "DiagnosticsCard.tsx"), "utf8");
    expect(lib + comp).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|mailto:/);
    expect(readFileSync(join(__dirname, "..", "src", "app", "settings", "page.tsx"), "utf8")).toContain("const DiagnosticsCard = PERSONAL_BUILD ? dynamic(");
  });
});
