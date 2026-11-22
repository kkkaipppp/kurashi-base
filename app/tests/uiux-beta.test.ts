import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { staleRecordError } from "@/lib/eventConcurrency";

// 友人β の UI・UX の直し（2026-11-22、チャッピーのパッチ＋取り込み時の修正）を見張る
const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");

describe("UI・UX の直し（友人β）", () => {
  it("消された記録の更新は、スナップショットがなくても成功扱いにしない", () => {
    expect(staleRecordError([], "x", undefined)).toContain("削除されています");
    expect(staleRecordError([{ id: "x" }], "x", undefined)).toBeNull();
  });

  it("予定の詳細を見ている間に消されても、新しい予定の入力に化けない（取り込み時の修正）", () => {
    const s = src("components/EventSheet.tsx");
    expect(s).toContain('(mode === "view" && !ev)');
    expect(s).not.toMatch(/originalEvent\.current/); // 描画中に ref を読まない（lint）
  });

  it("画面を移ると、開いていた追加・編集のシートを閉じる（BUG-07）", () => {
    const s = src("components/UIContext.tsx");
    expect(s).toContain("usePathname");
    expect(s).toMatch(/setTx\(null\);\s*setEv\(null\);/);
  });

  it("使い方に「ホーム画面に追加」の案内がある", () => {
    expect(src("app/guide/page.tsx")).toContain("ホーム画面に追加");
  });

  it("置き換えの復元は、押す前に何が起きるかを出し、ボタンも「今の記録を置き換える」", () => {
    const s = src("app/settings/page.tsx");
    expect(s).toContain("バックアップにない記録は残りません");
    expect(s).toContain("今の記録を置き換える");
  });

  it("小さいボタン（行き方の車で・歩いて、資格の候補）は 44px 以上（BUG-12）", () => {
    expect(src("components/EventSheet.tsx")).not.toMatch(/min-h-9 py-2 font-semibold text-brand underline/);
    expect(src("app/study/page.tsx")).not.toContain("min-h-9");
  });

  it("予算がないときのホームは「未設定」ではなく今月の支出を大きく出す", () => {
    const s = src("app/page.tsx");
    expect(s).toContain('remaining === null ? "今月の支出" : "今月の残り予算"');
    expect(s).not.toContain(">未設定<");
  });
});
