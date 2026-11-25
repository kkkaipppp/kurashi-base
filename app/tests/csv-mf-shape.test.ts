import { describe, expect, it } from "vitest";
import { genericToIncoming, parseTable, suggestConfig } from "@/lib/csvGeneric";
import { emptyData } from "@/lib/defaults";

// N06（CSV:C01〜C07）：マネーフォワード ME の家計簿の CSV（見出しは実物と同じ。行は作り物）。
// 本物の CSV（自分用/・GitHub に上げない）でも、2026-11-25 夜に、手元だけで同じ自動の対応になり、振替と計算対象外を除いて全件取り込めることを確かめた（中身は記録しない）
const HEADER = '"計算対象","日付","内容","金額（円）","保有金融機関","大項目","中項目","メモ","振替","ID"';
const rows = [
  '"1","2026/11/20","スーパー","-1280","カードA","食費","食料品","","0","mf-1"',
  '"1","2026/11/21","給料","300000","銀行B","収入","給与","","0","mf-2"',
  '"1","2026/11/22","カード引き落とし","-50000","銀行B","未分類","未分類","","1","mf-3"',
  '"0","2026/11/23","立て替え","-3000","現金","交際費","交際費","","0","mf-4"',
  '"1","2026/11/24","電車","-220","交通系IC","交通費","電車","通勤","0","mf-5"',
];
const text = [HEADER, ...rows].join("\r\n");

describe("CSV：マネーフォワード ME の形", () => {
  it("見出しから、列の対応を自動で選ぶ（計算対象・振替・ID も）", () => {
    const p = parseTable(text);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const c = suggestConfig(p.table);
    expect(c.map).toMatchObject({ include: 0, date: 1, merchant: 2, amount: 3, pay: 4, category: 5, memo: 7, transfer: 8, srcId: 9 });
    expect(c.mode).toBe("signed");
    expect(c.sign).toBe("negativeIsExpense");
  });
  it("振替（1）と計算対象外（0）は取り込まず「保留」に数える。マイナスは支出・プラスは収入", () => {
    const p = parseTable(text);
    if (!p.ok) throw new Error(p.error);
    const r = genericToIncoming(p.table, suggestConfig(p.table), emptyData("2026-11-25T00:00:00.000Z"), "2026-11-25T00:00:00.000Z");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const txs = r.incoming.transactions;
    expect(txs.map((t) => [t.type, t.amount, t.date])).toEqual([
      ["expense", 1280, "2026-11-20"],
      ["income", 300000, "2026-11-21"],
      ["expense", 220, "2026-11-24"],
    ]);
    expect(r.held?.length).toBe(2);
  });
});
