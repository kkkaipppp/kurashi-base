import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { figures, sampleRows, similarButDifferentId } from "@/lib/restoreView";
import type { Transaction } from "@/lib/types";

// 2026-11-24 ChatGPT のレビュー o1（kurashi-base_review-uiux_result_9de9612-o1）の直し
const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");
const tx = (p: Partial<Transaction>): Transaction => ({
  id: "x", type: "expense", date: "2026-11-01", amount: 1000, currency: "JPY", categoryId: "exp-1",
  merchant: "", paymentMethod: "", note: "", source: "manual", createdAt: "x", updatedAt: "x", ...p,
});

describe("P01 復元の意図をはっきりさせる", () => {
  it("復元方法はファイルを選ぶたびに未選択に戻り、選ぶまで実行できない", () => {
    const s = src("app/settings/page.tsx");
    expect(s).toContain('useState<"merge" | "replace" | null>(null)');
    expect(s).toContain("setMode(null);");
    expect(s).toContain("disabled={!mode || !plan?.ok}");
    expect(s).toContain("`${plan.added}件を追加`");
  });
  it("今と実行後の件数・合計、ID が違う似た記録の数", () => {
    const d = emptyData("2026-11-24T00:00:00.000Z");
    d.transactions = [tx({ id: "a", amount: 500 }), tx({ id: "b", type: "income", amount: 2000 })];
    expect(figures(d)).toMatchObject({ transactions: 2, expense: 500, income: 2000 });
    const incoming = [tx({ id: "a", amount: 500 }), tx({ id: "z", amount: 500 }), tx({ id: "y", amount: 500 }), tx({ id: "w", amount: 9 })];
    // a は同じ ID なので数えない。z は a と同じ日・金額で似ている。y は似た相手がもう残っていない
    expect(similarButDifferentId(d.transactions, incoming)).toBe(1);
    expect(sampleRows([tx({ id: "1", date: "2026-01-01" }), tx({ id: "2", date: "2026-03-01" })], 1)[0].id).toBe("2");
  });
});

describe("P04 消す操作を慎重に", () => {
  it("すべて削除は「削除」と打ってから。取り消しの注意。CSV の確認に合計と例", () => {
    const s = src("app/settings/page.tsx");
    expect(s).toContain('disabled={wipeWord.trim() !== "削除"}');
    expect(s).toContain("取り消すと、そのあとに入れた記録も消えます。");
    expect(s).toContain("例（新しい5件）");
    expect(s).toContain("CSV の合計：支出");
  });
});

describe("P03 保存場所の説明をアプリと Web 版で分ける", () => {
  it("Web 版はブラウザの中・アプリはアプリの中と自動バックアップ・削除で消えること", async () => {
    const { STORAGE_TEXT, isNativeApp } = await import("@/lib/platform");
    expect(STORAGE_TEXT.web.short).toContain("このブラウザの中だけ");
    expect(STORAGE_TEXT.app.backup).toContain("自動でバックアップ");
    expect(STORAGE_TEXT.app.backup).toContain("アプリを削除すると、自動バックアップも一緒に消える");
    expect(isNativeApp()).toBe(false); // テスト（ブラウザなし）では Web 版扱い
    for (const p of ["app/page.tsx", "app/settings/page.tsx", "app/guide/page.tsx"]) expect(src(p)).toContain("useIsNativeApp()");
  });
});
