import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { staleRecordError } from "@/lib/eventConcurrency";
import { parseAddKind } from "@/components/AddFromQuery";
import { renameCategoryIn } from "@/lib/categoryRename";
import type { Category } from "@/lib/types";

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

  it("支出・収入とタスクなどのシートも、編集中に別のタブで消されても入力を消さない", () => {
    expect(src("components/TxSheet.tsx")).toContain("const editing = liveEditing ?? originalEditing;");
    expect(src("components/CollectionPage.tsx")).toContain("const cur = liveCur ?? originalCur;");
  });

  it("ホーム画面のアイコンと Safari で記録が別々になることを、ホームと使い方に書く（2026-11-23 iPhone で判明）", () => {
    expect(src("app/page.tsx")).toContain("ホーム画面のアイコンと Safari でも、記録は別々です");
    const g = src("app/guide/page.tsx");
    expect(g).toContain("記録が別々になります");
    expect(g).toContain("アイコンから開いて、同じ画面で復元");
  });

  it("?add= で入力画面を開ける（ウィジェット・ショートカットのボタン用）。知らない値では何も開かない", () => {
    expect(parseAddKind("expense")).toBe("expense");
    expect(parseAddKind("income")).toBe("income");
    expect(parseAddKind("event")).toBe("event");
    expect(parseAddKind("choose")).toBe("choose");
    expect(parseAddKind("bogus")).toBeNull();
    expect(parseAddKind(null)).toBeNull();
    expect(src("app/page.tsx")).toContain("<AddFromQuery />");
  });

  it("カテゴリの名前を変えられる。ID は変わらず、空・21文字以上・同じ種類で表示中の同名は断る", () => {
    const cats: Category[] = [
      { id: "a", name: "食費", kind: "expense", order: 0, archived: false },
      { id: "b", name: "外食", kind: "expense", order: 1, archived: false },
      { id: "c", name: "昔の", kind: "expense", order: 2, archived: true },
      { id: "d", name: "給与", kind: "income", order: 0, archived: false },
    ];
    const ok = renameCategoryIn(cats, "a", "  ごはん  ");
    expect(ok.ok && ok.categories.find((c) => c.id === "a")?.name).toBe("ごはん");
    expect(ok.ok && ok.categories.length).toBe(4);
    expect(renameCategoryIn(cats, "a", "   ").ok).toBe(false);
    expect(renameCategoryIn(cats, "a", "あ".repeat(21)).ok).toBe(false);
    expect(renameCategoryIn(cats, "a", "外食").ok).toBe(false);
    expect(renameCategoryIn(cats, "a", "昔の").ok).toBe(true); // 非表示の同名は OK
    expect(renameCategoryIn(cats, "a", "給与").ok).toBe(true); // 収入側の同名は OK
    expect(renameCategoryIn(cats, "zz", "x").ok).toBe(false);
    expect(cats[0].name).toBe("食費"); // 元の配列は変えない
    expect(src("app/settings/page.tsx")).toContain("store.renameCategory(");
  });
});
