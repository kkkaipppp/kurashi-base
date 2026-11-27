import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HOME_CARDS, PUBLIC_ORDER, defaultLayout, layoutFor } from "@/lib/homeLayout";
import { emptyData } from "@/lib/defaults";

// To-Be 段階2 ホーム（02「日付、残り予算、今日の予定、やること、必要な確認、次の予定…未記録とゼロを区別。重複数値なし」・05 の名前）。期待値は 02・05 から手で作った
const page = readFileSync("src/app/page.tsx", "utf8");

describe("To-Be ホーム（自分用）", () => {
  it("初めの並びは 今日の予定 → 今日やること → 今月の残り予算 → 次の支払い → 確認すること。重なるカードは隠す（編集で出せる）", () => {
    expect(layoutFor(emptyData("2026-11-28T00:00:00.000Z").prefs.home, null, true)).toEqual(["today", "todo", "budget", "nextFixed", "navi"]);
    expect(defaultLayout().hidden).toEqual(["todayAll", "insight", "recent"]);
    const label = Object.fromEntries(HOME_CARDS.map((c) => [c.id, c.label]));
    expect([label.today, label.todo, label.budget, label.nextFixed, label.navi]).toEqual(["今日の予定", "今日やること", "今月の残り予算", "次の支払い", "確認すること"]);
  });
  it("保存した並びはそのまま（初めの並びが変わっても、編集して保存した人の並びは変えない）", () => {
    const prefs = { ...emptyData("2026-11-28T00:00:00.000Z").prefs.home, order: ["budget", "todayAll"], hidden: [] };
    expect(layoutFor(prefs, null, true).slice(0, 2)).toEqual(["budget", "todayAll"]);
  });
  it("公開版の並びと言葉は変えない（自分用は環境の値を直接比べる形で分ける）", () => {
    expect(PUBLIC_ORDER).toEqual(["budget", "today", "nextFixed", "todo", "navi", "insight", "recent"]);
    expect(page).toContain('const PERSONAL = process.env.NEXT_PUBLIC_KB_EDITION === "personal";');
    expect(page).toContain('{PERSONAL ? "次の支払い" : "次の固定費"}');
    // 「今日やること」は中身（期限が今日まで）に合わせて両方の版で同じ名前（点検 中-2）
    expect(page).toMatch(/>\s*今日やること<span/);
    expect(page).toContain('{PERSONAL ? "確認すること" : "確認したいこと"}');
  });
  it("予算を決めていない月に記録が無いときは ¥0 ではなく「まだ記録がありません」（未記録とゼロを区別）", () => {
    expect(page).toContain("const monthHasTx = data.transactions.some((t) => t.date.startsWith(month));");
    expect(page).toMatch(/PERSONAL && remaining === null && !monthHasTx \? \(\s*<p[^>]*>まだ記録がありません<\/p>/);
  });
});
