import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyRestore } from "@/lib/backup";
import { emptyData } from "@/lib/defaults";
import { csvToIncoming, parseCsv } from "@/lib/csvImport";
import { validateAppData } from "@/lib/schema";

const now = "2026-11-24T00:00:00.000Z";
const TX = "日付,種類,金額,カテゴリ,内容,支払い方法,メモ,元ID\n";

describe("家計簿の CSV の取り込み（Web 版、2026-11-24 平尾さん：Web 版でできる限界まで）", () => {
  it("CSV の \"…\" の中のカンマ・改行・\"\" を読める。BOM と CRLF も大丈夫", () => {
    expect(parseCsv('﻿a,b\r\n"x,y","改\n行","言う""ね"""\r\n')).toEqual([["a", "b"], ["x,y", "改\n行", '言う"ね"']]);
  });
  it("支出・収入を追加でき、今のカテゴリは名前で使い回し、ないものだけ作る。2回入れても増えない", () => {
    const cur = emptyData(now);
    const text = TX + "2026-11-01,支出,1200,食費,ラーメン,現金,,a1\n2026-11-02,収入,1000,ポイ活,楽天,,推定,a2\n2026-11-03,支出,3000,たばこ,,クレジットカード,,a3\n";
    const r = csvToIncoming(text, cur, now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.kind, r.rows, r.from, r.to]).toEqual(["transactions", 3, "2026-11-01", "2026-11-03"]);
    expect(r.newCategories).toEqual(["ポイ活", "たばこ"]);
    const m1 = applyRestore(cur, r.incoming, "merge");
    expect(m1.ok && m1.added).toBe(3);
    if (!m1.ok) return;
    expect(validateAppData(m1.data).ok).toBe(true);
    expect(m1.data.transactions.find((t) => t.merchant === "ラーメン")?.categoryId).toBe("exp-1");
    const again = csvToIncoming(text, m1.data, now);
    expect(again.ok && applyRestore(m1.data, again.incoming, "merge")).toMatchObject({ ok: true, added: 0 });
  });
  it("元ID がない CSV でも、期間が重なる別の CSV で同じ明細を二重にしない（並びが変わっても）", () => {
    const cur = emptyData(now);
    const a = TX + "2026-11-01,支出,500,食費,パン,,,\n2026-11-02,支出,800,食費,弁当,,,\n";
    const b = TX + "2026-10-31,支出,300,食費,牛乳,,,\n2026-11-02,支出,800,食費,弁当,,,\n2026-11-01,支出,500,食費,パン,,,\n2026-11-01,支出,500,食費,パン,,,\n";
    const ra = csvToIncoming(a, cur, now);
    if (!ra.ok) throw new Error(ra.error);
    const m1 = applyRestore(cur, ra.incoming, "merge");
    if (!m1.ok) throw new Error(m1.error);
    const rb = csvToIncoming(b, m1.data, now);
    if (!rb.ok) throw new Error(rb.error);
    const m2 = applyRestore(m1.data, rb.incoming, "merge");
    // 牛乳と、同じ日のパンの2つ目だけが増える
    expect(m2.ok && m2.added).toBe(2);
    expect(m2.ok && m2.data.transactions.length).toBe(4);
  });
  it("ない日付（2026-02-31）は断る。文字化けのときは UTF-8 で保存し直すよう伝える", () => {
    const cur = emptyData(now);
    expect(csvToIncoming(TX + "2026-02-31,支出,100,食費,,,,\n", cur, now)).toMatchObject({ ok: false, error: expect.stringContaining("2行目の日付") });
    expect(csvToIncoming("\u0093ú\u0095t,x\n1,2\n", cur, now)).toMatchObject({ ok: false, error: expect.stringContaining("UTF-8") });
  });
  it("同じ名前で金額が違う固定費は、別々に入る", () => {
    const cur = emptyData(now);
    const r = csvToIncoming("名前,金額,周期,支払日,次の支払日,カテゴリ,支払い方法\n保険,3000,毎月,10,2026-12-10,その他,\n保険,5000,毎月,20,2026-12-20,その他,\n", cur, now);
    if (!r.ok) throw new Error(r.error);
    const m = applyRestore(cur, r.incoming, "merge");
    expect(m.ok && m.data.recurring.length).toBe(2);
  });
  it("おかしな行は、行の番号を付けて断る", () => {
    const cur = emptyData(now);
    expect(csvToIncoming(TX + "2026/11/01,支出,100,食費,,,,\n", cur, now)).toMatchObject({ ok: false, error: expect.stringContaining("2行目の日付") });
    expect(csvToIncoming(TX + "2026-11-01,支出,-100,食費,,,,\n", cur, now)).toMatchObject({ ok: false, error: expect.stringContaining("2行目の金額") });
    expect(csvToIncoming(TX + "2026-11-01,出費,100,食費,,,,\n", cur, now)).toMatchObject({ ok: false, error: expect.stringContaining("種類") });
    expect(csvToIncoming(TX + "2026-11-01,支出,100,食費,,ポイント払い,,\n", cur, now)).toMatchObject({ ok: false, error: expect.stringContaining("支払い方法") });
    expect(csvToIncoming("a,b\n1,2\n", cur, now)).toMatchObject({ ok: false, error: expect.stringContaining("見出し") });
  });
  it("固定費の CSV も入れられる。同じ名前・金額の固定費があれば足さない", () => {
    const cur = emptyData(now);
    cur.recurring.push({ id: "r1", name: "家賃", amount: 81330, cycle: "monthly", anchorDay: 27, nextDueDate: "2026-11-27", categoryId: "exp-4", paymentMethod: "", active: true, createdAt: now, updatedAt: now });
    const text = "名前,金額,周期,支払日,次の支払日,カテゴリ,支払い方法\n家賃（全保連）,81330,毎月,27,2026-11-27,家賃,口座振替・振込\nNetflix,1590,毎月,1,2026-12-01,趣味・娯楽,クレジットカード\n";
    const r = csvToIncoming(text, cur, now);
    expect(r.ok && r.kind).toBe("recurring");
    if (!r.ok) return;
    expect(r.incoming.recurring.map((x) => x.name)).toEqual(["Netflix"]);
    const m = applyRestore(cur, r.incoming, "merge");
    expect(m.ok && m.data.recurring.length).toBe(2);
  });
  it("設定の画面に「家計簿の CSV を取り込む」がある", () => {
    const s = readFileSync(join(__dirname, "..", "src", "app", "settings", "page.tsx"), "utf8");
    expect(s).toContain("家計簿の CSV を取り込む");
    expect(s).toContain('store.replaceAll(res.data, "家計簿の CSV から追加")');
  });
});
