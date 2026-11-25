import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 磨き込み（2026-11-26）：使い勝手の点検で見つけたものの見張り。画面のコードを読んで確かめる（コメントは除く）
const root = path.resolve(import.meta.dirname, "../src");
const code = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("磨き込み：高", () => {
  it("自分用では、iPhone アプリで使える機能（文字の読み取り・ウィジェット・通知）を「まだ使えない」と書かない。公開版の文は残す", () => {
    const menu = code("app/menu/page.tsx");
    expect(menu).toMatch(/IS_PERSONAL\s*\?\s*\{ href: "\/import", label: "レシートを見て入力", desc: "レシートの写真から/);
    expect(menu).toContain('...(IS_PERSONAL ? [] : [{ href: "/widget"');
    const widget = code("app/widget/page.tsx");
    expect(widget).toMatch(/IS_PERSONAL \? \(\s*<section[\s\S]*?ホーム画面を長押し/);
    expect(widget).toContain("まだ対応していません"); // 公開版の文
    const guide = code("app/guide/page.tsx");
    expect(guide).toMatch(/IS_PERSONAL \? \(\s*<ul[\s\S]*?iPhone アプリの中だけ/);
    const settings = code("app/settings/page.tsx");
    expect(settings).toMatch(/PERSONAL_BUILD \? \(\s*<ul[\s\S]*?iPhone アプリの中だけ/);
    const tx = code("components/TxSheet.tsx");
    expect(tx).toMatch(/EXTRA \? \(\s*<p className="pt-1">\s*返金は、元の支出を開いて「返金があった」から/);
  });
  it("固定費の入力も、書きかけで閉じるときは確かめる（ほかの入力シートと同じ）", () => {
    const rec = code("app/recurring/page.tsx");
    expect(rec).toMatch(/const requestClose = async \(\) => \{\s*if \(dirty && !\(await ui\.confirm\(\{ title: "入力内容を破棄しますか？"/);
    expect(rec).toContain("onRequestClose={requestClose}");
  });
  it("提案「予算を超える見込み」は、見込みのある振り返りへ（ホームの存在しない場所へ飛ばない）", () => {
    expect(code("lib/suggestions.ts")).toContain('href: "/report", score: 500');
    expect(code("lib/suggestions.ts")).not.toContain("/#forecast");
  });
  it("自分用の設定は、効かない切り替え（次の固定費・確認したいこと）を出さず、予算の説明は生活費（投資を除く）", () => {
    const s = code("app/settings/page.tsx");
    expect(s).toMatch(/const toggles: \{ key: HomeToggle; label: string \}\[\] = PERSONAL_BUILD\s*\?\s*\[\{ key: "todaySpent"/);
    expect(s).toContain("今月の生活費（投資を除く）");
  });
});

describe("磨き込み：中（入力）", () => {
  it("1日だけの予定・旅行は、開始日を変えると終了日も一緒に動く（前にずらして、知らないうちに何日もの予定にならない）", () => {
    expect(code("components/EventSheet.tsx")).toMatch(/if \(k === "startDate" && typeof v === "string" && \(d\.startDate === d\.endDate \|\| n\.endDate < v\)\) n\.endDate = v;/);
    expect(code("app/trips/page.tsx")).toMatch(/if \(k === "startDate" && \(x\.startDate === x\.endDate \|\| n\.endDate < v\)\) n\.endDate = v;/);
  });
  it("＋からタスクを選ぶと、今日以外を選んでいたらその日を期限の初めの値にする", () => {
    expect(code("components/UIContext.tsx")).toContain('router.push(date && date !== todayStr() ? `/tasks?open=new&date=${date}` : "/tasks?open=new")');
    expect(code("components/OpenFromQuery.tsx")).toContain('onOpen(id, id === "new" && date && ');
    expect(code("components/OpenFromQuery.tsx")).toContain('params.delete("date")');
    expect(code("app/tasks/page.tsx")).toContain('newDateField: "due"');
    expect(code("components/CollectionPage.tsx")).toContain("...(date && config.newDateField ? { [config.newDateField]: date } : {})");
  });
  it("保存できなかったときは最初の間違いの欄へ移り、間違い・ヒントの文は入力欄の説明としてつながる", () => {
    const ui = code("components/ui.tsx");
    expect(ui).toContain("export function focusFirstInvalid()");
    expect(ui).toMatch(/cloneElement\(children[\s\S]*?"aria-describedby"/);
    expect(ui).toContain('<p id={`${htmlFor}-hint`}');
    for (const f of ["components/CollectionPage.tsx", "components/EventSheet.tsx", "app/recurring/page.tsx", "app/trips/page.tsx"]) expect(code(f), f).toContain("focusFirstInvalid()");
  });
});
