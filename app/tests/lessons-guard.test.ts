import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// docs/LESSONS.md の学びが、あとの変更で消えていないかを見張るテスト。
// iPhone Safari の実機でしか出ない問題は、ここでコードの「守り」が残っているかを確かめる。

const src = (p: string) => readFileSync(path.resolve(import.meta.dirname, "..", "src", p), "utf-8");

describe("LESSONS L-01：iPhone Safari で日付・時刻の欄が隣に重なる", () => {
  it("date/time の入力欄を枠の幅に収める CSS が残っている", () => {
    const css = src("app/globals.css");
    expect(css).toMatch(/input\[type="date"\][\s\S]*?min-width:\s*0/);
    expect(css).toMatch(/input\[type="time"\]/);
  });
  it("入力欄の部品が min-w-0 を持つ（2列のときにはみ出さない）", () => {
    const ui = src("components/ui.tsx");
    expect(ui).toContain('<div className="min-w-0 space-y-1">');
    expect(ui).toMatch(/inputCls[\s\S]*min-w-0/);
  });
});

describe("LESSONS L-02：iPhone でキーボードが出ると保存ボタンが隠れる", () => {
  it("入力シートが visualViewport（見えている範囲）に合わせている", () => {
    const sheet = src("components/Sheet.tsx");
    expect(sheet).toContain("visualViewport");
    expect(sheet).toContain('addEventListener("resize"');
  });
});

describe("LESSONS L-03：iPhone から http で開くと crypto.subtle が使えない", () => {
  it("画像の指紋に代わりの計算がある", () => {
    const dup = src("lib/duplicates.ts");
    expect(dup).toContain("fallbackFingerprint");
    expect(dup).toMatch(/crypto\.subtle\)/);
  });
});

describe("LESSONS L-04：選択肢が並列になっていない", () => {
  it("任意の欄はラベルに「（任意）」と書かず、optional の印を使う", () => {
    for (const f of ["app/tasks/page.tsx", "app/assets/page.tsx", "app/contracts/page.tsx", "app/health/page.tsx", "app/documents/page.tsx", "app/notes/page.tsx", "app/goals/page.tsx", "app/study/page.tsx", "app/nisa/page.tsx", "components/TxSheet.tsx", "components/EventSheet.tsx", "app/recurring/page.tsx"]) {
      expect(src(f), f).not.toMatch(/label[=:]\s*["{][^"\n]*（[^）]*任意）/);
    }
  });
});

describe("友人β：初めて使う人に保存場所とバックアップが伝わる（U01・U08）", () => {
  it("ホームのはじめての案内と使い方の画面に「このブラウザの中だけ」と、バックアップへの入口がある", () => {
    // 2026-11-24 レビュー o1 の P03：説明は lib/platform.ts にまとめ、Web 版とアプリで出し分ける
    expect(src("lib/platform.ts")).toContain("このブラウザの中だけ");
    expect(src("app/page.tsx")).toContain('STORAGE_TEXT[nativeApp ? "app" : "web"].short');
    const guide = src("app/guide/page.tsx");
    expect(guide).toContain("このブラウザの中だけ");
    expect(guide).toContain("/settings#backup");
    expect(src("app/settings/page.tsx")).toContain('id="backup"');
  });
  it("Safari でバックアップの書き出しが始まらない問題の回避（URL をすぐに無効にしない）が残っている", () => {
    expect(src("app/settings/page.tsx")).not.toMatch(/a\.click\(\);\s*\n\s*URL\.revokeObjectURL/);
  });
  it("復元・置き換えは前の状態を控える経路（理由つきの replaceAll）を通る", () => {
    expect(src("app/settings/page.tsx")).toMatch(/store\.replaceAll\([^)]*,\s*mode === "replace"/);
  });
});
