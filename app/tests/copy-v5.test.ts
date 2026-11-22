import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// v5 の文言の見張り：画面に出る文字（コメントを除いたソース）に、古い言い方・誤解させる言い方が戻っていないか。
// 07_日本語全面改善 の表と、10_ブランドとロゴの反映 に対応。

const SRC = join(__dirname, "..", "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|json)$/.test(n) ? [p] : [];
  });
}

/** コメントを取り除いた中身（画面に出うる文字だけを見る） */
function code(p: string): string {
  return readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const ALL = files(SRC).map((p) => ({ p, s: code(p) }));

describe("v5 の文言", () => {
  it.each([
    ["今月あと使える", "今月の残り予算"],
    ["今日のナビ", "確認したいこと／今日やること"],
    ["くらしの気づき", "支出の変化"],
    ["まずは3つだけ", "はじめにやること"],
    ["画像を見ながら記録", "レシートを見て入力"],
  ])("古い言い方「%s」を使わない（→ %s）", (old) => {
    expect(ALL.filter((f) => f.s.includes(old)).map((f) => f.p)).toEqual([]);
  });

  it.each(["同期しました", "登録完了", "登録しました（Google", "調べました", "おすすめ本", "売れ筋"])("外部との連携をしたように見せる言い方「%s」を使わない", (w) => {
    expect(ALL.filter((f) => f.s.includes(w)).map((f) => f.p)).toEqual([]);
  });

  it("Amazon のリンクにアソシエイトのタグを付けない", () => {
    expect(ALL.filter((f) => /amazon\.co\.jp[^"'`]*tag=/.test(f.s)).map((f) => f.p)).toEqual([]);
  });

  it("アプリの表示名はくらしベースにそろえる（タブの名前・ヘッダー）", () => {
    const layout = ALL.find((f) => f.p.endsWith(join("app", "layout.tsx")))!.s;
    expect(layout).toContain('title: "くらしベース"');
    const logo = ALL.find((f) => f.p.endsWith("Logo.tsx"))!.s;
    expect(logo).toContain('name: "くらしベース"');
    expect(logo).toContain('en: "KURASHI BASE"');
    // 古い表示名を画面に出さない（バックアップの説明で旧名を添える1か所を除く）
    const old = ALL.filter((f) => f.s.includes("暮らしベース") && !f.p.endsWith("backup.ts")).map((f) => f.p);
    expect(old).toEqual([]);
  });

  it("Googleカレンダーへのボタンは「予定を作る」と言い（同期と誤解させない）、渡す内容と保存は Google 側だと説明する", () => {
    const ev = ALL.find((f) => f.p.endsWith("EventSheet.tsx"))!.s;
    expect(ev).toContain("Googleカレンダーで予定を作る");
    expect(ev).not.toContain("Googleカレンダーに追加する");
    expect(ev).toContain("予定名・日時・場所だけ渡します");
    expect(ev).toContain("「保存」すると登録されます");
    expect(ev).toContain("行き方を調べる");
  });
});
