import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { applyRestore } from "@/lib/backup";
import { detectDelimiter, genericToIncoming, normalizeAmount, normalizeDate, parseTable, suggestConfig } from "@/lib/csvGeneric";

// NEXT v21 CSV:C01〜C07（汎用の取り込み）。合成データだけ（実際の明細は使わない）
const now = "2026-11-25T00:00:00.000Z";
const run = (text: string, tweak?: (c: ReturnType<typeof suggestConfig>) => void, cur = emptyData(now)) => {
  const t = parseTable(text);
  if (!t.ok) return { parse: t } as const;
  const cfg = suggestConfig(t.table);
  tweak?.(cfg);
  return { parse: t, cfg, res: genericToIncoming(t.table, cfg, cur, now), cur } as const;
};

describe("値の読み方（切り捨てない・曖昧は断る）", () => {
  it("日付：いろいろな書き方を読む。年がないもの・ない日は null", () => {
    expect(normalizeDate("2026/11/5")).toBe("2026-11-05");
    expect(normalizeDate("2026年11月5日")).toBe("2026-11-05");
    expect(normalizeDate("20261105")).toBe("2026-11-05");
    expect(normalizeDate("２０２６-11-05 12:30")).toBe("2026-11-05");
    expect(normalizeDate("11/05")).toBeNull();
    expect(normalizeDate("2026-02-30")).toBeNull();
  });
  it("金額：円・カンマ・全角・マイナスの書き方を読む。小数は断る", () => {
    expect(normalizeAmount("¥1,234")).toBe(1234);
    expect(normalizeAmount("１２３４円")).toBe(1234);
    expect(normalizeAmount("-500")).toBe(-500);
    expect(normalizeAmount("(500)")).toBe(-500);
    expect(normalizeAmount("▲500")).toBe(-500);
    expect(normalizeAmount("1000.00")).toBe(1000);
    expect(normalizeAmount("1000.5")).toBeNull();
    expect(normalizeAmount("abc")).toBeNull();
    expect(normalizeAmount("")).toBeNull();
  });
  it("区切りはカンマかタブ。引用符の中は数えない", () => {
    expect(detectDelimiter("日付\t金額\t内容\n")).toBe("\t");
    expect(detectDelimiter('日付,"金額\t円",内容\n')).toBe(",");
  });
});

describe("家計簿アプリふうの CSV（計算対象・振替・ID つき）", () => {
  const MF = "計算対象,日付,内容,金額（円）,保有金融機関,大項目,中項目,メモ,振替,ID\n1,2026/11/03,スーパー,-1280,現金,食費,食料品,,0,id-a\n1,2026/11/05,給与,300000,サンプル銀行,給与,給与,,0,id-b\n0,2026/11/06,計算しない,-500,現金,食費,,,0,id-c\n1,2026/11/07,口座間,-10000,サンプル銀行,その他,,,1,id-d\n1,2026/11/08,未知の費目,-700,現金,趣味の道具,,,0,id-e\n";
  it("列を自動で対応づけ、計算対象外・振替は理由つきで保留にし、分類が分からないものは「その他」にする", () => {
    const r = run(MF);
    expect(r.cfg?.mode).toBe("signed");
    expect(r.cfg?.sign).toBe("negativeIsExpense");
    expect(r.res?.ok).toBe(true);
    if (!r.res?.ok) return;
    const tx = r.res.incoming.transactions;
    expect(tx.map((t) => [t.date, t.type, t.amount, t.merchant])).toEqual([
      ["2026-11-03", "expense", 1280, "スーパー"],
      ["2026-11-05", "income", 300000, "給与"],
      ["2026-11-08", "expense", 700, "未知の費目"],
    ]);
    expect(r.res.held?.map((h) => h.line)).toEqual([4, 5]); // 計算対象が0・振替（ファイルの行番号）
    expect(r.res.held?.[0].reason).toContain("計算対象");
    expect(r.res.unknownCategories).toEqual([{ name: "趣味の道具", count: 1 }]);
    expect(r.res.newCategories).toEqual([]); // 勝手にカテゴリを増やさない
    // 元 ID つきなので、同じ CSV をもう一度入れても増えない
    const m1 = applyRestore(emptyData(now), r.res.incoming, "merge");
    expect(m1.ok && m1.added).toBe(3);
    if (!m1.ok) return;
    const again = run(MF, undefined, m1.data);
    if (again.res?.ok) {
      const m2 = applyRestore(m1.data, again.res.incoming, "merge");
      expect(m2.ok && m2.added).toBe(0);
    }
  });
  it("新しいカテゴリを作ると選んだときだけ、カテゴリが増える", () => {
    const r = run(MF, (c) => (c.newCategories = true));
    expect(r.res?.ok && r.res.newCategories).toContain("趣味の道具");
  });
});

