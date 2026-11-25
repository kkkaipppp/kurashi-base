import { describe, expect, it } from "vitest";
import { findAmount, findDate, findMerchant, parseReceipt } from "@/lib/receiptParse";

// NEXT v21：レシートの読み取り結果から、日付・合計・店名の「候補」を取り出す（合成の文字列。実際のレシートは使わない）
const TODAY = "2026-11-25";

describe("日付", () => {
  it("いろいろな書き方を読む（全角・年月日・令和）。時刻・電話番号・年のない日付は読まない", () => {
    expect(findDate(["2026/11/24 12:34"], TODAY)).toBe("2026-11-24");
    expect(findDate(["２０２６年１１月２４日"], TODAY)).toBe("2026-11-24");
    expect(findDate(["2026.11.4"], TODAY)).toBe("2026-11-04");
    expect(findDate(["令和8年11月23日"], TODAY)).toBe("2026-11-23");
    expect(findDate(["R8.11.23"], TODAY)).toBe("2026-11-23");
    expect(findDate(["11/24 12:34", "TEL 03-1234-5678"], TODAY)).toBeNull();
  });
  it("先の日付・ずっと前の日付・ない日付は、候補にしない（読み間違いの可能性が高い）", () => {
    expect(findDate(["2027/01/01"], TODAY)).toBeNull();
    expect(findDate(["2019/01/01"], TODAY)).toBeNull();
    expect(findDate(["2026/02/30"], TODAY)).toBeNull();
    expect(findDate(["2026/11/26"], TODAY)).toBe("2026-11-26"); // 翌日までは許す（日付の境目）
  });
});

describe("合計金額", () => {
  it("「合計」の行の金額（税込）。小計・お預り・お釣り・ポイントは使わない", () => {
    const lines = ["おにぎり ¥150", "お茶 ¥140", "小計 ¥290", "消費税 ¥29", "合計 ¥319", "お預り ¥1,000", "お釣り ¥681", "ポイント 5"];
    expect(findAmount(lines)).toEqual({ amount: 319, confidence: "high" });
  });
  it("カンマ・円・全角を読む。合計の行が複数あるときは、いちばん大きい金額", () => {
    expect(findAmount(["お会計 １２，３４５円"])).toEqual({ amount: 12345, confidence: "high" });
    expect(findAmount(["合計 1,000", "税込合計 1,100"])).toEqual({ amount: 1100, confidence: "high" });
  });
  it("合計の行がないときは、お預り・お釣りを除いた最大の金額（確度は低い）。金額がなければ null", () => {
    expect(findAmount(["コーヒー 480", "サンドイッチ 650"])).toEqual({ amount: 650, confidence: "low" });
    expect(findAmount(["お預り 2,000", "お釣り 870"])).toEqual({ amount: null, confidence: null });
    expect(findAmount(["ありがとうございました"])).toEqual({ amount: null, confidence: null });
  });
  it("電話番号・時刻・日付の数字を、金額と取り違えない", () => {
    expect(findAmount(["TEL 03-1234-5678", "2026/11/24 12:34", "合計 ¥880"])).toEqual({ amount: 880, confidence: "high" });
    expect(findAmount(["TEL 03-1234-5678", "2026/11/24 12:34"])).toEqual({ amount: null, confidence: null });
  });
});

describe("店名", () => {
  it("最初のそれらしい行。住所・電話・日付・「領収書」・数字だけの行は飛ばす。「株式会社」は外す", () => {
    expect(findMerchant(["領収書", "株式会社 サンプルマート", "〒100-0001 東京都", "TEL 03-0000-0000"])).toBe("サンプルマート");
    expect(findMerchant(["2026/11/24", "12345", "カフェ ひなた"])).toBe("カフェ ひなた");
    expect(findMerchant(["¥1,200", "---"])).toBeNull();
  });
});

describe("まとめて", () => {
  it("1枚のレシート（合成）：候補を3つ返す。足りないものは null のまま", () => {
    const g = parseReceipt(["サンプルマート 駅前店", "2026/11/24 18:05", "牛乳 ¥198", "パン ¥140", "合計 ¥338", "お預り ¥500"], TODAY);
    expect(g).toEqual({ date: "2026-11-24", amount: 338, amountConfidence: "high", merchant: "サンプルマート 駅前店" });
    expect(parseReceipt([], TODAY)).toEqual({ date: null, amount: null, amountConfidence: null, merchant: null });
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scaledSize } from "@/lib/imageScale";
describe("画面と部品（iPhone アプリ）", () => {
  const src = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
  it("画像は長い辺を1800までに縮める（小さい画像は大きくしない）", () => {
    expect(scaledSize(4000, 3000)).toEqual({ w: 1800, h: 1350 });
    expect(scaledSize(1000, 800)).toEqual({ w: 1000, h: 800 });
    expect(scaledSize(900, 3600)).toEqual({ w: 450, h: 1800 });
  });
  it("読み取りは iPhone の Vision（端末の中だけ）。外へ送らない。候補を入力欄に入れるだけで、確認して保存するのは本人", () => {
    const swift = src("ios/App/App/WidgetBridgePlugin.swift");
    expect(swift).toContain("VNRecognizeTextRequest");
    expect(swift).toContain('request.recognitionLanguages = ["ja-JP", "en-US"]');
    expect(swift).not.toMatch(/URLSession|URLRequest/);
    const page = src("src/app/import/page.tsx");
    expect(page).toContain("NativeBridge.recognizeText({ image })");
    expect(page).toContain('title: "読み取った候補を確認"');
    expect(page).not.toContain("addTx(");
    expect(page).toContain("文字の自動読み取り（OCR）は、まだありません。"); // 公開版（ブラウザ）の案内は今のまま
  });
});
