import { describe, expect, it } from "vitest";
import { emptyData } from "@/lib/defaults";
import { validateAppData } from "@/lib/schema";
import { eventLabel } from "@/lib/aggregate";
import { pinnedTemplates, recentTemplates } from "@/lib/txTemplates";
import type { Transaction } from "@/lib/types";

// 期待値は決めごと（2026-11-28：仮予定は「（仮）」を前に・ひな形は追加の一覧にいつも出す）から手で作った
const ts = "2026-11-28T00:00:00.000Z";
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({ type: "expense", date: "2026-11-10", amount: 500, currency: "JPY", categoryId: "exp-1", merchant: "カフェ", paymentMethod: "card", note: "", source: "manual", createdAt: ts, updatedAt: ts, ...o });

describe("仮予定", () => {
  it("名前の前に「（仮）」。名前なしは「（名前なし）」", () => {
    expect(eventLabel({ title: "歯医者", tentative: true })).toBe("（仮）歯医者");
    expect(eventLabel({ title: "  " })).toBe("（名前なし）");
    expect(eventLabel({ title: "会議" })).toBe("会議");
  });
});

describe("入力のひな形", () => {
  it("印の付いた記録だけ・同じ中身は1つ・立替・経費・返金・口座間の移動は出さない・店名の順。前の記録からは、ひな形と同じ中身を出さない", () => {
    const txs = [
      tx({ id: "a", template: true, merchant: "ジム", amount: 8000 }),
      tx({ id: "b", template: true, merchant: "カフェ", amount: 500 }),
      tx({ id: "b2", template: true, merchant: "カフェ", amount: 500, date: "2026-11-12" }),
      tx({ id: "c", template: true, merchant: "立替", amount: 1000, advanceGross: 3000 }),
      tx({ id: "d", template: true, merchant: "経費", amount: 1000, claim: true, countAs: "transfer" }),
      tx({ id: "e", merchant: "本屋", amount: 1200, date: "2026-11-20" }),
    ];
    const p = pinnedTemplates(txs);
    expect(p.map((x) => [x.merchant, x.amount])).toEqual([["カフェ", 500], ["ジム", 8000]]);
    expect(recentTemplates(txs, 3, new Set(p.map((x) => x.key))).map((x) => x.merchant)).toEqual(["本屋"]);
  });
  it("保存の形：仮予定・ひな形の印は true だけ", () => {
    const d = emptyData(ts);
    d.transactions = [tx({ id: "a", template: true })];
    d.events = [{ id: "e", title: "x", startDate: "2026-11-28", endDate: "2026-11-28", allDay: true, startTime: "", endTime: "", note: "", tentative: true, createdAt: ts, updatedAt: ts }];
    expect(validateAppData(JSON.parse(JSON.stringify(d))).ok).toBe(true);
    const bad = JSON.parse(JSON.stringify(d));
    bad.events[0].tentative = 1;
    expect(validateAppData(bad).ok).toBe(false);
    const bad2 = JSON.parse(JSON.stringify(d));
    bad2.transactions[0].template = "y";
    expect(validateAppData(bad2).ok).toBe(false);
  });
});