describe("銀行・カードの CSV", () => {
  it("銀行：出金・入金の2列。両方に金額があれば保留。0円・空は保留", () => {
    const text = "日付,摘要,出金,入金,残高\n2026-11-01,引落 ガス,5000,,100000\n2026-11-02,振込 給与,,250000,350000\n2026-11-03,両方,100,200,0\n2026-11-04,ゼロ,0,,0\n";
    const r = run(text);
    expect(r.cfg?.mode).toBe("split");
    expect(r.res?.ok).toBe(true);
    if (!r.res?.ok) return;
    expect(r.res.incoming.transactions.map((t) => [t.type, t.amount])).toEqual([["expense", 5000], ["income", 250000]]);
    expect(r.res.held?.map((h) => h.line)).toEqual([4, 5]);
    expect(r.res.held?.[0].reason).toContain("両方");
  });
  it("カード：利用金額はプラスが支出。Shift_JIS 由来のタブ区切りも読める。支払方法は言葉から決める", () => {
    const text = "利用日\t利用店名\t利用金額\t支払区分\n2026/11/10\tコンビニ\t¥1,200\tクレジットカード\n2026/11/11\tカフェ\t800\tPayPay\n";
    const r = run(text);
    expect(r.parse.ok && r.parse.table.delim).toBe("\t");
    expect(r.cfg?.sign).toBe("positiveIsExpense");
    expect(r.res?.ok).toBe(true);
    if (!r.res?.ok) return;
    expect(r.res.incoming.transactions.map((t) => [t.amount, t.paymentMethod])).toEqual([[1200, "card"], [800, "qr"]]);
  });
  it("種類の列：支出・収入・振替。振替・カード引落は保留、分からない種類も保留", () => {
    const text = "日付,種類,金額,内容\n2026-11-01,支出,300,A\n2026-11-02,収入,900,B\n2026-11-03,カード引落,5000,C\n2026-11-04,不明,100,D\n";
    const r = run(text);
    expect(r.cfg?.mode).toBe("kind");
    expect(r.res?.ok).toBe(true);
    if (!r.res?.ok) return;
    expect(r.res.incoming.transactions).toHaveLength(2);
    expect(r.res.held?.map((h) => h.line)).toEqual([4, 5]);
  });
});

describe("エラーと安全", () => {
  it("読めない日付・金額は、取り込まず、ファイルの実際の行番号つきで全部示す", () => {
    const text = "日付,金額,内容\n2026-11-01,-100,A\n11/02,-100,B\n2026-11-03,abc,C\n";
    const r = run(text);
    expect(r.res?.ok).toBe(false);
    if (r.res?.ok !== false) return;
    expect(r.res.error).toContain("3行目の日付");
    expect(r.res.error).toContain("4行目の金額");
  });
  it("同じ列を2つの項目に選ぶ・必須の列がないときは、理由を返して取り込まない", () => {
    const t = parseTable("日付,金額,内容\n2026-11-01,-100,A\n");
    if (!t.ok) throw new Error("parse");
    const cfg = suggestConfig(t.table);
    cfg.map.memo = cfg.map.merchant;
    expect(genericToIncoming(t.table, cfg, emptyData(now), now)).toMatchObject({ ok: false, error: expect.stringContaining("同じ列") });
    const cfg2 = suggestConfig(t.table);
    cfg2.map.date = -1;
    expect(genericToIncoming(t.table, cfg2, emptyData(now), now)).toMatchObject({ ok: false, error: expect.stringContaining("日付") });
  });
  it("引用符が閉じないファイルは断る。見出しだけのファイルも断る", () => {
    expect(parseTable('日付,金額\n2026-11-01,"1,000\n')).toMatchObject({ ok: false, error: expect.stringContaining("引用符") });
    expect(parseTable("日付,金額\n")).toMatchObject({ ok: false });
  });
  it("表計算の式のような内容（=cmd など）は、ただの文字として保存する（実行しない）", () => {
    const r = run("日付,金額,内容\n2026-11-01,-100,=SUM(1+1)\n");
    expect(r.res?.ok && r.res.incoming.transactions[0].merchant).toBe("=SUM(1+1)");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
describe("設定の画面（自分用だけ）", () => {
  const page = readFileSync(join(__dirname, "..", "src", "app", "settings", "page.tsx"), "utf8");
  it("決まった形ではない CSV は列の対応づけへ。公開版は読み込まない。文字コードは UTF-8 のあと Shift_JIS", () => {
    expect(page).toContain('const CsvGenericPanel = PERSONAL_BUILD ? dynamic(');
    expect(page).toContain('new TextDecoder("shift_jis")');
    expect(page).toContain('std.error.startsWith("1行目の見出しが違います")');
  });
  it("取り込まない行と、分類が分からなかったものを、確認画面に出す", () => {
    expect(page).toContain("取り込まない行：");
    expect(page).toContain("今のカテゴリにないので「その他」にします");
  });
});
