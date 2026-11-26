import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatDiffYen, formatSignedYen } from "@/lib/money";
import { shortAmount } from "@/components/TrendChart";

// 2026-11-26 平尾さん「全部おすすめで」（朝の報告の 5）：公開版の文言・見た目の直し12件
const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");

describe("承認5：公開版の文言・見た目", () => {
  it("1 金額の符号：マイナスは「−」（U+2212）、プラスは半角の「+」", () => {
    expect([formatSignedYen(-500), formatSignedYen(500), formatDiffYen(1200), formatDiffYen(-1200), formatDiffYen(0)]).toEqual(["−¥500", "¥500", "+¥1,200", "−¥1,200", "¥0"]);
    expect(shortAmount(-250000)).toBe("−25万");
    expect(src("components/Rows.tsx")).toContain('{exp ? "−" : "+"}');
    // 点検 中-1：買い物の判断・生活の変化の「差」は、増えたら「+¥」
    expect(src("app/decide/page.tsx")).toContain("formatDiffYen(s.diff)");
    expect(src("app/life/page.tsx").match(/formatDiffYen\(/g)?.length).toBe(3);
    for (const f of ["app/decide/page.tsx", "app/life/page.tsx"]) expect(src(f), f).not.toContain("＋は増える");
    for (const f of ["components/ForecastCard.tsx", "components/CashBalanceCard.tsx"]) expect(src(f), f).not.toContain("<dd>＋");
  });
  it("2 外部サービス連携：今は CSV・.ics で取り込めることを書く", () => {
    expect(src("app/integrations/page.tsx")).toContain("今できること（ファイルで取り込む）");
  });
  it("3 使い方：新しい機能を書き足す", () => {
    const g = src("app/guide/page.tsx");
    for (const w of ["月末の見込み", "週・年", "買い物の判断", "未分類の記録", "検索", ".ics"]) expect(g, w).toContain(w);
  });
  it("4 メニュー：準備中は、どちらの版でもたたむ", () => {
    expect(src("app/menu/page.tsx")).toMatch(/\n\s*if \(soon\)\n/);
  });
  it("5 取引履歴の検索は「この月」だけと書き、「すべての月から探す」へつなぐ", () => {
    const h = src("app/history/page.tsx");
    expect(h).toContain("この月の記録だけを探します。");
    expect(h).toContain("すべての月から探す");
  });
  it("6 10〜11px の文字を残さない（カレンダーのマスとウィジェットの見本は除く）", () => {
    const root = join(__dirname, "..", "src");
    const files = (readdirSync(root, { recursive: true }) as string[]).filter((f) => f.endsWith(".tsx") && !/(calendar|widget)[\\/]page/.test(f));
    const bad = files.filter((f) => /text-\[(10|11)px\]/.test(readFileSync(join(root, f), "utf8")));
    expect(bad).toEqual([]);
  });
  it("7 CSV：Shift_JIS も読めると書く", () => {
    expect(src("app/settings/page.tsx")).toContain("「UTF-8」と「Shift_JIS」");
  });
  it("8 目標：数の欄は数値目標のときだけ。出さない欄は確かめない", () => {
    expect(src("app/goals/page.tsx").match(/showWhen: isNumberGoal/g)?.length).toBe(3);
    expect(src("components/CollectionPage.tsx")).toContain("if (f.showWhen && !f.showWhen(d)) continue;");
  });
  it("9 予算を超えたときの言い方：「オーバー」を使わない（実際は「超過」、見込みは「超える見込み」）", () => {
    expect(src("lib/navi.ts")).not.toContain("オーバー");
  });
  it("10 保存のボタンは「保存する」（設定の予算）", () => {
    expect(src("app/settings/page.tsx")).toMatch(/onClick=\{saveBudget\} className="mt-6">\s*保存する/);
  });
  it("11 カードの見出し（h2・太字）は 17px にそろえる", () => {
    for (const f of ["app/integrations/page.tsx", "app/nisa/page.tsx", "app/page.tsx", "app/trips/page.tsx", "app/goals/page.tsx"]) expect(src(f), f).not.toMatch(/<h2 [^>]*text-\[(15|16)px\] font-bold/);
  });
});
